# EchoTone

EchoTone is a web app for turning books and long-form text into narrated audio using a user's own voice.

## Product Goal

The first useful version should let a user:

1. Record or upload a clean voice sample.
2. Upload or paste book text.
3. Review text metadata such as word count and estimated duration.
4. Generate narrated audio.
5. Download the result as an audio file.

## MVP Scope

This repository currently starts with a local-first prototype for Russian audiobook narration. The frontend records or uploads a voice sample and sends it with Russian text to a local Python backend. The backend is prepared for XTTS-v2 voice cloning.

### Phase 1: Prototype

- Voice sample recording with the browser microphone.
- Voice sample upload.
- Text upload from `.txt` files.
- Manual paste/edit text area.
- Basic estimated reading time.
- Local backend generation request.

### Phase 2: Local Backend

- Local Python HTTP server.
- Local upload handling for voice samples and source text.
- XTTS-v2 adapter for Russian voice cloning.
- Local WAV output storage and downloads.
- Clear setup error when XTTS is not installed yet.

### Phase 3: Voice Cloning Integration

- Install and cache XTTS-v2 locally.
- Add explicit user consent for voice cloning.
- Validate audio quality before training/generation.
- Split long books into chunks.
- Generate, stitch, normalize, and export final audio.

### Phase 4: Production

- Payments or quota limits.
- Library of generated audiobooks.
- Chapter support.
- Multi-language support.
- Abuse prevention and voice ownership checks.

## Local Usage

Run the local EchoTone server:

```bash
python3 backend/server.py 8081
```

Then open:

```text
http://127.0.0.1:8081
```

The UI can record a voice sample and send Russian text to the backend. If XTTS is not installed yet, generation will return a setup message instead of falling back to a fake/system voice.

## Optional XTTS Setup

XTTS-v2 is not vendored into this repo because the model runtime and weights are large. Install it locally when you are ready to generate cloned Russian audio:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install TTS
python3 backend/server.py 8081
```

XTTS/PyTorch compatibility is usually better on Python 3.10 or 3.11 than on the newest Python versions. The first successful XTTS generation may download model weights into your local model cache. After that, the cached model can be used offline.

For best XTTS results, upload a clean `.wav` voice sample. The browser recorder may produce `.webm`; that is useful for testing the app flow, but local XTTS may require conversion before generation.

## Technical Direction

The current prototype is dependency-light HTML, CSS, JavaScript, and Python standard library backend code. A practical local stack is:

- Frontend: browser HTML/CSS/JavaScript.
- Backend: Python local server.
- Storage: local `data/uploads` and `data/outputs`.
- TTS: local XTTS-v2 adapter configured for Russian `ru`.
- Later: background queue for long books and chunk stitching.
