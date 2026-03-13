from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import secrets
import string
import os
from datetime import datetime, timedelta

from app.database import get_db
from app.models import (
    User,
    Admin,
    UserRole,
    Interview,
    InterviewStatus,
    PerformanceRecord,
    MalpracticeRecord,
    CollegeProfile,
)
from app.utils.auth import verify_super_admin_secret, get_password_hash
from app.utils.deps import require_role


super_admin_router = APIRouter()


class SuperAdminCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: str
    college_name: str
    # Backward-compatible: frontend/API callers may still pass secret in the body.
    super_admin_secret: Optional[str] = None


class AdminCreate(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    department: str
    unique_admin_id: Optional[str] = None
    password: Optional[str] = None
    # Backward-compatible: ignored; derived from super admin's college.
    college_name: Optional[str] = None
    permissions: Optional[List[str]] = []


class AdminResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: str
    department: str
    unique_admin_id: str
    permissions: List[str]
    created_at: str
    is_active: bool = True
    temporary_password: Optional[str] = None

    class Config:
        from_attributes = True


def generate_unique_admin_id() -> str:
    """Generate a unique admin ID."""
    # Generate a 8-character alphanumeric ID
    characters = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(characters) for _ in range(8))


@super_admin_router.post("/create-super-admin")
async def create_super_admin(
    super_admin_data: SuperAdminCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Bootstrap a college super admin account (developer/owner only).

    Security model:
    - Requires a secret (env SUPER_ADMIN_SECRET) provided either via header `X-Superadmin-Secret`
      or legacy request body field `super_admin_secret`.
    - By default, only accepts requests from localhost. Set SUPERADMIN_BOOTSTRAP_ALLOW_REMOTE=true
      to allow remote requests.
    - By default, only allows creating the FIRST super admin for a college.
    """

    allow_remote = (
        os.getenv("SUPERADMIN_BOOTSTRAP_ALLOW_REMOTE", "false").lower() == "true"
    )
    if not allow_remote:
        client_host = request.client.host if request.client else ""
        if client_host not in {"127.0.0.1", "::1", "localhost"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bootstrap endpoint is restricted to localhost",
            )

    header_secret = request.headers.get("X-Superadmin-Secret")
    provided_secret = header_secret or (super_admin_data.super_admin_secret or "")

    # Verify super admin secret
    if not verify_super_admin_secret(provided_secret):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid super admin secret",
        )

    # Check if super admin already exists for this college
    existing_super_admin = (
        db.query(User)
        .filter(
            User.role == UserRole.SUPER_ADMIN,
            User.college_name == super_admin_data.college_name,
        )
        .first()
    )

    if existing_super_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super admin already exists for this college",
        )

    # Check if email or username already exists
    if db.query(User).filter(User.email == super_admin_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    if db.query(User).filter(User.username == super_admin_data.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken"
        )

    # Create super admin user
    hashed_password = get_password_hash(super_admin_data.password)
    super_admin = User(
        email=super_admin_data.email,
        username=super_admin_data.username,
        hashed_password=hashed_password,
        full_name=super_admin_data.full_name,
        role=UserRole.SUPER_ADMIN,
        college_name=super_admin_data.college_name,
        department="Administration",
    )

    db.add(super_admin)
    db.commit()
    db.refresh(super_admin)

    return {
        "message": "Super admin created successfully",
        "super_admin": {
            "id": super_admin.id,
            "email": super_admin.email,
            "username": super_admin.username,
            "full_name": super_admin.full_name,
            "college_name": super_admin.college_name,
        },
    }


@super_admin_router.post("/create-admin", response_model=AdminResponse)
async def create_admin(
    admin_data: AdminCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Create a new department admin (super admin only)."""

    college_name = (current_user.get("college_name") or "").strip()
    if not college_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super admin account is missing college_name",
        )

    # Check if email or username already exists
    if db.query(User).filter(User.email == admin_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    if db.query(User).filter(User.username == admin_data.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken"
        )

    raw_password = admin_data.password
    provided_password = (
        raw_password
        if (raw_password is not None and raw_password.strip() != "")
        else None
    )
    if provided_password is not None:
        if len(provided_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 6 characters",
            )
        temp_password = None
        hashed_password = get_password_hash(provided_password)
    else:
        # Generate temporary password
        generated = "".join(
            secrets.choice(string.ascii_letters + string.digits) for _ in range(12)
        )
        temp_password = generated
        hashed_password = get_password_hash(generated)

    # Resolve unique admin ID BEFORE creating any DB records to avoid orphaned users
    provided_unique = (admin_data.unique_admin_id or "").strip()
    if provided_unique:
        provided_unique = provided_unique.upper()
        if db.query(Admin).filter(Admin.unique_admin_id == provided_unique).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unique Admin ID already exists",
            )
        unique_admin_id = provided_unique
    else:
        unique_admin_id = generate_unique_admin_id()
        while db.query(Admin).filter(Admin.unique_admin_id == unique_admin_id).first():
            unique_admin_id = generate_unique_admin_id()

    # Create admin user (only after all validations pass)
    admin_user = User(
        email=admin_data.email,
        username=admin_data.username,
        hashed_password=hashed_password,
        full_name=admin_data.full_name,
        role=UserRole.ADMIN,
        department=admin_data.department,
        college_name=college_name,
    )

    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)

    # Create admin record
    admin_record = Admin(
        user_id=admin_user.id,
        unique_admin_id=unique_admin_id,
        department=admin_data.department,
        permissions=admin_data.permissions
        or ["schedule_interviews", "view_analytics", "manage_students"],
        created_by=current_user["user_id"],
    )

    db.add(admin_record)
    db.commit()
    db.refresh(admin_record)

    return {
        "id": admin_user.id,
        "email": admin_user.email,
        "username": admin_user.username,
        "full_name": admin_user.full_name,
        "department": admin_data.department,
        "unique_admin_id": unique_admin_id,
        "permissions": admin_record.permissions,
        "created_at": admin_record.created_at.isoformat(),
        "is_active": admin_user.is_active,
        "temporary_password": temp_password,
    }


@super_admin_router.get("/admins")
async def list_admins(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """List all department admins created by this super admin, enriched with student count and last activity."""

    admins = (
        db.query(Admin, User)
        .join(User, Admin.user_id == User.id)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    )

    admin_list = []
    for admin_record, user in admins:
        uid = admin_record.unique_admin_id

        # Count students linked to this admin
        student_count = (
            db.query(func.count(User.id))
            .filter(User.role == UserRole.STUDENT, User.admin_id == uid)
            .scalar()
            or 0
        )

        # Last completed interview for any student under this admin (proxy for "last active")
        student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(User.role == UserRole.STUDENT, User.admin_id == uid)
            .all()
        ]
        last_active = None
        if student_ids:
            last_interview = (
                db.query(Interview.ended_at)
                .filter(
                    Interview.student_id.in_(student_ids),
                    Interview.status == InterviewStatus.COMPLETED,
                    Interview.ended_at.isnot(None),
                )
                .order_by(Interview.ended_at.desc())
                .first()
            )
            if last_interview and last_interview[0]:
                last_active = last_interview[0].isoformat()

        admin_list.append(
            {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "full_name": user.full_name,
                "department": admin_record.department,
                "college_name": user.college_name or "",
                "unique_admin_id": uid,
                "permissions": admin_record.permissions,
                "created_at": admin_record.created_at.isoformat(),
                "is_active": user.is_active,
                "status": "active" if user.is_active else "inactive",
                "managed_students": student_count,
                "last_login": last_active,
                # admin_id used as key in some frontend loops
                "admin_id": uid,
            }
        )

    return admin_list


@super_admin_router.post("/admins/{admin_user_id}/reset-password")
async def reset_department_admin_password(
    admin_user_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Reset password for a department admin created by this super admin."""

    admin_record = (
        db.query(Admin)
        .filter(
            Admin.user_id == admin_user_id,
            Admin.created_by == current_user["user_id"],
        )
        .first()
    )
    if not admin_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found"
        )

    user = (
        db.query(User)
        .filter(User.id == admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    new_password = "".join(
        secrets.choice(string.ascii_letters + string.digits) for _ in range(12)
    )
    user.hashed_password = get_password_hash(new_password)
    user.is_active = True

    db.add(user)
    db.commit()

    return {
        "message": "Password reset",
        "temporary_password": new_password,
    }


@super_admin_router.delete("/admins/{admin_user_id}")
async def delete_admin(
    admin_user_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Permanently delete a department admin created by this super admin."""

    admin_record = (
        db.query(Admin)
        .filter(
            Admin.user_id == admin_user_id,
            Admin.created_by == current_user["user_id"],
        )
        .first()
    )
    if not admin_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found"
        )

    user = (
        db.query(User)
        .filter(User.id == admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    db.delete(admin_record)
    db.delete(user)
    db.commit()

    return {"message": "Admin deleted successfully"}


@super_admin_router.patch("/admins/{admin_user_id}/toggle-active")
async def toggle_admin_active(
    admin_user_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Activate or deactivate a department admin created by this super admin."""

    admin_record = (
        db.query(Admin)
        .filter(
            Admin.user_id == admin_user_id,
            Admin.created_by == current_user["user_id"],
        )
        .first()
    )
    if not admin_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found"
        )

    user = (
        db.query(User)
        .filter(User.id == admin_user_id, User.role == UserRole.ADMIN)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    user.is_active = not user.is_active
    db.add(user)
    db.commit()

    return {
        "message": f"Admin {'activated' if user.is_active else 'deactivated'} successfully",
        "is_active": user.is_active,
    }


@super_admin_router.get("/analytics")
async def get_college_analytics(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Get college-wide analytics for super admin."""

    # Only count admins created by this super admin (departments under this college)
    created_admin_ids = [
        a.unique_admin_id
        for a in db.query(Admin)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    ]
    total_admins = len(created_admin_ids)

    # Students are associated via User.admin_id (string unique_admin_id)
    total_students = 0
    if created_admin_ids:
        total_students = (
            db.query(User)
            .filter(
                User.role == UserRole.STUDENT,
                User.admin_id.in_(created_admin_ids),
            )
            .count()
        )

    # Get department-wise breakdown
    dept_stats = (
        db.query(Admin.department, func.count(User.id).label("student_count"))
        .join(User, User.admin_id == Admin.unique_admin_id)
        .filter(Admin.created_by == current_user["user_id"])
        .group_by(Admin.department)
        .all()
    )

    return {
        "total_admins": total_admins,
        "total_students": total_students,
        "department_stats": [
            {"department": dept, "student_count": count} for dept, count in dept_stats
        ],
    }


@super_admin_router.get("/dashboard")
async def get_dashboard_overview(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Dashboard summary for a college super admin.

    This is intentionally shaped to match the existing frontend `SuperAdminDashboard`.
    """

    created_admin_ids = [
        a.unique_admin_id
        for a in db.query(Admin)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    ]

    total_admins = len(created_admin_ids)
    active_admins = 0
    if total_admins:
        # Active admin users
        active_admins = (
            db.query(User)
            .join(Admin, Admin.user_id == User.id)
            .filter(Admin.created_by == current_user["user_id"], User.is_active == True)
            .count()
        )

    total_students = 0
    if created_admin_ids:
        total_students = (
            db.query(User)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .count()
        )

    # Interviews for those students
    total_interviews = 0
    if created_admin_ids:
        student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .all()
        ]
        if student_ids:
            total_interviews = (
                db.query(Interview)
                .filter(Interview.student_id.in_(student_ids))
                .count()
            )

    return {
        "total_colleges": 1,
        "total_admins": total_admins,
        "active_admins": active_admins,
        "total_students": total_students,
        "total_interviews": total_interviews,
    }


@super_admin_router.get("/colleges")
async def get_colleges(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Return the current super admin's college as a single-item list."""

    college_name = (current_user.get("college_name") or "").strip()
    if not college_name:
        return []

    created_admin_ids = [
        a.unique_admin_id
        for a in db.query(Admin)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    ]
    total_admins = len(created_admin_ids)
    student_ids: List[int] = []
    if created_admin_ids:
        student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .all()
        ]
    total_students = len(student_ids)

    total_interviews = 0
    avg_perf = 0.0
    if student_ids:
        interviews = (
            db.query(Interview).filter(Interview.student_id.in_(student_ids)).all()
        )
        total_interviews = len(interviews)
        scores = [
            float(i.overall_score)
            for i in interviews
            if i.status == InterviewStatus.COMPLETED and i.overall_score is not None
        ]
        avg_perf = (sum(scores) / len(scores)) if scores else 0.0

    profile = (
        db.query(CollegeProfile)
        .filter(CollegeProfile.super_admin_user_id == current_user["user_id"])
        .first()
    )

    return [
        _build_college_payload(
            current_user,
            profile,
            total_students,
            total_admins,
            total_interviews,
            avg_perf,
        )
    ]


def _get_or_create_profile(db: Session, user_id: int) -> "CollegeProfile":
    """Return the CollegeProfile row for this super admin, creating one if absent."""
    profile = (
        db.query(CollegeProfile)
        .filter(CollegeProfile.super_admin_user_id == user_id)
        .first()
    )
    if not profile:
        profile = CollegeProfile(super_admin_user_id=user_id)
        db.add(profile)
        db.flush()
    return profile


def _build_college_payload(
    current_user: dict,
    profile: "CollegeProfile | None",
    total_students: int,
    total_admins: int,
    total_interviews: int,
    avg_perf: float,
) -> dict:
    college_name = (current_user.get("college_name") or "").strip()
    college_id = "-".join(college_name.lower().split())
    return {
        "college_id": college_id,
        "college_name": college_name,
        "address": profile.address if profile else "",
        "contact_email": current_user.get("email"),
        "contact_phone": profile.contact_phone if profile else "",
        "website_url": profile.website_url if profile else "",
        "established_year": profile.established_year if profile else None,
        "college_type": (profile.college_type if profile else None) or "engineering",
        "status": (profile.status if profile else None) or "active",
        "total_students": total_students,
        "total_admins": total_admins,
        "total_interviews": total_interviews,
        "average_performance": avg_perf,
    }


class CollegeUpdateBody(BaseModel):
    college_name: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    website_url: Optional[str] = None
    established_year: Optional[int] = None
    college_type: Optional[str] = None
    status: Optional[str] = None


@super_admin_router.post("/colleges")
async def update_college_info(
    body: CollegeUpdateBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Update the super admin's own college metadata."""
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update college_name on the User row if provided
    if body.college_name is not None and body.college_name.strip():
        user.college_name = body.college_name.strip()

    # Update extended profile
    profile = _get_or_create_profile(db, current_user["user_id"])
    if body.address is not None:
        profile.address = body.address
    if body.contact_phone is not None:
        profile.contact_phone = body.contact_phone
    if body.website_url is not None:
        profile.website_url = body.website_url
    if body.established_year is not None:
        profile.established_year = body.established_year
    if body.college_type is not None:
        profile.college_type = body.college_type
    if body.status is not None:
        profile.status = body.status

    db.commit()
    db.refresh(user)
    db.refresh(profile)

    return {"message": "College updated successfully"}


class CollegeStatusBody(BaseModel):
    status: str


@super_admin_router.put("/colleges/{college_id}/status")
async def update_college_status(
    college_id: str,
    body: CollegeStatusBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Toggle active/inactive/suspended status of the super admin's college."""
    new_status = body.status
    if new_status not in ("active", "inactive", "suspended"):
        raise HTTPException(status_code=400, detail="Invalid status value")

    profile = _get_or_create_profile(db, current_user["user_id"])
    profile.status = new_status
    db.commit()
    return {"message": f"College status updated to {new_status}", "status": new_status}


@super_admin_router.get("/colleges/{college_id}")
async def get_college_detail(
    college_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Return full detail for the super admin's own college."""
    college_name = (current_user.get("college_name") or "").strip()
    expected_id = "-".join(college_name.lower().split())
    if college_id != expected_id:
        raise HTTPException(status_code=404, detail="College not found")

    created_admin_ids = [
        a.unique_admin_id
        for a in db.query(Admin)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    ]
    total_admins = len(created_admin_ids)

    student_ids: List[int] = []
    if created_admin_ids:
        student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .all()
        ]
    total_students = len(student_ids)

    total_interviews = 0
    avg_perf = 0.0
    if student_ids:
        interviews = (
            db.query(Interview).filter(Interview.student_id.in_(student_ids)).all()
        )
        total_interviews = len(interviews)
        scores = [
            float(i.overall_score)
            for i in interviews
            if i.status == InterviewStatus.COMPLETED and i.overall_score is not None
        ]
        avg_perf = (sum(scores) / len(scores)) if scores else 0.0

    profile = (
        db.query(CollegeProfile)
        .filter(CollegeProfile.super_admin_user_id == current_user["user_id"])
        .first()
    )

    # Build admin list with per-admin stats
    admins_detail = []
    admin_records = (
        db.query(Admin, User)
        .join(User, Admin.user_id == User.id)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    )
    for admin_rec, admin_user in admin_records:
        dept_student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(
                User.role == UserRole.STUDENT,
                User.admin_id == admin_rec.unique_admin_id,
            )
            .all()
        ]
        dept_interviews = 0
        if dept_student_ids:
            dept_interviews = (
                db.query(Interview)
                .filter(Interview.student_id.in_(dept_student_ids))
                .count()
            )
        admins_detail.append(
            {
                "id": admin_user.id,
                "full_name": admin_user.full_name,
                "email": admin_user.email,
                "department": admin_rec.department,
                "unique_admin_id": admin_rec.unique_admin_id,
                "is_active": admin_user.is_active,
                "total_students": len(dept_student_ids),
                "total_interviews": dept_interviews,
            }
        )

    payload = _build_college_payload(
        current_user, profile, total_students, total_admins, total_interviews, avg_perf
    )
    payload["admins"] = admins_detail
    return payload


@super_admin_router.get("/colleges/{college_id}/analytics")
async def get_college_analytics_detail(
    college_id: str,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Detailed analytics for the super admin's college."""
    college_name = (current_user.get("college_name") or "").strip()
    expected_id = "-".join(college_name.lower().split())
    if college_id != expected_id:
        raise HTTPException(status_code=404, detail="College not found")

    since = datetime.utcnow() - timedelta(days=days)

    created_admin_ids = [
        a.unique_admin_id
        for a in db.query(Admin)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    ]

    student_ids: List[int] = []
    if created_admin_ids:
        student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .all()
        ]

    all_interviews: List[Interview] = []
    if student_ids:
        all_interviews = (
            db.query(Interview).filter(Interview.student_id.in_(student_ids)).all()
        )

    completed = [i for i in all_interviews if i.status == InterviewStatus.COMPLETED]
    scores = [float(i.overall_score) for i in completed if i.overall_score is not None]
    avg_score = (sum(scores) / len(scores)) if scores else 0.0

    # Score distribution buckets
    score_distribution = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for s in scores:
        if s <= 20:
            score_distribution["0-20"] += 1
        elif s <= 40:
            score_distribution["21-40"] += 1
        elif s <= 60:
            score_distribution["41-60"] += 1
        elif s <= 80:
            score_distribution["61-80"] += 1
        else:
            score_distribution["81-100"] += 1

    # Department breakdown
    dept_breakdown = []
    admin_records = (
        db.query(Admin, User)
        .join(User, Admin.user_id == User.id)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    )
    for admin_rec, admin_user in admin_records:
        dept_sids = [
            row[0]
            for row in db.query(User.id)
            .filter(
                User.role == UserRole.STUDENT,
                User.admin_id == admin_rec.unique_admin_id,
            )
            .all()
        ]
        dept_ivs: List[Interview] = []
        if dept_sids:
            dept_ivs = (
                db.query(Interview).filter(Interview.student_id.in_(dept_sids)).all()
            )
        dept_completed = [i for i in dept_ivs if i.status == InterviewStatus.COMPLETED]
        dept_scores = [
            float(i.overall_score)
            for i in dept_completed
            if i.overall_score is not None
        ]
        dept_avg = (sum(dept_scores) / len(dept_scores)) if dept_scores else 0.0
        dept_breakdown.append(
            {
                "department": admin_rec.department,
                "admin_name": admin_user.full_name,
                "total_students": len(dept_sids),
                "total_interviews": len(dept_ivs),
                "completed_interviews": len(dept_completed),
                "average_score": round(dept_avg, 2),
            }
        )

    # Interview type breakdown
    type_counts: dict = {}
    for iv in all_interviews:
        t = (
            iv.interview_type.value
            if hasattr(iv.interview_type, "value")
            else str(iv.interview_type)
        )
        type_counts[t] = type_counts.get(t, 0) + 1

    return {
        "college_name": college_name,
        "days": days,
        "total_students": len(student_ids),
        "total_interviews": len(all_interviews),
        "completed_interviews": len(completed),
        "average_score": round(avg_score, 2),
        "completion_rate": round(len(completed) / len(all_interviews) * 100, 1)
        if all_interviews
        else 0.0,
        "score_distribution": [
            {"range": k, "count": v} for k, v in score_distribution.items()
        ],
        "department_breakdown": dept_breakdown,
        "interview_type_breakdown": [
            {"type": k, "count": v} for k, v in type_counts.items()
        ],
    }


@super_admin_router.get("/system/statistics")
async def get_system_statistics(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Return real platform stats computed from the database."""

    # ── Scoping: resolve all student IDs under this super admin ──────────────
    created_admin_ids = [
        a.unique_admin_id
        for a in db.query(Admin)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    ]
    student_ids: List[int] = []
    if created_admin_ids:
        student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .all()
        ]

    # ── Interview counts ──────────────────────────────────────────────────────
    total_interviews = 0
    completed = 0
    active_sessions = 0
    daily_interviews = 0

    if student_ids:
        total_interviews = (
            db.query(Interview).filter(Interview.student_id.in_(student_ids)).count()
        )

        completed = (
            db.query(Interview)
            .filter(
                Interview.student_id.in_(student_ids),
                Interview.status == InterviewStatus.COMPLETED,
            )
            .count()
        )

        # Active sessions = interviews currently in progress
        active_sessions = (
            db.query(Interview)
            .filter(
                Interview.student_id.in_(student_ids),
                Interview.status == InterviewStatus.IN_PROGRESS,
            )
            .count()
        )

        # Daily interviews = created today (UTC)
        today_start = datetime.utcnow().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        daily_interviews = (
            db.query(Interview)
            .filter(
                Interview.student_id.in_(student_ids),
                Interview.created_at >= today_start,
            )
            .count()
        )

    # ── Interview success rate ────────────────────────────────────────────────
    # Percentage of all interviews that reached COMPLETED status
    success_rate = (
        round((completed / total_interviews * 100.0), 1) if total_interviews else 0.0
    )

    # ── Avg response time (seconds) from PerformanceRecord ───────────────────
    # response_time_avg is stored per interview; we take the mean across all
    # completed interviews for this super admin's students.
    avg_rt_row = (
        db.query(func.avg(PerformanceRecord.response_time_avg))
        .join(Interview, PerformanceRecord.interview_id == Interview.id)
        .filter(Interview.student_id.in_(student_ids))
        .scalar()
        if student_ids
        else None
    )
    # Convert seconds → milliseconds; fall back to None so frontend can show "—"
    avg_response_time = round(float(avg_rt_row) * 1000) if avg_rt_row else None

    # ── Malpractice / alerts ──────────────────────────────────────────────────
    # Resolve interview IDs for scoping malpractice queries
    interview_ids: List[int] = []
    if student_ids:
        interview_ids = [
            row[0]
            for row in db.query(Interview.id)
            .filter(Interview.student_id.in_(student_ids))
            .all()
        ]

    critical_issues = 0
    pending_malpractice = 0
    system_warnings = 0

    if interview_ids:
        # Critical issues = malpractice records with severity "high"
        critical_issues = (
            db.query(MalpracticeRecord)
            .filter(
                MalpracticeRecord.interview_id.in_(interview_ids),
                MalpracticeRecord.severity == "high",
            )
            .count()
        )

        # Pending malpractice = distinct interviews that have ANY malpractice
        # record but the interview has no admin_notice yet (i.e. unreviewed)
        pending_malpractice = (
            db.query(Interview.id)
            .filter(
                Interview.id.in_(interview_ids),
                Interview.admin_notice.is_(None),
            )
            .join(MalpracticeRecord, MalpracticeRecord.interview_id == Interview.id)
            .distinct()
            .count()
        )

        # System warnings = malpractice records with severity "medium"
        system_warnings = (
            db.query(MalpracticeRecord)
            .filter(
                MalpracticeRecord.interview_id.in_(interview_ids),
                MalpracticeRecord.severity == "medium",
            )
            .count()
        )

    # ── Platform score (composite, out of 10) ────────────────────────────────
    # Derived from three signals, each weighted:
    #   40% — interview success rate (0–100 → 0–10)
    #   40% — average overall_score of completed interviews (0–100 → 0–10)
    #   20% — integrity score: 1 − (malpractice_interviews / total_interviews)
    #
    # All three are DB-driven; result is clamped to [0, 10].

    avg_score_row = (
        db.query(func.avg(Interview.overall_score))
        .filter(
            Interview.student_id.in_(student_ids),
            Interview.status == InterviewStatus.COMPLETED,
            Interview.overall_score > 0,
        )
        .scalar()
        if student_ids
        else None
    )
    avg_interview_score = float(avg_score_row) if avg_score_row else 0.0

    # Count interviews that have at least one malpractice record
    interviews_with_malpractice = (
        db.query(Interview.id)
        .filter(Interview.id.in_(interview_ids))
        .join(MalpracticeRecord, MalpracticeRecord.interview_id == Interview.id)
        .distinct()
        .count()
        if interview_ids
        else 0
    )
    integrity_ratio = (
        1.0 - (interviews_with_malpractice / total_interviews)
        if total_interviews
        else 1.0
    )

    platform_score = round(
        min(
            (success_rate / 100.0) * 10 * 0.4
            + (avg_interview_score / 100.0) * 10 * 0.4
            + integrity_ratio * 10 * 0.2,
            10.0,
        ),
        1,
    )

    # ── Server uptime ─────────────────────────────────────────────────────────
    # Approximated as the ratio of non-cancelled interviews to all interviews.
    # When there is no data yet, default to 100.0 (system just started, no failures).
    non_cancelled = (
        db.query(Interview)
        .filter(
            Interview.student_id.in_(student_ids),
            Interview.status != InterviewStatus.CANCELLED,
        )
        .count()
        if student_ids
        else 0
    )
    server_uptime = (
        round((non_cancelled / total_interviews) * 100, 1)
        if total_interviews
        else 100.0
    )

    return {
        "avg_response_time": avg_response_time,  # ms (int) or None
        "active_sessions": active_sessions,  # int
        "interview_success_rate": success_rate,  # float 0–100
        "daily_interviews": daily_interviews,  # int
        "platform_score": platform_score,  # float 0–10
        "critical_issues": critical_issues,  # int
        "pending_malpractice": pending_malpractice,  # int
        "system_warnings": system_warnings,  # int
        "server_uptime": server_uptime,  # float 0–100
    }


@super_admin_router.get("/analytics/system")
async def get_system_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Return analytics payload expected by the existing SystemAnalytics UI."""

    created_admin_ids = [
        a.unique_admin_id
        for a in db.query(Admin)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    ]
    student_ids: List[int] = []
    if created_admin_ids:
        student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .all()
        ]

    total_students = len(student_ids)
    total_interviews = 0
    if student_ids:
        total_interviews = (
            db.query(Interview).filter(Interview.student_id.in_(student_ids)).count()
        )

    # The UI expects growth %, peak hours, distribution etc. Provide stable defaults.
    return {
        "total_colleges": 1,
        "college_growth": 0,
        "total_students": total_students,
        "student_growth": 0,
        "total_interviews": total_interviews,
        "interview_growth": 0,
        "uptime_percentage": 99.9,
        "peak_hours": [],
        "interview_distribution": [],
        "geographic_data": [],
        "resource_usage": {
            "cpu": 0,
            "memory": 0,
            "storage": 0,
            "bandwidth": 0,
        },
        "days": days,
    }


@super_admin_router.get("/system/performance")
async def get_system_performance(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    created_admin_ids = [
        a.unique_admin_id
        for a in db.query(Admin)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    ]
    student_ids: List[int] = []
    if created_admin_ids:
        student_ids = [
            row[0]
            for row in db.query(User.id)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .all()
        ]

    total_interviews = 0
    completed = 0
    if student_ids:
        total_interviews = (
            db.query(Interview).filter(Interview.student_id.in_(student_ids)).count()
        )
        completed = (
            db.query(Interview)
            .filter(
                Interview.student_id.in_(student_ids),
                Interview.status == InterviewStatus.COMPLETED,
            )
            .count()
            if total_interviews
            else 0
        )

    success_rate = (completed / total_interviews * 100.0) if total_interviews else 0.0

    return {
        "avg_response_time": 120,
        "success_rate": float(success_rate),
        "error_rate": 0.0,
        "concurrent_users": 0,
        "days": days,
    }


@super_admin_router.get("/analytics/college-performance")
async def get_college_performance(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Detailed college performance analytics: per-admin breakdown, score distribution, trends."""

    since = datetime.utcnow() - timedelta(days=days)

    # ── Admins created by this super admin ───────────────────────────────────
    admin_records = (
        db.query(Admin, User)
        .join(User, Admin.user_id == User.id)
        .filter(Admin.created_by == current_user["user_id"])
        .all()
    )

    created_admin_ids = [a.unique_admin_id for a, _ in admin_records]

    # ── All students under those admins ──────────────────────────────────────
    all_students: List[User] = []
    if created_admin_ids:
        all_students = (
            db.query(User)
            .filter(User.role == UserRole.STUDENT, User.admin_id.in_(created_admin_ids))
            .all()
        )

    all_student_ids = [s.id for s in all_students]

    # ── All completed interviews ──────────────────────────────────────────────
    all_completed: List[Interview] = []
    if all_student_ids:
        all_completed = (
            db.query(Interview)
            .filter(
                Interview.student_id.in_(all_student_ids),
                Interview.status == InterviewStatus.COMPLETED,
            )
            .all()
        )

    total_interviews = len(all_completed)
    overall_scores = [float(i.overall_score or 0) for i in all_completed]
    avg_score = (sum(overall_scores) / len(overall_scores)) if overall_scores else 0.0

    # ── Per-admin breakdown ───────────────────────────────────────────────────
    admin_performance = []
    best_dept = None
    best_dept_score = -1.0

    for admin_rec, admin_user in admin_records:
        uid = admin_rec.unique_admin_id

        # Students for this admin
        students_here = [s for s in all_students if s.admin_id == uid]
        student_ids_here = [s.id for s in students_here]

        # Completed interviews for those students
        interviews_here = [
            i for i in all_completed if i.student_id in set(student_ids_here)
        ]
        scores_here = [float(i.overall_score or 0) for i in interviews_here]
        dept_avg = (sum(scores_here) / len(scores_here)) if scores_here else 0.0

        # Performance record breakdown
        interview_ids_here = [i.id for i in interviews_here]
        perf_recs: List[PerformanceRecord] = []
        if interview_ids_here:
            perf_recs = (
                db.query(PerformanceRecord)
                .filter(PerformanceRecord.interview_id.in_(interview_ids_here))
                .all()
            )

        def _avg(vals):
            return (sum(vals) / len(vals)) if vals else 0.0

        tech_avg = _avg([float(p.technical_score or 0) for p in perf_recs])
        comm_avg = _avg([float(p.communication_score or 0) for p in perf_recs])
        conf_avg = _avg([float(p.confidence_score or 0) for p in perf_recs])
        comp_avg = _avg([float(p.completion_rate or 0) for p in perf_recs])

        entry = {
            "admin_id": uid,
            "admin_name": admin_user.full_name,
            "admin_email": admin_user.email,
            "department": admin_rec.department,
            "student_count": len(students_here),
            "interview_count": len(interviews_here),
            "avg_score": round(dept_avg, 2),
            "technical_avg": round(tech_avg, 2),
            "communication_avg": round(comm_avg, 2),
            "confidence_avg": round(conf_avg, 2),
            "completion_rate": round(comp_avg, 2),
        }
        admin_performance.append(entry)

        if dept_avg > best_dept_score and len(interviews_here) > 0:
            best_dept_score = dept_avg
            best_dept = {
                "department": admin_rec.department,
                "admin_name": admin_user.full_name,
                "avg_score": round(dept_avg, 2),
                "interview_count": len(interviews_here),
            }

    # ── Score distribution (grade buckets) ───────────────────────────────────
    grade_buckets = {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for s in overall_scores:
        if s >= 90:
            grade_buckets["A+"] += 1
        elif s >= 80:
            grade_buckets["A"] += 1
        elif s >= 70:
            grade_buckets["B"] += 1
        elif s >= 60:
            grade_buckets["C"] += 1
        elif s >= 50:
            grade_buckets["D"] += 1
        else:
            grade_buckets["F"] += 1

    score_distribution = [{"grade": k, "count": v} for k, v in grade_buckets.items()]

    # ── Interview type distribution (across entire college) ───────────────────
    type_dist: dict = {}
    for i in all_completed:
        t = (
            i.interview_type.value
            if hasattr(i.interview_type, "value")
            else str(i.interview_type)
        ).lower()
        type_dist[t] = type_dist.get(t, 0) + 1

    interview_type_distribution = [
        {"type": k, "count": v} for k, v in type_dist.items()
    ]

    # ── Trend: avg score per day over `days` window ──────────────────────────
    day_buckets: dict = {}
    for i in all_completed:
        if i.ended_at and i.ended_at >= since:
            day = i.ended_at.strftime("%Y-%m-%d")
        elif i.created_at and i.created_at >= since:
            day = i.created_at.strftime("%Y-%m-%d")
        else:
            continue
        if day not in day_buckets:
            day_buckets[day] = {"scores": [], "count": 0}
        day_buckets[day]["scores"].append(float(i.overall_score or 0))
        day_buckets[day]["count"] += 1

    trends = sorted(
        [
            {
                "date": day,
                "avg_score": round(
                    sum(v["scores"]) / len(v["scores"]) if v["scores"] else 0, 2
                ),
                "interview_count": v["count"],
            }
            for day, v in day_buckets.items()
        ],
        key=lambda x: x["date"],
    )

    # ── Summary ───────────────────────────────────────────────────────────────
    all_total = (
        db.query(Interview).filter(Interview.student_id.in_(all_student_ids)).count()
        if all_student_ids
        else 0
    )
    completion_rate = (total_interviews / all_total * 100.0) if all_total else 0.0

    return {
        "summary": {
            "total_admins": len(admin_records),
            "total_students": len(all_students),
            "total_interviews": total_interviews,
            "avg_score": round(avg_score, 2),
            "completion_rate": round(completion_rate, 2),
        },
        "admin_performance": admin_performance,
        "top_department": best_dept,
        "score_distribution": score_distribution,
        "interview_type_distribution": interview_type_distribution,
        "trends": trends,
        "days": days,
    }


# ─── Settings ─────────────────────────────────────────────────────────────────


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    college_name: Optional[str] = None


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


@super_admin_router.get("/settings/profile")
async def get_profile(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Return the current super admin's profile."""
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "username": user.username,
        "college_name": user.college_name or "",
        "department": user.department or "",
        "role": user.role.value,
        "is_active": user.is_active,
    }


@super_admin_router.patch("/settings/profile")
async def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Update the super admin's profile fields."""
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email and payload.email != user.email:
        conflict = (
            db.query(User)
            .filter(User.email == payload.email, User.id != user.id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = payload.email

    if payload.username and payload.username != user.username:
        conflict = (
            db.query(User)
            .filter(User.username == payload.username, User.id != user.id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = payload.username

    if payload.full_name:
        user.full_name = payload.full_name

    if payload.college_name:
        user.college_name = payload.college_name

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Profile updated successfully",
        "full_name": user.full_name,
        "email": user.email,
        "username": user.username,
        "college_name": user.college_name or "",
    }


@super_admin_router.patch("/settings/password")
async def update_password(
    payload: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("super_admin")),
):
    """Change the super admin's password after verifying the current one."""
    from app.utils.auth import verify_password

    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(payload.new_password) < 6:
        raise HTTPException(
            status_code=400, detail="New password must be at least 6 characters"
        )

    user.hashed_password = get_password_hash(payload.new_password)
    db.add(user)
    db.commit()

    return {"message": "Password changed successfully"}
