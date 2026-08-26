#!/usr/bin/env python3
"""Create a user account bound to an organisation, without a browser session.

The HTTP endpoints under /users need an admin session cookie, which requires
OTP delivery over SMTP - not available in every environment. This talks to the
database directly, applying the same rules the endpoint does: unique email,
bcrypt-hashed password, non-admin role by default, organisation binding.

Run inside the backend container:

    docker compose exec -T backend python /app/scripts/create_org_user.py \
        --email developer@partner.org --org ulodz

The password is generated server-side and shown exactly once, like an API
client secret. Have the user change it at first login (legacy flow) or before
the Keycloak cutover.
"""

from __future__ import annotations

import argparse
import asyncio
import secrets
import sys

sys.path.insert(0, "/app")

from sqlalchemy import select, text  # noqa: E402

from api.models.user import User  # noqa: E402
from api.schemas.user import Role  # noqa: E402
from utils.auth import pwd_context  # noqa: E402
from utils.db import AsyncSessionLocal  # noqa: E402


async def create_user(email: str, org_slug: str, role: str) -> None:
    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(select(User).where(User.email == email))
        ).scalars().first()
        if existing is not None:
            sys.exit(f"User {email!r} already exists (id={existing.id}); nothing done.")

        row = (
            await db.execute(text("select id from organisations where slug = :s"), {"s": org_slug})
        ).first()
        if row is None:
            sys.exit(f"No organisation with slug {org_slug!r}.")
        organisation_id = row[0]

        password = secrets.token_urlsafe(12)
        # organisation_id is NOT NULL in the database (migration 002) but is
        # not mapped on the legacy User model, so the ORM insert would omit
        # it. Insert directly with the binding included in one statement.
        result = await db.execute(
            text(
                """
                insert into users (email, password, role, is_active, organisation_id)
                values (:email, :password, cast(:role as role), true, :org)
                returning id
                """
            ),
            {
                "email": email,
                "password": pwd_context.hash(password),
                "role": role,
                "org": organisation_id,
            },
        )
        user_id = result.scalar_one()
        await db.commit()

    print()
    print("=" * 68)
    print("  USER CREATED - copy the password now, it is not recoverable")
    print("=" * 68)
    print(f"  email         : {email}")
    print(f"  role          : {role}")
    print(f"  organisation  : {org_slug} ({organisation_id})")
    print(f"  password      : {password}")
    print("=" * 68)
    print("\n  Deliver over a password manager. The user should change it after")
    print("  first sign-in; it also unlocks OTP by email once SMTP is configured.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--email", required=True)
    ap.add_argument("--org", required=True, help="organisation slug, e.g. eurskem")
    ap.add_argument("--role", default="user", choices=[r.value for r in Role])
    args = ap.parse_args()

    asyncio.run(create_user(args.email, args.org, args.role))


if __name__ == "__main__":
    main()
