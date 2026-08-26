"""Path boundary and file-name controls for tenant-owned content."""

from __future__ import annotations

import os
import unicodedata
from pathlib import Path, PurePath

from fastapi import HTTPException, status


def safe_filename(value: str, fallback: str = "download") -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    name = PurePath(normalized.replace("\\", "/")).name
    name = "".join(ch for ch in name if ch.isprintable() and ch not in {'"', "\r", "\n", "\x00"})
    return name[:180] or fallback


def resolve_beneath(root: Path, *parts: str, must_exist: bool = True) -> Path:
    try:
        root = root.resolve(strict=True)
    except OSError:
        # The tenant root itself does not exist (e.g. no file was ever stored
        # for this organisation). Without this guard the FileNotFoundError
        # escapes as a 500.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    for part in parts:
        if not isinstance(part, str) or not part or "\x00" in part:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid path")
        normalized = unicodedata.normalize("NFKC", part)
        if normalized in {".", ".."} or Path(normalized).is_absolute():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid path")

    candidate = root.joinpath(*parts)
    try:
        resolved = candidate.resolve(strict=must_exist)
        resolved.relative_to(root)
    except (OSError, RuntimeError, ValueError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")

    # A resolved path inside root is safe even if intermediate components are
    # symlinks; a symlink escape fails relative_to above.
    return resolved
