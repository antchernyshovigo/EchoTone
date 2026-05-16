const recordButton = document.querySelector("#recordButton");
const deleteVoiceButton = document.querySelector("#deleteVoiceButton");
const modeInputs = document.querySelectorAll("input[name='narrationMode']");
const modeState = document.querySelector("#modeState");
const modeHint = document.querySelector("#modeHint");
const voiceLibrary = document.querySelector("#voiceLibrary");
const voiceName = document.querySelector("#voiceName");
const saveVoiceButton = document.querySelector("#saveVoiceButton");
const deleteSavedVoiceButton = document.querySelector("#deleteSavedVoiceButton");
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
let selectedVoiceId = "";
let savedVoices = [];
let narrationMode = "system";
let activeJobPoll;

function setStatus(message, ready = false) {
  statusText.textContent = message;
  statusDot.classList.toggle("ready", ready);
}

function setPill(element, label, className = "") {
  element.className = `pill ${className}`.trim();
  element.textContent = label;
}

function updateGenerateState() {
  const needsVoice = narrationMode === "clone";
  const voiceReady = hasVoice || Boolean(selectedVoiceId);
  generateButton.disabled = !(hasText && (!needsVoice || voiceReady));
  saveVoiceButton.disabled = !voiceBlob || !voiceName.value.trim();
  deleteSavedVoiceButton.disabled = !selectedVoiceId;

  if (!hasText) {
    setStatus("Add book text");
  } else if (needsVoice && !voiceReady) {
    setStatus("Add a voice sample");
  } else {
    setStatus("Ready to narrate", true);
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
  selectedVoiceId = "";
  voiceLibrary.value = "";
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
  selectedVoiceId = "";
  voiceLibrary.value = "";
  hasVoice = false;
  deleteVoiceButton.hidden = true;
  setPill(voiceState, "Missing");
  voiceMeta.textContent = "Use 30-90 seconds of clean speech for best results later.";
  setPill(jobState, "Idle");
  progressFill.style.width = "0%";
  resultBox.innerHTML = "<p>No narration started yet.</p>";
  stopJobPolling();
  updateGenerateState();
}

async function loadVoiceLibrary() {
  try {
    const response = await fetch("/api/voices");
    const payload = await response.json();
    savedVoices = Array.isArray(payload.voices) ? payload.voices : [];
    renderVoiceLibrary();
  } catch (error) {
    savedVoices = [];
    renderVoiceLibrary();
  }
}

function renderVoiceLibrary() {
  voiceLibrary.innerHTML = '<option value="">Current sample</option>';
  for (const voice of savedVoices) {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = voice.name;
    voiceLibrary.appendChild(option);
  }

  voiceLibrary.value = selectedVoiceId;
}

async function saveCurrentVoice() {
  if (!voiceBlob || !voiceName.value.trim()) {
    updateGenerateState();
    return;
  }

  saveVoiceButton.disabled = true;
  const formData = new FormData();
  formData.append("name", voiceName.value.trim());
  formData.append("language", "ru");
  formData.append("voice", voiceBlob, voiceFilename);

  try {
    const response = await fetch("/api/voices", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not save voice");
    }

    selectedVoiceId = payload.id;
    hasVoice = true;
    setPill(voiceState, "Saved", "good");
    voiceMeta.textContent = `${payload.name} saved to local voice library.`;
    voiceName.value = "";
    await loadVoiceLibrary();
    updateGenerateState();
  } catch (error) {
    setStatus(error.message);
  } finally {
    updateGenerateState();
  }
}

async function deleteSavedVoice() {
  if (!selectedVoiceId) {
    updateGenerateState();
    return;
  }

  deleteSavedVoiceButton.disabled = true;
  const deletedId = selectedVoiceId;

  try {
    const response = await fetch(`/api/voices/${deletedId}`, {
      method: "DELETE",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not delete voice");
    }

    selectedVoiceId = "";
    voiceLibrary.value = "";
    hasVoice = Boolean(voiceBlob);
    setPill(voiceState, hasVoice ? "Loaded" : "Missing", hasVoice ? "good" : "");
    voiceMeta.textContent = hasVoice
      ? "Current voice sample selected."
      : "Use 30-90 seconds of clean speech for best results later.";
    await loadVoiceLibrary();
  } catch (error) {
    setStatus(error.message);
  } finally {
    updateGenerateState();
  }
}

function selectSavedVoice() {
  selectedVoiceId = voiceLibrary.value;
  if (!selectedVoiceId) {
    hasVoice = Boolean(voiceBlob);
    setPill(voiceState, hasVoice ? "Loaded" : "Missing", hasVoice ? "good" : "");
    voiceMeta.textContent = hasVoice
      ? "Current voice sample selected."
      : "Use 30-90 seconds of clean speech for best results later.";
    updateGenerateState();
    return;
  }

  const selected = savedVoices.find((voice) => voice.id === selectedVoiceId);
  hasVoice = true;
  setPill(voiceState, "Library", "good");
  voiceMeta.textContent = selected
    ? `${selected.name} selected from local voice library.`
    : "Saved voice selected from local library.";
  updateGenerateState();
}

function setNarrationMode(mode) {
  narrationMode = mode;
  const isSystem = narrationMode === "system";
  setPill(modeState, isSystem ? "System" : "My voice", isSystem ? "good" : "busy");
  modeHint.textContent = isSystem
    ? "System voice runs in the browser and does not need a voice sample."
    : "My voice uses the local XTTS backend and needs a recorded or uploaded sample.";
  generateButton.textContent = isSystem ? "Play narration" : "Generate Russian audio";
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
saveVoiceButton.addEventListener("click", saveCurrentVoice);
deleteSavedVoiceButton.addEventListener("click", deleteSavedVoice);
voiceName.addEventListener("input", updateGenerateState);
voiceLibrary.addEventListener("change", selectSavedVoice);

modeInputs.forEach((input) => {
  input.addEventListener("change", () => setNarrationMode(input.value));
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

generateButton.addEventListener("click", async () => {
  if (narrationMode === "system") {
    playWithSystemVoice();
    return;
  }

  if ((!voiceBlob && !selectedVoiceId) || !bookText.value.trim()) {
    updateGenerateState();
    return;
  }

  setPill(jobState, "Running", "busy");
  setStatus("Starting local XTTS job");
  resultBox.innerHTML = "<p>Starting local XTTS generation...</p>";
  generateButton.disabled = true;
  progressFill.style.width = "8%";

  const formData = new FormData();
  formData.append("language", "ru");
  formData.append("text", bookText.value.trim());
  if (selectedVoiceId) {
    formData.append("voiceId", selectedVoiceId);
  } else {
    formData.append("voice", voiceBlob, voiceFilename);
  }

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Local generation failed");
    }

    pollGenerationJob(payload.jobId, payload.estimateSeconds);
  } catch (error) {
    progressFill.style.width = "0%";
    setPill(jobState, "Needs setup");
    setStatus("Local XTTS setup required");
    resultBox.innerHTML = `<p>${error.message}</p>`;
    generateButton.disabled = !((hasVoice || selectedVoiceId) && hasText);
  }
});

function pollGenerationJob(jobId, estimateSeconds = 60) {
  stopJobPolling();
  const startedAt = Date.now();

  async function poll() {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not read job status");
      }

      const progress = Math.max(0, Math.min(100, payload.progress || 0));
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const remainingSeconds = Math.max(0, (payload.estimateSeconds || estimateSeconds) - elapsedSeconds);

      progressFill.style.width = `${progress}%`;
      setStatus(payload.message || "Generating locally");
      resultBox.innerHTML = `<p>${payload.message || "Generating locally"} · elapsed ${formatDuration(elapsedSeconds)} · estimate ${formatDuration(remainingSeconds)} left</p>`;

      if (payload.state === "done") {
        stopJobPolling();
        progressFill.style.width = "100%";
        setPill(jobState, "Done", "good");
        setStatus("Russian audio ready", true);
        resultBox.innerHTML = `
          <audio class="audio-player" controls src="${payload.audioUrl}"></audio>
          <p><a href="${payload.audioUrl}" download>Download generated WAV</a></p>
        `;
        generateButton.disabled = !((hasVoice || selectedVoiceId) && hasText);
        return;
      }

      if (payload.state === "error") {
        throw new Error(payload.message || "Local generation failed");
      }
    } catch (error) {
      stopJobPolling();
      progressFill.style.width = "0%";
      setPill(jobState, "Error");
      setStatus("Local XTTS failed");
      resultBox.innerHTML = `<p>${error.message}</p>`;
      generateButton.disabled = !((hasVoice || selectedVoiceId) && hasText);
    }
  }

  poll();
  activeJobPoll = window.setInterval(poll, 2000);
}

function stopJobPolling() {
  if (activeJobPoll) {
    window.clearInterval(activeJobPoll);
    activeJobPoll = undefined;
  }
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function playWithSystemVoice() {
  const text = bookText.value.trim();
  if (!text || !("speechSynthesis" in window)) {
    setStatus("System voice is not available");
    return;
  }

  window.speechSynthesis.cancel();
  setPill(jobState, "Playing", "busy");
  setStatus("Playing system voice", true);
  progressFill.style.width = "100%";
  resultBox.innerHTML = "<p>System voice playback is running in the browser.</p>";

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ru-RU";
  utterance.rate = 1;
  utterance.onend = () => {
    setPill(jobState, "Done", "good");
    setStatus("System narration finished", true);
  };
  utterance.onerror = () => {
    setPill(jobState, "Error");
    setStatus("System voice failed");
  };

  window.speechSynthesis.speak(utterance);
}

updateTextMetrics();
setNarrationMode("system");
loadVoiceLibrary();
