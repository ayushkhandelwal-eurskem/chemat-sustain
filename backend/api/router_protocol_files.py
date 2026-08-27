"""Protocol SOP file endpoints: upload, download, delete.

Files are stored on local disk under PROTOCOL_FILE_DIR. That directory MUST be
a Docker volume mounted from the host (see docker-compose snippet in the README)
or uploads will live in the ephemeral container layer and disappear on the next
deploy.

When you migrate to IONOS Object Storage: replace the disk writes in
upload_protocol_file with an S3 put, return a presigned URL from
download_protocol_file, and store the object key in proto.file_path. The model,
the tree serialization, and the frontend stay unchanged.
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas.user import Role
from security.files import resolve_beneath, safe_filename
from utils.auth import get_current_user, get_user_by_role
from utils.db import get_db
from .models_tree import Protocol

router = APIRouter(prefix="/protocols", tags=["protocol-files"])

UPLOAD_DIR = Path(os.environ.get("PROTOCOL_FILE_DIR", "/data/protocol_files"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_MIME = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
}
MAX_BYTES = 25 * 1024 * 1024  # 25 MB


async def _get_protocol(protocol_id: int, session: AsyncSession) -> Protocol:
    proto = (
        await session.execute(select(Protocol).where(Protocol.id == protocol_id))
    ).scalar_one_or_none()
    if proto is None:
        raise HTTPException(404, "Protocol not found")
    return proto


def _stored_file_path(value: str, *, must_exist: bool = True) -> Path:
    """Resolve a database-stored path without permitting an upload-root escape.

    Existing rows store absolute paths, while older development rows may contain
    a path relative to ``UPLOAD_DIR``.  Both forms are accepted, but symlinks,
    ``..`` components and corrupted absolute paths outside the configured root
    fail closed.
    """
    root = UPLOAD_DIR.resolve(strict=True)
    candidate = Path(value)
    try:
        if candidate.is_absolute():
            relative = candidate.relative_to(root)
        else:
            try:
                relative = candidate.relative_to(UPLOAD_DIR)
            except ValueError:
                relative = candidate
    except ValueError:
        raise HTTPException(404, "No file attached to this protocol.")
    return resolve_beneath(root, *relative.parts, must_exist=must_exist)


@router.post("/{protocol_id}/file")
async def upload_protocol_file(
    protocol_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_user_by_role(Role.admin)),
):
    proto = await _get_protocol(protocol_id, session)

    # Validate the old database path before writing a replacement. A corrupted
    # row must not turn this endpoint into an arbitrary-file deletion primitive.
    previous_path = (
        _stored_file_path(proto.file_path, must_exist=False)
        if proto.file_path
        else None
    )

    ext = ALLOWED_MIME.get(file.content_type)
    if ext is None:
        raise HTTPException(415, "Only PDF and Word (.doc/.docx) files are accepted.")

    safe_name = f"{protocol_id}_{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / safe_name
    size = 0
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(413, "File exceeds the 25 MB limit.")
                out.write(chunk)
    finally:
        await file.close()

    # Verify magic bytes so a renamed file can't pose as an allowed type.
    head = dest.read_bytes()[:8]
    is_pdf = head.startswith(b"%PDF")
    is_zip = head.startswith(b"PK\x03\x04")          # .docx is a zip container
    is_ole = head.startswith(b"\xd0\xcf\x11\xe0")    # legacy .doc (OLE)
    if not (is_pdf or is_zip or is_ole):
        dest.unlink(missing_ok=True)
        raise HTTPException(415, "File content does not match its type.")

    # Replace any previously attached file.
    if previous_path:
        previous_path.unlink(missing_ok=True)

    proto.file_path = str(dest)
    proto.file_name = file.filename
    proto.file_mime = file.content_type
    proto.file_size = size
    await session.commit()

    return {
        "id": proto.id,
        "file_name": proto.file_name,
        "file_mime": proto.file_mime,
        "file_size": proto.file_size,
    }


@router.get("/{protocol_id}/file")
async def download_protocol_file(
    protocol_id: int,
    session: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    proto = await _get_protocol(protocol_id, session)
    if not proto.file_path:
        raise HTTPException(404, "No file attached to this protocol.")
    path = _stored_file_path(proto.file_path)
    # Content-Disposition: inline lets the browser render PDFs in-page (the
    # frontend embeds this URL in an <object>). Passing filename= would force
    # `attachment` and trigger a download instead. The filename is still set
    # via the header so a manual download keeps the original name.
    safe_name = safe_filename(proto.file_name or "protocol")
    return FileResponse(
        path=path,
        media_type=proto.file_mime or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/{protocol_id}/file")
async def delete_protocol_file(
    protocol_id: int,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_user_by_role(Role.admin)),
):
    proto = await _get_protocol(protocol_id, session)
    if proto.file_path:
        _stored_file_path(proto.file_path, must_exist=False).unlink(missing_ok=True)
    proto.file_path = None
    proto.file_name = None
    proto.file_mime = None
    proto.file_size = None
    await session.commit()
    return {"id": proto.id, "deleted": True}