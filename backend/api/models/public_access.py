"""Short-lived records of which authenticated person viewed public test data."""

from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from utils.db import Base


class PublicDataAccessEvent(Base):
    __tablename__ = "public_data_access_events"

    event_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_name: Mapped[str] = mapped_column(String(200), nullable=False)
    user_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    test_id: Mapped[int | None] = mapped_column(
        ForeignKey("tests.id", ondelete="SET NULL"), nullable=True, index=True
    )
    test_name: Mapped[str] = mapped_column(String(160), nullable=False)
    work_package_name: Mapped[str] = mapped_column(String(160), nullable=False)
    element_cms_id: Mapped[str] = mapped_column(String(160), nullable=False)
    organisation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    access_level: Mapped[str] = mapped_column(String(20), nullable=False)
    released_sections: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    request_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_endpoint: Mapped[str] = mapped_column(String(160), nullable=False)
    accessed_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )