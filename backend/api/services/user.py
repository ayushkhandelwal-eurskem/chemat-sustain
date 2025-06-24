from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from api.models.user import User
from api.schemas.user import UserCreate, UserOut
from utils.auth import hash_password, verify_password
from datetime import datetime
import pyotp
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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
            print(f"Generated new OTP secret for {email}")
        else:
            print(f"Using existing OTP secret for {email}")

        # Create TOTP with 5-minute interval (300 seconds)
        otp = pyotp.TOTP(user.otp_secret, interval=300)
        
        # Send OTP via email
        otp_code = otp.now()
        print(f"Generated OTP code: {otp_code} for {email} (valid for 5 minutes)")
        sender_email = "database@eurskem.com"  # Replace with your email
        receiver_email = email
        password = "zgct bacw xupc ithx"  # Replace with your email password

        message = MIMEMultipart()
        message["From"] = sender_email
        message["To"] = receiver_email
        message["Subject"] = "Your OTP Code"

        body = f"Your OTP code is {otp_code}"
        message.attach(MIMEText(body, "plain"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(sender_email, password)
            server.sendmail(sender_email, receiver_email, message.as_string())
            print(f"OTP email sent successfully to {email}")
            return True, "OTP sent successfully"

    except smtplib.SMTPException as e:
        print(f"Failed to send OTP email to {email}. Error: {str(e)}")
        return False, f"Failed to send OTP: {str(e)}"
    except Exception as e:
        print(f"Unexpected error while sending OTP to {email}. Error: {str(e)}")
        return False, f"Unexpected error: {str(e)}"

async def verify_otp(db: AsyncSession, email: str, otp_code: str):
    """Verify OTP code - valid for 5 minutes"""
    user = await get_user_by_email(db, email)
    if not user:
        print(f"User not found for email: {email}")
        return False
    
    if not user.otp_secret:
        print(f"No OTP secret found for user: {email}")
        return False
    
    # Create TOTP with same 5-minute interval (300 seconds) as used in send_otp
    otp = pyotp.TOTP(user.otp_secret, interval=300)
    
    print(f"Verifying OTP for {email}: provided={otp_code}")
    
    # Verify the OTP code (valid for 5 minutes)
    is_valid = otp.verify(otp_code)
    
    if is_valid:
        print(f"OTP verification successful for {email}")
        # Clear the OTP secret after successful verification to prevent reuse
        user.otp_secret = None
        await db.commit()
        await db.refresh(user)
    else:
        print(f"OTP verification failed for {email}. OTP is valid for 5 minutes from generation.")
    
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
    query = select(User)
    if search_email:
        query = query.filter(User.email.ilike(f"%{search_email}%")).order_by(User.id)
    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()
