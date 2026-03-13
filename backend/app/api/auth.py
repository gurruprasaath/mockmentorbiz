from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import timedelta
from typing import Optional

from app.database import get_db
from app.models import User, Admin, UserRole
from app.utils.auth import (
    verify_password, 
    get_password_hash, 
    create_access_token, 
    verify_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

from app.utils.deps import get_current_user as get_current_user_dep

auth_router = APIRouter()

# Pydantic models
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: str
    admin_id: Optional[str] = None  # Required for students
    department: Optional[str] = None
    college_name: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: str
    role: str
    department: Optional[str]
    college_name: Optional[str]
    is_active: bool
    
    class Config:
        from_attributes = True

def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def create_user(db: Session, user: UserCreate, role: UserRole = UserRole.STUDENT):
    # Validate and hydrate college/department from Admin ID for students
    resolved_department = user.department
    resolved_college_name = user.college_name
    resolved_admin_id = user.admin_id

    if role == UserRole.STUDENT:
        raw_admin_id = (user.admin_id or "").strip()
        if not raw_admin_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin ID is required for student registration",
            )

        # Normalize for lookup; Admin.unique_admin_id is stored uppercase.
        admin_lookup = raw_admin_id.upper()
        admin = db.query(Admin).filter(Admin.unique_admin_id == admin_lookup).first()
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid admin ID. Please check with your department admin.",
            )

        admin_user = db.query(User).filter(User.id == admin.user_id).first()
        if not admin_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid admin ID (admin user not found)",
            )

        # Force student into the admin's department + college
        resolved_department = admin.department
        resolved_college_name = admin_user.college_name
        # Store canonical admin id for reliable joins/filters later
        resolved_admin_id = admin.unique_admin_id
    
    # Check if email or username already exists
    existing_email = get_user_by_email(db, user.email)
    if existing_email:
        # Check if this is a pre-provisioned inactive account (e.g. scheduled before registration)
        if existing_email.role == UserRole.STUDENT and not existing_email.is_active:
            # Claim the account!
            existing_email.username = user.username
            existing_email.full_name = user.full_name
            existing_email.hashed_password = get_password_hash(user.password)
            existing_email.is_active = True
            
            # Ensure admin/college details are correct
            if resolved_admin_id:
                existing_email.admin_id = resolved_admin_id
            if resolved_department:
                existing_email.department = resolved_department
            if resolved_college_name:
                existing_email.college_name = resolved_college_name
            
            try:
                db.add(existing_email)
                db.commit()
                db.refresh(existing_email)
                return existing_email
            except Exception as e:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Could not claim account: {str(e)}"
                )
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    if get_user_by_username(db, user.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email,
        username=user.username,
        hashed_password=hashed_password,
        full_name=user.full_name,
        role=role,
        admin_id=resolved_admin_id,
        department=resolved_department,
        college_name=resolved_college_name,
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@auth_router.post("/register", response_model=UserResponse)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register a new student account."""
    db_user = create_user(db, user, UserRole.STUDENT)
    return db_user

@auth_router.post("/login", response_model=Token)
async def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Login user and return access token."""
    user = get_user_by_email(db, user_credentials.email)
    
    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "username": user.username},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role.value,
            "department": user.department,
            "college_name": user.college_name
        }
    }

@auth_router.get("/me", response_model=UserResponse)
async def get_current_user(db: Session = Depends(get_db), current: dict = Depends(get_current_user_dep)):
    """Get current user information."""
    user = db.query(User).filter(User.id == current["user_id"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user

@auth_router.post("/logout")
async def logout():
    """Logout user (client-side token removal)."""
    return {"message": "Successfully logged out"}