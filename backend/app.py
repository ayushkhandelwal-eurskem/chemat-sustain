import os
from fastapi import FastAPI, APIRouter, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from utils.db import Base, engine
from api.controllers.user import router as user_router
from api.services.user import create_user, get_user_by_email
from utils.auth import get_current_user
from api.schemas.user import UserCreate
from utils.db import get_db
from utils.logging_config import configure_logging, get_logger
from dotenv import load_dotenv

load_dotenv()
configure_logging()
logger = get_logger(__name__)

app = FastAPI()

# Initialize the database
async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Run database initialization
@app.on_event("startup")
async def startup_event():
    logger.info("Application startup")
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
                # Create admin user if it doesn't exist. The password value is
                # never logged - only its presence and the resulting outcome.
                admin_user = UserCreate(
                    email=admin_email,
                    password=admin_password,
                    role="admin"
                )

                await create_user(db, admin_user)
                logger.info("Admin user created from ADMIN_EMAIL/ADMIN_PASSWORD environment variables")
            else:
                logger.info("Admin user already exists; skipping bootstrap creation")

            break  # Break after the first iteration to ensure the session is closed
    else:
        logger.info("Admin bootstrap skipped: ADMIN_EMAIL/ADMIN_PASSWORD not set")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://database.eurskem.com/", "http://localhost", "https://localhost"],  # Your Next.js frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/health")
async def health_check():
    return Response(status_code=200, content="OK")


from api.controllers.file_navigator import router as file_navigator_router
from api.controllers.test import router as test_router
from api.router_tree import router as tree_router
from api.router_tree_admin import router as tree_admin_router
from api.router_protocol_files import router as protocol_files_router

app.include_router(test_router, prefix="/tests", tags=["Tests"])
app.include_router(file_navigator_router, prefix="/files", tags=["File Navigator"])
app.include_router(user_router, prefix="/users", tags=["User Management"])
app.include_router(tree_router, tags=["Tree"])              # remove prefix="/tree"
app.include_router(protocol_files_router, tags=["Protocol Files"])  # remove prefix="/protocols"
app.include_router(tree_admin_router, tags=["Tree Admin"])  # this one stays prefix-less (correct already)
