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

This repository currently starts with a browser-only prototype. It does not clone a voice yet. The first prototype focuses on the core product flow and uses the browser's built-in speech synthesis only as a placeholder preview.

### Phase 1: Prototype

- Voice sample recording with the browser microphone.
- Voice sample upload.
- Text upload from `.txt` files.
- Manual paste/edit text area.
- Basic estimated reading time.
- Mock generation state and audio preview placeholder.

### Phase 2: Backend

- User accounts and private storage.
- Secure upload API for voice samples and source text.
- Background narration jobs.
- Job progress and status history.
- Audio output storage and downloads.

### Phase 3: Voice Cloning Integration

- Pick a TTS provider or self-hosted model.
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

Open `index.html` in a browser.

For microphone recording, some browsers require a local server. From this folder, run:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Technical Direction

The current prototype is dependency-free HTML, CSS, and JavaScript. A practical production stack would be:

- Frontend: React or Next.js.
- Backend: Node.js or Python FastAPI.
- Storage: S3-compatible object storage.
- Database: Postgres.
- Jobs: Redis queue or managed background workers.
- TTS: external voice cloning provider first, self-hosted model later if needed.
