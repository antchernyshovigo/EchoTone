from __future__ import annotations

import json
import mimetypes
import os
import sys
import threading
import time
import uuid
from email.parser import BytesParser
from email.policy import default
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from tts.xtts_local import TtsEngineError, generate_russian_voice_clone


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
OUTPUTS_DIR = DATA_DIR / "outputs"
CACHE_DIR = DATA_DIR / "cache"
JOBS_DIR = DATA_DIR / "jobs"
MAX_UPLOAD_BYTES = 80 * 1024 * 1024

os.environ.setdefault("MPLCONFIGDIR", str(CACHE_DIR / "matplotlib"))
os.environ.setdefault("XDG_CACHE_HOME", str(CACHE_DIR / "xdg"))


class EchoToneHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith("/outputs/"):
            return self.serve_output()

        if self.path.startswith("/api/jobs/"):
            return self.serve_job_status()

        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/generate":
            return self.handle_generate()

        self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def handle_generate(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_json({"error": "Invalid Content-Length"}, HTTPStatus.BAD_REQUEST)

        if content_length <= 0:
            return self.send_json({"error": "Request body is empty"}, HTTPStatus.BAD_REQUEST)

        if content_length > MAX_UPLOAD_BYTES:
            return self.send_json({"error": "Upload is too large"}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            return self.send_json({"error": "Expected multipart/form-data"}, HTTPStatus.BAD_REQUEST)

        body = self.rfile.read(content_length)
        fields = parse_multipart(content_type, body)

        text = fields.get("text", {}).get("text", "").strip()
        voice = fields.get("voice")
        language = fields.get("language", {}).get("text", "ru").strip() or "ru"

        if not text:
            return self.send_json({"error": "Text is required"}, HTTPStatus.BAD_REQUEST)

        if not voice or not voice.get("content"):
            return self.send_json({"error": "Voice sample is required"}, HTTPStatus.BAD_REQUEST)

        job_id = uuid.uuid4().hex
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

        voice_ext = extension_for_upload(voice.get("filename"), voice.get("content_type"))
        voice_path = UPLOADS_DIR / f"{job_id}{voice_ext}"
        text_path = UPLOADS_DIR / f"{job_id}.txt"
        output_path = OUTPUTS_DIR / f"{job_id}.wav"

        voice_path.write_bytes(voice["content"])
        text_path.write_text(text, encoding="utf-8")

        estimate = estimate_duration(text)
        write_job_status(
            job_id,
            {
                "state": "queued",
                "message": "Queued local XTTS generation",
                "progress": 5,
                "startedAt": time.time(),
                "estimateSeconds": estimate,
            },
        )

        thread = threading.Thread(
            target=run_generation_job,
            kwargs={
                "job_id": job_id,
                "text": text,
                "voice_path": voice_path,
                "output_path": output_path,
                "language": language,
                "estimate_seconds": estimate,
            },
            daemon=True,
        )
        thread.start()

        self.send_json(
            {
                "jobId": job_id,
                "state": "queued",
                "statusUrl": f"/api/jobs/{job_id}",
                "estimateSeconds": estimate,
                "engine": "xtts_local",
                "language": language,
            },
            HTTPStatus.ACCEPTED,
        )
        return

    def serve_job_status(self):
        job_id = Path(self.path.removeprefix("/api/jobs/")).name
        status_path = JOBS_DIR / f"{job_id}.json"
        if not status_path.exists():
            return self.send_json({"error": "Job not found"}, HTTPStatus.NOT_FOUND)

        self.send_json(json.loads(status_path.read_text(encoding="utf-8")))

    def serve_output(self):
        filename = Path(self.path.removeprefix("/outputs/")).name
        target = OUTPUTS_DIR / filename

        if not target.exists() or not target.is_file():
            return self.send_error(HTTPStatus.NOT_FOUND, "Output not found")

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload, status=HTTPStatus.OK):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def parse_multipart(content_type: str, body: bytes):
    message = BytesParser(policy=default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
    )

    fields = {}
    for part in message.iter_parts():
        disposition = part.get("Content-Disposition", "")
        if "form-data" not in disposition:
            continue

        name = part.get_param("name", header="Content-Disposition")
        if not name:
            continue

        filename = part.get_param("filename", header="Content-Disposition")
        content = part.get_payload(decode=True) or b""
        content_type_part = part.get_content_type()

        if filename:
            fields[name] = {
                "filename": filename,
                "content": content,
                "content_type": content_type_part,
            }
        else:
            fields[name] = {
                "text": content.decode(part.get_content_charset() or "utf-8", errors="replace"),
                "content_type": content_type_part,
            }

    return fields


def extension_for_upload(filename: str | None, content_type: str | None):
    if filename:
        suffix = Path(filename).suffix
        if suffix:
            return suffix

    return mimetypes.guess_extension(content_type or "") or ".webm"


def estimate_duration(text: str):
    words = len(text.split())
    # First local XTTS calls have model warm-up overhead. Keep the estimate honest, not pretty.
    return max(45, min(900, int(words * 1.6 + 35)))


def write_job_status(job_id: str, payload: dict):
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = JOBS_DIR / f"{job_id}.tmp"
    status_path = JOBS_DIR / f"{job_id}.json"
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp_path.replace(status_path)


def update_job_status(job_id: str, **changes):
    status_path = JOBS_DIR / f"{job_id}.json"
    current = {}
    if status_path.exists():
        current = json.loads(status_path.read_text(encoding="utf-8"))

    current.update(changes)
    current["updatedAt"] = time.time()
    write_job_status(job_id, current)


def run_generation_job(
    *,
    job_id: str,
    text: str,
    voice_path: Path,
    output_path: Path,
    language: str,
    estimate_seconds: int,
):
    try:
        update_job_status(
            job_id,
            state="running",
            message="Preparing voice sample and loading XTTS",
            progress=15,
            estimateSeconds=estimate_seconds,
        )

        generate_russian_voice_clone(
            text=text,
            speaker_wav=voice_path,
            output_wav=output_path,
            language=language,
            progress_callback=lambda message, progress: update_job_status(
                job_id,
                state="running",
                message=message,
                progress=progress,
                estimateSeconds=estimate_seconds,
            ),
        )

        update_job_status(
            job_id,
            state="done",
            message="Audio ready",
            progress=100,
            audioUrl=f"/outputs/{output_path.name}",
            engine="xtts_local",
            language=language,
        )
    except TtsEngineError as error:
        update_job_status(
            job_id,
            state="error",
            message=str(error),
            progress=0,
            engine="xtts_local",
        )
    except Exception as error:  # noqa: BLE001
        update_job_status(
            job_id,
            state="error",
            message=f"Local generation failed: {error}",
            progress=0,
            engine="xtts_local",
        )


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    server = ThreadingHTTPServer(("127.0.0.1", port), EchoToneHandler)
    print(f"EchoTone local server running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
