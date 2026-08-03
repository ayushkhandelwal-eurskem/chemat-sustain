from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from api.models.user import User
from api.schemas.user import UserCreate, UserOut
from utils.auth import hash_password, verify_password
from datetime import datetime
import pyotp
import smtplib
import logging
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

async def create_user(db: AsyncSession, user: UserCreate):
    """Create a new user with hashed password"""
    db_user = User(
        email=user.email,
        password=hash_password(user.password),
        role=user.role
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

async def get_user_by_email(db: AsyncSession, email: str):
    """Get user by email"""
    result = await db.execute(select(User).filter(User.email == email))
    return result.scalars().first()

async def authenticate_user(db: AsyncSession, email: str, password: str):
    """Authenticate user by email and password"""
    user = await get_user_by_email(db, email)
    if not user or not verify_password(password, user.password):
        return False
    return user

async def send_otp(db: AsyncSession, email: str):
    """Generate and send OTP to user's email"""
    try:
        user = await get_user_by_email(db, email)
        if not user:
            return False, "User not found"

        # Generate new OTP secret only if user doesn't have one
        if not user.otp_secret:
            otp_secret = pyotp.random_base32()
            user.otp_secret = otp_secret
            await db.commit()
            await db.refresh(user)

        # Create TOTP with 5-minute interval (300 seconds)
        otp = pyotp.TOTP(user.otp_secret, interval=300)
        
        # Send OTP via email
        otp_code = otp.now()
        sender_email = os.getenv("SMTP_SENDER")
        receiver_email = email
        password = os.getenv("SMTP_PASSWORD")
        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        if not sender_email or not password:
            logger.error("OTP delivery is unavailable because SMTP is not configured")
            return False, "OTP delivery is temporarily unavailable"

        message = MIMEMultipart()
        message["From"] = sender_email
        message["To"] = receiver_email
        message["Subject"] = "Your OTP Code"

        body = f"Your OTP code is {otp_code}"
        message.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(sender_email, password)
            server.sendmail(sender_email, receiver_email, message.as_string())
            logger.info("OTP email sent", extra={"recipient_domain": email.rsplit("@", 1)[-1]})
            return True, "OTP sent successfully"

    except smtplib.SMTPException:
        logger.exception("SMTP delivery failed")
        return False, "OTP delivery is temporarily unavailable"
    except Exception:
        logger.exception("Unexpected OTP delivery failure")
        return False, "OTP delivery is temporarily unavailable"

async def verify_otp(db: AsyncSession, email: str, otp_code: str):
    """Verify OTP code - valid for 5 minutes"""
    user = await get_user_by_email(db, email)
    if not user:
        return False
    
    if not user.otp_secret:
        return False
    
    # Create TOTP with same 5-minute interval (300 seconds) as used in send_otp
    otp = pyotp.TOTP(user.otp_secret, interval=300)
    
    # Verify the OTP code (valid for 5 minutes)
    is_valid = otp.verify(otp_code)
    
    if is_valid:
        # Clear the OTP secret after successful verification to prevent reuse
        user.otp_secret = None
        await db.commit()
        await db.refresh(user)
    return is_valid

async def change_password(db: AsyncSession, email: str, new_password: str):
    """Change user's password"""
    user = await get_user_by_email(db, email)
    if user:
        user.password = hash_password(new_password)
        await db.commit()
        await db.refresh(user)
        return user
    return None

async def update_last_activity(db: AsyncSession, email: str):
    """Update user's last activity timestamp"""
    user = await get_user_by_email(db, email)
    if user:
        user.last_activity = datetime.utcnow()
        await db.commit()
        await db.refresh(user)
        return user
    return None

async def get_users(db: AsyncSession, skip: int = 0, limit: int = 100, search_email: str = None):
    """Get a list of users with pagination and optional email search"""
    query = select(User).order_by(User.id)
    if search_email:
        query = query.filter(User.email.ilike(f"%{search_email}%"))
    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()
