from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Role(str, Enum):
    admin = "admin"
    user = "user"


class UserBase(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    email: EmailStr
    role: Role


class UserCreate(UserBase):
    password: str = Field(min_length=12, max_length=72)


class UserOut(UserBase):
    model_config = ConfigDict(
        use_enum_values=True,
        from_attributes=True,
    )

    id: int
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