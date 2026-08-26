"""User-level API resource grants; independent of organisation provenance."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, func

from utils.db import Base


class UserAccessProfile(Base):
    __tablename__ = "user_access_profiles"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    all_tests = Column(Boolean, nullable=False, default=False)
    all_protocols = Column(Boolean, nullable=False, default=False)
    all_files = Column(Boolean, nullable=False, default=False)
    is_platform_tester = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserTestAccess(Base):
    __tablename__ = "user_test_access"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    test_id = Column(Integer, ForeignKey("tests.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserProtocolAccess(Base):
    __tablename__ = "user_protocol_access"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    protocol_id = Column(Integer, ForeignKey("protocols.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())