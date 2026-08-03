#!/usr/bin/env python3
"""Issue a partner API credential from the server, without a browser session.

The HTTP endpoints under /api/admin/api-clients need an admin session cookie,
which is awkward to obtain from a shell - and impossible while OTP delivery is
broken. This talks to the database directly instead, applying the same rules the
endpoint does: admin-only, allow-listed scopes, bcrypt-hashed secret, plaintext
shown exactly once.

Run inside the backend container:

    docker compose exec -T backend python /app/scripts/issue_api_key.py \
        --name "University of Lodz pipeline" \
        --user-email partner@uni.lodz.pl \
        --org ulodz \
        --scopes tests:read,protocols:read

List and disable:

    ... issue_api_key.py --list
    ... issue_api_key.py --disable cms_abc123...
"""

from __future__ import annotations

import argparse
import asyncio
import sys

sys.path.insert(0, "/app")

from sqlalchemy import select, text  # noqa: E402

from api.models.api_client import ApiClient  # noqa: E402
from api.models.user import User  # noqa: E402
from security.api_key import (  # noqa: E402
    generate_client_id,
    generate_client_secret,
    hash_client_secret,
)
from utils.db import AsyncSessionLocal  # noqa: E402

# Mirrors ALLOWED_SCOPES in api/router_api_clients.py. Kept in step manually;
# an unknown scope authorises nothing, so a typo would create a credential that
# looks granted but cannot read anything.
ALLOWED_SCOPES = [
    "tests:read",
    "protocols:read",
    "protocol-files:download",
    "files:navigate",
]


async def issue(name, user_email, org_slug, scopes, note):
    scopes = sorted({s.strip() for s in scopes if s.strip()})
    unknown = [s for s in scopes if s not in ALLOWED_SCOPES]
    if unknown:
        sys.exit(f"Unknown scope(s): {', '.join(unknown)}\nAllowed: {', '.join(ALLOWED_SCOPES)}")
    if not scopes:
        sys.exit("At least one scope is required")

    async with AsyncSessionLocal() as db:
        user_id = None
        if user_email:
            user = (
                await db.execute(select(User).where(User.email == user_email))
            ).scalars().first()
            if user is None:
                sys.exit(f"No user with email {user_email!r}. Create the user first.")
            user_id = user.id

        organisation_id = None
        if org_slug:
            row = (
                await db.execute(
                    text("select id from organisations where slug = :s"), {"s": org_slug}
                )
            ).first()
            if row is None:
                sys.exit(
                    f"No organisation with slug {org_slug!r}. "
                    "Create it first, or omit --org (the credential will then see "
                    "no tenant-scoped rows)."
                )
            organisation_id = row[0]

        client_id = generate_client_id()
        secret = generate_client_secret()
        record = ApiClient(
            client_id=client_id,
            client_secret_hash=hash_client_secret(secret),
            name=name,
            organisation_id=organisation_id,
            user_id=user_id,
            scopes=scopes,
            note=note or "",
            created_by="issue_api_key.py (server-side)",
            is_active=True,
            secret_version=1,
        )
        db.add(record)
        await db.commit()

    print("\n" + "=" * 68)
    print("  API CREDENTIAL ISSUED - copy the secret now, it is not recoverable")
    print("=" * 68)
    print(f"  client_id     : {client_id}")
    print(f"  client_secret : {secret}")
    print(f"  name          : {name}")
    print(f"  organisation  : {org_slug or '(none - sees no tenant-scoped rows)'}")
    print(f"  user          : {user_email or '(none - system credential)'}")
    print(f"  scopes        : {', '.join(scopes)}")
    print("=" * 68)
    print("\n  Send to the partner over a password manager, never email or chat.")
    print("  They use it as:\n")
    print(f"    curl -u {client_id}:<client_secret> \\")
    print("      https://database.eurskem.com/api/v1/tests\n")


async def show_list():
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(select(ApiClient).order_by(ApiClient.created_at.desc()))
        ).scalars().all()
    if not rows:
        print("  no API clients issued yet")
        return
    print(f"  {'client_id':22} {'active':7} {'scopes':34} name")
    print("  " + "-" * 96)
    for r in rows:
        print(
            f"  {r.client_id:22} {str(r.is_active):7} "
            f"{','.join(r.scopes or []):34} {r.name}"
        )


async def set_active(client_id: str, active: bool):
    async with AsyncSessionLocal() as db:
        record = (
            await db.execute(select(ApiClient).where(ApiClient.client_id == client_id))
        ).scalars().first()
        if record is None:
            sys.exit(f"No API client with client_id {client_id!r}")
        record.is_active = active
        await db.commit()
    print(f"  {client_id} {'enabled' if active else 'disabled'} - effective on the next request")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name")
    ap.add_argument("--user-email", help="partner user this credential belongs to")
    ap.add_argument("--org", help="organisation slug, e.g. ulodz")
    ap.add_argument("--scopes", default="tests:read", help="comma separated")
    ap.add_argument("--note", default="")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--disable", metavar="CLIENT_ID")
    ap.add_argument("--enable", metavar="CLIENT_ID")
    args = ap.parse_args()

    if args.list:
        asyncio.run(show_list())
    elif args.disable:
        asyncio.run(set_active(args.disable, False))
    elif args.enable:
        asyncio.run(set_active(args.enable, True))
    elif args.name:
        asyncio.run(issue(args.name, args.user_email, args.org,
                          args.scopes.split(","), args.note))
    else:
        ap.error("give --name to issue, or --list / --disable / --enable")


if __name__ == "__main__":
    main()
