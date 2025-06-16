import os
from fastapi import FastAPI, APIRouter, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from utils.db import Base, engine
from api.controllers.user import router as user_router
from api.services.user import create_user, get_user_by_email
from api.schemas.user import UserCreate
from utils.db import get_db
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Initialize the database
async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Run database initialization
@app.on_event("startup")
async def startup_event():
    await init_models()
    
    # Read admin credentials from environment variables
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    
    # Only create admin user if credentials are provided and user doesn't exist
    if admin_email and admin_password:
        async for db in get_db():
            # Check if admin user already exists
            existing_admin = await get_user_by_email(db, admin_email)
            
            if not existing_admin:
                # Create admin user if it doesn't exist
                admin_user = UserCreate(
                    email=admin_email,
                    password=admin_password,
                    role="admin"
                )
                
                await create_user(db, admin_user)
                print(f"Admin user created with email: {admin_email}")
            else:
                print(f"Admin user already exists with email: {admin_email}")
            
            break  # Break after the first iteration to ensure the session is closed
    else:
        print("Admin credentials not provided in environment variables (ADMIN_EMAIL, ADMIN_PASSWORD)")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your Next.js frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/health")
async def health_check():
    return Response(status_code=200, content="OK")


from api.controllers.file_navigator import router as file_navigator_router

app.include_router(file_navigator_router, prefix="/files", tags=["File Navigator"])
app.include_router(user_router, prefix="/users", tags=["User Management"])
