from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class Role(str, Enum):
    admin = "admin"
    user = "user"


class UserBase(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    email: EmailStr
    role: Role


class UserCreate(UserBase):
    password: str


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
    password: str


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str


class ChangePasswordRequest(BaseModel):
    email: EmailStr
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class MessageResponse(BaseModel):
    msg: str