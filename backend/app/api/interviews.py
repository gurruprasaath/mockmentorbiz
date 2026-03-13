from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.utils.time import utc_now, to_utc
import cv2
import numpy as np
from datetime import datetime
import json
import os
import base64

from app.database import get_db
from app.models import (
    Interview,
    MalpracticeRecord,
    MalpracticeType,
    InterviewStatus,
    InterviewType,
)
from app.utils.ai_services import VoiceProcessor
from app.utils.deps import require_role
from app.utils.uploads import audio_upload_dir, ensure_dir

interview_router = APIRouter()


class ProctorEvent(BaseModel):
    type: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None


class ProctorUpdateRequest(BaseModel):
    interview_id: int
    frame_data: Optional[str] = None  # Base64 encoded frame
    audio_level: Optional[float] = None
    tab_switches: Optional[int] = None
    events: Optional[List[ProctorEvent]] = None
    timestamp: datetime


class MalpracticeDetectionResponse(BaseModel):
    detected_issues: List[Dict]
    risk_level: str
    recommendations: List[str]


@interview_router.post("/proctor/update")
async def update_proctoring_data(
    proctor_data: ProctorUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Receive and process proctoring data from frontend."""

    # Get interview — must belong to the authenticated student
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == proctor_data.interview_id,
            Interview.student_id == current_user["user_id"],
            Interview.is_proctored == True,
            Interview.status == InterviewStatus.IN_PROGRESS,
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found or proctoring not enabled",
        )

    detected_issues = []

    # Process frame data for face detection
    if proctor_data.frame_data:
        face_analysis = await analyze_frame_for_faces(proctor_data.frame_data)

        if face_analysis["face_count"] == 0:
            detected_issues.append(
                {
                    "type": "no_face_detected",
                    "severity": "high",
                    "description": "No face detected in the frame",
                }
            )

            # Create malpractice record
            malpractice = MalpracticeRecord(
                interview_id=proctor_data.interview_id,
                malpractice_type=MalpracticeType.NO_FACE_DETECTED,
                severity="high",
                timestamp=proctor_data.timestamp,
                description="Student face not visible in camera",
                evidence_data={"face_count": face_analysis["face_count"]},
            )
            db.add(malpractice)

        elif face_analysis["face_count"] > 1:
            detected_issues.append(
                {
                    "type": "multiple_faces",
                    "severity": "high",
                    "description": f"Multiple faces detected: {face_analysis['face_count']}",
                }
            )

            # Create malpractice record
            malpractice = MalpracticeRecord(
                interview_id=proctor_data.interview_id,
                malpractice_type=MalpracticeType.MULTIPLE_FACES,
                severity="high",
                timestamp=proctor_data.timestamp,
                description=f"Multiple faces detected in frame: {face_analysis['face_count']}",
                evidence_data={"face_count": face_analysis["face_count"]},
            )
            db.add(malpractice)

    # Process explicit proctoring events (preferred, per-event tracking)
    if proctor_data.events:
        for evt in proctor_data.events:
            evt_type = (evt.type or "").strip().lower()
            evt_meta = evt.metadata or {}

            mapped: Optional[MalpracticeType] = None
            severity = "medium"
            description: Optional[str] = None

            if evt_type in {"tab_switch", "tab_switching"}:
                mapped = MalpracticeType.TAB_SWITCHING
                severity = "medium"
                description = "Tab switch detected"
            elif evt_type in {"fullscreen_exit", "exit_fullscreen"}:
                mapped = MalpracticeType.FULLSCREEN_EXIT
                severity = "medium"
                description = "Fullscreen exited during proctored interview"
            elif evt_type in {"copy", "cut", "paste", "copy_paste"}:
                mapped = MalpracticeType.COPY_PASTE
                severity = "low"
                description = f"Clipboard action blocked: {evt_type}"
            elif evt_type in {"right_click", "contextmenu"}:
                mapped = MalpracticeType.RIGHT_CLICK
                severity = "low"
                description = "Right click / context menu blocked"
            elif evt_type in {
                "prohibited_keys",
                "prohibited_key",
                "devtools",
                "devtools_open",
            }:
                mapped = MalpracticeType.PROHIBITED_KEYS
                severity = "medium"
                combo = evt_meta.get("combo")
                description = (
                    "Prohibited keys detected"
                    if not combo
                    else f"Prohibited keys detected: {combo}"
                )
            elif evt_type in {"window_blur", "focus_lost", "window_focus_lost"}:
                mapped = MalpracticeType.WINDOW_BLUR
                severity = "medium"
                description = "Focus lost (moved away from interview)"
            elif evt_type in {"look_away", "lookaway", "head_pose", "head_movement"}:
                mapped = MalpracticeType.LOOK_AWAY
                severity = "medium"
                direction = evt_meta.get("direction")
                description = (
                    "Look away detected"
                    if not direction
                    else f"Look away detected: {direction}"
                )
            elif evt_type in {"multiple_persons", "multiple_people"}:
                mapped = MalpracticeType.MULTIPLE_PERSONS
                severity = "high"
                count = evt_meta.get("person_count")
                description = (
                    "Multiple persons detected"
                    if not count
                    else f"Multiple persons detected: {count}"
                )
            elif evt_type in {"phone_detected", "mobile_phone_detected"}:
                mapped = MalpracticeType.PHONE_DETECTED
                severity = "high"
                phone_count = evt_meta.get("phone_count")
                description = (
                    "Mobile phone detected"
                    if not phone_count
                    else f"Mobile phone detected: {phone_count}"
                )

            if mapped:
                detected_issues.append(
                    {
                        "type": mapped.value,
                        "severity": severity,
                        "description": description or mapped.value,
                    }
                )
                db.add(
                    MalpracticeRecord(
                        interview_id=proctor_data.interview_id,
                        malpractice_type=mapped,
                        severity=severity,
                        timestamp=evt.timestamp,
                        description=description,
                        evidence_data=evt_meta,
                    )
                )

    # Backward compatibility: older clients send only tab_switches total.
    # If explicit tab switch events are present, don't also create threshold-based incidents.
    has_explicit_tab_events = any(
        (evt.type or "").strip().lower() in {"tab_switch", "tab_switching"}
        for evt in (proctor_data.events or [])
    )

    # Check for excessive tab switching (legacy)
    if (
        (not has_explicit_tab_events)
        and proctor_data.tab_switches
        and proctor_data.tab_switches > 3
    ):
        detected_issues.append(
            {
                "type": "tab_switching",
                "severity": "medium",
                "description": f"Excessive tab switching detected: {proctor_data.tab_switches} switches",
            }
        )

        # Create malpractice record
        malpractice = MalpracticeRecord(
            interview_id=proctor_data.interview_id,
            malpractice_type=MalpracticeType.TAB_SWITCHING,
            severity="medium",
            timestamp=proctor_data.timestamp,
            description=f"Student switched tabs {proctor_data.tab_switches} times",
            evidence_data={"tab_switches": proctor_data.tab_switches},
        )
        db.add(malpractice)

    # Check audio levels for anomalies
    if proctor_data.audio_level:
        if proctor_data.audio_level > 80:  # Threshold for loud background noise
            detected_issues.append(
                {
                    "type": "audio_anomaly",
                    "severity": "low",
                    "description": f"High background noise detected: {proctor_data.audio_level}dB",
                }
            )

            # Create malpractice record
            malpractice = MalpracticeRecord(
                interview_id=proctor_data.interview_id,
                malpractice_type=MalpracticeType.AUDIO_ANOMALY,
                severity="low",
                timestamp=proctor_data.timestamp,
                description=f"High background noise level: {proctor_data.audio_level}dB",
                evidence_data={"audio_level": proctor_data.audio_level},
            )
            db.add(malpractice)

    db.commit()

    # Determine risk level
    risk_level = "low"
    if any(issue["severity"] == "high" for issue in detected_issues):
        risk_level = "high"
    elif any(issue["severity"] == "medium" for issue in detected_issues):
        risk_level = "medium"

    # Generate recommendations
    recommendations = []
    for issue in detected_issues:
        if issue["type"] == "no_face_detected":
            recommendations.append("Ensure your face is visible in the camera")
        elif issue["type"] == "multiple_faces":
            recommendations.append("Ensure you are alone during the interview")
        elif issue["type"] in {"tab_switching", "tab_switch"}:
            recommendations.append("Stay focused on the interview tab")
        elif issue["type"] == "audio_anomaly":
            recommendations.append("Find a quieter environment for the interview")
        elif issue["type"] == MalpracticeType.FULLSCREEN_EXIT.value:
            recommendations.append("Keep the interview in fullscreen mode")
        elif issue["type"] == MalpracticeType.PHONE_DETECTED.value:
            recommendations.append("Do not use a mobile phone during the interview")
        elif issue["type"] == MalpracticeType.PROHIBITED_KEYS.value:
            recommendations.append("Do not use prohibited keys or open developer tools")
        elif issue["type"] == MalpracticeType.WINDOW_BLUR.value:
            recommendations.append(
                "Do not switch windows; stay on the interview screen"
            )
        elif issue["type"] == MalpracticeType.LOOK_AWAY.value:
            recommendations.append("Keep looking at the screen during the interview")
        elif issue["type"] == MalpracticeType.MULTIPLE_PERSONS.value:
            recommendations.append("Ensure you are alone during the interview")

    return {
        "detected_issues": detected_issues,
        "risk_level": risk_level,
        "recommendations": recommendations,
    }


@interview_router.get("/{interview_id}/malpractice-summary")
async def get_malpractice_summary(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student", "admin", "super_admin")),
):
    """Get malpractice summary for a specific interview."""

    # Verify interview exists
    interview = db.query(Interview).filter(Interview.id == interview_id).first()
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found"
        )

    # Students can only view their own interview summaries
    role = current_user.get("role", "")
    if role == "student" and interview.student_id != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this interview",
        )

    # Get all malpractice records for this interview
    malpractice_records = (
        db.query(MalpracticeRecord)
        .filter(MalpracticeRecord.interview_id == interview_id)
        .order_by(MalpracticeRecord.timestamp.asc())
        .all()
    )

    # Group by type and severity
    summary = {
        "total_incidents": len(malpractice_records),
        "by_type": {},
        "by_severity": {"low": 0, "medium": 0, "high": 0},
        "timeline": [],
        "risk_assessment": "low",
    }

    for record in malpractice_records:
        # Count by type
        type_key = record.malpractice_type.value
        summary["by_type"][type_key] = summary["by_type"].get(type_key, 0) + 1

        # Count by severity
        summary["by_severity"][record.severity] += 1

        # Add to timeline
        summary["timeline"].append(
            {
                "timestamp": record.timestamp.isoformat(),
                "type": record.malpractice_type.value,
                "severity": record.severity,
                "description": record.description,
            }
        )

    # Determine overall risk
    if summary["by_severity"]["high"] > 0:
        summary["risk_assessment"] = "high"
    elif summary["by_severity"]["medium"] > 2:
        summary["risk_assessment"] = "high"
    elif summary["by_severity"]["medium"] > 0:
        summary["risk_assessment"] = "medium"

    return summary


@interview_router.post("/voice/analyze")
async def analyze_voice_recording(
    interview_id: int,
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student", "admin", "super_admin")),
):
    """Analyze voice recording for confidence and quality metrics."""

    # Verify interview exists
    interview = db.query(Interview).filter(Interview.id == interview_id).first()
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found"
        )

    # Students can only analyze recordings for their own interviews
    role = current_user.get("role", "")
    if role == "student" and interview.student_id != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this interview",
        )

    # Save audio file to proper uploads directory
    audio_dir = ensure_dir(audio_upload_dir())
    audio_path = audio_dir / f"{interview_id}_{datetime.now().timestamp()}.wav"

    with open(audio_path, "wb") as buffer:
        content = await audio_file.read()
        buffer.write(content)

    try:
        # Analyze speech using AI services
        voice_analysis = await VoiceProcessor.analyze_speech_confidence(audio_path)

        # Clean up temp file
        os.remove(audio_path)

        return {
            "transcript": voice_analysis["transcript"],
            "confidence_score": voice_analysis["confidence_score"],
            "word_count": voice_analysis["word_count"],
            "has_filler_words": voice_analysis["has_filler_words"],
            "analysis_summary": {
                "clarity": "good"
                if voice_analysis["confidence_score"] > 70
                else "needs_improvement",
                "fluency": "good"
                if not voice_analysis["has_filler_words"]
                else "needs_improvement",
                "content_length": "adequate"
                if voice_analysis["word_count"] > 20
                else "too_brief",
            },
        }

    except Exception as e:
        # Clean up temp file in case of error
        if os.path.exists(audio_path):
            os.remove(audio_path)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error analyzing voice recording: {str(e)}",
        )


@interview_router.get("/{interview_id}/live-status")
async def get_interview_live_status(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Get real-time status of an ongoing interview."""

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.student_id == current_user["user_id"],
            Interview.status.in_(
                [InterviewStatus.IN_PROGRESS, InterviewStatus.PENDING]
            ),
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Active interview not found"
        )

    is_admin_scheduled = bool(interview.scheduled_at) and bool(interview.admin_id)

    # If scheduled interview is past its end time, block access
    if is_admin_scheduled and interview.scheduled_at:
        from datetime import timedelta

        duration_minutes = int(interview.duration_minutes or 0) or 60
        scheduled_at = to_utc(interview.scheduled_at)
        end_time = scheduled_at + timedelta(minutes=duration_minutes)
        if utc_now() > end_time:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Scheduled interview has ended",
            )

    # Get recent malpractice incidents (last 5 minutes)
    from datetime import timedelta

    five_minutes_ago = utc_now() - timedelta(minutes=5)

    recent_incidents = (
        db.query(MalpracticeRecord)
        .filter(
            MalpracticeRecord.interview_id == interview_id,
            MalpracticeRecord.timestamp >= five_minutes_ago,
        )
        .count()
    )

    # Calculate interview progress
    current_time = utc_now()
    started_at = to_utc(interview.started_at) if interview.started_at else None
    if started_at:
        elapsed_minutes = (current_time - started_at).total_seconds() / 60
    else:
        elapsed_minutes = 0

    # Count unique answered questions (protect against duplicate submissions for the same question).
    answered_ids = set()
    for r in interview.responses or []:
        if isinstance(r, dict) and r.get("question_id") is not None:
            try:
                answered_ids.add(int(r.get("question_id")))
            except Exception:
                continue

    questions_answered = len(answered_ids)
    total_questions = len(interview.questions) if interview.questions else 0
    progress_percentage = (
        (questions_answered / total_questions * 100) if total_questions > 0 else 0
    )

    next_index = None
    if total_questions > 0:
        for i in range(total_questions):
            if i not in answered_ids:
                next_index = i
                break

    return {
        "interview_id": interview_id,
        "status": interview.status.value,
        "elapsed_minutes": int(elapsed_minutes),
        "questions_answered": questions_answered,
        "total_questions": total_questions,
        "progress_percentage": round(progress_percentage, 2),
        "recent_incidents": recent_incidents,
        "is_proctored": interview.is_proctored,
        "current_question": interview.questions[next_index]
        if next_index is not None
        else None,
    }


async def analyze_frame_for_faces(frame_data: str) -> Dict:
    """Analyze video frame for face detection."""
    try:
        # Decode a data URL like "data:image/jpeg;base64,..." or raw base64.
        b64 = frame_data
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64)
        img_arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Unable to decode frame")

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        cascade = cv2.CascadeClassifier(
            os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        )
        faces = cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )

        face_positions = [
            {"x": int(x), "y": int(y), "width": int(w), "height": int(h)}
            for (x, y, w, h) in faces
        ]

        face_count = int(len(face_positions))
        confidence = 0.9 if face_count == 1 else 0.4
        return {
            "face_count": face_count,
            "confidence": confidence,
            "face_positions": face_positions,
        }

    except Exception as e:
        print(f"Error analyzing frame: {e}")
        return {
            "face_count": 1,  # Default to assuming face is present
            "confidence": 0.5,
            "face_positions": [],
        }
