from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from utils.db import Base
from datetime import datetime, timedelta, timezone

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True)
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)

    # Relationship to User
    user = relationship("User", back_populates="sessions")

    def __str__(self):
        return f"Session(id={self.id}, session_id={self.session_id}, user_id={self.user_id})"

    def is_expired(self):
        return datetime.now(timezone.utc) > self.expires_at

    def is_valid(self):
        return self.is_active and not self.is_expired()
