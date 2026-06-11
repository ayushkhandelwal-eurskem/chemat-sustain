"""SQLAlchemy models for the test-library navigation tree.

Hierarchy: Category -> Protocol -> ProtocolTest (leaf -> existing test).

The file_* columns on Protocol hold an attached SOP document. They are nullable
and empty until a file is uploaded. `file_path` is a local path now; it becomes
an S3 object key when you move to IONOS Object Storage.

IMPORTANT: this imports your existing declarative `Base`. Adjust the import
below to wherever your project defines it (commonly app.database or app.db).
"""
from __future__ import annotations

from sqlalchemy import Integer, Text, ForeignKey, TIMESTAMP, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from utils.db import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    protocols: Mapped[list["Protocol"]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="Protocol.sort_order",
    )


class Protocol(Base):
    __tablename__ = "protocols"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Attached SOP file (nullable until uploaded)
    file_path: Mapped[str | None] = mapped_column(Text)
    file_name: Mapped[str | None] = mapped_column(Text)
    file_mime: Mapped[str | None] = mapped_column(Text)
    file_size: Mapped[int | None] = mapped_column(Integer)

    category: Mapped["Category"] = relationship(back_populates="protocols")
    tests: Mapped[list["ProtocolTest"]] = relationship(
        back_populates="protocol",
        cascade="all, delete-orphan",
        order_by="ProtocolTest.sort_order",
    )


class ProtocolTest(Base):
    __tablename__ = "protocol_tests"
    __table_args__ = (
        UniqueConstraint(
            "work_package_name", "element_cms_id", "test_name",
            name="uq_protocol_tests_triple",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    protocol_id: Mapped[int] = mapped_column(
        ForeignKey("protocols.id", ondelete="CASCADE"), nullable=False
    )
    work_package_name: Mapped[str] = mapped_column(Text, nullable=False)
    element_cms_id: Mapped[str] = mapped_column(Text, nullable=False)
    test_name: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text)  # editable label
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    protocol: Mapped["Protocol"] = relationship(back_populates="tests")