from __future__ import annotations

from typing import Optional, Dict

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, Admin
from app.utils.auth import verify_token

# Token URL is relative to the FastAPI app root. Our auth router is mounted at /api/auth.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Dict:
    payload = verify_token(token)

    user_id = payload.get("sub")
    role = payload.get("role")
    username = payload.get("username")

    if not user_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Enrich with admin info when applicable
    unique_admin_id: Optional[str] = None
    if user.role == UserRole.ADMIN:
        admin = db.query(Admin).filter(Admin.user_id == user.id).first()
        unique_admin_id = admin.unique_admin_id if admin else None

    return {
        "user_id": user.id,
        "role": user.role.value,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "department": user.department,
        "college_name": user.college_name,
        "admin_id": user.admin_id,
        "unique_admin_id": unique_admin_id,
    }


def require_role(*allowed_roles: str):
    def _dep(current_user: Dict = Depends(get_current_user)) -> Dict:
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _dep
