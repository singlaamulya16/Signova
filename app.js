// Signova App Logic
console.log("Signova System Initialized");

// Elements
const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null;
const statusDot = document.getElementById('system-dot');
const trackerStatus = document.getElementById('tracker-status');
const gestureOutput = document.getElementById('gesture-output');
const confidenceScore = document.getElementById('confidence-score');

// Modal Elements
const infoBtn = document.getElementById('info-btn');
const closeModalBtn = document.getElementById('close-modal');
const infoModal = document.getElementById('info-modal');

if (infoBtn && closeModalBtn && infoModal) {
    infoBtn.addEventListener('click', () => {
        infoModal.classList.remove('hidden');
    });
    closeModalBtn.addEventListener('click', () => {
        infoModal.classList.add('hidden');
    });
}

// MediaPipe Setup
let hands;
let camera;

async function setupMediaPipe() {
    if (!videoElement || !canvasElement) return;

    try {
        hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        hands.onResults(onResults);

        camera = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({ image: videoElement });
            },
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

// Prediction buffer and stabilization
const gestureBuffer = [];
const BUFFER_SIZE = 10;
let stableGesture = "";
let ttsEnabled = true;

const ttsBtn = document.getElementById('tts-toggle');
if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
        ttsEnabled = !ttsEnabled;
        ttsBtn.innerText = ttsEnabled ? "TTS: ON" : "TTS: OFF";
        ttsBtn.classList.toggle('active', ttsEnabled);
    });
}

const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        gestureBuffer.length = 0;
        stableGesture = "";
        gestureOutput.innerText = "AWAITING HAND...";
        confidenceScore.innerText = "0%";
        window.speechSynthesis.cancel();
    });
}

function speakGesture(text) {
    if (!ttsEnabled || text === "UNKNOWN" || text === "No Hand Detected") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1;
    utterance.pitch = 1;
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
}

function setGesture(text, conf) {
    gestureOutput.innerText = text;
    setConfidence(conf);
}

function setConfidence(conf) {
    confidenceScore.innerText = `${conf}%`;
    if (conf > 75) {
        confidenceScore.style.color = 'var(--neon-green)';
    } else if (conf > 40) {
        confidenceScore.style.color = '#eab308'; // yellow
    } else {
        confidenceScore.style.color = '#ef4444'; // red
    }
}

function updatePrediction(newGesture) {
    if (newGesture) {
        gestureBuffer.push(newGesture);
    } else {
        gestureBuffer.length = 0; // Clear buffer
        if (stableGesture !== "") {
            stableGesture = "";
            setGesture("No Hand Detected", 0);
        }
        return;
    }
    
    if (gestureBuffer.length > BUFFER_SIZE) {
        gestureBuffer.shift();
    }
    
    // Majority voting
    const counts = {};
    let dominantGesture = newGesture;
    let maxCount = 0;
    
    for (const g of gestureBuffer) {
        if (g === "UNKNOWN") continue;
        counts[g] = (counts[g] || 0) + 1;
        if (counts[g] > maxCount) {
            maxCount = counts[g];
            dominantGesture = g;
        }
    }
    
    const activeLength = gestureBuffer.filter(g => g !== "UNKNOWN").length;
    let conf = 0;
    if (activeLength > 0) {
        conf = Math.round((maxCount / activeLength) * 100);
    }
    
    if (activeLength >= BUFFER_SIZE / 2 && conf > 50 && dominantGesture !== stableGesture) {
        stableGesture = dominantGesture;
        setGesture(stableGesture, conf);
        speakGesture(stableGesture);
    } else if (stableGesture && dominantGesture === stableGesture) {
        setConfidence(conf);
    }
}

const isFingerExtended = (landmarks, tipIdx, pipIdx) => {
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
}

const getGesture = (landmarks) => {
    const indexExt = isFingerExtended(landmarks, 8, 6);
    const middleExt = isFingerExtended(landmarks, 12, 10);
    const ringExt = isFingerExtended(landmarks, 16, 14);
    const pinkyExt = isFingerExtended(landmarks, 20, 18);
    
    const thumbUp = landmarks[4].y < landmarks[5].y && landmarks[4].y < landmarks[3].y;
    
    if (indexExt && middleExt && ringExt && pinkyExt) {
        return "HELLO"; // Open palm
    } else if (indexExt && middleExt && !ringExt && !pinkyExt) {
        return "TWO"; // Index and middle up
    } else if (indexExt && !middleExt && !ringExt && !pinkyExt) {
        return "ONE"; // Index up
    } else if (!indexExt && !middleExt && !ringExt && !pinkyExt) {
        if (thumbUp) {
            return "YES"; // Thumbs up
        } else {
            return "NO"; // Closed fist
        }
    }
    
    return "UNKNOWN";
}

function resizeCanvas() {
    if (videoElement && canvasElement) {
        if (canvasElement.width !== videoElement.videoWidth && videoElement.videoWidth > 0) {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        }
    }
}

function onResults(results) {
    if (!canvasCtx) return;
    resizeCanvas();
    if (canvasElement.width === 0 || canvasElement.height === 0) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the mirrored video frame on the canvas instead of directly displaying the video element
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        for (const ls of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, ls, HAND_CONNECTIONS, {color: '#22c55e', lineWidth: 4});
            drawLandmarks(canvasCtx, ls, {color: '#ffffff', lineWidth: 2, radius: 3});
        }
        const detectedGesture = getGesture(landmarks);
        updatePrediction(detectedGesture);
    } else {
        updatePrediction(null);
    }
    
    canvasCtx.restore();
}

window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('input-video')) {
        setupMediaPipe();
    }
});