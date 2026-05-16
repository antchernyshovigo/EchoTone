const recordButton = document.querySelector("#recordButton");
const voiceUpload = document.querySelector("#voiceUpload");
const voicePreview = document.querySelector("#voicePreview");
const voiceState = document.querySelector("#voiceState");
const voiceMeta = document.querySelector("#voiceMeta");
const textUpload = document.querySelector("#textUpload");
const bookText = document.querySelector("#bookText");
const textState = document.querySelector("#textState");
const wordCount = document.querySelector("#wordCount");
const durationEstimate = document.querySelector("#durationEstimate");
const generateButton = document.querySelector("#generateButton");
const progressFill = document.querySelector("#progressFill");
const jobState = document.querySelector("#jobState");
const resultBox = document.querySelector("#resultBox");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");

let recorder;
let chunks = [];
let hasVoice = false;
let hasText = false;
let isRecording = false;

function setStatus(message, ready = false) {
  statusText.textContent = message;
  statusDot.classList.toggle("ready", ready);
}

function setPill(element, label, className = "") {
  element.className = `pill ${className}`.trim();
  element.textContent = label;
}

function updateGenerateState() {
  generateButton.disabled = !(hasVoice && hasText);
  if (hasVoice && hasText) {
    setStatus("Ready to generate", true);
  }
}

function updateTextMetrics() {
  const text = bookText.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const minutes = Math.max(0, Math.ceil(words / 150));

  hasText = words > 0;
  wordCount.textContent = String(words);
  durationEstimate.textContent = words ? `${minutes} min` : "0 min";
  setPill(textState, hasText ? "Loaded" : "Empty", hasText ? "good" : "");
  updateGenerateState();
}

function loadVoiceBlob(blob, label) {
  const url = URL.createObjectURL(blob);
  voicePreview.src = url;
  voicePreview.hidden = false;
  hasVoice = true;
  setPill(voiceState, "Loaded", "good");
  voiceMeta.textContent = label;
  updateGenerateState();
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Microphone recording is not supported in this browser");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  recorder = new MediaRecorder(stream);

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  recorder.addEventListener("stop", () => {
    stream.getTracks().forEach((track) => track.stop());
    loadVoiceBlob(new Blob(chunks, { type: "audio/webm" }), "Recorded voice sample.");
  });

  recorder.start();
  isRecording = true;
  recordButton.textContent = "Stop recording";
  setPill(voiceState, "Recording", "busy");
  setStatus("Recording voice sample");
}

function stopRecording() {
  recorder.stop();
  isRecording = false;
  recordButton.textContent = "Start recording";
}

recordButton.addEventListener("click", async () => {
  try {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  } catch (error) {
    setStatus("Microphone access was blocked");
    setPill(voiceState, "Missing");
  }
});

voiceUpload.addEventListener("change", () => {
  const file = voiceUpload.files?.[0];
  if (!file) {
    return;
  }

  loadVoiceBlob(file, `${file.name} selected.`);
});

textUpload.addEventListener("change", async () => {
  const file = textUpload.files?.[0];
  if (!file) {
    return;
  }

  bookText.value = await file.text();
  updateTextMetrics();
});

bookText.addEventListener("input", updateTextMetrics);

generateButton.addEventListener("click", () => {
  let progress = 0;
  setPill(jobState, "Running", "busy");
  setStatus("Generating preview");
  resultBox.innerHTML = "<p>Preparing narration preview...</p>";
  generateButton.disabled = true;
  progressFill.style.width = "0%";

  const timer = setInterval(() => {
    progress += 20;
    progressFill.style.width = `${progress}%`;

    if (progress >= 100) {
      clearInterval(timer);
      setPill(jobState, "Done", "good");
      setStatus("Preview ready", true);
      resultBox.innerHTML = "<p>Prototype preview is ready. Real voice cloning will be connected through the backend in the next phase.</p>";
      generateButton.disabled = false;

      if ("speechSynthesis" in window) {
        const sample = bookText.value.trim().slice(0, 260);
        const utterance = new SpeechSynthesisUtterance(sample);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    }
  }, 350);
});

updateTextMetrics();
