from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from pathlib import Path
import secrets
import string
from pydantic import EmailStr

from app.database import get_db
from app.utils.auth import get_password_hash
from app.models import (
    User,
    Admin,
    Interview,
    InterviewType,
    InterviewStatus,
    PerformanceRecord,
    MalpracticeRecord,
    UserRole,
)

from app.utils.deps import require_role
from app.utils.time import utc_now, to_utc
from app.utils.ai_services import QuestionGenerator
from app.utils.uploads import audio_upload_dir

admin_router = APIRouter()


_AUDIO_UPLOAD_DIR = audio_upload_dir()


def _safe_audio_path(path_str: str) -> Path:
    """Resolve an audio path and ensure it stays within uploads/audio."""

    p = Path(path_str)
    try:
        base = _AUDIO_UPLOAD_DIR.resolve()
        resolved = p.resolve()
        if base not in resolved.parents and resolved != base:
            raise ValueError("Audio path is outside allowed directory")
        return resolved
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found"
        )


def _pct_change(current: float, previous: float) -> float:
    """Return percent change from previous to current.

    If previous is 0:
    - returns 0 when current is 0
    - returns 100 when current is non-zero
    """

    try:
        current_f = float(current or 0)
        previous_f = float(previous or 0)
    except Exception:
        return 0.0

    if previous_f == 0:
        return 0.0 if current_f == 0 else 100.0

    return ((current_f - previous_f) / abs(previous_f)) * 100.0


def _admin_scope_filters(current_user: dict):
    """Return (user_filter, invalid_scope) tuple.

    - For role=admin: filters students by unique_admin_id (User.admin_id).
      Falls back to college_name if unique_admin_id is not set.
    - For role=super_admin: filters students by college_name.
    """

    role = current_user.get("role")
    if role == "admin":
        unique_admin_id = current_user.get("unique_admin_id")
        if unique_admin_id:
            return func.upper(User.admin_id) == str(unique_admin_id).upper(), False
        # Fallback: scope by college_name so legacy/demo admin accounts still work
        college_name = (current_user.get("college_name") or "").strip()
        if college_name:
            return User.college_name == college_name, False
        # No scope at all — return a filter that matches nothing rather than blocking
        return User.id == -1, False

    # super_admin (and any other future role allowed by require_role)
    college_name = (current_user.get("college_name") or "").strip()
    if not college_name:
        # No college -> safest is deny with a 400 in the caller
        return None, True
    return User.college_name == college_name, False


def _period_bounds(days: int):
    days_i = int(days or 30)
    if days_i <= 0:
        days_i = 30
    days_i = min(days_i, 3650)

    end = utc_now()
    start = end - timedelta(days=days_i)
    prev_end = start
    prev_start = prev_end - timedelta(days=days_i)

    # Our MySQL driver often yields naive datetimes even when timezone=True.
    # Use naive UTC bounds for DB comparisons.
    return (
        start.replace(tzinfo=None),
        end.replace(tzinfo=None),
        prev_start.replace(tzinfo=None),
        prev_end.replace(tzinfo=None),
        days_i,
    )


@admin_router.get("/me")
async def get_admin_me(
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Return the current admin identity payload (includes unique_admin_id)."""

    return current_user


@admin_router.get("/interview/{interview_id}/results")
async def get_interview_results_for_admin(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Return detailed results for a specific interview (admin view)."""

    interview = db.query(Interview).filter(Interview.id == interview_id).first()
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found"
        )

    student = db.query(User).filter(User.id == interview.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )

    # Access control: admins can only view their own students.
    if current_user.get("role") != "super_admin":
        # Primary check: admin must own/schedule this interview.
        if interview.admin_id == current_user.get("user_id"):
            pass
        else:
            # Fallback (legacy / data mismatch): allow when the student belongs to this admin's unique_admin_id.
            unique_admin_id = current_user.get("unique_admin_id")
            if not unique_admin_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not allowed",
                )
            if student.admin_id != unique_admin_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed"
                )

    # Parse stored evaluation JSON (if present)
    evaluation = None
    if isinstance(interview.feedback, str) and interview.feedback.strip().startswith(
        "{"
    ):
        try:
            import json

            evaluation = json.loads(interview.feedback)
        except Exception:
            evaluation = None

    # Malpractice
    malpractice_q = db.query(MalpracticeRecord).filter(
        MalpracticeRecord.interview_id == interview.id
    )
    malpractice_count = malpractice_q.count()
    malpractice_breakdown = {}
    for mr in malpractice_q.all():
        k = (
            mr.malpractice_type.value
            if getattr(mr, "malpractice_type", None)
            else "unknown"
        )
        malpractice_breakdown[k] = malpractice_breakdown.get(k, 0) + 1

    # Build a lookup: list index → sample_answer from the stored questions list
    # NOTE: questions have no question_id/id field — question_id in responses IS the list index
    questions_list = (
        interview.questions if isinstance(interview.questions, list) else []
    )
    sample_answer_map: dict = {}
    for idx, q in enumerate(questions_list):
        if isinstance(q, dict):
            sa = q.get("sample_answer") or q.get("ideal_answer") or ""
            if sa:
                sample_answer_map[idx] = sa

    # Per-question results: prefer stored evaluation.per_question, else derive from responses
    per_question = []
    if isinstance(evaluation, dict) and isinstance(
        evaluation.get("per_question"), list
    ):
        raw_pq = evaluation.get("per_question")
        for entry in raw_pq:
            if not isinstance(entry, dict):
                per_question.append(entry)
                continue
            qid = int(entry.get("question_id") or 0)
            entry["sample_answer"] = entry.get(
                "sample_answer"
            ) or sample_answer_map.get(qid, "")
            per_question.append(entry)
    else:
        for r in interview.responses or []:
            analysis = r.get("analysis") if isinstance(r, dict) else None
            analysis = analysis if isinstance(analysis, dict) else {}
            qid = int(r.get("question_id") or 0)
            per_question.append(
                {
                    "question_id": qid,
                    "question": r.get("question") or "",
                    "answer": r.get("answer") or "",
                    "transcript": r.get("transcript") or "",
                    "audio": r.get("audio")
                    if isinstance(r.get("audio"), dict)
                    else None,
                    "response_time": int(r.get("response_time") or 0),
                    "technical_score": analysis.get("technical_score", 0),
                    "communication_score": analysis.get("communication_score", 0),
                    "relevance_score": analysis.get("relevance_score", 0),
                    "strengths": analysis.get("strengths", []),
                    "weaknesses": analysis.get("improvements", []),
                    "feedback": analysis.get("overall_feedback")
                    or analysis.get("feedback")
                    or "",
                    "sample_answer": sample_answer_map.get(qid, ""),
                }
            )

    record = (
        db.query(PerformanceRecord)
        .filter(PerformanceRecord.interview_id == interview.id)
        .first()
    )

    return {
        "student": {
            "id": student.id,
            "name": student.full_name,
            "email": student.email,
            "department": student.department,
            "admin_id": student.admin_id,
        },
        "interview": {
            "interview_id": interview.id,
            "status": interview.status.value,
            "interview_type": interview.interview_type.value,
            "domain": interview.domain,
            "started_at": interview.started_at.isoformat()
            if interview.started_at
            else None,
            "ended_at": interview.ended_at.isoformat() if interview.ended_at else None,
            "duration_minutes": interview.duration_minutes,
            "overall_score": float(interview.overall_score or 0),
        },
        "scores": {
            "technical": float(record.technical_score or 0) if record else 0.0,
            "communication": float(record.communication_score or 0) if record else 0.0,
            "confidence": float(record.confidence_score or 0) if record else 0.0,
            "completion_rate": float(record.completion_rate or 0) if record else 0.0,
        },
        "strengths": (record.strengths or []) if record else [],
        "areas_for_improvement": (record.weaknesses or []) if record else [],
        "evaluation": evaluation,
        "per_question": per_question,
        "malpractice_count": malpractice_count,
        "malpractice_breakdown": malpractice_breakdown,
    }


@admin_router.get("/interview/{interview_id}/answer-audio")
async def download_answer_audio_admin(
    interview_id: int,
    question_id: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Download a student's recorded answer audio for replay (admin view)."""

    interview = db.query(Interview).filter(Interview.id == interview_id).first()
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found"
        )

    student = db.query(User).filter(User.id == interview.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )

    # Access control: admins can only view their own students.
    if current_user.get("role") != "super_admin":
        if interview.admin_id == current_user.get("user_id"):
            pass
        else:
            unique_admin_id = current_user.get("unique_admin_id")
            if not unique_admin_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed"
                )
            if student.admin_id != unique_admin_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed"
                )

    # Pick the latest matching entry (in case older data has duplicates).
    target = None
    for r in reversed(list(interview.responses or [])):
        if isinstance(r, dict) and int(r.get("question_id") or -1) == int(question_id):
            target = r
            break

    audio = (target or {}).get("audio") if isinstance(target, dict) else None
    if not isinstance(audio, dict) or not audio.get("path"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio not found"
        )

    resolved = _safe_audio_path(str(audio.get("path")))
    if not resolved.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found"
        )

    media_type = str(audio.get("content_type") or "application/octet-stream")
    filename = str(
        audio.get("original_filename") or audio.get("filename") or "answer-audio"
    )
    return FileResponse(path=str(resolved), media_type=media_type, filename=filename)


class ScheduleInterviewRequest(BaseModel):
    interview_type: InterviewType
    scheduled_at: datetime
    scheduled_end_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    # If provided, schedule only for these student IDs (must be under this admin)
    student_ids: Optional[List[int]] = None
    # Required only when interview_type=DOMAIN_BASED
    domain: Optional[str] = None
    # Optional; used for domain/resume initialization (defaults to 10)
    num_questions: Optional[int] = 10
    # If provided, used as explicit questions for the scheduled interview.
    questions: Optional[List[dict]] = []
    is_proctored: Optional[bool] = True
    student_emails: Optional[List[EmailStr]] = None


class StudentPerformanceResponse(BaseModel):
    student_id: int
    student_name: str
    email: str
    total_interviews: int
    average_score: float
    last_interview_date: Optional[str]
    performance_trend: str  # "improving", "declining", "stable"

    class Config:
        from_attributes = True


class ReviewMalpracticeRequest(BaseModel):
    action: str
    notes: Optional[str] = None


class ViolationBreakdownItem(BaseModel):
    violation_type: str
    count: int
    severity: str


class MalpracticeResponse(BaseModel):
    # One consolidated report per interview
    report_id: int  # = interview_id (used as the review key)
    interview_id: int
    student_name: str
    student_email: str
    interview_type: str
    interview_date: str  # when interview started/created
    overall_score: Optional[float]
    total_violations: int
    overall_severity: str  # highest severity across all violations
    violation_breakdown: List[ViolationBreakdownItem]
    first_detected_at: str
    status: str = "pending"
    actions_taken: Optional[str] = None

    class Config:
        from_attributes = True


@admin_router.post("/schedule-interview")
async def schedule_interview(
    schedule_request: ScheduleInterviewRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Schedule an interview for students under this admin.

    If student_ids is provided, schedules only for those students.
    Otherwise, schedules for all students under this admin.
    """

    # Load students under this admin (optionally limited)
    user_scope_filter, invalid_scope = _admin_scope_filters(current_user)
    if invalid_scope:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin account is not associated with a college",
        )
    q = db.query(User).filter(
        User.role == UserRole.STUDENT,
        user_scope_filter,
    )
    if schedule_request.student_ids:
        q = q.filter(User.id.in_([int(x) for x in schedule_request.student_ids]))

    students = q.all()

    # Process additional emails (create shadow accounts if needed)
    if schedule_request.student_emails:
        student_set = {s.id for s in students}
        for email in schedule_request.student_emails:
            existing_user = db.query(User).filter(User.email == email).first()

            if not existing_user:
                # Create shadow user
                random_pw = "".join(
                    secrets.choice(string.ascii_letters + string.digits)
                    for _ in range(12)
                )
                admin_uid = current_user.get("unique_admin_id")

                # We need to find the full User object for current admin to get college_name
                # current_user is a dict from token payload mostly
                # Actually, current_user from require_role has: id, email, username, role, unique_admin_id, college_name

                shadow_user = User(
                    email=email,
                    username=email,  # temporary username
                    hashed_password=get_password_hash(random_pw),
                    full_name="Pending Registration",
                    role=UserRole.STUDENT,
                    is_active=False,
                    admin_id=admin_uid,
                    college_name=current_user.get("college_name"),
                    department=current_user.get("department"),
                )
                db.add(shadow_user)
                db.commit()
                db.refresh(shadow_user)
                existing_user = shadow_user

            if existing_user.id not in student_set:
                students.append(existing_user)
                student_set.add(existing_user.id)

    if not students:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No students found (or provided emails)",
        )

    # Validate time window and derive duration
    scheduled_at = to_utc(schedule_request.scheduled_at)
    scheduled_end_at_req = to_utc(schedule_request.scheduled_end_at)
    now = utc_now()

    # Validate scheduled interview kind
    if schedule_request.interview_type not in (
        InterviewType.RESUME_BASED,
        InterviewType.DOMAIN_BASED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scheduled interviews must be either resume_based or domain_based",
        )

    # Allow immediate scheduling: tolerate up to 5 minutes in the past
    # to account for clock skew and "start now" use cases
    if scheduled_at is None or (scheduled_at - now).total_seconds() < -300:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Interview start time cannot be more than 5 minutes in the past",
        )

    if (
        schedule_request.interview_type == InterviewType.DOMAIN_BASED
        and not (schedule_request.domain or "").strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain is required for domain-based scheduled interviews",
        )

    duration_minutes: int
    if scheduled_end_at_req is not None:
        duration_minutes = int(
            (scheduled_end_at_req - scheduled_at).total_seconds() // 60
        )
        if duration_minutes <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End time must be after start time",
            )
    elif schedule_request.duration_minutes is not None:
        duration_minutes = int(schedule_request.duration_minutes)
    else:
        duration_minutes = 60

    if duration_minutes < 5 or duration_minutes > 1440:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duration must be between 5 and 1440 minutes (24 hours)",
        )

    # Prepare questions (if any)
    questions_payload: List[dict] = list(schedule_request.questions or [])

    # Admin decides the number of questions for all scheduled interviews.
    # If explicit questions are provided, prefer their length.
    if questions_payload:
        n = max(1, min(len(questions_payload), 25))
    else:
        n = int(schedule_request.num_questions or 10)
        n = max(1, min(n, 25))

    if (
        not questions_payload
        and schedule_request.interview_type == InterviewType.DOMAIN_BASED
    ):
        if not schedule_request.domain:
            raise HTTPException(
                status_code=400,
                detail="domain is required for domain_based interviews",
            )
        questions_payload = await QuestionGenerator.generate_domain_qna(
            schedule_request.domain, n
        )

    # Create scheduled interview for every student under this admin
    created_ids: List[int] = []
    scheduled_at_db = scheduled_at.replace(tzinfo=None)

    for student in students:
        interview = Interview(
            student_id=student.id,
            admin_id=current_user["user_id"],
            interview_type=schedule_request.interview_type,
            status=InterviewStatus.PENDING,
            scheduled_at=scheduled_at_db,
            duration_minutes=duration_minutes,
            num_questions=n,
            domain=(
                schedule_request.domain.strip() if schedule_request.domain else None
            ),
            questions=questions_payload,
            is_proctored=True
            if schedule_request.is_proctored is None
            else bool(schedule_request.is_proctored),
        )
        db.add(interview)
        db.flush()  # get interview.id without committing per-row
        created_ids.append(interview.id)

    db.commit()

    scheduled_end_at = scheduled_at + timedelta(minutes=duration_minutes)
    return {
        "message": "Interview scheduled successfully",
        "scheduled_at": scheduled_at.isoformat(),
        "scheduled_end_at": scheduled_end_at.isoformat(),
        "duration_minutes": duration_minutes,
        "is_proctored": True
        if schedule_request.is_proctored is None
        else bool(schedule_request.is_proctored),
        "students_scheduled": len(created_ids),
        "interview_ids": created_ids,
    }


@admin_router.get("/students", response_model=List[StudentPerformanceResponse])
async def get_my_students(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Get all students under this admin with their performance summary."""

    user_scope_filter, invalid_scope = _admin_scope_filters(current_user)
    if invalid_scope or user_scope_filter is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin scope is not configured for this account",
        )

    # Get students with their performance data
    students_query = (
        db.query(
            User.id,
            User.full_name,
            User.email,
            func.count(Interview.id).label("total_interviews"),
            func.avg(Interview.overall_score).label("average_score"),
            func.max(Interview.ended_at).label("last_interview_date"),
        )
        .outerjoin(Interview, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
        )
        .group_by(User.id, User.full_name, User.email)
        .all()
    )

    students_list = []
    for student_data in students_query:
        # Calculate performance trend (simplified)
        performance_trend = "stable"
        if student_data.total_interviews >= 2:
            # Get last 2 interview scores to determine trend
            recent_scores = (
                db.query(Interview.overall_score)
                .filter(
                    Interview.student_id == student_data.id,
                    Interview.status == InterviewStatus.COMPLETED,
                )
                .order_by(Interview.ended_at.desc())
                .limit(2)
                .all()
            )

            if len(recent_scores) >= 2:
                if recent_scores[0].overall_score > recent_scores[1].overall_score:
                    performance_trend = "improving"
                elif recent_scores[0].overall_score < recent_scores[1].overall_score:
                    performance_trend = "declining"

        students_list.append(
            {
                "student_id": student_data.id,
                "student_name": student_data.full_name,
                "email": student_data.email,
                "total_interviews": student_data.total_interviews or 0,
                "average_score": round(student_data.average_score or 0, 2),
                "last_interview_date": student_data.last_interview_date.isoformat()
                if student_data.last_interview_date
                else None,
                "performance_trend": performance_trend,
            }
        )

    return students_list


@admin_router.get("/student/{student_id}/performance")
async def get_student_detailed_performance(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Get detailed performance analysis for a specific student."""

    user_scope_filter, invalid_scope = _admin_scope_filters(current_user)
    if invalid_scope or user_scope_filter is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin scope is not configured for this account",
        )

    # Verify the student belongs to this admin
    student = (
        db.query(User)
        .filter(
            User.id == student_id,
            User.role == UserRole.STUDENT,
            user_scope_filter,
        )
        .first()
    )

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found or not under your supervision",
        )

    # Get performance records
    performance_records = (
        db.query(PerformanceRecord)
        .filter(PerformanceRecord.student_id == student_id)
        .order_by(PerformanceRecord.created_at.desc())
        .all()
    )

    # Get interviews history
    interviews = (
        db.query(Interview)
        .filter(Interview.student_id == student_id)
        .order_by(Interview.created_at.desc())
        .all()
    )

    # Calculate statistics
    stats = (
        db.query(
            func.avg(PerformanceRecord.technical_score).label("avg_technical"),
            func.avg(PerformanceRecord.communication_score).label("avg_communication"),
            func.avg(PerformanceRecord.confidence_score).label("avg_confidence"),
            func.avg(PerformanceRecord.completion_rate).label("avg_completion"),
        )
        .filter(PerformanceRecord.student_id == student_id)
        .first()
    )

    # Compile strengths and weaknesses
    all_strengths = []
    all_weaknesses = []

    for record in performance_records:
        all_strengths.extend(record.strengths or [])
        all_weaknesses.extend(record.weaknesses or [])

    # Count frequency of strengths and weaknesses
    from collections import Counter

    strength_counts = Counter(all_strengths)
    weakness_counts = Counter(all_weaknesses)

    # Add richer per-interview result objects so admins can view the same evaluation students see.
    enriched_recent = []
    for interview in interviews[:10]:
        record = (
            db.query(PerformanceRecord)
            .filter(PerformanceRecord.interview_id == interview.id)
            .first()
        )
        strengths = record.strengths if record else []
        weaknesses = record.weaknesses if record else []
        recommendations = []
        feedback_text = interview.feedback
        if (
            isinstance(interview.feedback, str)
            and interview.feedback
            and interview.feedback.strip().startswith("{")
        ):
            try:
                import json

                parsed = json.loads(interview.feedback)
                feedback_text = (
                    parsed.get("feedback") or parsed.get("summary") or feedback_text
                )
                recs = parsed.get("recommendations")
                if isinstance(recs, list):
                    recommendations = [str(r).strip() for r in recs if str(r).strip()]
            except Exception:
                pass

        enriched_recent.append(
            {
                "id": interview.id,
                "type": interview.interview_type.value,
                "score": interview.overall_score,
                "technical_score": float(record.technical_score) if record else 0.0,
                "communication_score": float(record.communication_score)
                if record
                else 0.0,
                "confidence_score": float(record.confidence_score) if record else 0.0,
                "duration": interview.duration_minutes,
                "completed_at": interview.ended_at.isoformat()
                if interview.ended_at
                else None,
                "feedback": feedback_text,
                "strengths": strengths or [],
                "areas_for_improvement": weaknesses or [],
                "recommendations": recommendations,
            }
        )

    return {
        "student_info": {
            "id": student.id,
            "name": student.full_name,
            "email": student.email,
            "department": student.department,
        },
        "performance_summary": {
            "total_interviews": len(interviews),
            "completed_interviews": len(
                [i for i in interviews if i.status == InterviewStatus.COMPLETED]
            ),
            "average_technical_score": round(stats.avg_technical or 0, 2),
            "average_communication_score": round(stats.avg_communication or 0, 2),
            "average_confidence_score": round(stats.avg_confidence or 0, 2),
            "average_completion_rate": round(stats.avg_completion or 0, 2),
        },
        "top_strengths": [
            {"strength": k, "frequency": v} for k, v in strength_counts.most_common(5)
        ],
        "areas_for_improvement": [
            {"weakness": k, "frequency": v} for k, v in weakness_counts.most_common(5)
        ],
        "recent_interviews": enriched_recent,
    }


@admin_router.get("/scheduled-interviews")
async def get_scheduled_interviews(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    date: Optional[str] = Query(default=None),
):
    """Get all interviews scheduled by this admin."""

    from sqlalchemy import func, or_

    q = (
        db.query(Interview, User)
        .join(User, Interview.student_id == User.id)
        .filter(
            Interview.admin_id == current_user["user_id"],
            Interview.scheduled_at.isnot(None),
        )
    )

    if search:
        s = f"%{search.strip()}%"
        q = q.filter(or_(User.full_name.ilike(s), User.email.ilike(s)))

    if status:
        try:
            st = InterviewStatus(status)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid status filter",
            )
        q = q.filter(Interview.status == st)

    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d").date()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid date filter. Expected YYYY-MM-DD",
            )
        q = q.filter(func.date(Interview.scheduled_at) == d)

    interviews = q.order_by(Interview.scheduled_at.desc()).all()

    interview_list = []
    for interview, student in interviews:
        interview_list.append(
            {
                "interview_id": interview.id,
                "interview_type": interview.interview_type.value,
                "student_name": student.full_name,
                "student_email": student.email,
                "scheduled_at": to_utc(interview.scheduled_at).isoformat()
                if interview.scheduled_at
                else None,
                "status": interview.status.value,
                "duration_minutes": interview.duration_minutes,
                "num_questions": int(getattr(interview, "num_questions", 10) or 10),
                "is_proctored": interview.is_proctored,
                "domain": interview.domain,
                "started_at": to_utc(interview.started_at).isoformat()
                if interview.started_at
                else None,
                "ended_at": to_utc(interview.ended_at).isoformat()
                if interview.ended_at
                else None,
                "overall_score": interview.overall_score
                if interview.status == InterviewStatus.COMPLETED
                else None,
            }
        )

    return interview_list


@admin_router.get("/malpractice-reports", response_model=List[MalpracticeResponse])
async def get_malpractice_reports(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Get one consolidated malpractice report per interview under this admin's supervision."""

    user_scope_filter, invalid_scope = _admin_scope_filters(current_user)
    if invalid_scope:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin account is not associated with a college",
        )

    malpractice_records = (
        db.query(MalpracticeRecord, Interview, User)
        .join(Interview, MalpracticeRecord.interview_id == Interview.id)
        .join(User, Interview.student_id == User.id)
        .filter(user_scope_filter)
        .order_by(MalpracticeRecord.timestamp.asc())
        .all()
    )

    # Group by interview_id → one consolidated report per interview
    from collections import defaultdict

    grouped: dict = defaultdict(
        lambda: {
            "interview": None,
            "student": None,
            "records": [],
        }
    )
    for malpractice, interview, student in malpractice_records:
        g = grouped[interview.id]
        g["interview"] = interview
        g["student"] = student
        g["records"].append(malpractice)

    SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}

    reports = []
    for interview_id, g in grouped.items():
        interview = g["interview"]
        student = g["student"]
        records: list = g["records"]

        # Build violation breakdown: count per (type, severity)
        breakdown_map: dict = {}
        for r in records:
            key = r.malpractice_type.value
            if key not in breakdown_map:
                breakdown_map[key] = {"count": 0, "severity": r.severity}
            breakdown_map[key]["count"] += 1
            # Keep the highest severity seen for this type
            if SEVERITY_ORDER.get(r.severity, 0) > SEVERITY_ORDER.get(
                breakdown_map[key]["severity"], 0
            ):
                breakdown_map[key]["severity"] = r.severity

        violation_breakdown = [
            {
                "violation_type": vtype,
                "count": info["count"],
                "severity": info["severity"],
            }
            for vtype, info in breakdown_map.items()
        ]

        # Overall severity = max severity across all records
        severities = [r.severity for r in records]
        overall_severity = max(
            severities, key=lambda s: SEVERITY_ORDER.get(s, 0), default="low"
        )

        # Status / actions from the most-recently-reviewed record
        status_val = "pending"
        actions_val = None
        for r in sorted(records, key=lambda x: x.timestamp, reverse=True):
            if r.evidence_data and isinstance(r.evidence_data, dict):
                s = r.evidence_data.get("status")
                if s and s != "pending":
                    status_val = s
                    actions_val = r.evidence_data.get("review_notes")
                    break
                elif s == "pending":
                    status_val = "pending"

        first_detected = min(r.timestamp for r in records)
        interview_date = interview.started_at or interview.created_at or first_detected

        reports.append(
            {
                "report_id": interview_id,
                "interview_id": interview_id,
                "student_name": student.full_name,
                "student_email": student.email,
                "interview_type": interview.interview_type.value
                if interview.interview_type
                else "UNKNOWN",
                "interview_date": interview_date.isoformat(),
                "overall_score": float(interview.overall_score)
                if interview.overall_score is not None
                else None,
                "total_violations": len(records),
                "overall_severity": overall_severity,
                "violation_breakdown": violation_breakdown,
                "first_detected_at": first_detected.isoformat(),
                "status": status_val,
                "actions_taken": actions_val,
            }
        )

    # Sort: pending first, then by total_violations desc
    reports.sort(
        key=lambda r: (0 if r["status"] == "pending" else 1, -r["total_violations"])
    )

    return reports


@admin_router.post("/malpractice-reports/{report_id}/review")
async def review_malpractice_report(
    report_id: int,
    review_data: ReviewMalpracticeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Review and take action on a consolidated malpractice report (by interview_id).

    Actions:
    - dismiss      → status=dismissed, clears any existing admin_notice
    - investigate  → status=investigating, no score change
    - warn         → status=warned, writes warning admin_notice on interview
    - penalize     → status=penalized, sets overall_score=0, writes penalty admin_notice
    - resolve      → status=resolved, no score change

    Notes are REQUIRED for all actions.
    """

    # Require non-empty notes for all actions
    notes_stripped = (review_data.notes or "").strip()
    if not notes_stripped:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Review notes are required before taking any action.",
        )

    # report_id is now interview_id — update ALL malpractice records for this interview
    records = (
        db.query(MalpracticeRecord)
        .filter(MalpracticeRecord.interview_id == report_id)
        .all()
    )

    if not records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Malpractice report not found"
        )

    # Determine new status from action
    action = review_data.action
    STATUS_MAP = {
        "dismiss": "dismissed",
        "investigate": "investigating",
        "warn": "warned",
        "warn_student": "warned",  # frontend compat alias
        "penalize": "penalized",
        "resolve": "resolved",
    }
    new_status = STATUS_MAP.get(action, "resolved")

    reviewed_at = datetime.utcnow().isoformat()
    review_payload = {
        "status": new_status,
        "review_action": action,
        "review_notes": notes_stripped,
        "reviewed_by": current_user["user_id"],
        "reviewed_at": reviewed_at,
    }

    # Apply real effects on the interview
    interview = db.query(Interview).filter(Interview.id == report_id).first()
    if interview:
        if action in ("penalize",):
            # Set score to 0 on penalty
            interview.overall_score = 0.0
            interview.admin_notice = {
                "type": "penalty",
                "action": "penalize",
                "message": notes_stripped,
                "reviewed_by": current_user["user_id"],
                "reviewed_at": reviewed_at,
                "interview_id": report_id,
            }
        elif action in ("warn", "warn_student"):
            # Write warning notice (no score change)
            interview.admin_notice = {
                "type": "warning",
                "action": "warn",
                "message": notes_stripped,
                "reviewed_by": current_user["user_id"],
                "reviewed_at": reviewed_at,
                "interview_id": report_id,
            }
        elif action == "dismiss":
            # Clear any existing notice (false positive)
            interview.admin_notice = None

    # Update all malpractice records with review metadata
    for record in records:
        current_data = dict(record.evidence_data) if record.evidence_data else {}
        current_data.update(review_payload)
        record.evidence_data = current_data

    db.commit()

    return {"message": "Report reviewed successfully", "status": new_status}


@admin_router.get("/analytics/dashboard")
async def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Get dashboard analytics for admin."""

    from sqlalchemy import func
    from datetime import datetime, timedelta

    user_scope_filter, invalid_scope = _admin_scope_filters(current_user)
    if invalid_scope or user_scope_filter is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin scope is not configured for this account",
        )

    # Get total students
    total_students = (
        db.query(User)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
        )
        .count()
    )

    # Get interviews in last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_interviews = (
        db.query(Interview)
        .join(User, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            Interview.created_at >= thirty_days_ago,
        )
        .count()
    )

    # Get average performance scores
    avg_performance = (
        db.query(
            func.avg(PerformanceRecord.technical_score).label("avg_technical"),
            func.avg(PerformanceRecord.communication_score).label("avg_communication"),
            func.avg(PerformanceRecord.confidence_score).label("avg_confidence"),
        )
        .join(User, PerformanceRecord.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
        )
        .first()
    )

    # Get malpractice count
    malpractice_count = (
        db.query(MalpracticeRecord)
        .join(Interview, MalpracticeRecord.interview_id == Interview.id)
        .join(User, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            MalpracticeRecord.timestamp >= thirty_days_ago,
        )
        .count()
    )

    # Get interview type distribution
    interview_type_stats = (
        db.query(Interview.interview_type, func.count(Interview.id).label("count"))
        .join(User, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            Interview.created_at >= thirty_days_ago,
        )
        .group_by(Interview.interview_type)
        .all()
    )

    return {
        "total_students": total_students,
        "recent_interviews": recent_interviews,
        "average_performance": {
            "technical": round(avg_performance.avg_technical or 0, 2),
            "communication": round(avg_performance.avg_communication or 0, 2),
            "confidence": round(avg_performance.avg_confidence or 0, 2),
        },
        "malpractice_incidents": malpractice_count,
        "interview_type_distribution": [
            {"type": stat.interview_type.value, "count": stat.count}
            for stat in interview_type_stats
        ],
    }


@admin_router.get("/analytics")
async def get_admin_analytics(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Analytics payload used by the admin Performance Analytics page."""

    user_scope_filter, invalid_scope = _admin_scope_filters(current_user)
    if invalid_scope or user_scope_filter is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin analytics scope is not configured for this account",
        )

    start_db, end_db, prev_start_db, prev_end_db, days_i = _period_bounds(days)

    # Students scope
    total_students = (
        db.query(User).filter(User.role == UserRole.STUDENT, user_scope_filter).count()
    )

    new_students_period = (
        db.query(User)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            User.created_at >= start_db,
            User.created_at < end_db,
        )
        .count()
    )
    new_students_prev = (
        db.query(User)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            User.created_at >= prev_start_db,
            User.created_at < prev_end_db,
        )
        .count()
    )

    # Completed interviews in period
    period_interviews_q = (
        db.query(Interview)
        .join(User, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            Interview.status == InterviewStatus.COMPLETED,
            Interview.ended_at.isnot(None),
            Interview.ended_at >= start_db,
            Interview.ended_at < end_db,
        )
    )
    prev_interviews_q = (
        db.query(Interview)
        .join(User, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            Interview.status == InterviewStatus.COMPLETED,
            Interview.ended_at.isnot(None),
            Interview.ended_at >= prev_start_db,
            Interview.ended_at < prev_end_db,
        )
    )

    total_interviews = int(period_interviews_q.count() or 0)
    total_interviews_prev = int(prev_interviews_q.count() or 0)

    avg_performance = (
        period_interviews_q.with_entities(func.avg(Interview.overall_score)).scalar()
        or 0
    )
    avg_performance_prev = (
        prev_interviews_q.with_entities(func.avg(Interview.overall_score)).scalar() or 0
    )

    avg_duration = (
        period_interviews_q.with_entities(func.avg(Interview.duration_minutes)).scalar()
        or 0
    )
    avg_duration_prev = (
        prev_interviews_q.with_entities(func.avg(Interview.duration_minutes)).scalar()
        or 0
    )

    # Performance breakdown from PerformanceRecord (ties to interview ended_at window)
    perf_stats = (
        db.query(
            func.avg(PerformanceRecord.technical_score).label("avg_technical"),
            func.avg(PerformanceRecord.communication_score).label("avg_communication"),
            func.avg(PerformanceRecord.confidence_score).label("avg_confidence"),
            func.avg(PerformanceRecord.completion_rate).label("avg_completion"),
        )
        .join(Interview, PerformanceRecord.interview_id == Interview.id)
        .join(User, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            Interview.status == InterviewStatus.COMPLETED,
            Interview.ended_at.isnot(None),
            Interview.ended_at >= start_db,
            Interview.ended_at < end_db,
        )
        .first()
    )

    technical = float(getattr(perf_stats, "avg_technical", 0) or 0)
    communication = float(getattr(perf_stats, "avg_communication", 0) or 0)
    confidence = float(getattr(perf_stats, "avg_confidence", 0) or 0)
    completion_rate = float(getattr(perf_stats, "avg_completion", 0) or 0)
    # No direct field for problem solving; provide a stable proxy.
    problem_solving = (
        (technical + completion_rate) / 2.0 if (technical or completion_rate) else 0.0
    )

    # Interview type distribution (completed interviews)
    type_counts = {
        "resume_based": 0,
        "domain_specific": 0,
        "admin_scheduled": 0,
    }
    type_rows = (
        period_interviews_q.with_entities(
            Interview.interview_type, func.count(Interview.id)
        )
        .group_by(Interview.interview_type)
        .all()
    )
    for itype, count in type_rows:
        key = None
        try:
            if itype == InterviewType.RESUME_BASED:
                key = "resume_based"
            elif itype == InterviewType.DOMAIN_BASED:
                key = "domain_specific"
            elif itype == InterviewType.SCHEDULED:
                key = "admin_scheduled"
        except Exception:
            key = None
        if key:
            type_counts[key] = int(count or 0)

    # Top performers (completed interviews)
    top_rows = (
        db.query(
            User.id.label("student_id"),
            User.full_name.label("student_name"),
            func.count(Interview.id).label("total_interviews"),
            func.avg(Interview.overall_score).label("average_score"),
        )
        .join(Interview, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            Interview.status == InterviewStatus.COMPLETED,
            Interview.ended_at.isnot(None),
            Interview.ended_at >= start_db,
            Interview.ended_at < end_db,
        )
        .group_by(User.id, User.full_name)
        .order_by(func.avg(Interview.overall_score).desc())
        .limit(5)
        .all()
    )
    top_performers = [
        {
            "student_id": int(r.student_id),
            "student_name": r.student_name,
            "total_interviews": int(r.total_interviews or 0),
            "average_score": float(r.average_score or 0),
        }
        for r in top_rows
    ]

    # Recent activities (latest completed interviews)
    recent_rows = (
        period_interviews_q.with_entities(
            User.full_name, Interview.interview_type, Interview.ended_at
        )
        .order_by(Interview.ended_at.desc())
        .limit(6)
        .all()
    )
    recent_activities = []
    for student_name, itype, ended_at in recent_rows:
        try:
            type_label = itype.value.replace("_", " ").title()
        except Exception:
            type_label = "Interview"
        recent_activities.append(
            {
                "description": f"{student_name} completed a {type_label} interview",
                "timestamp": (
                    ended_at.isoformat() if ended_at else datetime.utcnow().isoformat()
                ),
            }
        )

    return {
        "days": days_i,
        "total_students": int(total_students or 0),
        "student_growth": round(_pct_change(new_students_period, new_students_prev), 2),
        "total_interviews": total_interviews,
        "interview_growth": round(
            _pct_change(total_interviews, total_interviews_prev), 2
        ),
        "average_performance": float(avg_performance or 0),
        "performance_change": round(
            _pct_change(avg_performance, avg_performance_prev), 2
        ),
        "average_duration": float(avg_duration or 0),
        "duration_change": round(_pct_change(avg_duration, avg_duration_prev), 2),
        "completion_rate": float(completion_rate or 0),
        "performance_breakdown": {
            "technical": float(technical or 0),
            "communication": float(communication or 0),
            "problem_solving": float(problem_solving or 0),
            "confidence": float(confidence or 0),
        },
        "interview_type_distribution": type_counts,
        "top_performers": top_performers,
        "recent_activities": recent_activities,
    }


@admin_router.get("/analytics/performance-trends")
async def get_admin_performance_trends(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Time series data for admin analytics charts.

    Returns a list under `daily_trends` with objects that include:
    - date
    - performance (0-100)
    - completion_rate (0-100)
    - average_duration (minutes, capped to 100 for chart scaling)
    """

    user_scope_filter, invalid_scope = _admin_scope_filters(current_user)
    if invalid_scope or user_scope_filter is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin analytics scope is not configured for this account",
        )

    start_db, end_db, _prev_start_db, _prev_end_db, days_i = _period_bounds(days)

    # Decide bucketing to keep chart usable
    if days_i <= 30:
        bucket_days = 1
    elif days_i <= 120:
        bucket_days = 7
    else:
        bucket_days = 30

    # Load completed interviews in range
    interviews = (
        db.query(
            Interview.id,
            Interview.ended_at,
            Interview.overall_score,
            Interview.duration_minutes,
            Interview.interview_type,
        )
        .join(User, Interview.student_id == User.id)
        .filter(
            User.role == UserRole.STUDENT,
            user_scope_filter,
            Interview.status == InterviewStatus.COMPLETED,
            Interview.ended_at.isnot(None),
            Interview.ended_at >= start_db,
            Interview.ended_at < end_db,
        )
        .all()
    )

    # Completion rates mapped by interview id
    completion_by_interview = {
        int(r.interview_id): float(r.completion_rate or 0)
        for r in (
            db.query(PerformanceRecord.interview_id, PerformanceRecord.completion_rate)
            .join(Interview, PerformanceRecord.interview_id == Interview.id)
            .join(User, Interview.student_id == User.id)
            .filter(
                User.role == UserRole.STUDENT,
                user_scope_filter,
                Interview.status == InterviewStatus.COMPLETED,
                Interview.ended_at.isnot(None),
                Interview.ended_at >= start_db,
                Interview.ended_at < end_db,
            )
            .all()
        )
    }

    # Build buckets
    from collections import defaultdict

    bucket_perf = defaultdict(list)
    bucket_completion = defaultdict(list)
    bucket_duration = defaultdict(list)

    def _bucket_start(dt: datetime) -> datetime:
        # Normalize into [start_db, end_db) buckets.
        delta_days = max(0, (dt.date() - start_db.date()).days)
        bucket_index = delta_days // bucket_days
        return (start_db + timedelta(days=bucket_index * bucket_days)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    bucket_perf_resume = defaultdict(list)
    bucket_perf_domain = defaultdict(list)

    for (
        interview_id,
        ended_at,
        overall_score,
        duration_minutes,
        interview_type,
    ) in interviews:
        if not ended_at:
            continue
        b = _bucket_start(ended_at)
        overall = float(overall_score or 0)
        bucket_perf[b].append(overall)
        bucket_duration[b].append(float(duration_minutes or 0))

        if interview_type == InterviewType.RESUME_BASED:
            bucket_perf_resume[b].append(overall)
        elif interview_type == InterviewType.DOMAIN_BASED:
            bucket_perf_domain[b].append(overall)
        cr = completion_by_interview.get(int(interview_id))
        if cr is not None:
            bucket_completion[b].append(float(cr or 0))

    # Emit chronological series
    series = []
    bucket_cursor = start_db.replace(hour=0, minute=0, second=0, microsecond=0)
    while bucket_cursor < end_db:
        perf_list = bucket_perf.get(bucket_cursor, [])
        comp_list = bucket_completion.get(bucket_cursor, [])
        dur_list = bucket_duration.get(bucket_cursor, [])

        perf_resume_list = bucket_perf_resume.get(bucket_cursor, [])
        perf_domain_list = bucket_perf_domain.get(bucket_cursor, [])

        perf_avg = sum(perf_list) / len(perf_list) if perf_list else 0.0
        comp_avg = sum(comp_list) / len(comp_list) if comp_list else 0.0
        dur_avg = sum(dur_list) / len(dur_list) if dur_list else 0.0

        perf_resume_avg = (
            sum(perf_resume_list) / len(perf_resume_list) if perf_resume_list else 0.0
        )
        perf_domain_avg = (
            sum(perf_domain_list) / len(perf_domain_list) if perf_domain_list else 0.0
        )

        series.append(
            {
                "date": bucket_cursor.date().isoformat(),
                "performance": round(perf_avg, 2),
                "resume_performance": round(perf_resume_avg, 2),
                "domain_performance": round(perf_domain_avg, 2),
                "completion_rate": round(comp_avg, 2),
                # cap to keep chart scaling consistent
                "average_duration": round(min(dur_avg, 100.0), 2),
            }
        )

        bucket_cursor = bucket_cursor + timedelta(days=bucket_days)

    return {
        "days": days_i,
        "bucket_days": bucket_days,
        "daily_trends": series,
    }


@admin_router.put("/interview/{interview_id}/cancel")
async def cancel_scheduled_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin", "super_admin")),
):
    """Cancel a scheduled interview."""

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.admin_id == current_user["user_id"],
            Interview.status == InterviewStatus.PENDING,
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found or cannot be cancelled",
        )

    interview.status = InterviewStatus.CANCELLED
    db.commit()

    return {"message": "Interview cancelled successfully"}
