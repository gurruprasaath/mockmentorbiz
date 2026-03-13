from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    Boolean,
    ForeignKey,
    Float,
    JSON,
    Enum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from datetime import datetime
from app.database import Base


class UserRole(str, enum.Enum):
    STUDENT = "student"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"
    OWNER = "owner"


class InterviewType(str, enum.Enum):
    RESUME_BASED = "resume_based"
    DOMAIN_BASED = "domain_based"
    SCHEDULED = "scheduled"


class InterviewStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class MalpracticeType(str, enum.Enum):
    MULTIPLE_FACES = "multiple_faces"
    TAB_SWITCHING = "tab_switching"
    NO_FACE_DETECTED = "no_face_detected"
    AUDIO_ANOMALY = "audio_anomaly"
    PHONE_DETECTED = "phone_detected"
    FULLSCREEN_EXIT = "fullscreen_exit"
    COPY_PASTE = "copy_paste"
    RIGHT_CLICK = "right_click"
    PROHIBITED_KEYS = "prohibited_keys"
    WINDOW_BLUR = "window_blur"
    LOOK_AWAY = "look_away"
    MULTIPLE_PERSONS = "multiple_persons"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(
        Enum(UserRole, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    is_active = Column(Boolean, default=True)
    admin_id = Column(
        String(100), nullable=True
    )  # For students - their admin's unique ID
    department = Column(String(100), nullable=True)
    college_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    student_interviews = relationship(
        "Interview", back_populates="student", foreign_keys="Interview.student_id"
    )
    admin_interviews = relationship(
        "Interview", back_populates="admin", foreign_keys="Interview.admin_id"
    )
    performance_records = relationship("PerformanceRecord", back_populates="student")


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    unique_admin_id = Column(String(100), unique=True, index=True, nullable=False)
    department = Column(String(100), nullable=False)
    permissions = Column(JSON, default=list)  # List of permissions
    created_by = Column(
        Integer, ForeignKey("users.id"), nullable=True
    )  # Super admin who created this admin
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    creator = relationship("User", foreign_keys=[created_by])


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    admin_id = Column(
        Integer, ForeignKey("users.id"), nullable=True
    )  # For scheduled interviews
    # DB stores Enum *values* (e.g., resume_based). Consistent with how UserRole is stored.
    interview_type = Column(
        Enum(InterviewType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    domain = Column(String(100), nullable=True)  # For domain-based interviews
    status = Column(
        Enum(InterviewStatus, values_callable=lambda obj: [e.value for e in obj]),
        default=InterviewStatus.PENDING,
    )
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, default=0)
    num_questions = Column(Integer, default=10)
    questions = Column(JSON, default=list)  # List of questions asked
    responses = Column(JSON, default=list)  # List of student responses
    resume_path = Column(String(500), nullable=True)  # Path to uploaded resume
    overall_score = Column(Float, default=0.0)
    feedback = Column(Text, nullable=True)
    is_proctored = Column(Boolean, default=True)
    admin_notice = Column(
        JSON, nullable=True
    )  # Set by admin after malpractice review (warn/penalize)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    student = relationship(
        "User", back_populates="student_interviews", foreign_keys=[student_id]
    )
    admin = relationship(
        "User", back_populates="admin_interviews", foreign_keys=[admin_id]
    )
    malpractice_records = relationship("MalpracticeRecord", back_populates="interview")


class PerformanceRecord(Base):
    __tablename__ = "performance_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    interview_id = Column(Integer, ForeignKey("interviews.id"), nullable=False)
    communication_score = Column(Float, default=0.0)
    technical_score = Column(Float, default=0.0)
    confidence_score = Column(Float, default=0.0)
    response_time_avg = Column(Float, default=0.0)  # Average response time in seconds
    completion_rate = Column(Float, default=0.0)  # Percentage of questions answered
    strengths = Column(JSON, default=list)
    weaknesses = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    student = relationship("User", back_populates="performance_records")
    interview = relationship("Interview")


class MalpracticeRecord(Base):
    __tablename__ = "malpractice_records"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"), nullable=False)
    malpractice_type = Column(
        Enum(MalpracticeType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    severity = Column(String(20), default="medium")  # low, medium, high
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    description = Column(Text, nullable=True)
    evidence_data = Column(
        JSON, default=dict
    )  # Store evidence like timestamps, screenshots info

    # Relationships
    interview = relationship("Interview", back_populates="malpractice_records")


class Domain(Base):
    __tablename__ = "domains"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    question_pool = Column(JSON, default=list)  # Pre-defined questions for this domain
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CollegeProfile(Base):
    """Stores extended college metadata for a super admin's college.

    One row per super_admin user. Created lazily when the super admin first
    updates their college info. Falls back to defaults if the row doesn't exist.
    """

    __tablename__ = "college_profiles"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_user_id = Column(
        Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True
    )
    address = Column(Text, nullable=True)
    contact_phone = Column(String(50), nullable=True)
    website_url = Column(String(500), nullable=True)
    established_year = Column(Integer, nullable=True)
    college_type = Column(String(50), default="engineering")
    status = Column(String(20), default="active")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    super_admin = relationship("User", foreign_keys=[super_admin_user_id])
