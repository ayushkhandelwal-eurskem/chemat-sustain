#!/usr/bin/env python3
"""Encrypt, verify, and purge public-data access records on a 20-day schedule."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, select

from api.models.public_access import PublicDataAccessEvent
from utils.db import AsyncSessionLocal

RETENTION_DAYS = 20
PREFIX = "public-access-"
SUFFIX = ".json.fernet"


def _fernet() -> Fernet:
    key = os.getenv("PUBLIC_ACCESS_BACKUP_KEY", "").strip().encode()
    if not key:
        raise RuntimeError("PUBLIC_ACCESS_BACKUP_KEY is required")
    return Fernet(key)


def _backup_dir() -> Path:
    path = Path(os.getenv("PUBLIC_ACCESS_BACKUP_DIR", "/var/backups/chemat-sustain/public-access"))
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path, 0o700)
    return path


def _payload(event: PublicDataAccessEvent) -> dict:
    return {
        column.name: getattr(event, column.key)
        for column in PublicDataAccessEvent.__table__.columns
    }


def archive_name(bucket: datetime) -> str:
    return f"{PREFIX}{bucket.strftime('%Y-%m-%dT%H00Z')}{SUFFIX}"


def archive_bucket(path: Path) -> datetime | None:
    raw = path.name[len(PREFIX):-len(SUFFIX)]
    try:
        return datetime.strptime(raw, "%Y-%m-%dT%H00Z").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def prune_archive(path: Path, cipher: Fernet, cutoff: datetime) -> bool:
    """Remove expired records inside one archive; return True when file removed."""
    try:
        records = json.loads(cipher.decrypt(path.read_bytes()))
    except (InvalidToken, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Refusing to prune unverifiable backup {path.name}") from exc

    retained = [
        item for item in records
        if datetime.fromisoformat(item["accessed_at"]).astimezone(timezone.utc) > cutoff
    ]
    if not retained:
        path.unlink()
        return True
    if len(retained) != len(records):
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(cipher.encrypt(json.dumps(retained, separators=(",", ":")).encode()))
        os.chmod(temporary, 0o600)
        temporary.replace(path)
        # Verify the rewritten archive before continuing.
        json.loads(cipher.decrypt(path.read_bytes()))
    return False


async def archive_hour(bucket: datetime, cipher: Fernet, directory: Path) -> int:
    start = bucket.replace(minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=1)
    async with AsyncSessionLocal() as db:
        events = list((await db.execute(
            select(PublicDataAccessEvent)
            .where(PublicDataAccessEvent.accessed_at >= start, PublicDataAccessEvent.accessed_at < end)
            .order_by(PublicDataAccessEvent.accessed_at, PublicDataAccessEvent.event_id)
        )).scalars().all())
        if not events:
            return 0

        plain = json.dumps([_payload(item) for item in events], default=str, separators=(",", ":")).encode()
        encrypted = cipher.encrypt(plain)
        destination = directory / archive_name(start)
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_bytes(encrypted)
        os.chmod(temporary, 0o600)
        temporary.replace(destination)

        try:
            restored = json.loads(cipher.decrypt(destination.read_bytes()))
        except (InvalidToken, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Backup verification failed for {start.isoformat()}") from exc
        if [item["event_id"] for item in restored] != [item.event_id for item in events]:
            raise RuntimeError(f"Backup verification count/order failed for {start.isoformat()}")
        return len(events)


async def run(now: datetime | None = None) -> dict[str, int]:
    now = now or datetime.now(timezone.utc)
    cipher = _fernet()
    directory = _backup_dir()
    cutoff = now - timedelta(days=RETENTION_DAYS)

    # Archive every live record before any deletion. Rewriting an hourly archive
    # captures late transactions; authenticated encryption is verified above.
    buckets: list[datetime] = []
    async with AsyncSessionLocal() as db:
        timestamps = (await db.execute(select(PublicDataAccessEvent.accessed_at))).scalars().all()
        buckets = sorted({
            timestamp.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
            for timestamp in timestamps
        })
    archived = sum([await archive_hour(item, cipher, directory) for item in buckets])

    # An event exactly 20 days old is expired. Delete only after archives for all
    # still-retained dates have completed and verified successfully.
    async with AsyncSessionLocal() as db:
        result = await db.execute(delete(PublicDataAccessEvent).where(PublicDataAccessEvent.accessed_at <= cutoff))
        deleted = int(result.rowcount or 0)
        await db.commit()

    removed_archives = 0
    for path in directory.glob(f"{PREFIX}*{SUFFIX}"):
        if archive_bucket(path) is not None and prune_archive(path, cipher, cutoff):
            removed_archives += 1
    return {"archived_records": archived, "deleted_records": deleted, "deleted_archives": removed_archives}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    print(json.dumps(asyncio.run(run()), sort_keys=True))


if __name__ == "__main__":
    main()