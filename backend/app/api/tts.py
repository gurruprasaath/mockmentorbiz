from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from typing import Literal, Optional

from app.utils.deps import require_role
from app.utils.tts import synthesize_speech


tts_router = APIRouter()


class SpeakRequest(BaseModel):
    text: str
    provider: Optional[Literal["elevenlabs", "murf"]] = None


@tts_router.post("/speak")
async def speak(
    payload: SpeakRequest,
    _current_user: dict = Depends(require_role("student", "admin", "super_admin")),
):
    """Convert text to speech audio.

    Returns MP3 bytes.
    """

    try:
        result = await synthesize_speech(payload.text, provider_preference=payload.provider)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TTS synthesis failed: {str(e)}",
        )

    return Response(
        content=result.audio_bytes,
        media_type=result.media_type,
        headers={"X-TTS-Provider": result.provider},
    )
