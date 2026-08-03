from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from api.models.user import User
from api.schemas.user import UserCreate, UserOut
from utils.auth import hash_password, verify_password
from utils.logging_config import get_logger
from datetime import datetime
import os
import pyotp
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = get_logger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_SENDER_EMAIL = os.getenv("SMTP_SENDER_EMAIL")
SMTP_SENDER_PASSWORD = os.getenv("SMTP_SENDER_PASSWORD")

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
    if not SMTP_SENDER_EMAIL or not SMTP_SENDER_PASSWORD:
        logger.error("OTP email not sent: SMTP_SENDER_EMAIL/SMTP_SENDER_PASSWORD are not configured")
        return False, "Email service is not configured"

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
            logger.info("Generated new OTP secret for user")
        else:
            logger.info("Using existing OTP secret for user")

        # Create TOTP with 5-minute interval (300 seconds)
        otp = pyotp.TOTP(user.otp_secret, interval=300)

        # Send OTP via email - the code itself is never logged.
        otp_code = otp.now()
        receiver_email = email

        message = MIMEMultipart()
        message["From"] = SMTP_SENDER_EMAIL
        message["To"] = receiver_email
        message["Subject"] = "Your OTP Code"

        body = f"Your OTP code is {otp_code}"
        message.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_SENDER_EMAIL, SMTP_SENDER_PASSWORD)
            server.sendmail(SMTP_SENDER_EMAIL, receiver_email, message.as_string())
            logger.info("OTP email dispatched for user")
            return True, "OTP sent successfully"

    except smtplib.SMTPException:
        logger.exception("Failed to send OTP email")
        return False, "Failed to send OTP"
    except Exception:
        logger.exception("Unexpected error while sending OTP")
        return False, "Unexpected error while sending OTP"

async def verify_otp(db: AsyncSession, email: str, otp_code: str):
    """Verify OTP code - valid for 5 minutes"""
    user = await get_user_by_email(db, email)
    if not user:
        logger.warning("OTP verification attempted for unknown user")
        return False

    if not user.otp_secret:
        logger.warning("OTP verification attempted with no OTP secret on record")
        return False

    # Create TOTP with same 5-minute interval (300 seconds) as used in send_otp
    otp = pyotp.TOTP(user.otp_secret, interval=300)

    # Verify the OTP code (valid for 5 minutes). Neither the provided code nor
    # the secret are ever logged.
    is_valid = otp.verify(otp_code)

    if is_valid:
        logger.info("OTP verification succeeded")
        # Clear the OTP secret after successful verification to prevent reuse
        user.otp_secret = None
        await db.commit()
        await db.refresh(user)
    else:
        logger.warning("OTP verification failed")

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
