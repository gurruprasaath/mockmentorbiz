from __future__ import annotations

import base64
import hashlib
import os
import time
from dataclasses import dataclass
from typing import Optional, Tuple

import httpx


class TTSConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class TTSResult:
    provider: str
    media_type: str
    audio_bytes: bytes


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _to_float(value: str, default: float) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _to_int(value: str, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


class _SimpleTTLCache:
    def __init__(self, ttl_seconds: int = 600, max_items: int = 128):
        self.ttl_seconds = ttl_seconds
        self.max_items = max_items
        self._items: dict[str, Tuple[float, TTSResult]] = {}

    def get(self, key: str) -> Optional[TTSResult]:
        item = self._items.get(key)
        if not item:
            return None
        ts, value = item
        if (time.time() - ts) > self.ttl_seconds:
            self._items.pop(key, None)
            return None
        return value

    def set(self, key: str, value: TTSResult) -> None:
        if len(self._items) >= self.max_items:
            # Drop the oldest entry (simple + predictable)
            oldest_key = min(self._items.items(), key=lambda kv: kv[1][0])[0]
            self._items.pop(oldest_key, None)
        self._items[key] = (time.time(), value)


_CACHE = _SimpleTTLCache(ttl_seconds=900, max_items=256)


async def synthesize_speech(
    text: str,
    *,
    provider_preference: Optional[str] = None,
    eleven_voice_id: Optional[str] = None,
    murf_voice_id: Optional[str] = None,
) -> TTSResult:
    """Generate speech audio for the given text.

    - Primary: ElevenLabs (returns audio bytes directly)
    - Fallback: Murf (requests Base64 audio, decodes to bytes)

    Returns audio as MP3 bytes.
    """

    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("text is required")

    if len(cleaned) > 1200:
        # Keep latency + cost reasonable; interview questions are short.
        raise ValueError("text is too long")

    pref = (provider_preference or "").strip().lower() or None
    cache_key = hashlib.sha256(
        ("|".join([
            cleaned,
            pref or "auto",
            eleven_voice_id or _env("ELEVENLABS_VOICE_ID"),
            _env("ELEVENLABS_MODEL_ID"),
            murf_voice_id or _env("MURF_VOICE_ID", "en-US-natalie"),
        ])).encode("utf-8")
    ).hexdigest()

    cached = _CACHE.get(cache_key)
    if cached:
        return cached

    # Provider order
    if pref == "murf":
        result = await _try_murf(cleaned, voice_id=murf_voice_id)
        _CACHE.set(cache_key, result)
        return result

    if pref == "elevenlabs":
        result = await _try_elevenlabs(cleaned, voice_id=eleven_voice_id)
        _CACHE.set(cache_key, result)
        return result

    # Auto: ElevenLabs then Murf
    try:
        result = await _try_elevenlabs(cleaned, voice_id=eleven_voice_id)
        _CACHE.set(cache_key, result)
        return result
    except Exception:
        result = await _try_murf(cleaned, voice_id=murf_voice_id)
        _CACHE.set(cache_key, result)
        return result


async def _try_elevenlabs(text: str, *, voice_id: Optional[str] = None) -> TTSResult:
    api_key = _env("ELEVENLABS_API_KEY")
    if not api_key:
        raise TTSConfigError("ELEVENLABS_API_KEY is not configured")

    vid = (voice_id or _env("ELEVENLABS_VOICE_ID") or "").strip()
    if not vid:
        raise TTSConfigError("ELEVENLABS_VOICE_ID is not configured")

    model_id = _env("ELEVENLABS_MODEL_ID", "eleven_monolingual_v1")

    stability = _to_float(_env("ELEVENLABS_STABILITY", "0.5"), 0.5)
    similarity_boost = _to_float(_env("ELEVENLABS_SIMILARITY_BOOST", "0.75"), 0.75)
    style = _to_float(_env("ELEVENLABS_STYLE", "0.0"), 0.0)
    use_speaker_boost = _env("ELEVENLABS_SPEAKER_BOOST", "true").lower() in ("1", "true", "yes", "y")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{vid}"
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": max(0.0, min(1.0, stability)),
            "similarity_boost": max(0.0, min(1.0, similarity_boost)),
            "style": max(0.0, min(1.0, style)),
            "use_speaker_boost": bool(use_speaker_boost),
        },
    }

    headers = {
        "xi-api-key": api_key,
        "accept": "audio/mpeg",
        "content-type": "application/json",
    }

    timeout = httpx.Timeout(20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        audio_bytes = resp.content

    if not audio_bytes:
        raise RuntimeError("ElevenLabs returned empty audio")

    return TTSResult(provider="elevenlabs", media_type="audio/mpeg", audio_bytes=audio_bytes)


async def _try_murf(text: str, *, voice_id: Optional[str] = None) -> TTSResult:
    api_key = _env("MURF_API_KEY")
    if not api_key:
        raise TTSConfigError("MURF_API_KEY is not configured")

    vid = (voice_id or _env("MURF_VOICE_ID", "en-US-natalie") or "").strip()
    if not vid:
        vid = "en-US-natalie"

    # Tuning controls (Gen2)
    rate = _to_int(_env("MURF_RATE", "0"), 0)  # -50..50
    pitch = _to_int(_env("MURF_PITCH", "0"), 0)  # -50..50
    style = _env("MURF_STYLE", "")
    variation = _to_int(_env("MURF_VARIATION", "1"), 1)  # 0..5

    payload: dict = {
        "text": text,
        "voiceId": vid,
        "format": "MP3",
        "encodeAsBase64": True,
        "modelVersion": "GEN2",
        "rate": max(-50, min(50, rate)),
        "pitch": max(-50, min(50, pitch)),
        "variation": max(0, min(5, variation)),
    }
    if style:
        payload["style"] = style

    headers = {
        "api-key": api_key,
        "accept": "application/json",
        "content-type": "application/json",
    }

    timeout = httpx.Timeout(25.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post("https://api.murf.ai/v1/speech/generate", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    encoded = (data or {}).get("encodedAudio")
    if isinstance(encoded, str) and encoded.strip():
        audio_bytes = base64.b64decode(encoded)
        if audio_bytes:
            return TTSResult(provider="murf", media_type="audio/mpeg", audio_bytes=audio_bytes)

    # Fallback: if Murf returns a URL instead of base64
    audio_url = (data or {}).get("audioFile")
    if isinstance(audio_url, str) and audio_url.strip():
        async with httpx.AsyncClient(timeout=timeout) as client:
            dl = await client.get(audio_url)
            dl.raise_for_status()
            audio_bytes = dl.content
        if audio_bytes:
            return TTSResult(provider="murf", media_type="audio/mpeg", audio_bytes=audio_bytes)

    raise RuntimeError("Murf returned no audio")
