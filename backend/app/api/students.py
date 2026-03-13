from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    UploadFile,
    File,
    Form,
    Query,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from typing import List, Optional
import os
import shutil
import mimetypes
import uuid
from pathlib import Path
from datetime import datetime
import logging

from app.database import get_db
from app.models import (
    User,
    Interview,
    InterviewType,
    InterviewStatus,
    Domain,
    PerformanceRecord,
    MalpracticeRecord,
)
from app.utils.ai_services import (
    QuestionGenerator,
    ResponseAnalyzer,
    GroqResumeInterviewAgent,
    GroqInterviewEvaluator,
    AgenticInterviewer,
    ResumeProfiler,
    ResumeGroundedInterviewAgent,
    StrictTurnEvaluator,
    FollowUpAgent,
)
from app.utils.deps import require_role
from app.utils.time import utc_now, to_utc
from app.utils.uploads import audio_upload_dir, ensure_dir, resumes_upload_dir

student_router = APIRouter()

logger = logging.getLogger(__name__)


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


class InterviewRequest(BaseModel):
    interview_type: InterviewType
    domain: Optional[str] = None


class InterviewResponse(BaseModel):
    id: int
    interview_type: str
    domain: Optional[str]
    status: str
    questions: List[dict]
    created_at: str

    class Config:
        from_attributes = True


class SubmitAnswerRequest(BaseModel):
    question_id: int
    answer_text: Optional[str] = None
    response_time: int  # in seconds


def _extract_resume_text(resume_path: str) -> str:
    """Best-effort resume text extraction for common formats.

    Supports: .pdf, .docx, .txt. Falls back to empty string.
    """
    if not resume_path:
        return ""

    _, ext = os.path.splitext(resume_path)
    ext = (ext or "").lower()

    try:
        if ext == ".txt":
            with open(resume_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

        if ext == ".pdf":
            try:
                from pypdf import PdfReader  # type: ignore
            except Exception:
                from PyPDF2 import PdfReader  # type: ignore

            reader = PdfReader(resume_path)
            parts: List[str] = []
            for page in reader.pages:
                text = page.extract_text() or ""
                if text.strip():
                    parts.append(text)
            return "\n".join(parts)

        if ext == ".docx":
            from docx import Document  # type: ignore

            doc = Document(resume_path)
            parts = []
            for p in doc.paragraphs:
                if p.text and p.text.strip():
                    parts.append(p.text)
            return "\n".join(parts)

    except Exception as e:
        print(f"Resume text extraction failed: {e}")

    return ""


class DomainResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]

    class Config:
        from_attributes = True


@student_router.post("/start-interview", response_model=InterviewResponse)
async def start_interview(
    interview_type: InterviewType = Form(...),
    domain: Optional[str] = Form(None),
    num_questions: int = Form(10),
    mode: str = Form("intermediate"),
    enable_followups: bool = Form(False),
    duration_minutes: int = Form(30),
    resume_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Start a new interview based on the selected type."""

    # Create the interview request from form data
    interview_request = InterviewRequest(interview_type=interview_type, domain=domain)

    # Validate interview type requirements
    if (
        interview_request.interview_type == InterviewType.RESUME_BASED
        and not resume_file
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resume file is required for resume-based interviews",
        )

    if (
        interview_request.interview_type == InterviewType.DOMAIN_BASED
        and not interview_request.domain
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain selection is required for domain-based interviews",
        )

    # Auto-cancel any stale in_progress interviews for this student.
    # These can accumulate when the browser is closed mid-session or when the
    # ENUM bug prevented interviews from being created correctly.
    stale = (
        db.query(Interview)
        .filter(
            Interview.student_id == current_user["user_id"],
            Interview.status == InterviewStatus.IN_PROGRESS,
        )
        .all()
    )
    for stale_interview in stale:
        # Only cancel if it has no responses (truly abandoned)
        if not stale_interview.responses:
            stale_interview.status = InterviewStatus.CANCELLED
    if stale:
        db.commit()

    # Create interview record
    safe_num_questions = max(1, min(int(num_questions), 25))
    safe_duration_minutes = max(5, min(int(duration_minutes), 120))
    mode_norm = (mode or "").strip().lower() or "intermediate"
    if mode_norm not in {"beginner", "intermediate", "expert"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mode. Must be one of: beginner, intermediate, expert",
        )

    interview = Interview(
        student_id=current_user["user_id"],
        interview_type=interview_request.interview_type,
        domain=interview_request.domain,
        status=InterviewStatus.IN_PROGRESS,
        started_at=utc_now(),
        is_proctored=True,
        num_questions=safe_num_questions,
        # For follow-up mode, use duration_minutes as the time budget.
        duration_minutes=safe_duration_minutes if enable_followups else 0,
    )

    # Handle resume upload
    resume_path = None
    if resume_file:
        upload_dir = ensure_dir(resumes_upload_dir())

        resume_path_obj = (
            upload_dir
            / f"{current_user['user_id']}_{datetime.now().timestamp()}_{resume_file.filename}"
        )
        resume_path = str(resume_path_obj).replace("\\", "/")

        with open(resume_path_obj, "wb") as buffer:
            shutil.copyfileobj(resume_file.file, buffer)

        interview.resume_path = resume_path

    db.add(interview)
    db.commit()
    db.refresh(interview)

    # Generate questions based on interview type
    questions = []

    if interview_request.interview_type == InterviewType.RESUME_BASED:
        resume_text = _extract_resume_text(resume_path) if resume_path else ""

        # Debug logging to verify resume parsing is working.
        # Truncate to avoid flooding logs / leaking too much content.
        try:
            preview = (resume_text or "").strip().replace("\r", "")
            preview = preview[:2000]
            logger.info(
                "Resume interview start: user_id=%s interview_id=%s filename=%s num_questions=%s resume_text_len=%s resume_text_preview=<<<%s>>>",
                current_user.get("user_id"),
                interview.id,
                getattr(resume_file, "filename", None),
                num_questions,
                len(resume_text or ""),
                preview,
            )
        except Exception as e:
            logger.warning("Failed to log resume preview: %s", e)

        if not resume_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract text from the uploaded resume. Please upload a text-based PDF or DOCX (not scanned images).",
            )

        try:
            if enable_followups:
                resume_profile = await ResumeProfiler.extract_profile(resume_text)
                # Start with the strongest project from the resume; then follow-up dynamically.
                questions = [
                    ResumeGroundedInterviewAgent.first_question(
                        resume_profile, safe_duration_minutes, mode=mode_norm
                    )
                ]
            else:
                questions = await GroqResumeInterviewAgent.generate_resume_qna(
                    resume_text,
                    num_questions=safe_num_questions,
                    mode=mode_norm,
                )
        except Exception as e:
            logger.exception(
                "Groq resume agent failed: user_id=%s interview_id=%s error=%s",
                current_user.get("user_id"),
                interview.id,
                str(e),
            )
            # Fallback instead of failing the whole interview.
            questions = QuestionGenerator._heuristic_resume_qna(
                resume_text, safe_num_questions
            )
            # Adjust difficulty labels based on mode for UI consistency.
            for it in questions:
                if not isinstance(it, dict):
                    continue
                if mode_norm == "beginner":
                    it["difficulty"] = (
                        "easy"
                        if str(it.get("difficulty") or "").strip().lower() != "medium"
                        else "medium"
                    )
                elif mode_norm == "expert":
                    it["difficulty"] = (
                        "hard"
                        if str(it.get("difficulty") or "").strip().lower() != "easy"
                        else "medium"
                    )
                else:
                    it["difficulty"] = (
                        str(it.get("difficulty") or "medium").strip().lower()
                        or "medium"
                    )

    elif interview_request.interview_type == InterviewType.DOMAIN_BASED:
        if enable_followups:
            # Domain-based agentic mode: generate only the first question, then
            # let FollowUpAgent handle the rest dynamically after each answer.
            domain_q = await QuestionGenerator.generate_domain_qna(
                interview_request.domain,
                num_questions=1,
            )
            first_q = (
                domain_q[0]
                if domain_q
                else {
                    "question": f"Tell me about your experience with {interview_request.domain or 'this domain'}.",
                    "type": "experience",
                    "difficulty": "medium",
                    "expected_duration": "120",
                    "sample_answer": "Describe your background, key projects, and main concepts you know.",
                }
            )
            # Embed follow-up metadata into the first question (same pattern as resume mode)
            first_q["followups_enabled"] = True
            first_q["max_questions"] = safe_num_questions
            first_q["time_limit_minutes"] = safe_duration_minutes
            first_q["is_followup"] = False
            questions = [first_q]
        else:
            questions = await QuestionGenerator.generate_domain_qna(
                interview_request.domain,
                num_questions=max(1, min(int(num_questions), 25)),
            )

    elif interview_request.interview_type == InterviewType.SCHEDULED:
        # For scheduled interviews, questions are pre-defined by admin
        questions = [
            {
                "question": "This is a scheduled interview. Please wait for the interviewer.",
                "type": "waiting",
                "difficulty": "easy",
                "expected_duration": "0",
            }
        ]

    # Update interview with generated questions
    interview.questions = questions
    db.commit()

    return {
        "id": interview.id,
        "interview_type": interview.interview_type.value,
        "domain": interview.domain,
        "status": interview.status.value,
        "questions": questions,
        "created_at": interview.created_at.isoformat(),
    }


@student_router.post("/submit-answer/{interview_id}")
async def submit_answer(
    interview_id: int,
    question_id: int = Form(...),
    answer_text: Optional[str] = Form(None),
    response_time: int = Form(...),
    audio_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Submit an answer for a specific question in the interview."""

    answer_data = SubmitAnswerRequest(
        question_id=question_id,
        answer_text=answer_text,
        response_time=response_time,
    )

    # Get interview (allow scheduled interviews to start from PENDING)
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found (or you don't have access)",
        )

    is_admin_scheduled = bool(interview.scheduled_at) and bool(interview.admin_id)

    # If this is a scheduled interview still pending, auto-start it (server-side enforcement)
    if interview.status == InterviewStatus.PENDING:
        if not is_admin_scheduled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interview is not active yet",
            )

        now = utc_now()
        if interview.scheduled_at:
            from datetime import timedelta

            duration_minutes = int(interview.duration_minutes or 0) or 60
            scheduled_at = to_utc(interview.scheduled_at)
            earliest = scheduled_at - timedelta(minutes=15)
            latest = scheduled_at + timedelta(minutes=duration_minutes)
            if now < earliest:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scheduled interview has not started yet",
                )
            if now > latest:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scheduled interview window has expired",
                )

        interview.status = InterviewStatus.IN_PROGRESS
        interview.started_at = now
        db.commit()
        db.refresh(interview)

    # For scheduled interviews, prevent answering after the end time even if still in_progress
    if is_admin_scheduled and interview.scheduled_at:
        from datetime import timedelta

        now = utc_now()
        duration_minutes = int(interview.duration_minutes or 0) or 60
        scheduled_at = to_utc(interview.scheduled_at)
        end_time = scheduled_at + timedelta(minutes=duration_minutes)
        if now > end_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scheduled interview has ended",
            )

    # Handle audio transcription if provided
    final_answer = answer_data.answer_text or ""
    transcript_text: Optional[str] = None
    audio_meta: Optional[dict] = None

    if audio_file:
        ensure_dir(_AUDIO_UPLOAD_DIR)

        original_name = (audio_file.filename or "audio").strip() or "audio"
        _, ext = os.path.splitext(original_name)
        ext = (ext or "").lower()
        if not ext:
            # Best-effort from content type
            guessed = mimetypes.guess_extension(audio_file.content_type or "")
            ext = guessed or ".webm"

        # Unique filename to avoid collisions
        file_id = uuid.uuid4().hex
        audio_path = (
            _AUDIO_UPLOAD_DIR
            / f"{interview_id}_{answer_data.question_id}_{file_id}{ext}"
        )

        with open(audio_path, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)

        from app.utils.ai_services import VoiceProcessor

        transcript_text = (
            await VoiceProcessor.transcribe_audio(str(audio_path))
        ) or None
        if transcript_text:
            final_answer = transcript_text

        audio_meta = {
            "path": str(audio_path).replace("\\", "/"),
            "filename": os.path.basename(str(audio_path)),
            "original_filename": original_name,
            "content_type": audio_file.content_type or "application/octet-stream",
        }

    # Get the question being answered
    if answer_data.question_id >= len(interview.questions):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid question ID"
        )

    qobj = interview.questions[answer_data.question_id]
    question = qobj.get("question")
    sample_answer = qobj.get("sample_answer") if isinstance(qobj, dict) else None

    # Analyze the response
    analysis = await ResponseAnalyzer.analyze_response(
        question=question,
        response=final_answer,
        response_time=answer_data.response_time,
        sample_answer=sample_answer,
        domain=interview.domain,
    )

    # Strict orchestration-only evaluation for follow-up mode (resume-only; used for
    # backward compat with the old ResumeGroundedInterviewAgent path — kept for reference).
    strict_eval = None
    try:
        first = (
            interview.questions[0]
            if (interview.questions and isinstance(interview.questions[0], dict))
            else None
        )
        if isinstance(first, dict) and bool(first.get("followups_enabled")):
            resume_profile = (
                first.get("resume_profile")
                if isinstance(first.get("resume_profile"), dict)
                else {}
            )
            strict_eval = await StrictTurnEvaluator.evaluate(
                resume_profile=resume_profile,
                question=str(question or ""),
                answer=str(final_answer or ""),
                history=list(interview.responses or []),
            )
    except Exception:
        strict_eval = None

    # Update interview responses
    # NOTE: interview.responses is stored in a JSON column; in-place mutation (append)
    # may not be detected by SQLAlchemy unless the column is configured as MutableList.
    # Reassign a new list to guarantee persistence.
    # Also: upsert by question_id so students can re-record/re-submit without
    # creating duplicate answers that break progress tracking.
    responses = [
        r
        for r in list(interview.responses or [])
        if not (
            isinstance(r, dict)
            and int(r.get("question_id") or -1) == int(answer_data.question_id)
        )
    ]

    responses.append(
        {
            "question_id": answer_data.question_id,
            "question": question,
            "sample_answer": sample_answer,
            "answer": final_answer,
            "answer_text": answer_data.answer_text or "",
            "transcript": transcript_text,
            "audio": audio_meta,
            "response_time": answer_data.response_time,
            "timestamp": utc_now().isoformat(),
            "analysis": {
                **(analysis or {}),
                "strict_eval": strict_eval,
            },
        }
    )

    interview.responses = responses

    # ---------------------------------------------------------------------------
    # FollowUpAgent — unified agentic follow-up for ALL interview types.
    # Replaces the old ResumeGroundedInterviewAgent-only path.
    # ---------------------------------------------------------------------------
    followup_result = None
    followup_generated = False
    followup_question_obj = None

    try:
        first = (
            interview.questions[0]
            if (interview.questions and isinstance(interview.questions[0], dict))
            else None
        )
        followups_enabled = isinstance(first, dict) and bool(
            first.get("followups_enabled")
        )

        if followups_enabled:
            max_questions = int((first or {}).get("max_questions") or 25)
            questions_answered = len(responses)

            # Enforce time budget
            time_limit = int(
                (first or {}).get("time_limit_minutes")
                or interview.duration_minutes
                or 30
            )
            time_limit = max(5, min(time_limit, 120))
            elapsed_minutes = 0.0
            try:
                started_at = (
                    to_utc(interview.started_at) if interview.started_at else None
                )
                if started_at:
                    elapsed_minutes = (utc_now() - started_at).total_seconds() / 60.0
            except Exception:
                elapsed_minutes = 0.0

            within_time = elapsed_minutes < float(time_limit)
            within_budget = len(interview.questions) < max_questions

            if within_time and within_budget:
                resume_profile = (
                    first.get("resume_profile")
                    if isinstance(first.get("resume_profile"), dict)
                    else None
                )

                # Build conversation history for the agent from saved responses.
                # Exclude the current answer (last entry) — the agent receives it
                # separately via current_question / current_answer so it is not
                # shown twice in the evaluate_node prompt.
                all_responses = list(interview.responses or [])
                conversation_history = [
                    {
                        "question": r.get("question", ""),
                        "answer": r.get("answer", ""),
                        "analysis": r.get("analysis", {}),
                    }
                    for r in all_responses[
                        :-1
                    ]  # all but the just-appended current answer
                ]

                # ------------------------------------------------------------------
                # Hard gate: never call the agent if the candidate has already
                # struggled 2+ times in a row OR if StrictTurnEvaluator explicitly
                # said change_topic. This prevents runaway drilling even if the
                # LLM ignores its policy prompt.
                # ------------------------------------------------------------------
                strict_eval = (analysis or {}).get("strict_eval") or {}
                next_action = str(strict_eval.get("next_action") or "").lower()

                from app.utils.ai_services import (
                    _count_consecutive_struggles,
                    generate_pivot_question,
                )

                consecutive_struggles = _count_consecutive_struggles(
                    conversation_history, analysis or {}
                )

                gate_blocked = (
                    next_action == "change_topic" or consecutive_struggles >= 2
                )

                if gate_blocked:
                    # Candidate has struggled 2+ times in a row or evaluator said
                    # change_topic. Stop drilling and generate a fresh question on
                    # a completely new topic so the interview stays alive.
                    logger.info(
                        "FollowUpAgent gate blocked (consecutive_struggles=%d, next_action=%s) — pivoting topic",
                        consecutive_struggles,
                        next_action,
                    )
                    pivot_q = await generate_pivot_question(
                        interview_type=interview.interview_type.value,
                        domain=interview.domain,
                        resume_profile=resume_profile,
                        conversation_history=conversation_history,
                    )
                    if pivot_q and pivot_q.get("question"):
                        interview.questions = list(interview.questions or []) + [
                            pivot_q
                        ]
                        followup_generated = True
                        followup_question_obj = pivot_q
                else:
                    followup_result = await FollowUpAgent.decide(
                        interview_type=interview.interview_type.value,
                        domain=interview.domain,
                        resume_profile=resume_profile,
                        conversation_history=conversation_history,
                        current_question=str(question or ""),
                        current_answer=str(final_answer or ""),
                        current_analysis=analysis or {},
                        questions_answered=questions_answered,
                        max_questions=max_questions,
                    )
                    logger.info(
                        "FollowUpAgent result: should_follow_up=%s, type=%s, reasoning=%s",
                        (followup_result or {}).get("should_follow_up"),
                        (followup_result or {}).get("follow_up_type"),
                        (followup_result or {}).get("reasoning", "")[:120],
                    )

                    if followup_result and followup_result.get("should_follow_up"):
                        fq = followup_result.get("follow_up_question")
                        if isinstance(fq, dict) and fq.get("question"):
                            interview.questions = list(interview.questions or []) + [fq]
                            followup_generated = True
                            followup_question_obj = fq

                    # Fallback: if the agent decided no follow-up but we still have
                    # time and budget, generate a pivot to keep the interview alive
                    # instead of ending abruptly.
                    if not followup_generated:
                        logger.info(
                            "FollowUpAgent returned no follow-up — generating pivot to keep interview alive"
                        )
                        pivot_q = await generate_pivot_question(
                            interview_type=interview.interview_type.value,
                            domain=interview.domain,
                            resume_profile=resume_profile,
                            conversation_history=conversation_history,
                        )
                        if pivot_q and pivot_q.get("question"):
                            interview.questions = list(interview.questions or []) + [
                                pivot_q
                            ]
                            followup_generated = True
                            followup_question_obj = pivot_q

    except Exception as e:
        logger.exception("FollowUpAgent follow-up generation failed: %s", e)

    # Ensure SQLAlchemy detects mutations to JSON columns before committing.
    # Without flag_modified(), in-place list reassignments to JSON columns
    # are not always detected and may be silently dropped.
    flag_modified(interview, "questions")
    flag_modified(interview, "responses")
    db.commit()

    # Compute next_question_id AFTER any follow-up was appended (fixes race condition)
    next_qid = answer_data.question_id + 1
    next_question_id = next_qid if next_qid < len(interview.questions) else None
    logger.info(
        "submit-answer summary: followup_generated=%s, total_questions=%d, "
        "answered_question_id=%d, next_question_id=%s",
        followup_generated,
        len(interview.questions),
        answer_data.question_id,
        next_question_id,
    )

    return {
        "message": "Answer submitted successfully",
        "analysis": analysis,
        "transcript": transcript_text,
        "has_audio": bool(audio_meta),
        "next_question_id": next_question_id,
        "follow_up_generated": followup_generated,
        "follow_up_question": followup_question_obj,
    }


@student_router.get("/interview/{interview_id}/answer-audio")
async def download_answer_audio(
    interview_id: int,
    question_id: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Download a previously recorded answer audio for replay (student-only)."""

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.student_id == current_user["user_id"],
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found"
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


@student_router.post("/complete-interview/{interview_id}")
async def complete_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Complete an interview and generate final scores."""

    def _to_float(value) -> float:
        if value is None:
            return 0.0
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            s = value.strip()
            # Extract the first number from strings like "85", "85/100", "score out of 100: 85".
            m = __import__("re").search(r"(-?\d+(?:\.\d+)?)", s)
            return float(m.group(1)) if m else 0.0
        return 0.0

    def _to_int(value) -> int:
        if value is None:
            return 0
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            m = __import__("re").search(r"(-?\d+)", value)
            return int(m.group(1)) if m else 0
        return 0

    def _as_str_list(value) -> List[str]:
        if value is None:
            return []
        if isinstance(value, str):
            v = value.strip()
            return [v] if v else []
        if isinstance(value, list):
            out: List[str] = []
            for item in value:
                if item is None:
                    continue
                if isinstance(item, str):
                    s = item.strip()
                    if s:
                        out.append(s)
                else:
                    out.append(str(item))
            return out
        return [str(value)]

    def _safe_str(value) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        return str(value)

    # Get interview
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.student_id == current_user["user_id"],
            Interview.status == InterviewStatus.IN_PROGRESS,
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found or not in progress",
        )

    # Refuse to complete an interview with no answers at all.
    # This prevents the LLM from hallucinating scores when the student
    # clicked "Complete Interview" without answering a single question.
    total_responses = len(interview.responses) if interview.responses else 0
    if total_responses == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot complete an interview with no answers. Please answer at least one question first.",
        )

    # Calculate final scores
    total_technical_score = 0.0
    total_communication_score = 0.0
    total_response_time = 0

    strengths = []
    weaknesses = []

    if interview.responses:
        for response in interview.responses:
            if "analysis" in response:
                analysis = response["analysis"]
                total_technical_score += _to_float(analysis.get("technical_score", 0))
                total_communication_score += _to_float(
                    analysis.get("communication_score", 0)
                )
                total_response_time += _to_int(response.get("response_time", 0))

                strengths.extend(_as_str_list(analysis.get("strengths", [])))
                weaknesses.extend(_as_str_list(analysis.get("improvements", [])))

    # Calculate averages
    avg_technical_score = (
        total_technical_score / total_responses if total_responses > 0 else 0
    )
    avg_communication_score = (
        total_communication_score / total_responses if total_responses > 0 else 0
    )
    avg_response_time = (
        total_response_time / total_responses if total_responses > 0 else 0
    )
    completion_rate = (
        (total_responses / len(interview.questions)) * 100 if interview.questions else 0
    )

    overall_score = (avg_technical_score + avg_communication_score) / 2

    # Per-question results (derived from per-answer Groq analysis we already saved during submit-answer)
    per_question_results: List[dict] = []

    # Build sample_answer lookup from interview.questions
    questions_list = (
        interview.questions if isinstance(interview.questions, list) else []
    )
    # Build sample_answer lookup by LIST INDEX — questions have no question_id/id field
    sample_answer_map: dict = {}
    for idx, qobj in enumerate(questions_list):
        if isinstance(qobj, dict):
            sa = qobj.get("sample_answer") or qobj.get("ideal_answer") or ""
            if sa:
                sample_answer_map[idx] = sa

    for r in interview.responses or []:
        analysis = r.get("analysis") if isinstance(r, dict) else None
        analysis = analysis if isinstance(analysis, dict) else {}

        audio_meta = r.get("audio") if isinstance(r, dict) else None
        transcript = r.get("transcript") if isinstance(r, dict) else None
        qid_val = _to_int(r.get("question_id"))

        per_question_results.append(
            {
                "question_id": qid_val,
                "question": _safe_str(r.get("question")),
                "answer": _safe_str(r.get("answer")),
                "transcript": _safe_str(transcript) if transcript else "",
                "audio": audio_meta if isinstance(audio_meta, dict) else None,
                "response_time": _to_int(r.get("response_time")),
                "technical_score": _to_float(analysis.get("technical_score")),
                "communication_score": _to_float(analysis.get("communication_score")),
                "relevance_score": _to_float(analysis.get("relevance_score")),
                "strengths": _as_str_list(analysis.get("strengths")),
                "weaknesses": _as_str_list(analysis.get("improvements")),
                "feedback": _safe_str(
                    analysis.get("overall_feedback") or analysis.get("feedback")
                ),
                # sample_answer: prefer the value stored in the response at submit time,
                # fall back to the index-based map from interview.questions
                "sample_answer": _safe_str(r.get("sample_answer"))
                or sample_answer_map.get(qid_val, ""),
            }
        )

    # Malpractice summary
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

    # Final interview evaluation (Groq) to generate human-readable feedback + recommendations.
    # If Groq fails, fall back to the computed averages above.
    evaluation = None
    try:
        evaluation = await GroqInterviewEvaluator.evaluate_interview(
            interview_type=interview.interview_type.value,
            domain=interview.domain,
            questions=interview.questions or [],
            responses=interview.responses or [],
        )
    except Exception as e:
        logger.warning("Groq final evaluation failed (using fallback scores): %s", e)

    # Always attach per-question + malpractice info into evaluation payload we store.
    if evaluation is None:
        evaluation = {}
    if isinstance(evaluation, dict):
        evaluation["per_question"] = per_question_results
        evaluation["malpractice_count"] = malpractice_count
        evaluation["malpractice_breakdown"] = malpractice_breakdown

    # Update interview
    interview.status = InterviewStatus.COMPLETED
    interview.ended_at = utc_now()
    if interview.started_at is not None:
        from datetime import timezone as _tz

        started = interview.started_at
        ended = interview.ended_at
        # Normalise: if one side is naive, treat both as UTC
        if started.tzinfo is None:
            started = started.replace(tzinfo=_tz.utc)
        if ended.tzinfo is None:
            ended = ended.replace(tzinfo=_tz.utc)
        interview.duration_minutes = int((ended - started).total_seconds() / 60)
    else:
        interview.duration_minutes = 0
    if evaluation:
        interview.overall_score = float(evaluation.get("overall_score", overall_score))
        # Store JSON in Text so we can retrieve recommendations later.
        try:
            import json

            interview.feedback = json.dumps(evaluation, ensure_ascii=False)
        except Exception:
            interview.feedback = str(evaluation)
    else:
        interview.overall_score = overall_score
        interview.feedback = f"Overall performance: {overall_score:.1f}/100. Completed {completion_rate:.1f}% of questions."

    # Create or update performance record (avoid duplicates if endpoint is called again).
    performance_record = (
        db.query(PerformanceRecord)
        .filter(
            PerformanceRecord.interview_id == interview.id,
            PerformanceRecord.student_id == current_user["user_id"],
        )
        .first()
    )

    if not performance_record:
        performance_record = PerformanceRecord(
            student_id=current_user["user_id"],
            interview_id=interview.id,
        )
        db.add(performance_record)

    if evaluation:
        performance_record.technical_score = float(
            evaluation.get("technical_score", avg_technical_score)
        )
        performance_record.communication_score = float(
            evaluation.get("communication_score", avg_communication_score)
        )
        performance_record.confidence_score = float(
            evaluation.get("confidence_score", 75.0)
        )
        performance_record.strengths = list(
            set(_as_str_list(evaluation.get("strengths", strengths)))
        )
        performance_record.weaknesses = list(
            set(_as_str_list(evaluation.get("areas_for_improvement", weaknesses)))
        )
    else:
        performance_record.technical_score = avg_technical_score
        performance_record.communication_score = avg_communication_score
        performance_record.confidence_score = (
            75.0  # Placeholder - could be replaced by voice analysis later
        )
        performance_record.strengths = list(set(strengths))
        performance_record.weaknesses = list(set(weaknesses))

    performance_record.response_time_avg = avg_response_time
    performance_record.completion_rate = completion_rate

    db.commit()

    # Build response for UI
    recommendations: List[str] = []
    feedback_text = interview.feedback
    if evaluation:
        feedback_text = (
            str(evaluation.get("feedback", ""))
            or str(evaluation.get("summary", ""))
            or ""
        )
        recs = evaluation.get("recommendations")
        if isinstance(recs, list):
            recommendations = [str(r).strip() for r in recs if str(r).strip()]

    return {
        "message": "Interview completed successfully",
        "id": interview.id,
        "interview_type": interview.interview_type.value,
        "completed_at": interview.ended_at.isoformat() if interview.ended_at else None,
        "overall_score": float(interview.overall_score or 0),
        "technical_score": float(performance_record.technical_score or 0),
        "communication_score": float(performance_record.communication_score or 0),
        "confidence_score": float(performance_record.confidence_score or 0),
        "completion_rate": completion_rate,
        "duration_minutes": interview.duration_minutes,
        "feedback": feedback_text,
        "strengths": performance_record.strengths or [],
        "areas_for_improvement": performance_record.weaknesses or [],
        "recommendations": recommendations,
        "per_question": per_question_results,
        "malpractice_count": malpractice_count,
        "malpractice_breakdown": malpractice_breakdown,
    }


@student_router.get("/domains", response_model=List[DomainResponse])
async def get_available_domains(db: Session = Depends(get_db)):
    """Get list of available interview domains."""

    domains = db.query(Domain).filter(Domain.is_active == True).all()
    return domains


@student_router.get("/my-interviews")
async def get_my_interviews(
    db: Session = Depends(get_db), current_user: dict = Depends(require_role("student"))
):
    """Get all interviews for the current student."""

    interviews = (
        db.query(Interview)
        .filter(Interview.student_id == current_user["user_id"])
        .order_by(Interview.created_at.desc())
        .all()
    )

    interview_list = []
    for interview in interviews:
        admin_name = None
        if interview.admin_id:
            admin_user = db.query(User).filter(User.id == interview.admin_id).first()
            admin_name = admin_user.full_name if admin_user else None
        interview_list.append(
            {
                "id": interview.id,
                "interview_type": interview.interview_type.value,
                "domain": interview.domain,
                "status": interview.status.value,
                "overall_score": interview.overall_score,
                "scheduled_at": to_utc(interview.scheduled_at).isoformat()
                if interview.scheduled_at
                else None,
                "duration_minutes": interview.duration_minutes,
                "admin_name": admin_name,
                "is_proctored": bool(interview.is_proctored),
                "created_at": interview.created_at.isoformat(),
                "completed_at": interview.ended_at.isoformat()
                if interview.ended_at
                else None,
            }
        )

    return interview_list


@student_router.get("/scheduled-interviews")
async def get_scheduled_interviews_for_student(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """List scheduled interviews for the current student."""

    interviews = (
        db.query(Interview)
        .filter(
            Interview.student_id == current_user["user_id"],
            Interview.scheduled_at.isnot(None),
            Interview.admin_id.isnot(None),
        )
        .order_by(Interview.scheduled_at.desc())
        .all()
    )

    out: List[dict] = []
    for interview in interviews:
        admin_name = None
        if interview.admin_id:
            admin_user = db.query(User).filter(User.id == interview.admin_id).first()
            admin_name = admin_user.full_name if admin_user else None
        out.append(
            {
                "interview_id": interview.id,
                "scheduled_at": to_utc(interview.scheduled_at).isoformat()
                if interview.scheduled_at
                else None,
                "status": interview.status.value,
                "interview_type": interview.interview_type.value,
                "domain": interview.domain,
                "duration_minutes": interview.duration_minutes,
                "num_questions": int(getattr(interview, "num_questions", 10) or 10),
                "is_proctored": bool(interview.is_proctored),
                "admin_name": admin_name,
                "overall_score": interview.overall_score
                if interview.status == InterviewStatus.COMPLETED
                else None,
            }
        )

    return out


@student_router.get("/interview/{interview_id}")
async def get_interview_details(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Get a single interview's details for the current student."""

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.student_id == current_user["user_id"],
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    admin_name = None
    if interview.admin_id:
        admin_user = db.query(User).filter(User.id == interview.admin_id).first()
        admin_name = admin_user.full_name if admin_user else None

    return {
        "id": interview.id,
        "status": interview.status.value,
        "interview_type": interview.interview_type.value,
        "domain": interview.domain,
        "scheduled_at": to_utc(interview.scheduled_at).isoformat()
        if interview.scheduled_at
        else None,
        "started_at": interview.started_at.isoformat()
        if interview.started_at
        else None,
        "ended_at": interview.ended_at.isoformat() if interview.ended_at else None,
        "duration_minutes": interview.duration_minutes,
        "num_questions": int(getattr(interview, "num_questions", 10) or 10),
        "admin_name": admin_name,
        # These fields are referenced by the current frontend scheduled page
        # but are not part of the Interview schema yet.
        "description": None,
        "special_instructions": None,
        "is_proctored": bool(interview.is_proctored),
    }


@student_router.get("/performance-summary")
async def get_performance_summary(
    db: Session = Depends(get_db), current_user: dict = Depends(require_role("student"))
):
    """Get performance summary for the student."""

    from sqlalchemy import func

    # Get overall statistics
    performance_stats = (
        db.query(
            func.avg(PerformanceRecord.technical_score).label("avg_technical"),
            func.avg(PerformanceRecord.communication_score).label("avg_communication"),
            func.avg(PerformanceRecord.confidence_score).label("avg_confidence"),
            func.avg(PerformanceRecord.completion_rate).label("avg_completion"),
            func.count(PerformanceRecord.id).label("total_interviews"),
        )
        .filter(PerformanceRecord.student_id == current_user["user_id"])
        .first()
    )

    return {
        "total_interviews": performance_stats.total_interviews or 0,
        "average_technical_score": round(performance_stats.avg_technical or 0, 2),
        "average_communication_score": round(
            performance_stats.avg_communication or 0, 2
        ),
        "average_confidence_score": round(performance_stats.avg_confidence or 0, 2),
        "average_completion_rate": round(performance_stats.avg_completion or 0, 2),
    }


def _build_type_stats(interviews: list, records: dict) -> dict:
    """Return per-interview-type aggregates for the PerformancePage split view."""
    from collections import defaultdict

    buckets: dict = defaultdict(
        lambda: {
            "count": 0,
            "total_score": 0.0,
            "total_technical": 0.0,
            "total_communication": 0.0,
            "total_confidence": 0.0,
        }
    )

    for interview in interviews:
        itype = getattr(
            interview.interview_type, "value", str(interview.interview_type)
        )
        record = records.get(interview.id)
        b = buckets[itype]
        b["count"] += 1
        b["total_score"] += float(interview.overall_score or 0)
        b["total_technical"] += float(record.technical_score or 0) if record else 0.0
        b["total_communication"] += (
            float(record.communication_score or 0) if record else 0.0
        )
        b["total_confidence"] += float(record.confidence_score or 0) if record else 0.0

    result = {}
    for itype, b in buckets.items():
        n = b["count"] or 1
        result[itype] = {
            "count": b["count"],
            "avg_score": round(b["total_score"] / n, 2),
            "avg_technical": round(b["total_technical"] / n, 2),
            "avg_communication": round(b["total_communication"] / n, 2),
            "avg_confidence": round(b["total_confidence"] / n, 2),
        }
    return result


@student_router.get("/performance")
async def get_performance(
    timeframe: str = "all",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Return performance analytics + interview history for PerformancePage."""

    from sqlalchemy import func, true
    from datetime import timedelta

    # Time filter
    q = db.query(Interview).filter(
        Interview.student_id == current_user["user_id"],
        Interview.status == InterviewStatus.COMPLETED,
    )
    if timeframe and timeframe != "all":
        try:
            days = int(timeframe)
            cutoff = utc_now() - timedelta(days=days)
            q = q.filter(Interview.ended_at >= cutoff)
        except Exception:
            pass

    interviews = q.order_by(Interview.ended_at.desc()).all()
    interview_ids = [i.id for i in interviews]

    records = {}
    if interview_ids:
        pr = (
            db.query(PerformanceRecord)
            .filter(
                PerformanceRecord.student_id == current_user["user_id"],
                PerformanceRecord.interview_id.in_(interview_ids),
            )
            .all()
        )
        records = {r.interview_id: r for r in pr}

    # Stats (use completed interview set for totals)
    stats_row = (
        db.query(
            func.count(Interview.id).label("total_interviews"),
            func.avg(Interview.overall_score).label("average_score"),
            func.max(Interview.overall_score).label("best_score"),
            func.sum(Interview.duration_minutes).label("total_minutes"),
        )
        .filter(
            Interview.student_id == current_user["user_id"],
            Interview.status == InterviewStatus.COMPLETED,
            Interview.id.in_(interview_ids) if interview_ids else true(),
        )
        .first()
    )

    pr_stats = (
        db.query(
            func.avg(PerformanceRecord.technical_score).label("avg_technical"),
            func.avg(PerformanceRecord.communication_score).label("avg_communication"),
            func.avg(PerformanceRecord.confidence_score).label("avg_confidence"),
            func.avg(PerformanceRecord.completion_rate).label("avg_completion"),
        )
        .filter(
            PerformanceRecord.student_id == current_user["user_id"],
            PerformanceRecord.interview_id.in_(interview_ids)
            if interview_ids
            else true(),
        )
        .first()
    )

    def _parse_feedback_and_recs(raw: str | None):
        if not raw:
            return "", [], [], 0, {}
        s = raw.strip()
        if s.startswith("{"):
            try:
                import json

                obj = json.loads(s)
                if isinstance(obj, dict):
                    fb = obj.get("feedback") or obj.get("summary") or ""
                    recs = obj.get("recommendations")
                    if isinstance(recs, list):
                        recs_out = [str(r).strip() for r in recs if str(r).strip()]
                    else:
                        recs_out = []
                    per_q = (
                        obj.get("per_question")
                        if isinstance(obj.get("per_question"), list)
                        else []
                    )
                    mp_count = (
                        obj.get("malpractice_count")
                        if isinstance(obj.get("malpractice_count"), (int, float, str))
                        else 0
                    )
                    mp_breakdown = (
                        obj.get("malpractice_breakdown")
                        if isinstance(obj.get("malpractice_breakdown"), dict)
                        else {}
                    )
                    try:
                        mp_count = int(mp_count)
                    except Exception:
                        mp_count = 0
                    return str(fb or ""), recs_out, per_q, mp_count, mp_breakdown
            except Exception:
                pass
        return raw, [], [], 0, {}

    out_interviews = []
    for interview in interviews:
        record = records.get(interview.id)
        fb, recs, per_q, mp_count, mp_breakdown = _parse_feedback_and_recs(
            interview.feedback
        )

        # Build sample_answer lookup by LIST INDEX — questions have no question_id/id field
        questions_list = (
            interview.questions if isinstance(interview.questions, list) else []
        )
        sample_answer_map: dict = {}
        for idx, qobj in enumerate(questions_list):
            if isinstance(qobj, dict):
                sa = qobj.get("sample_answer") or qobj.get("ideal_answer") or ""
                if sa:
                    sample_answer_map[idx] = sa

        # Inject sample_answer into each per_question entry
        enriched_per_q = []
        for entry in per_q:
            if isinstance(entry, dict):
                # question_id IS the list index (set at submit time)
                qid = int(entry.get("question_id") or 0)
                entry = dict(entry)  # copy so we don't mutate cached data
                if not entry.get("sample_answer"):
                    entry["sample_answer"] = sample_answer_map.get(qid, "")
            enriched_per_q.append(entry)
        per_q = enriched_per_q

        # If malpractice wasn't stored, compute quickly from DB
        if not mp_count:
            qmp = db.query(MalpracticeRecord).filter(
                MalpracticeRecord.interview_id == interview.id
            )
            mp_count = qmp.count()
            mp_breakdown = {}
            for mr in qmp.all():
                k = (
                    mr.malpractice_type.value
                    if getattr(mr, "malpractice_type", None)
                    else "unknown"
                )
                mp_breakdown[k] = mp_breakdown.get(k, 0) + 1

        out_interviews.append(
            {
                "id": str(interview.id),
                "interview_type": interview.interview_type.value,
                "completed_at": interview.ended_at.isoformat()
                if interview.ended_at
                else None,
                "duration_minutes": interview.duration_minutes,
                "overall_score": float(interview.overall_score or 0),
                "technical_score": float(record.technical_score or 0)
                if record
                else 0.0,
                "communication_score": float(record.communication_score or 0)
                if record
                else 0.0,
                "confidence_score": float(record.confidence_score or 0)
                if record
                else 0.0,
                "feedback": fb or "",
                "strengths": (record.strengths or []) if record else [],
                "areas_for_improvement": (record.weaknesses or []) if record else [],
                "recommendations": recs,
                "per_question": per_q,
                "malpractice_count": mp_count,
                "malpractice_breakdown": mp_breakdown,
            }
        )

    return {
        "stats": {
            "total_interviews": int(stats_row.total_interviews or 0),
            "average_score": float(stats_row.average_score or 0),
            "best_score": float(stats_row.best_score or 0),
            "total_minutes": int(stats_row.total_minutes or 0),
            "avg_technical": float(pr_stats.avg_technical or 0),
            "avg_communication": float(pr_stats.avg_communication or 0),
            "avg_confidence": float(pr_stats.avg_confidence or 0),
            "avg_completion": float(pr_stats.avg_completion or 0),
            # Per-type breakdown for PerformancePage split view
            "by_type": _build_type_stats(interviews, records),
        },
        "interviews": out_interviews,
    }


@student_router.get("/notices")
async def get_my_notices(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Return all admin notices (warnings/penalties) for the current student.

    Returns interviews where admin_notice is not null, sorted newest first.
    """

    interviews = (
        db.query(Interview)
        .filter(
            Interview.student_id == current_user["user_id"],
            Interview.admin_notice.isnot(None),
        )
        .order_by(Interview.ended_at.desc())
        .all()
    )

    notices = []
    for interview in interviews:
        notice = interview.admin_notice
        if not isinstance(notice, dict):
            continue
        notices.append(
            {
                "interview_id": interview.id,
                "interview_type": interview.interview_type.value,
                "interview_date": (
                    interview.ended_at or interview.created_at
                ).isoformat()
                if (interview.ended_at or interview.created_at)
                else None,
                "overall_score": float(interview.overall_score or 0),
                "notice_type": notice.get("type", "warning"),  # "warning" | "penalty"
                "action": notice.get("action", "warn"),
                "message": notice.get("message", ""),
                "reviewed_at": notice.get("reviewed_at"),
            }
        )

    return notices


@student_router.get("/interview/{interview_id}/results")
async def get_interview_results(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Return detailed results for one interview, including per-question + malpractice."""

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.student_id == current_user["user_id"],
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found"
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

    # Per-question results: prefer stored evaluation.per_question, else derive from responses
    per_question = []
    if isinstance(evaluation, dict) and isinstance(
        evaluation.get("per_question"), list
    ):
        per_question = evaluation.get("per_question")
    else:
        for r in interview.responses or []:
            analysis = r.get("analysis") if isinstance(r, dict) else None
            analysis = analysis if isinstance(analysis, dict) else {}
            per_question.append(
                {
                    "question_id": int(r.get("question_id") or 0),
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
                }
            )

    record = (
        db.query(PerformanceRecord)
        .filter(
            PerformanceRecord.student_id == current_user["user_id"],
            PerformanceRecord.interview_id == interview.id,
        )
        .first()
    )

    return {
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
        "technical_score": float(record.technical_score or 0) if record else 0.0,
        "communication_score": float(record.communication_score or 0)
        if record
        else 0.0,
        "confidence_score": float(record.confidence_score or 0) if record else 0.0,
        "strengths": (record.strengths or []) if record else [],
        "areas_for_improvement": (record.weaknesses or []) if record else [],
        "evaluation": evaluation,
        "per_question": per_question,
        "malpractice_count": malpractice_count,
        "malpractice_breakdown": malpractice_breakdown,
    }


@student_router.post("/scheduled-interview/{interview_id}/start-domain")
async def start_scheduled_domain_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Start an admin-scheduled domain interview (generate questions if missing)."""

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.student_id == current_user["user_id"],
            Interview.scheduled_at.isnot(None),
            Interview.admin_id.isnot(None),
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled interview not found",
        )

    if interview.interview_type != InterviewType.DOMAIN_BASED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This scheduled interview is not domain-based",
        )

    if not (interview.domain or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scheduled domain interview is missing a domain",
        )

    # Enforce schedule window (15 minutes before start until end)
    from datetime import timedelta

    now = utc_now()
    scheduled_at = to_utc(interview.scheduled_at)
    duration_minutes = int(interview.duration_minutes or 0) or 60
    earliest = scheduled_at - timedelta(minutes=15)
    end_time = scheduled_at + timedelta(minutes=duration_minutes)
    if now < earliest:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scheduled interview has not started yet",
        )
    if now > end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scheduled interview has ended",
        )

    # Generate questions if not already present
    if not interview.questions:
        n = int(getattr(interview, "num_questions", 10) or 10)
        n = max(1, min(n, 25))
        questions = await QuestionGenerator.generate_domain_qna(interview.domain, n)
        interview.questions = questions

    if interview.status == InterviewStatus.PENDING:
        interview.status = InterviewStatus.IN_PROGRESS
        interview.started_at = now

    db.commit()
    db.refresh(interview)

    return {"interview_id": interview.id, "id": interview.id}


@student_router.post("/scheduled-interview/{interview_id}/start-resume")
async def start_scheduled_resume_interview(
    interview_id: int,
    resume_file: UploadFile = File(...),
    num_questions: Optional[int] = Form(None),
    mode: str = Form("intermediate"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("student")),
):
    """Start an admin-scheduled resume interview by uploading resume and generating questions."""

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.student_id == current_user["user_id"],
            Interview.scheduled_at.isnot(None),
            Interview.admin_id.isnot(None),
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled interview not found",
        )

    if interview.interview_type != InterviewType.RESUME_BASED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This scheduled interview is not resume-based",
        )

    from datetime import timedelta

    now = utc_now()
    scheduled_at = to_utc(interview.scheduled_at)
    duration_minutes = int(interview.duration_minutes or 0) or 60
    earliest = scheduled_at - timedelta(minutes=15)
    end_time = scheduled_at + timedelta(minutes=duration_minutes)
    if now < earliest:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scheduled interview has not started yet",
        )
    if now > end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scheduled interview has ended",
        )

    # Save resume
    upload_dir = ensure_dir(resumes_upload_dir())
    resume_path_obj = (
        upload_dir
        / f"{current_user['user_id']}_{datetime.now().timestamp()}_{resume_file.filename}"
    )
    resume_path = str(resume_path_obj).replace("\\", "/")
    with open(resume_path_obj, "wb") as buffer:
        shutil.copyfileobj(resume_file.file, buffer)

    interview.resume_path = resume_path

    resume_text = _extract_resume_text(resume_path)
    if not resume_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract text from the uploaded resume. Please upload a text-based PDF or DOCX.",
        )

    # Admin decides number of questions for scheduled interviews.
    # Keep the form param optional for backward compatibility; ignore unless explicitly provided.
    n = int(num_questions or getattr(interview, "num_questions", 10) or 10)
    n = max(1, min(n, 25))

    mode_norm = (mode or "").strip().lower() or "intermediate"
    if mode_norm not in {"beginner", "intermediate", "expert"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mode. Must be one of: beginner, intermediate, expert",
        )
    try:
        questions = await GroqResumeInterviewAgent.generate_resume_qna(
            resume_text, num_questions=n, mode=mode_norm
        )
    except Exception as e:
        logger.exception(
            "Groq resume agent failed for scheduled interview: interview_id=%s error=%s",
            interview.id,
            str(e),
        )
        questions = QuestionGenerator._heuristic_resume_qna(resume_text, n)
        for it in questions:
            if not isinstance(it, dict):
                continue
            if mode_norm == "beginner":
                it["difficulty"] = (
                    "easy"
                    if str(it.get("difficulty") or "").strip().lower() != "medium"
                    else "medium"
                )
            elif mode_norm == "expert":
                it["difficulty"] = (
                    "hard"
                    if str(it.get("difficulty") or "").strip().lower() != "easy"
                    else "medium"
                )
            else:
                it["difficulty"] = (
                    str(it.get("difficulty") or "medium").strip().lower() or "medium"
                )

    interview.questions = questions
    if interview.status == InterviewStatus.PENDING:
        interview.status = InterviewStatus.IN_PROGRESS
        interview.started_at = now

    db.commit()
    db.refresh(interview)

    return {"interview_id": interview.id, "id": interview.id}
