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


@router.post("/{protocol_id}/file")
async def upload_protocol_file(
    protocol_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
):
    # TODO: gate this behind your write-auth dependency before going public.
    proto = await _get_protocol(protocol_id, session)

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
    if proto.file_path:
        Path(proto.file_path).unlink(missing_ok=True)

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
):
    proto = await _get_protocol(protocol_id, session)
    if not proto.file_path or not Path(proto.file_path).exists():
        raise HTTPException(404, "No file attached to this protocol.")
    # Content-Disposition: inline lets the browser render PDFs in-page (the
    # frontend embeds this URL in an <object>). Passing filename= would force
    # `attachment` and trigger a download instead. The filename is still set
    # via the header so a manual download keeps the original name.
    safe_name = (proto.file_name or "protocol").replace('"', "")
    return FileResponse(
        path=proto.file_path,
        media_type=proto.file_mime or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@router.delete("/{protocol_id}/file")
async def delete_protocol_file(
    protocol_id: int,
    session: AsyncSession = Depends(get_db),
):
    # TODO: gate this behind your write-auth dependency before going public.
    proto = await _get_protocol(protocol_id, session)
    if proto.file_path:
        Path(proto.file_path).unlink(missing_ok=True)
    proto.file_path = None
    proto.file_name = None
    proto.file_mime = None
    proto.file_size = None
    await session.commit()
    return {"id": proto.id, "deleted": True}