// Signova App Logic
console.log("Signova System Initialized");

// DOM Elements
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null;
const statusDot = document.getElementById('system-dot');
const trackerStatus = document.getElementById('tracker-status');

const leftHandOutput = document.getElementById('left-hand-output');
const rightHandOutput = document.getElementById('right-hand-output');

const sttOutput = document.getElementById('stt-output');
const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const speakBtn = document.getElementById('speak-btn');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');

const toggleSignVoice = document.getElementById('toggle-sign-voice');
const toggleVoiceText = document.getElementById('toggle-voice-text');

// Modal Logic
const infoBtn = document.getElementById('info-btn');
const closeModalBtn = document.getElementById('close-modal');
const infoModal = document.getElementById('info-modal');

if (infoBtn && closeModalBtn && infoModal) {
    infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
    closeModalBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
}

// Prediction Buffer State
const BUFFER_SIZE = 10;
const buffers = { Left: [], Right: [] };
const stableGestures = { Left: "", Right: "" };

function setHandOutput(handStr, text) {
    const el = handStr === 'Left' ? leftHandOutput : rightHandOutput;
    if (el) el.innerText = text;
}

function updatePrediction(handStr, newGesture) {
    const buffer = buffers[handStr];
    
    if (newGesture === null) {
        buffer.length = 0;
        if (stableGestures[handStr] !== "") {
            stableGestures[handStr] = "";
            setHandOutput(handStr, "--");
        }
        return;
    }

    buffer.push(newGesture);
    if (buffer.length > BUFFER_SIZE) buffer.shift();

    const counts = {};
    let maxCount = 0;
    let dominant = newGesture;
    
    for (const g of buffer) {
        if (g === "UNKNOWN") continue;
        counts[g] = (counts[g] || 0) + 1;
        if (counts[g] > maxCount) {
            maxCount = counts[g];
            dominant = g;
        }
    }

    const activeLength = buffer.filter(g => g !== "UNKNOWN").length;
    const conf = activeLength > 0 ? (maxCount / activeLength) * 100 : 0;

    if (activeLength >= BUFFER_SIZE / 2 && conf > 50 && dominant !== stableGestures[handStr]) {
        stableGestures[handStr] = dominant;
        setHandOutput(handStr, dominant);
        
        // Output sign to voice + chat if enabled
        if (toggleSignVoice && toggleSignVoice.checked && dominant !== "UNKNOWN") {
            speakText(dominant);
            addChatMessage('me', `[Gesture]: ${dominant}`);
        }
    }
}

// MediaPipe Setup
let hands;
let camera;

async function setupMediaPipe() {
    if (!videoElement || !canvasElement) return;

    try {
        hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        // Track up to 2 hands for advanced comms
        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        hands.onResults(onResults);

        camera = new Camera(videoElement, {
            onFrame: async () => await hands.send({ image: videoElement }),
            width: 640,
            height: 480
        });

        camera.start();
        trackerStatus.innerText = "System Online";
        statusDot.style.animation = "none";
        statusDot.style.opacity = "1";
    } catch (e) {
        console.error(e);
        trackerStatus.innerText = "Error Initializing";
        statusDot.classList.add('error');
    }
}

function resizeCanvas() {
    if (videoElement && canvasElement) {
        if (canvasElement.width !== videoElement.videoWidth && videoElement.videoWidth > 0) {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        }
    }
}

const isFingerExtended = (landmarks, tipIdx, pipIdx) => landmarks[tipIdx].y < landmarks[pipIdx].y;

const getGesture = (landmarks, handedness) => {
    const indexExt = isFingerExtended(landmarks, 8, 6);
    const middleExt = isFingerExtended(landmarks, 12, 10);
    const ringExt = isFingerExtended(landmarks, 16, 14);
    const pinkyExt = isFingerExtended(landmarks, 20, 18);
    
    // Thumb heuristics
    let thumbExtended = false;
    if (handedness === 'Left') {
        thumbExtended = landmarks[4].x < landmarks[5].x - 0.05; 
    } else {
        thumbExtended = landmarks[4].x > landmarks[5].x + 0.05;
    }
    
    const thumbUp = landmarks[4].y < landmarks[5].y && landmarks[4].y < landmarks[3].y;
    
    if (indexExt && middleExt && ringExt && pinkyExt) {
        if (!thumbExtended) return "B"; 
        return "HELLO";
    } else if (indexExt && middleExt && !ringExt && !pinkyExt) {
        return "V"; 
    } else if (indexExt && middleExt && ringExt && !pinkyExt) {
        return "W";
    } else if (indexExt && !middleExt && !ringExt && !pinkyExt) {
        if (thumbExtended) return "L"; 
        return "ONE";
    } else if (indexExt && !middleExt && !ringExt && pinkyExt) {
        return "ROCK";
    } else if (!indexExt && !middleExt && !ringExt && pinkyExt) {
        if (thumbExtended) return "Y";
        return "I";
    } else if (!indexExt && !middleExt && !ringExt && !pinkyExt) {
        if (thumbUp) return "YES";
        if (thumbExtended) return "A";
        return "NO"; 
    }
    return "UNKNOWN";
}

function onResults(results) {
    if (!canvasCtx) return;
    resizeCanvas();
    if (canvasElement.width === 0 || canvasElement.height === 0) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let seenHands = { Left: false, Right: false };

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handLabel = results.multiHandedness[i].label; // Left or Right
            
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#22c55e', lineWidth: 4});
            drawLandmarks(canvasCtx, landmarks, {color: '#ffffff', lineWidth: 2, radius: 3});
            
            const detectedGesture = getGesture(landmarks, handLabel);
            updatePrediction(handLabel, detectedGesture);
            seenHands[handLabel] = true;
        }
    }
    
    if (!seenHands.Left) updatePrediction("Left", null);
    if (!seenHands.Right) updatePrediction("Right", null);
    
    canvasCtx.restore();
}

// Communication Logic: STT, TTS, Chat
let speechRecognition;
let isListening = false;

if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognitionAPI();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    
    speechRecognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
            else interim += event.results[i][0].transcript;
        }
        
        if (final) {
            addChatMessage('them', `[Voice]: ${final}`);
            sttOutput.innerText = interim || "Listening...";
        } else {
            sttOutput.innerText = interim || "Listening...";
            if(interim) {
                sttOutput.classList.add('neon-text');
                sttOutput.classList.remove('text-gray-300');
            }
        }
    };
    
    speechRecognition.onstart = () => {
        sttOutput.innerText = "Listening...";
        sttOutput.classList.add('pulse-glow');
        sttOutput.classList.remove('text-gray-300');
        sttOutput.classList.add('neon-text');
    };
    
    speechRecognition.onend = () => {
        sttOutput.classList.remove('pulse-glow');
        if (toggleVoiceText && toggleVoiceText.checked && isListening) {
            try { speechRecognition.start(); } catch(e) {}
        } else {
            sttOutput.innerText = "Microphone disabled.";
            sttOutput.classList.add('text-gray-300');
            sttOutput.classList.remove('neon-text');
        }
    };
} else {
    if (sttOutput) sttOutput.innerText = "Speech-to-Text not supported in this browser.";
}

function updateSTTState() {
    if (!toggleVoiceText || !speechRecognition) return;
    
    isListening = toggleVoiceText.checked;
    if (isListening) {
        try { speechRecognition.start(); } catch(e) {}
    } else {
        try { speechRecognition.stop(); } catch(e) {}
    }
}

if (toggleVoiceText) toggleVoiceText.addEventListener('change', updateSTTState);

function speakText(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
}

function addChatMessage(sender, text) {
    if (!chatHistory) return;
    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;
    msg.innerText = text;
    chatHistory.appendChild(msg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

if (speakBtn && chatInput) {
    speakBtn.addEventListener('click', () => {
        const msg = chatInput.value.trim();
        if (msg) {
            speakText(msg);
            addChatMessage('me', `[Spoke]: ${msg}`);
            chatInput.value = '';
        }
    });
}

if (sendBtn && chatInput) {
    sendBtn.addEventListener('click', () => {
        const msg = chatInput.value.trim();
        if (msg) {
            addChatMessage('me', msg);
            chatInput.value = '';
            // Auto response for aesthetic
            setTimeout(() => addChatMessage('them', `Acknowledged.`), 1000);
        }
    });
}

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (chatHistory) chatHistory.innerHTML = '<div class="chat-message system">Secure channel re-established.</div>';
        buffers.Left.length = 0;
        buffers.Right.length = 0;
        stableGestures.Left = "";
        stableGestures.Right = "";
        setHandOutput("Left", "--");
        setHandOutput("Right", "--");
        window.speechSynthesis.cancel();
    });
}

chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendBtn.click();
});

window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('input-video')) {
        setupMediaPipe();
        // Delay to allow DOM initialization before starting STT
        setTimeout(() => updateSTTState(), 1000); 
    }
});