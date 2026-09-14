from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Role(str, Enum):
    admin = "admin"
    user = "user"
    public_viewer = "public_viewer"


class UserBase(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    email: EmailStr
    role: Role


class UserCreate(UserBase):
    name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=12, max_length=72)


class PublicRegistration(BaseModel):
    """Self-registration payload. Role is intentionally not caller-controlled."""

    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(min_length=12, max_length=72)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Name must contain at least 2 visible characters")
        return normalized


class UserOut(UserBase):
    model_config = ConfigDict(
        use_enum_values=True,
        from_attributes=True,
    )

    id: int
    name: Optional[str] = None
    last_activity: Optional[datetime] = None
    is_active: bool


class LoginRequest(BaseModel):
    email: EmailStr
    # Bound request work and bcrypt input length without changing existing hashes.
    password: str = Field(min_length=1, max_length=72)


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=12, max_length=72)


class ChangePasswordRequest(BaseModel):
    email: EmailStr
    new_password: str = Field(min_length=12, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class MessageResponse(BaseModel):
    msg: str