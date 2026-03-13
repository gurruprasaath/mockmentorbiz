from __future__ import annotations

import os
import secrets
import string
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, Admin, Interview, PerformanceRecord, MalpracticeRecord
from app.utils.auth import get_password_hash
from app.utils.deps import require_role

owner_router = APIRouter()


def _is_localhost(request: Request) -> bool:
    host = (request.client.host if request.client else "")
    return host in {"127.0.0.1", "::1", "localhost"}


class OwnerBootstrapRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: str


class OwnerResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str


class SuperAdminCreateByOwner(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    password: Optional[str] = None
    college_name: str


class SuperAdminUpdateByOwner(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    college_name: Optional[str] = None
    is_active: Optional[bool] = None


class SuperAdminRow(BaseModel):
    id: int
    email: str
    username: str
    full_name: str
    college_name: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


def _generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@owner_router.post("/bootstrap-owner")
async def bootstrap_owner(
    payload: OwnerBootstrapRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create the first platform owner (developer-only).

    Requirements:
    - Requires env OWNER_BOOTSTRAP_SECRET provided via header X-Owner-Secret
    - By default, localhost only (set OWNER_BOOTSTRAP_ALLOW_REMOTE=true to allow remote)
    - Only allowed when there is no existing owner
    """

    allow_remote = (os.getenv("OWNER_BOOTSTRAP_ALLOW_REMOTE", "false").lower() == "true")
    if not allow_remote and not _is_localhost(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner bootstrap is restricted to localhost")

    secret = request.headers.get("X-Owner-Secret") or ""
    expected = os.getenv("OWNER_BOOTSTRAP_SECRET") or ""
    if not expected or secret != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid owner bootstrap secret")

    existing_owner = db.query(User).filter(User.role == UserRole.OWNER).first()
    if existing_owner:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner already exists")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")

    owner = User(
        email=payload.email,
        username=payload.username,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=UserRole.OWNER,
        department="Platform",
        college_name=None,
    )

    db.add(owner)
    db.commit()
    db.refresh(owner)

    return {
        "message": "Owner created",
        "owner": {
            "id": owner.id,
            "email": owner.email,
            "username": owner.username,
            "full_name": owner.full_name,
        },
    }


@owner_router.post("/bootstrap-owner/reset-password")
async def reset_owner_password(
    payload: OwnerResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Developer-only owner password reset.

    Guarded by env OWNER_BOOTSTRAP_SECRET in header X-Owner-Secret.
    Localhost only by default.
    """

    allow_remote = (os.getenv("OWNER_BOOTSTRAP_ALLOW_REMOTE", "false").lower() == "true")
    if not allow_remote and not _is_localhost(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner bootstrap is restricted to localhost")

    secret = request.headers.get("X-Owner-Secret") or ""
    expected = os.getenv("OWNER_BOOTSTRAP_SECRET") or ""
    if not expected or secret != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid owner bootstrap secret")

    owner = db.query(User).filter(User.role == UserRole.OWNER, User.email == payload.email).first()
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner not found")

    owner.hashed_password = get_password_hash(payload.new_password)
    owner.is_active = True

    db.add(owner)
    db.commit()

    return {"message": "Owner password updated"}


@owner_router.get("/super-admins", response_model=List[SuperAdminRow])
async def list_super_admins(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("owner")),
):
    rows = db.query(User).filter(User.role == UserRole.SUPER_ADMIN).order_by(User.id.desc()).all()
    return rows


@owner_router.post("/super-admins")
async def create_super_admin_by_owner(
    payload: SuperAdminCreateByOwner,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("owner")),
):
    # Ensure per-college uniqueness
    existing_for_college = db.query(User).filter(User.role == UserRole.SUPER_ADMIN, User.college_name == payload.college_name).first()
    if existing_for_college:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Super admin already exists for this college")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")

    password = payload.password or _generate_password()

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=get_password_hash(password),
        full_name=payload.full_name,
        role=UserRole.SUPER_ADMIN,
        college_name=payload.college_name,
        department="Administration",
        is_active=True,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Super admin created",
        "super_admin": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "college_name": user.college_name,
            "is_active": user.is_active,
        },
        "temporary_password": password if payload.password is None else None,
    }


@owner_router.put("/super-admins/{super_admin_id}")
async def update_super_admin(
    super_admin_id: int,
    payload: SuperAdminUpdateByOwner,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("owner")),
):
    user = db.query(User).filter(User.id == super_admin_id, User.role == UserRole.SUPER_ADMIN).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Super admin not found")

    if payload.email and payload.email != user.email:
        if db.query(User).filter(User.email == payload.email).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        user.email = payload.email

    if payload.username and payload.username != user.username:
        if db.query(User).filter(User.username == payload.username).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
        user.username = payload.username

    if payload.college_name and payload.college_name != user.college_name:
        existing_for_college = db.query(User).filter(User.role == UserRole.SUPER_ADMIN, User.college_name == payload.college_name).first()
        if existing_for_college:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Super admin already exists for this college")
        user.college_name = payload.college_name

    if payload.full_name is not None:
        user.full_name = payload.full_name

    if payload.is_active is not None:
        user.is_active = bool(payload.is_active)

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Super admin updated",
        "super_admin": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "college_name": user.college_name,
            "is_active": user.is_active,
        },
    }


@owner_router.post("/super-admins/{super_admin_id}/reset-password")
async def reset_super_admin_password(
    super_admin_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("owner")),
):
    user = db.query(User).filter(User.id == super_admin_id, User.role == UserRole.SUPER_ADMIN).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Super admin not found")

    new_password = _generate_password()
    user.hashed_password = get_password_hash(new_password)

    db.add(user)
    db.commit()

    return {
        "message": "Password reset",
        "temporary_password": new_password,
    }


@owner_router.delete("/super-admins/{super_admin_id}")
async def deactivate_super_admin(
    super_admin_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("owner")),
):
    """Deactivate a super admin (safe delete)."""

    user = db.query(User).filter(User.id == super_admin_id, User.role == UserRole.SUPER_ADMIN).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Super admin not found")

    user.is_active = False
    db.add(user)
    db.commit()

    return {"message": "Super admin deactivated"}


@owner_router.delete("/super-admins/{super_admin_id}/hard-delete")
async def hard_delete_super_admin_hierarchy(
    super_admin_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("owner")),
):
    """Hard delete a super admin and the entire hierarchy under the same college.

    Deletes:
    - Super admin user
    - Admin users and Admin rows for that college
    - Student users for that college
    - Interviews associated with those admins/students
    - Performance records and malpractice records tied to those interviews

    Note: This assumes `college_name` is the primary partition key for a hierarchy.
    """

    super_admin = (
        db.query(User)
        .filter(User.id == super_admin_id, User.role == UserRole.SUPER_ADMIN)
        .first()
    )
    if not super_admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Super admin not found")

    college_name = super_admin.college_name
    if not college_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super admin has no college_name; cannot determine hierarchy",
        )

    admin_users = (
        db.query(User)
        .filter(User.role == UserRole.ADMIN, User.college_name == college_name)
        .all()
    )
    student_users = (
        db.query(User)
        .filter(User.role == UserRole.STUDENT, User.college_name == college_name)
        .all()
    )

    admin_user_ids = [u.id for u in admin_users]
    student_user_ids = [u.id for u in student_users]

    interview_q = db.query(Interview).filter(
        or_(
            Interview.student_id.in_(student_user_ids) if student_user_ids else False,
            Interview.admin_id.in_(admin_user_ids) if admin_user_ids else False,
        )
    )
    interviews = interview_q.all()
    interview_ids = [i.id for i in interviews]

    deleted_malpractice = 0
    deleted_performance = 0
    deleted_interviews = 0
    deleted_admin_rows = 0
    deleted_students = 0
    deleted_admin_users = 0

    if interview_ids:
        deleted_malpractice = (
            db.query(MalpracticeRecord)
            .filter(MalpracticeRecord.interview_id.in_(interview_ids))
            .delete(synchronize_session=False)
        )
        deleted_performance = (
            db.query(PerformanceRecord)
            .filter(PerformanceRecord.interview_id.in_(interview_ids))
            .delete(synchronize_session=False)
        )
        deleted_interviews = (
            db.query(Interview)
            .filter(Interview.id.in_(interview_ids))
            .delete(synchronize_session=False)
        )

    # Delete Admin table rows before deleting users to satisfy FK constraints.
    if admin_user_ids:
        deleted_admin_rows = (
            db.query(Admin)
            .filter(or_(Admin.user_id.in_(admin_user_ids), Admin.created_by == super_admin_id))
            .delete(synchronize_session=False)
        )
    else:
        deleted_admin_rows = (
            db.query(Admin)
            .filter(Admin.created_by == super_admin_id)
            .delete(synchronize_session=False)
        )

    if student_user_ids:
        deleted_students = (
            db.query(User)
            .filter(User.id.in_(student_user_ids))
            .delete(synchronize_session=False)
        )

    if admin_user_ids:
        deleted_admin_users = (
            db.query(User)
            .filter(User.id.in_(admin_user_ids))
            .delete(synchronize_session=False)
        )

    # Finally delete the super admin.
    db.delete(super_admin)
    db.commit()

    return {
        "message": "Super admin hierarchy deleted",
        "college_name": college_name,
        "deleted": {
            "malpractice_records": deleted_malpractice,
            "performance_records": deleted_performance,
            "interviews": deleted_interviews,
            "admin_rows": deleted_admin_rows,
            "student_users": deleted_students,
            "admin_users": deleted_admin_users,
            "super_admin_user": 1,
        },
    }
