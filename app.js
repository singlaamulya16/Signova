const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const output = document.getElementById("output");
const confidenceEl = document.getElementById("confidence");
const statusEl = document.querySelector(".status");

// 🧠 STATE
let lastGesture = "...";
let lastSpoken = "";
let gestureBuffer = [];

const BUFFER_SIZE = 10;

// 🎥 CANVAS
canvas.width = 420;
canvas.height = 280;

// 🎥 CAMERA
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  });

// 🧠 MEDIAPIPE
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

// 🎯 GESTURE LOGIC
function detectGesture(landmarks) {
  const thumb = landmarks[4].x < landmarks[3].x;
  const index = landmarks[8].y < landmarks[6].y;
  const middle = landmarks[12].y < landmarks[10].y;
  const ring = landmarks[16].y < landmarks[14].y;
  const pinky = landmarks[20].y < landmarks[18].y;

  if (thumb && !index && !middle && !ring && !pinky) return "YES";
  if (!index && !middle && !ring && !pinky) return "NO";
  if (index && middle && ring && pinky) return "HELLO";
  if (index && !middle && !ring && !pinky) return "ONE";
  if (index && middle && !ring && !pinky) return "TWO";

  return "...";
}

// 🖐️ MAIN LOOP
hands.onResults((results) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.multiHandLandmarks.length > 0) {
    statusEl.innerText = "● Detecting";
    statusEl.style.color = "#22c55e";

    const landmarks = results.multiHandLandmarks[0];

    // 🎨 Draw landmarks
    for (let point of landmarks) {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#22c55e";
      ctx.fill();
    }

    const gesture = detectGesture(landmarks);

    // 🧠 BUFFER
    gestureBuffer.push(gesture);
    if (gestureBuffer.length > BUFFER_SIZE) {
      gestureBuffer.shift();
    }

    // 🧠 COUNT FREQUENCY
    const counts = {};
    gestureBuffer.forEach(g => {
      counts[g] = (counts[g] || 0) + 1;
    });

    // 🧠 FIND MOST STABLE
    const stableGesture = Object.keys(counts).reduce((a, b) =>
      counts[a] > counts[b] ? a : b
    );

    // 📊 CONFIDENCE
    const confidence = Math.round((counts[stableGesture] / gestureBuffer.length) * 100);
    confidenceEl.innerText = "Confidence: " + confidence + "%";

    // ✅ UPDATE OUTPUT
    if (stableGesture !== lastGesture && stableGesture !== "...") {
      lastGesture = stableGesture;
            output.style.opacity = 0;

      setTimeout(() => {
        output.innerText = stableGesture;
        output.style.opacity = 1;
      }, 150);

      // 🔊 AUTO SPEAK
      if (stableGesture !== lastSpoken) {
        speechSynthesis.cancel();
        speechSynthesis.speak(new SpeechSynthesisUtterance(stableGesture));
        lastSpoken = stableGesture;
      }
    }

  } else {
    // 🚫 NO HAND
    statusEl.innerText = "● No Hand";
    statusEl.style.color = "#ef4444";

    output.innerText = "No Hand Detected";
    confidenceEl.innerText = "";
    gestureBuffer = [];
  }
});

// 🎥 CAMERA LOOP
const camera = new Camera(video, {
  onFrame: async () => {
    await hands.send({ image: video });
  },
  width: 420,
  height: 280
});

camera.start();

// 🔊 MANUAL SPEAK
function speak() {
  const text = output.innerText;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// ⏸ PAUSE
function pauseCam() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    statusEl.innerText = "● Paused";
    statusEl.style.color = "#facc15";
  }
}

// 🔄 RESET
function resetText() {
  output.innerText = "...";
  confidenceEl.innerText = "";
  gestureBuffer = [];
  lastGesture = "...";
}

// ✨ PARTICLES
const pCanvas = document.getElementById("particles");
const pCtx = pCanvas.getContext("2d");

pCanvas.width = window.innerWidth;
pCanvas.height = window.innerHeight;

let particles = [];

for (let i = 0; i < 80; i++) {
  particles.push({
    x: Math.random() * pCanvas.width,
    y: Math.random() * pCanvas.height,
    radius: Math.random() * 2,
    dx: (Math.random() - 0.5) * 0.5,
    dy: (Math.random() - 0.5) * 0.5
  });
}

function animateParticles() {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);

  particles.forEach(p => {
    p.x += p.dx;
    p.y += p.dy;

    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    pCtx.fillStyle = "rgba(34,197,94,0.5)";
    pCtx.fill();
  });

  requestAnimationFrame(animateParticles);
}

animateParticles();

// ℹ️ MODAL
function openModal() {
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}
window.onload = () => {
  setTimeout(() => {
    openModal();
  }, 800);
};