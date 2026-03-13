from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from contextlib import asynccontextmanager
import uvicorn
import os
from pathlib import Path

from dotenv import load_dotenv

from app.database import create_tables, get_db
from app.models import (
    User,
    Admin,
    Interview,
    PerformanceRecord,
    MalpracticeRecord,
    Domain,
    CollegeProfile,
)  # Import models
from app.api.auth import auth_router
from app.api.students import student_router
from app.api.admin import admin_router
from app.api.super_admin import super_admin_router
from app.api.owner import owner_router
from app.api.interviews import interview_router
from app.api.tts import tts_router
from app.utils.auth import verify_token

# Load environment variables
_here = Path(__file__).resolve()
_backend_env = _here.parents[1] / ".env"  # backend/.env (legacy)
_root_env = _here.parents[2] / ".env"  # repo-root/.env (preferred)

if _root_env.exists():
    load_dotenv(dotenv_path=_root_env)
elif _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env)
else:
    load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_tables()
    yield
    # Shutdown
    pass


# Initialize FastAPI app
app = FastAPI(
    title="MockMentorBiz API",
    description="AI-Powered Mock Interview Platform for Colleges",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
# Allow origins from CORS_ORIGINS env var (comma-separated) or fall back to
# safe local dev defaults. In Docker production, nginx proxies everything on
# the same origin so CORS is not needed — but we keep it permissive for dev.
_cors_env = os.getenv("CORS_ORIGINS", "")
_cors_origins = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:5173",
        "http://localhost:80",
        "http://localhost",
        "http://127.0.0.1:5173",
        "http://127.0.0.1",
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security scheme
security = HTTPBearer()

# Include routers
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(student_router, prefix="/api/students", tags=["Students"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(super_admin_router, prefix="/api/super-admin", tags=["Super Admin"])
app.include_router(owner_router, prefix="/api/owner", tags=["Owner"])
app.include_router(interview_router, prefix="/api/interviews", tags=["Interviews"])
app.include_router(tts_router, prefix="/api/tts", tags=["TTS"])


@app.get("/")
async def root():
    return {"message": "MockMentorBiz API - AI-Powered Mock Interview Platform"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "MockMentorBiz API is running"}


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
