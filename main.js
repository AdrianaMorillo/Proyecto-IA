// ====================== MAIN.JS - CYBER-GEN MASTER V15.2 ======================
// Arquitectura: Frontend puro con Vite + Seguridad .env
// Autor: Basado en guía del Ing. Juancito Peña

// ====================== CONFIGURACIÓN GLOBAL ======================
const MODELS_LIST = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-001", 
  "gemini-2.5-flash"
];

const SYSTEM_PROMPT = `Eres CYBER-GEN MASTER V15.2, una asistente IA experta en análisis de datos.

REGLAS DE FORMATO:
1. Usa ## para títulos y ### para subtítulos
2. Usa **negritas** para conceptos clave
3. Usa \`código\` para números, fechas y valores
4. Tonó profesional pero accesible

CAPACIDADES:
- Analizar archivos Excel, CSV y PDF
- Generar gráficos con [CHART_DATA: {...}]
- Responder preguntas técnicas y creativas`;

// Estado global
let currentChatId = "main";
let chats = new Map();
let currentAbortController = null;
let isAudioEnabled = true;
let currentSpeech = null;
let uploadedFiles = [];

// ====================== SEGURIDAD: API KEY desde .env ======================
let API_KEY = "";
try {
    API_KEY = import.meta.env?.VITE_GEMINI_API_KEY || "";
    if (!API_KEY) {
        console.warn("⚠️ No se encontró VITE_GEMINI_API_KEY en .env");
    }
} catch(e) {
    console.error("Error cargando API Key:", e);
}

// ====================== INICIALIZACIÓN ======================
document.addEventListener('DOMContentLoaded', () => {
    loadChatsFromStorage();
    initUI();
    setupEventListeners();
    updateModelDisplay();
    
    if (!API_KEY) {
        showApiKeyWarning();
    }
});

function showApiKeyWarning() {
    const container = document.getElementById('chat-container');
    const warning = document.createElement('div');
    warning.className = 'message ai-message';
    warning.innerHTML = `
        <strong>⚠️ Configuración Requerida</strong><br>
        No se encontró tu API Key de Gemini.<br><br>
        <strong>Solución:</strong><br>
        1. Crea un archivo <code>.env</code> en la raíz del proyecto<br>
        2. Añade: <code>VITE_GEMINI_API_KEY=tu_clave_aqui</code><br>
        3. Reinicia el servidor con <code>npm run dev</code><br><br>
        📍 Obtén tu clave gratis en <a href="https://aistudio.google.com/" target="_blank">Google AI Studio</a>
    `;
    container.appendChild(warning);
}

// ====================== GESTIÓN DE CHATS ======================
function loadChatsFromStorage() {
    const stored = localStorage.getItem('cyber_gen_chats');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            chats = new Map(parsed);
        } catch(e) {}
    }
    
    if (!chats.has("main")) {
        chats.set("main", {
            id: "main",
            name: "Terminal Principal",
            messages: [],
            createdAt: Date.now()
        });
    }
    saveChats();
}

function saveChats() {
    const serialized = JSON.stringify(Array.from(chats.entries()));
    localStorage.setItem('cyber_gen_chats', serialized);
}

function saveCurrentChat() {
    const chat = chats.get(currentChatId);
    if (chat) {
        const messages = Array.from(document.querySelectorAll('#chat-container .message')).map(msg => ({
            role: msg.classList.contains('user-message') ? 'user' : 'ai',
            text: msg.querySelector('.message-text')?.innerHTML || msg.innerText,
            timestamp: Date.now()
        }));
        chat.messages = messages;
        saveChats();
    }
}

function renderChatHistory() {
    const historyList = document.getElementById('chat-history-list');
    if (!historyList) return;
    
    historyList.innerHTML = '';
    const sortedChats = Array.from(chats.values()).sort((a,b) => b.createdAt - a.createdAt);
    
    sortedChats.forEach(chat => {
        const btn = document.createElement('button');
        btn.className = `nav-item ${chat.id === currentChatId ? 'active' : ''}`;
        btn.innerHTML = `<i class="fas fa-message"></i> ${chat.name.substring(0, 20)}`;
        btn.onclick = () => switchChat(chat.id);
        historyList.appendChild(btn);
    });
}

function switchChat(chatId) {
    saveCurrentChat();
    currentChatId = chatId;
    
    if (!chats.has(chatId)) {
        chats.set(chatId, {
            id: chatId,
            name: `Chat ${new Date().toLocaleTimeString()}`,
            messages: [],
            createdAt: Date.now()
        });
    }
    
    renderCurrentChat();
    renderChatHistory();
}

function renderCurrentChat() {
    const container = document.getElementById('chat-container');
    const chat = chats.get(currentChatId);
    
    if (!chat || chat.messages.length === 0) {
        container.innerHTML = `
            <div class="welcome-screen">
                <div class="cyber-logo-anim">
                    <i class="fas fa-brain"></i>
                </div>
                <h1>Bienvenido al Futuro</h1>
                <p>Conexión neuronal establecida</p>
                <small>🔒 API Key protegida vía .env</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    chat.messages.forEach(msg => {
        addMessageToUI(msg.role, msg.text, false);
    });
}

function addMessageToUI(role, content, save = true) {
    const container = document.getElementById('chat-container');
    
    // Remove welcome screen if exists
    if (container.querySelector('.welcome-screen')) {
        container.innerHTML = '';
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-text';
    
    if (role === 'ai') {
        // Process charts and markdown
        const processed = processChartsInText(content);
        contentDiv.innerHTML = processed.html;
        messageDiv.appendChild(contentDiv);
        
        // Render charts after adding to DOM
        if (processed.charts.length > 0) {
            setTimeout(() => renderCharts(processed.charts), 50);
        }
    } else {
        contentDiv.textContent = content;
        messageDiv.appendChild(contentDiv);
    }
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    
    if (save) {
        const chat = chats.get(currentChatId);
        if (chat) {
            chat.messages.push({ role, text: content, timestamp: Date.now() });
            saveChats();
        }
    }
    
    // Speak AI responses
    if (role === 'ai' && isAudioEnabled && content) {
        speakText(content);
    }
}

// ====================== PROCESAMIENTO DE GRÁFICOS ======================
function processChartsInText(text) {
    let processedText = text;
    const charts = [];
    const chartRegex = /\[CHART_DATA:\s*(\{[\s\S]*?\})\s*\]/g;
    
    let match;
    let index = 0;
    while ((match = chartRegex.exec(text)) !== null) {
        try {
            const config = JSON.parse(match[1]);
            const chartId = `chart-${Date.now()}-${index++}`;
            charts.push({ id: chartId, config });
            processedText = processedText.replace(match[0], `<div class="chart-container" id="${chartId}" style="height: 300px; margin: 20px 0;"></div>`);
        } catch(e) {
            console.warn("Error parsing chart config:", e);
        }
    }
    
    // Parse markdown
    let html = processedText;
    if (typeof marked !== 'undefined') {
        html = marked.parse(processedText);
    }
    
    return { html, charts };
}

function renderCharts(charts) {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js not loaded");
        return;
    }
    
    charts.forEach(chartInfo => {
        const container = document.getElementById(chartInfo.id);
        if (!container) return;
        
        const ctx = document.createElement('canvas');
        container.appendChild(ctx);
        
        try {
            new Chart(ctx, chartInfo.config);
        } catch(e) {
            console.error("Error rendering chart:", e);
            container.innerHTML = `<p class="text-danger">Error al renderizar gráfico: ${e.message}</p>`;
        }
    });
}

// ====================== SISTEMA DE VOZ ======================
function speakText(text) {
    if (!window.speechSynthesis) return;
    
    if (currentSpeech) {
        window.speechSynthesis.cancel();
    }
    
    // Limpiar texto para voz
    const cleanText = text
        .replace(/\[CHART_DATA[^\]]*\]/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/[#*_`]/g, '')
        .replace(/\n/g, '. ')
        .substring(0, 2000);
    
    currentSpeech = new SpeechSynthesisUtterance(cleanText);
    currentSpeech.lang = 'es-ES';
    currentSpeech.rate = 0.95;
    currentSpeech.onend = () => { currentSpeech = null; };
    
    window.speechSynthesis.speak(currentSpeech);
}

// ====================== API DE GEMINI CON FALLBACK ======================
async function callGeminiAPI(prompt, files = [], retryCount = 0) {
    if (!API_KEY) {
        throw new Error("API Key no configurada. Crea un archivo .env con VITE_GEMINI_API_KEY");
    }
    
    const model = MODELS_LIST[retryCount % MODELS_LIST.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    
    // Build contents with file context if any
    let userContent = prompt;
    if (files.length > 0) {
        userContent = `[ARCHIVOS ADJUNTOS]\n${files.map(f => f.content).join('\n---\n')}\n\n[CONSULTA]\n${prompt}`;
    }
    
    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: userContent }]
        }],
        systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        },
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096
        }
    };
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error (${response.status}): ${errorText}`);
        }
        
        const data = await response.json();
        const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Lo siento, no pude generar una respuesta.";
        
        return aiResponse;
        
    } catch (error) {
        console.error(`Error con modelo ${model}:`, error);
        
        if (retryCount < MODELS_LIST.length - 1) {
            addMessageToUI("ai", `⚠️ Cambiando a modelo ${MODELS_LIST[retryCount + 1]}...`, true);
            return callGeminiAPI(prompt, files, retryCount + 1);
        }
        
        throw error;
    }
}

// ====================== PROCESAMIENTO DE ARCHIVOS ======================
async function processExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                resolve({
                    name: file.name,
                    type: 'excel',
                    content: JSON.stringify(json, null, 2),
                    preview: json.slice(0, 10)
                });
            } catch(err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function processPDFFile(file) {
    // Note: Full PDF parsing requires pdf.js library
    // For now, extract basic info
    return {
        name: file.name,
        type: 'pdf',
        content: `[Archivo PDF: ${file.name}, tamaño: ${(file.size/1024).toFixed(2)} KB]`,
        preview: null
    };
}

async function handleFileUpload(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        return await processExcelFile(file);
    } else if (ext === 'pdf') {
        return await processPDFFile(file);
    } else {
        return {
            name: file.name,
            type: 'text',
            content: await file.text(),
            preview: null
        };
    }
}

// ====================== UI y EVENTOS ======================
function initUI() {
    // Ajustar altura del textarea automáticamente
    const textarea = document.getElementById('user-input');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 150) + 'px';
        });
    }
}

function setupEventListeners() {
    // Send message
    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('user-input');
    
    sendBtn?.addEventListener('click', sendMessage);
    userInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Voice input
    const voiceBtn = document.getElementById('voice-btn');
    voiceBtn?.addEventListener('click', startVoiceInput);
    
    // File upload
    const fileInput = document.getElementById('file-input');
    const fileLabel = document.querySelector('label.action-btn');
    fileInput?.addEventListener('change', handleFileSelect);
    
    // Clear chat
    const clearBtn = document.getElementById('clear-chat');
    clearBtn?.addEventListener('click', clearCurrentChat);
    
    // Toggle audio
    const audioBtn = document.getElementById('toggle-audio');
    audioBtn?.addEventListener('click', toggleAudio);
    
    // New chat
    const newChatBtn = document.getElementById('new-chat-btn');
    newChatBtn?.addEventListener('click', createNewChat);
    
    // Model selector
    const modelSelector = document.getElementById('model-selector');
    modelSelector?.addEventListener('change', (e) => {
        const model = e.target.value;
        const index = MODELS_LIST.indexOf(model);
        if (index !== -1) {
            MODELS_LIST[0] = model;
            addMessageToUI("ai", `🔧 Modelo cambiado a: **${model}**`, true);
        }
    });
    
    // Sidebar toggle
    const toggleSidebar = document.getElementById('toggle-sidebar');
    const closeSidebar = document.getElementById('close-sidebar');
    const sidebar = document.getElementById('sidebar');
    
    toggleSidebar?.addEventListener('click', () => {
        sidebar?.classList.remove('collapsed');
    });
    closeSidebar?.addEventListener('click', () => {
        sidebar?.classList.add('collapsed');
    });
}

function updateModelDisplay() {
    const modelSpan = document.getElementById('current-model-name');
    if (modelSpan) {
        modelSpan.textContent = MODELS_LIST[0].toUpperCase();
    }
}

async function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    
    if (!message && uploadedFiles.length === 0) return;
    
    // Show user message
    let userDisplay = message;
    if (uploadedFiles.length > 0) {
        userDisplay += `\n\n📎 Archivos adjuntos: ${uploadedFiles.map(f => f.name).join(', ')}`;
    }
    addMessageToUI('user', userDisplay, true);
    
    input.value = '';
    input.style.height = 'auto';
    
    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai-message typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    document.getElementById('chat-container').appendChild(typingDiv);
    
    try {
        const response = await callGeminiAPI(message, uploadedFiles);
        typingDiv.remove();
        addMessageToUI('ai', response, true);
    } catch (error) {
        typingDiv.remove();
        addMessageToUI('ai', `❌ **Error:** ${error.message}`, true);
        console.error(error);
    } finally {
        uploadedFiles = [];
        updateFileIndicator();
    }
}

function startVoiceInput() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        addMessageToUI('ai', '❌ Tu navegador no soporta reconocimiento de voz.', true);
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => {
        const voiceBtn = document.getElementById('voice-btn');
        voiceBtn.style.background = '#00f2ff';
        voiceBtn.style.color = '#000';
    };
    
    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        const input = document.getElementById('user-input');
        input.value = text;
        input.dispatchEvent(new Event('input'));
        sendMessage();
    };
    
    recognition.onerror = (event) => {
        console.error('Voice error:', event.error);
        addMessageToUI('ai', `❌ Error de voz: ${event.error}`, true);
    };
    
    recognition.onend = () => {
        const voiceBtn = document.getElementById('voice-btn');
        voiceBtn.style.background = '';
        voiceBtn.style.color = '';
    };
    
    recognition.start();
}

async function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
        try {
            const processed = await handleFileUpload(file);
            uploadedFiles.push(processed);
            addMessageToUI('user', `📎 **Archivo cargado:** ${file.name} (${(file.size/1024).toFixed(2)} KB)`, true);
        } catch (error) {
            addMessageToUI('ai', `❌ Error al procesar ${file.name}: ${error.message}`, true);
        }
    }
    
    updateFileIndicator();
    event.target.value = '';
}

function updateFileIndicator() {
    let indicator = document.querySelector('.file-indicator');
    
    if (uploadedFiles.length > 0) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'file-indicator';
            document.body.appendChild(indicator);
        }
        indicator.innerHTML = `
            <i class="fas fa-paperclip"></i>
            <span>${uploadedFiles.length} archivo(s) listo(s)</span>
            <button onclick="clearFiles()"><i class="fas fa-times"></i></button>
        `;
    } else if (indicator) {
        indicator.remove();
    }
}

window.clearFiles = function() {
    uploadedFiles = [];
    updateFileIndicator();
    addMessageToUI('ai', '🧹 Archivos adjuntos eliminados.', true);
};

function clearCurrentChat() {
    const chat = chats.get(currentChatId);
    if (chat) {
        chat.messages = [];
        saveChats();
    }
    renderCurrentChat();
    addMessageToUI('ai', '🧹 Terminal limpiada. ¿En qué puedo ayudarte?', true);
}

function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    const audioBtn = document.getElementById('toggle-audio');
    if (audioBtn) {
        audioBtn.innerHTML = isAudioEnabled ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
    }
    addMessageToUI('ai', isAudioEnabled ? '🔊 Respuestas por voz activadas' : '🔇 Respuestas por voz desactivadas', true);
}

function createNewChat() {
    const newId = `chat_${Date.now()}`;
    const newName = `Chat ${new Date().toLocaleTimeString()}`;
    chats.set(newId, {
        id: newId,
        name: newName,
        messages: [],
        createdAt: Date.now()
    });
    saveChats();
    switchChat(newId);
    addMessageToUI('ai', '✨ Nuevo diálogo iniciado. ¿Cuál es tu consulta?', true);
}