"""Creation and lookup helpers for the 20-day public-data access register."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.public_access import PublicDataAccessEvent
from api.models.test import Test
from api.models.user import User


def released_sections(test: Test, private_access: bool) -> list[str]:
    fields = (
        "test_details",
        "raw_data",
        "processed_data",
        "final_results",
        "statistical_analysis",
    )
    if private_access:
        return [field for field in fields if getattr(test, field) is not None]
    return [
        field
        for field in fields
        if getattr(test, f"release_{field}", False) and getattr(test, field) is not None
    ]


async def record_test_access(
    db: AsyncSession,
    user: User,
    test: Test,
    *,
    private_access: bool,
    request_id: str | None,
    source_endpoint: str,
) -> PublicDataAccessEvent:
    event = PublicDataAccessEvent(
        user_id=user.id,
        user_name=user.name or "",
        user_email=user.email.lower(),
        test_id=test.id,
        test_name=test.test_name,
        work_package_name=test.work_package_name,
        element_cms_id=test.element_cms_id,
        organisation_id=test.organisation_id,
        access_level="private" if private_access else "public",
        released_sections=released_sections(test, private_access),
        request_id=request_id,
        source_endpoint=source_endpoint,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def access_history_by_email(db: AsyncSession, email: str) -> tuple[User | None, list[PublicDataAccessEvent]]:
    normalized = email.strip().lower()
    user = await db.scalar(select(User).where(func.lower(User.email) == normalized))
    events = (
        await db.execute(
            select(PublicDataAccessEvent)
            .where(func.lower(PublicDataAccessEvent.user_email) == normalized)
            .order_by(PublicDataAccessEvent.accessed_at.desc())
        )
    ).scalars().all()
    return user, list(events)