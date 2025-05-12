from fastapi import FastAPI, APIRouter, Response
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI()

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

