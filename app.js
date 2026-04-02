// Signova App Logic
console.log("Signova System Active");

// DOM Elements
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null;
const statusDot = document.getElementById('system-dot');
const trackerStatus = document.getElementById('tracker-status');

const leftHandOutput = document.getElementById('left-hand-output');
const rightHandOutput = document.getElementById('right-hand-output');

const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const speakBtn = document.getElementById('speak-btn');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');

const toggleSignVoice = document.getElementById('toggle-sign-voice');
const toggleVoiceText = document.getElementById('toggle-voice-text');

// Chat Expansion Hook
const rightPanel = document.getElementById('right-panel');
const expandChatBtn = document.getElementById('expand-chat-btn');
let isChatExpanded = false;

if (expandChatBtn && rightPanel) {
    expandChatBtn.addEventListener('click', () => {
        isChatExpanded = !isChatExpanded;
        if (isChatExpanded) {
            rightPanel.classList.add('chat-expanded');
            expandChatBtn.innerHTML = '<i data-lucide="minimize-2"></i>';
        } else {
            rightPanel.classList.remove('chat-expanded');
            expandChatBtn.innerHTML = '<i data-lucide="maximize-2"></i>';
        }
        lucide.createIcons();
    });
}

// Modal Logic
const infoBtn = document.getElementById('info-btn');
const closeModalBtn = document.getElementById('close-modal');
const infoModal = document.getElementById('info-modal');

if (infoBtn && closeModalBtn && infoModal) {
    infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
    closeModalBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
}

// Phrase Sequence Tracking
const PHRASE_WINDOW_MS = 4000;
const gestureSequence = { Left: [], Right: [] };
let activePhraseTimer = { Left: null, Right: null };

const PHRASE_MAP = {
    "I,LOVE,YOU": "I love you",
    "MY,NAME": "My name is...",
    "I,HAPPY": "I am happy!",
    "GOOD,BYE": "Goodbye!",
    "THANK,YOU": "Thank you!"
};

// Prediction Buffer State
const BUFFER_SIZE = 10;
const buffers = { Left: [], Right: [] };
const stableGestures = { Left: "", Right: "" };

const wristHistory = { Left: [], Right: [] };

function isHandWaving(handLabel, wristX) {
    const hist = wristHistory[handLabel];
    hist.push(wristX);
    if (hist.length > 15) hist.shift();
    
    if (hist.length < 10) return false;
    const minX = Math.min(...hist);
    const maxX = Math.max(...hist);
    // Return true if hand moved left-to-right by at least 4% of the screen
    return (maxX - minX) > 0.04;
}

function setHandOutput(handStr, text, isPhrase = false) {
    const el = handStr === 'Left' ? leftHandOutput : rightHandOutput;
    if (el) {
        el.innerText = text;
        if (isPhrase) {
            el.classList.add('phrase-mode');
        } else {
            el.classList.remove('phrase-mode');
        }
    }
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
        
        // --- Sequence Tracker ---
        const now = Date.now();
        const seq = gestureSequence[handStr];
        
        // Remove sequences older than window
        while (seq.length > 0 && now - seq[0].time > PHRASE_WINDOW_MS) {
            seq.shift();
        }
        
        // Prevent duplicate consecutive entries to sequence 
        if (seq.length === 0 || seq[seq.length - 1].gesture !== dominant) {
            seq.push({ gesture: dominant, time: now });
        }
        
        // Search for phrase match incrementally backwards
        let foundPhrase = null;
        for (let idx = 0; idx < seq.length; idx++) {
            const suffixStr = seq.slice(idx).map(item => item.gesture).join(',');
            if (PHRASE_MAP[suffixStr]) {
                foundPhrase = PHRASE_MAP[suffixStr];
                break;
            }
        }
        
        if (foundPhrase) {
            setHandOutput(handStr, foundPhrase, true);
            seq.length = 0; // flush sequence on phrase trigger
            
            if (toggleSignVoice && toggleSignVoice.checked) {
                speakText(foundPhrase);
                addChatMessage('me', `[Signed Phrase]: ${foundPhrase}`);
            }
            
            // clear phrase highlight after a delay
            clearTimeout(activePhraseTimer[handStr]);
            activePhraseTimer[handStr] = setTimeout(() => {
                if (stableGestures[handStr] !== "") {
                    setHandOutput(handStr, stableGestures[handStr], false);
                } else {
                    setHandOutput(handStr, "--", false);
                }
            }, 3000);
            
        } else {
            setHandOutput(handStr, dominant, false);
            clearTimeout(activePhraseTimer[handStr]);
            
            if (toggleSignVoice && toggleSignVoice.checked && dominant !== "UNKNOWN") {
                speakText(dominant);
                addChatMessage('me', `[Signed]: ${dominant}`);
            }
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
        trackerStatus.innerText = "Camera Error";
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

const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

const isFingerExtended = (landmarks, tipIdx, pipIdx) => landmarks[tipIdx].y < landmarks[pipIdx].y;

const getGesture = (landmarks, handedness) => {
    const indexExt = isFingerExtended(landmarks, 8, 6);
    const middleExt = isFingerExtended(landmarks, 12, 10);
    const ringExt = isFingerExtended(landmarks, 16, 14);
    const pinkyExt = isFingerExtended(landmarks, 20, 18);
    
    let thumbExtended = false;
    if (handedness === 'Left') {
        thumbExtended = landmarks[4].x < landmarks[5].x - 0.05; 
    } else {
        thumbExtended = landmarks[4].x > landmarks[5].x + 0.05;
    }
    
    const thumbUp = landmarks[4].y < landmarks[5].y && landmarks[4].y < landmarks[3].y && landmarks[4].y < landmarks[8].y && !indexExt && !middleExt;
    const thumbDown = landmarks[4].y > landmarks[5].y && landmarks[4].y > landmarks[3].y && landmarks[4].y > landmarks[8].y && !indexExt && !middleExt;
    
    const indexMiddleDist = dist(landmarks[8], landmarks[12]);
    const thumbIndexDist = dist(landmarks[4], landmarks[8]);
    
    if (thumbIndexDist < 0.05 && middleExt && ringExt && pinkyExt) {
        return "THANK"; // 'F' / 'OK' sign used for THANK
    }
    
    if (indexExt && middleExt && ringExt && pinkyExt) {
        const thumbOutward = Math.abs(landmarks[4].x - landmarks[3].x) > 0.05;
        
        if (thumbOutward) {
            // Check for lateral waving movement
            const waving = isHandWaving(handedness, landmarks[0].x);
            return waving ? "BYE" : "HELLO"; 
        }
        return "B"; 
    } else if (indexExt && middleExt && ringExt && !pinkyExt) {
        return "HAPPY"; // 'W' shape
    } else if (indexExt && middleExt && !ringExt && !pinkyExt) {
        if (indexMiddleDist < 0.04) return "NAME"; // 'U' / 'H' shape
        return "V"; 
    } else if (indexExt && !middleExt && !ringExt && !pinkyExt) {
        if (thumbExtended) return "L"; 
        return "YOU"; // Index only
    } else if (indexExt && !middleExt && !ringExt && pinkyExt) {
        if (thumbExtended) return "LOVE"; // ILY sign
        return "ROCK";
    } else if (!indexExt && !middleExt && !ringExt && pinkyExt) {
        if (thumbExtended) return "MY"; // Y shape
        return "I";
    } else if (!indexExt && !middleExt && !ringExt && !pinkyExt) {
        if (thumbUp) return "GOOD";
        if (thumbDown) return "BAD";
        if (thumbExtended) return "A";
        
        // Approximate 'C' shape detection
        const isC_shape = (thumbIndexDist > 0.05 && thumbIndexDist < 0.2) && landmarks[8].y > landmarks[6].y && landmarks[12].y > landmarks[10].y;
        if (isC_shape) return "C";
        
        return "NO"; // closed fist
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
            const handLabel = results.multiHandedness[i].label; 
            
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

// Communication Logic: Unified Stream (STT + User Chat + System messages)
let speechRecognition;
let isListening = false;
let interimMsg = null;

function showInterim(text) {
    if (!chatHistory) return;
    if (!interimMsg) {
        interimMsg = document.createElement('div');
        interimMsg.className = 'chat-message system hidden';
        chatHistory.appendChild(interimMsg);
    }
    if (text) {
        interimMsg.innerHTML = `<i data-lucide="mic" class="sm-icon"></i> ${text}`;
        interimMsg.classList.remove('hidden');
        chatHistory.appendChild(interimMsg); // Append forces it to the bottom
        chatHistory.scrollTop = chatHistory.scrollHeight;
        if(window.lucide) lucide.createIcons();
    } else {
        interimMsg.classList.add('hidden');
    }
}

function addMessageToChat(text) {
    if (!text || text.trim() === '') return;
    if (!chatHistory) return;
    
    const msg = document.createElement('div');
    msg.className = 'chat-message me'; // Ensure styling matches user message
    msg.innerText = text;
    
    chatHistory.appendChild(msg);
    if(interimMsg && interimMsg.parentNode === chatHistory) {
         chatHistory.appendChild(interimMsg); // Keep interim marker at end
    }
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognitionAPI();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';
    
    speechRecognition.onresult = (event) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // Show live spoken words in input field
        if (chatInput) {
            chatInput.value = finalTranscript + interimTranscript;
        }

        // Add final transcript to chat
        if (finalTranscript.trim() !== '') {
            addMessageToChat(finalTranscript.trim());
            if (chatInput) {
                chatInput.value = interimTranscript; // Keep any ongoing interim text
            }
        }
    };
    
    speechRecognition.onstart = () => showInterim("Listening for voice...");
    
    speechRecognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
            isListening = false;
            if (toggleVoiceText) toggleVoiceText.checked = false;
            const label = toggleVoiceText?.closest('.cyber-toggle')?.querySelector('.toggle-label');
            if (label) {
                label.innerHTML = 'Voice &rarr; Text';
                label.classList.remove('neon-text');
                label.style.textShadow = '';
            }
            showInterim("Microphone access denied. Please allow permissions.");
        }
    };
    
    speechRecognition.onend = () => {
        if (isListening && toggleVoiceText && toggleVoiceText.checked) {
            try { speechRecognition.start(); } catch(e) {}
        } else {
            showInterim(""); 
        }
    };
} else {
    showInterim("Speech Recognition not supported in this environment.");
}

function updateSTTState() {
    if (!toggleVoiceText || !speechRecognition) return;
    
    isListening = toggleVoiceText.checked;
    const label = toggleVoiceText.closest('.cyber-toggle')?.querySelector('.toggle-label');
    
    if (isListening) {
        if (label) {
            label.innerHTML = 'Listening...';
            label.classList.add('neon-text');
            label.style.textShadow = '0 0 10px #4ade80, 0 0 20px #4ade80';
        }
        try { speechRecognition.start(); } catch(e) {}
    } else {
        if (label) {
            label.innerHTML = 'Voice &rarr; Text';
            label.classList.remove('neon-text');
            label.style.textShadow = '';
        }
        try { speechRecognition.stop(); } catch(e) {}
        showInterim(""); // Clear "Standby..."
        if (chatInput) chatInput.value = ''; // Clear partial input
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
    if(interimMsg && interimMsg.parentNode === chatHistory) {
         chatHistory.appendChild(interimMsg); // Keep interim marker at end
    }
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
            setTimeout(() => addChatMessage('them', `User response simulated.`), 1000);
        }
    });
}

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (chatHistory) {
            chatHistory.innerHTML = '<div class="chat-message system">Secure channel re-established.</div>';
            interimMsg = null;
            if(isListening && speechRecognition) {
                showInterim("Standby for vocal input...");
            }
        }
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
        setTimeout(() => updateSTTState(), 1000); 
    }
});