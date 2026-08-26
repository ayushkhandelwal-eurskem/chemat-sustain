#!/usr/bin/env python3
"""Seed the api_definitions catalogue used by the Developer Portal.

Run inside the backend container:

    docker compose exec -T backend python /app/scripts/seed_api_definitions.py

Mirrors the seed rows in migrations/001_secure_foundation.sql. Idempotent:
rows that already exist (by unique name) are left alone.
"""

from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, "/app")

from sqlalchemy import select  # noqa: E402

from api.models.security import ApiDefinition  # noqa: E402
from utils.db import AsyncSessionLocal  # noqa: E402

SEED = [
    ("Research tests", "v1", "Tenant-scoped research test results", "consortium",
     ["tests:read"]),
    ("Experimental data", "v1", "Tenant-scoped experimental datasets", "restricted",
     ["experimental-data:read"]),
    ("Protocol files", "v1", "Authorised protocol metadata and downloads", "consortium",
     ["protocol-files:read", "protocol-files:download"]),
    ("File navigation", "v1", "Tenant-scoped file navigation", "consortium",
     ["files:navigate", "files:read"]),
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        existing = set(
            (await db.execute(select(ApiDefinition.name))).scalars().all()
        )
        added = 0
        for name, version, description, classification, scopes in SEED:
            if name in existing:
                continue
            db.add(
                ApiDefinition(
                    name=name,
                    version=version,
                    description=description,
                    classification=classification,
                    scopes=scopes,
                )
            )
            added += 1
        await db.commit()
        rows = sorted((await db.execute(select(ApiDefinition.name))).scalars().all())
        print(f"Added {added} api_definitions. Catalogue now: {rows}")


if __name__ == "__main__":
    asyncio.run(main())
