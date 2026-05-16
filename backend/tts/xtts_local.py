from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


class TtsEngineError(RuntimeError):
    """Raised when a local TTS engine is not available or cannot generate audio."""


def generate_russian_voice_clone(
    *,
    text: str,
    speaker_wav: Path,
    output_wav: Path,
    language: str = "ru",
):
    """
    Generate Russian speech with a local XTTS-v2 installation.

    Install the optional runtime first:
      python3 -m venv .venv
      . .venv/bin/activate
      pip install TTS

    The first successful XTTS call may download model weights into the local
    model cache. After that, generation can run offline from the cached model.
    """
    try:
        from TTS.api import TTS
    except ImportError as error:
        raise TtsEngineError(
            "XTTS is not installed locally. Create a virtualenv and run `pip install TTS`, "
            "then restart the EchoTone server. The model weights must be available locally "
            "or downloaded once before offline use."
        ) from error

    if language != "ru":
        raise TtsEngineError("This local adapter is currently configured for Russian language code `ru`.")

    if not speaker_wav.exists():
        raise TtsEngineError("Voice sample file was not saved.")

    speaker_wav = ensure_supported_speaker_sample(speaker_wav)

    output_wav.parent.mkdir(parents=True, exist_ok=True)

    model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
    model.tts_to_file(
        text=text,
        speaker_wav=str(speaker_wav),
        language=language,
        file_path=str(output_wav),
    )

    if not output_wav.exists():
        raise TtsEngineError("XTTS finished without creating an output file.")


def ensure_supported_speaker_sample(speaker_path: Path):
    if speaker_path.suffix.lower() in {".wav", ".mp3", ".flac", ".m4a"}:
        return speaker_path

    if speaker_path.suffix.lower() not in {".webm", ".ogg"}:
        raise TtsEngineError(
            "XTTS needs a standard audio file for the speaker sample. Upload `.wav`, `.mp3`, `.flac`, "
            "or record in the browser so EchoTone can convert it locally."
        )

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise TtsEngineError(
            "Browser recordings need conversion before XTTS. Install `ffmpeg` or upload a clean `.wav` sample."
        )

    converted_path = speaker_path.with_suffix(".wav")
    command = [
        ffmpeg,
        "-y",
        "-i",
        str(speaker_path),
        "-ac",
        "1",
        "-ar",
        "24000",
        str(converted_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not converted_path.exists():
        raise TtsEngineError(f"Could not convert browser recording to WAV: {result.stderr.strip()}")

    return converted_path
