import os

from fastapi import Depends, HTTPException, status, Request, Response
from utils.custom_router import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession
from api.schemas.user import (
    UserCreate, UserOut, LoginRequest, VerifyOTPRequest,
    ForgotPasswordRequest, ResetPasswordRequest,
    ChangePasswordRequest, TokenResponse, MessageResponse, Role
)
from api.services.user import (
    create_user, authenticate_user, send_otp, verify_otp,
    change_password, update_last_activity, get_user_by_email
)
from utils.auth import get_current_user, get_user_by_role, create_session, invalidate_session
from utils.db import get_db
from api.models.user import User
from utils.logging_config import get_logger
from typing import List

logger = get_logger(__name__)

router = APIRouter()

@router.post("/", response_model=UserOut)
async def create_new_user(user: UserCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a new user (admin only)"""
    if current_user.role != Role.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    db_user = await create_user(db=db, user=user)
    return db_user

@router.post("/login", response_model=MessageResponse)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """User login with email and password"""
    user = await authenticate_user(db=db, email=login_data.email, password=login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Send OTP
    success, message = await send_otp(db, login_data.email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=message
        )

    return MessageResponse(msg="OTP sent to email")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    request_data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send a password-reset code without revealing whether an account exists."""
    user = await get_user_by_email(db, request_data.email)
    if user and user.is_active:
        success, _message = await send_otp(db, request_data.email, purpose="password reset")
        if not success:
            # Do not disclose account existence or SMTP details to the caller.
            logger.error("Password-reset email could not be delivered")
    return MessageResponse(
        msg="If an active account exists for this email, a reset code has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    reset_data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reset a password after verifying the emailed five-minute code."""
    user = await get_user_by_email(db, reset_data.email)
    if (
        not user
        or not user.is_active
        or not await verify_otp(
            db,
            reset_data.email,
            reset_data.otp_code,
            purpose="password reset",
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code",
        )
    user = await change_password(
        db=db,
        email=reset_data.email,
        new_password=reset_data.new_password,
    )
    if not user:
        # Same response family as an invalid code; do not reveal account state.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code",
        )
    return MessageResponse(msg="Password reset successfully. You can now sign in.")

@router.post("/verify-otp", response_model=MessageResponse)
async def verify_otp_endpoint(otp_data: VerifyOTPRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Verify OTP code and create session"""
    logger.info("OTP verification attempt received")

    # First check if user exists
    user = await get_user_by_email(db, otp_data.email)
    if not user:
        logger.warning("OTP verification attempted for unknown user")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Verify OTP
    is_valid = await verify_otp(db, otp_data.email, otp_data.otp_code)
    if not is_valid:
        logger.warning("OTP verification failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )

    logger.info("OTP verification succeeded")

    # Update last activity
    await update_last_activity(db=db, email=otp_data.email)

    # Create session
    user_agent = request.headers.get("user-agent")
    ip_address = request.client.host if request.client else None
    session = await create_session(db, user.id, user_agent, ip_address)

    # Set session cookie. The session identifier itself is never logged.
    response.set_cookie(
        key="session_id",
        value=session.session_id,
        max_age=7*24*60*60,  # 7 days in seconds
        httponly=True,
        secure=os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true",
        samesite="lax"
    )

    logger.info("Session created for user")
    return MessageResponse(msg="Login successful")

@router.post("/logout", response_model=MessageResponse)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Logout user and invalidate session"""
    # Get session ID from cookie
    session_id = request.cookies.get("session_id")
    if session_id:
        await invalidate_session(db, session_id)
    
    # Clear session cookie
    response.delete_cookie(key="session_id")
    
    return MessageResponse(msg="Logout successful")

@router.post("/change-password", response_model=MessageResponse)
async def change_user_password(password_data: ChangePasswordRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Change user's password (admin or self)"""
    # Admin can change any user's password, user can only change their own
    if current_user.role != Role.admin and current_user.email != password_data.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden"
        )

    user = await change_password(db=db, email=password_data.email, new_password=password_data.new_password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return MessageResponse(msg="Password changed successfully")

@router.get("/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

@router.get("/admin", response_model=List[UserOut])
async def read_all_users(db: AsyncSession = Depends(get_db),
                   current_user: User = Depends(get_user_by_role(Role.admin))):
    """Get all users (admin only)"""
    from api.services.user import get_users
    users = await get_users(db)
    return users


@router.get("/{email}", response_model=UserOut)
async def read_user_by_email(email: str, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_user_by_role(Role.admin))):
    """Get user info by email (admin only)"""
    db_user = await get_user_by_email(db, email)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user
