from __future__ import annotations

import os
from pathlib import Path


def uploads_base_dir() -> Path:
    """Return the base directory for user uploads.

    Defaults to a relative `uploads` folder (resolved from the process working directory).

    Deployment-friendly overrides:
    - UPLOADS_DIR: preferred
    - UPLOAD_DIR: legacy alias
    - UPLOAD_DIRECTORY: legacy alias
    """

    raw = (
        os.getenv("UPLOADS_DIR")
        or os.getenv("UPLOAD_DIR")
        or os.getenv("UPLOAD_DIRECTORY")
        or "uploads"
    ).strip()
    return Path(raw) if raw else Path("uploads")


def audio_upload_dir() -> Path:
    return uploads_base_dir() / "audio"


def resumes_upload_dir() -> Path:
    return uploads_base_dir() / "resumes"


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
