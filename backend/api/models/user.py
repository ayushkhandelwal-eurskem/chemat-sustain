from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from utils.db import Base
from api.schemas.user import Role

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    role = Column(Enum(Role), default=Role.user)
    last_activity = Column(DateTime(timezone=True))
    otp_secret = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    # Relationship to Sessions
    sessions = relationship("Session", back_populates="user")

    def __str__(self):
        return f"User(id={self.id}, email={self.email}, role={self.role.value})"
