#!/usr/bin/env python3
"""Script to create demo users for GoToMock.

Creates an Admin (with a valid `unique_admin_id`) and a Student that references
that Admin ID, plus a few sample Domains.

This is intended for local/dev Docker usage.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from app.database import SessionLocal
from app.models import Admin, Domain, User, UserRole
from app.utils.auth import get_password_hash

def _get_user(db, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def _ensure_user(
    db,
    *,
    email: str,
    username: str,
    password: str,
    full_name: str,
    role: UserRole,
    department: str,
    college_name: str,
    admin_id: Optional[str] = None,
) -> User:
    existing = _get_user(db, email)
    if existing:
        return existing

    user = User(
        email=email,
        username=username,
        hashed_password=get_password_hash(password),
        full_name=full_name,
        role=role,
        department=department,
        college_name=college_name,
        admin_id=admin_id,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.flush()  # ensure user.id is available
    return user


def _ensure_admin_record(db, *, user: User, department: str, unique_admin_id: str) -> Admin:
    existing = db.query(Admin).filter(Admin.user_id == user.id).first()
    if existing:
        return existing

    admin = Admin(
        user_id=user.id,
        unique_admin_id=unique_admin_id,
        department=department,
        permissions=["manage_students", "schedule_interviews", "view_analytics"],
    )
    db.add(admin)
    db.flush()
    return admin


def _ensure_domain(db, *, name: str, description: str) -> None:
    existing = db.query(Domain).filter(Domain.name == name).first()
    if existing:
        return
    db.add(Domain(name=name, description=description, created_at=datetime.utcnow()))


def create_test_users() -> None:
    """Create demo users for the GoToMock platform."""

    db = SessionLocal()
    try:
        demo_college = "Demo College"
        cs_dept = "Computer Science"

        # Create admin user + admin record with a valid unique_admin_id
        admin_user = _ensure_user(
            db,
            email="admin@demo.com",
            username="demo_admin",
            password="admin123",
            full_name="Demo Admin",
            role=UserRole.ADMIN,
            department=cs_dept,
            college_name=demo_college,
        )

        # Deterministic-ish ID on first run; stable if record already exists
        admin_id = "DEMO" + uuid.uuid4().hex[:6].upper()
        admin_record = _ensure_admin_record(db, user=admin_user, department=cs_dept, unique_admin_id=admin_id)
        admin_id = admin_record.unique_admin_id

        # Create student user tied to that Admin ID
        _ensure_user(
            db,
            email="student@demo.com",
            username="demo_student",
            password="password123",
            full_name="Demo Student",
            role=UserRole.STUDENT,
            department=cs_dept,
            college_name=demo_college,
            admin_id=admin_id,
        )

        # Create a super admin user (can log in, but super-admin management is via separate endpoints)
        _ensure_user(
            db,
            email="superadmin@demo.com",
            username="demo_superadmin",
            password="superadmin123",
            full_name="Demo Super Admin",
            role=UserRole.SUPER_ADMIN,
            department="Administration",
            college_name=demo_college,
        )

        # Sample domains
        _ensure_domain(db, name="Computer Science", description="Programming, algorithms, data structures")
        _ensure_domain(db, name="Data Science", description="Machine learning, statistics, data analysis")
        _ensure_domain(db, name="Web Development", description="Frontend, backend, full-stack development")
        _ensure_domain(db, name="Mobile Development", description="iOS, Android, cross-platform development")
        _ensure_domain(db, name="DevOps", description="CI/CD, cloud platforms, infrastructure")

        db.commit()

        print("\n✅ Demo data created/verified successfully!")
        print("\nLogin Accounts:")
        print("👨‍💼 Admin: admin@demo.com / admin123")
        print(f"   Admin ID (use for Student registration): {admin_id}")
        print("🎓 Student: student@demo.com / password123")
        print("🔧 Super Admin: superadmin@demo.com / superadmin123")
    except Exception as e:
        db.rollback()
        print(f"❌ Error creating demo users: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Creating demo users for GoToMock platform...")
    create_test_users()