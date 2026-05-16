const recordButton = document.querySelector("#recordButton");
const deleteVoiceButton = document.querySelector("#deleteVoiceButton");
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
let voiceObjectUrl;
let voiceBlob;
let voiceFilename = "voice-sample.webm";

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
  } else if (!hasVoice) {
    setStatus("Add a voice sample");
  } else {
    setStatus("Add book text");
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
  if (voiceObjectUrl) {
    URL.revokeObjectURL(voiceObjectUrl);
  }

  const url = URL.createObjectURL(blob);
  voiceObjectUrl = url;
  voiceBlob = blob;
  voicePreview.src = url;
  voicePreview.hidden = false;
  hasVoice = true;
  deleteVoiceButton.hidden = false;
  setPill(voiceState, "Loaded", "good");
  voiceMeta.textContent = label;
  updateGenerateState();
}

function deleteVoiceSample() {
  if (isRecording && recorder?.state === "recording") {
    recorder.stop();
    isRecording = false;
    recordButton.textContent = "Start recording";
  }

  if (voiceObjectUrl) {
    URL.revokeObjectURL(voiceObjectUrl);
    voiceObjectUrl = undefined;
  }

  voicePreview.removeAttribute("src");
  voicePreview.load();
  voicePreview.hidden = true;
  voiceUpload.value = "";
  voiceBlob = undefined;
  voiceFilename = "voice-sample.webm";
  hasVoice = false;
  deleteVoiceButton.hidden = true;
  setPill(voiceState, "Missing");
  voiceMeta.textContent = "Use 30-90 seconds of clean speech for best results later.";
  setPill(jobState, "Idle");
  progressFill.style.width = "0%";
  resultBox.innerHTML = "<p>No local audio generated yet.</p>";
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
    voiceFilename = "voice-sample.webm";
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

  voiceFilename = file.name || "voice-sample.webm";
  loadVoiceBlob(file, `${file.name} selected.`);
});

deleteVoiceButton.addEventListener("click", deleteVoiceSample);

textUpload.addEventListener("change", async () => {
  const file = textUpload.files?.[0];
  if (!file) {
    return;
  }

  bookText.value = await file.text();
  updateTextMetrics();
});

bookText.addEventListener("input", updateTextMetrics);

generateButton.addEventListener("click", async () => {
  if (!voiceBlob || !bookText.value.trim()) {
    updateGenerateState();
    return;
  }

  setPill(jobState, "Running", "busy");
  setStatus("Generating locally with XTTS");
  resultBox.innerHTML = "<p>Sending text and voice sample to the local XTTS backend...</p>";
  generateButton.disabled = true;
  progressFill.style.width = "35%";

  const formData = new FormData();
  formData.append("language", "ru");
  formData.append("text", bookText.value.trim());
  formData.append("voice", voiceBlob, voiceFilename);

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Local generation failed");
    }

    progressFill.style.width = "100%";
    setPill(jobState, "Done", "good");
    setStatus("Russian audio ready", true);
    resultBox.innerHTML = `
      <audio class="audio-player" controls src="${payload.audioUrl}"></audio>
      <p><a href="${payload.audioUrl}" download>Download generated WAV</a></p>
    `;
  } catch (error) {
    progressFill.style.width = "0%";
    setPill(jobState, "Needs setup");
    setStatus("Local XTTS setup required");
    resultBox.innerHTML = `<p>${error.message}</p>`;
  } finally {
    generateButton.disabled = !(hasVoice && hasText);
  }
});

updateTextMetrics();
