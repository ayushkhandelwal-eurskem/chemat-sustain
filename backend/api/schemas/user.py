from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum
from datetime import datetime

class Role(str, Enum):
    admin = "admin"
    user = "user"

class UserBase(BaseModel):
    email: EmailStr
    role: Role

    class Config:
        use_enum_values = True

class UserCreate(UserBase):
    password: str

class UserOut(UserBase):
    id: int
    last_activity: datetime
    is_active: bool

    class Config:
        orm_mode = True

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
