const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const output = document.getElementById("output");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  });

canvas.width = 420;
canvas.height = 280;

// 🎯 Simple Fake Detection Loop
setInterval(() => {
  const gestures = ["HELLO", "YES", "NO", "ONE", "TWO"];
  const random = gestures[Math.floor(Math.random() * gestures.length)];

  output.innerText = random;
}, 2000);

// 🔊 SPEAK
function speak() {
  const text = output.innerText;
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// ⏸ PAUSE
function pauseCam() {
  video.srcObject.getTracks().forEach(track => track.stop());
}

// 🔄 RESET
function resetText() {
  output.innerText = "...";
}