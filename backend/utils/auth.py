from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from utils.db import get_db
from api.models.user import User
from api.schemas.user import UserOut, Role
import os
from sqlalchemy import select
import secrets
from dotenv import load_dotenv
# Load environment variables from .env file
load_dotenv()


# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Session configuration
SESSION_EXPIRE_HOURS = int(os.getenv("SESSION_EXPIRE_HOURS", 24*7))  # Default to 7 days

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)

def generate_session_id():
    """Generate a secure session ID"""
    return secrets.token_urlsafe(32)

async def create_session(db: AsyncSession, user_id: int, user_agent: str = None, ip_address: str = None):
    """Create a new session for the user"""
    from api.models.session import Session
    from sqlalchemy import select
    
    # Clean up expired sessions for this user
    await cleanup_expired_sessions(db, user_id)
    
    session_id = generate_session_id()
    expires_at = datetime.utcnow() + timedelta(hours=SESSION_EXPIRE_HOURS)
    
    session = Session(
        session_id=session_id,
        user_id=user_id,
        expires_at=expires_at,
        user_agent=user_agent,
        ip_address=ip_address
    )
    
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    return session

async def get_session_by_id(db: AsyncSession, session_id: str):
    """Get session by session ID"""
    from api.models.session import Session
    from sqlalchemy import select
    
    result = await db.execute(select(Session).filter(Session.session_id == session_id))
    return result.scalars().first()

async def invalidate_session(db: AsyncSession, session_id: str):
    """Invalidate a session"""
    session = await get_session_by_id(db, session_id)
    if session:
        session.is_active = False
        await db.commit()
        return True
    return False

async def cleanup_expired_sessions(db: AsyncSession, user_id: int = None):
    """Clean up expired sessions"""
    from api.models.session import Session
    from sqlalchemy import select, delete
    
    query = delete(Session).where(Session.expires_at < datetime.utcnow())
    if user_id:
        query = query.where(Session.user_id == user_id)
    
    await db.execute(query)
    await db.commit()

async def get_current_user(request: Request, db: AsyncSession = Depends(get_db), session_id: str = Cookie(None, alias="session_id")):
    """Get current user from session"""
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No session found",
        )
    
    session = await get_session_by_id(db, session_id)
    if not session or not session.is_valid():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    
    # Get user
    result = await db.execute(select(User).filter(User.id == session.user_id))
    user = result.scalars().first()
    user.last_activity = datetime.now()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    return user

def get_user_by_role(role: Role):
    async def check_role(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
        current_user.last_activity = datetime.now()
        await db.commit()
        if current_user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
            )
        return current_user
    return check_role

async def check_if_private_user(request: Request, db: AsyncSession = Depends(get_db), session_id: str = Cookie(None, alias="session_id")):
    if not session_id:
        return False
    session = await get_session_by_id(db, session_id)

    if not session or not session.is_valid():
        return False
    
    # Get user
    result = await db.execute(select(User).filter(User.id == session.user_id))
    user = result.scalars().first()
    user.last_activity = datetime.now()
    if not user or not user.is_active:
        return False
    
    return True


