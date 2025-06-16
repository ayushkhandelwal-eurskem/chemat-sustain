from fastapi import FastAPI, APIRouter, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from utils.db import Base, engine
from api.controllers.user import router as user_router
from api.services.user import create_user
from api.schemas.user import UserCreate
from utils.db import get_db

app = FastAPI()

# Initialize the database
async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Run database initialization
@app.on_event("startup")
async def startup_event():
    await init_models()
    # async for db in get_db():
    #     user = UserCreate(
    #         email="jashjasani@proton.me",
    #         password="password123",  # Use a secure password in production
    #         role="admin"
    #     )
        
    #     await create_user(db, user)
    #     break # Break after the first iteration to ensure the session is closed

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
