from groq import Groq
from openai import OpenAI
import os
import logging
from typing import List, Dict, Optional, Any, Literal
import re
import json
import asyncio
import aiofiles
import httpx
from dotenv import load_dotenv
from pathlib import Path

# LangGraph — stateful agent graph for the FollowUpAgent
from typing_extensions import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# Load env vars reliably regardless of CWD.
# Preferred: repo-root/.env (single source of truth)
# Fallback: backend/.env (legacy)
_here = Path(__file__).resolve()
_backend_env = _here.parents[2] / ".env"  # backend/.env
_root_env = _here.parents[3] / ".env"  # repo-root/.env

if _root_env.exists():
    load_dotenv(dotenv_path=_root_env)
elif _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env)
else:
    load_dotenv()


# ---------------------------------------------------------------------------
# Groq clients — one per feature key so each key's rate limit is isolated.
# All 5 env vars point to separate API keys in .env; if a specific key is
# missing it falls back to GROQ_API_KEY so a single key still works.
# ---------------------------------------------------------------------------
def _groq(env_var: str) -> Groq:
    """Return a Groq client using env_var, falling back to GROQ_API_KEY."""
    key = os.getenv(env_var) or os.getenv("GROQ_API_KEY") or ""
    return Groq(api_key=key)


# Keep the legacy name alive so existing code outside this module doesn't break
groq_client = _groq("GROQ_API_KEY")  # LangGraph / FollowUpAgent / pivot
groq_client_resume = _groq(
    "GROQ_RESUME"
)  # QuestionGenerator resume, ResumeProfiler, AgenticInterviewer
groq_client_domain = _groq("GROQ_DOMAIN")  # QuestionGenerator domain
groq_client_eval = _groq("GROQ_EVALUATE")  # StrictTurnEvaluator, GroqInterviewEvaluator
groq_client_answer = _groq("GROQ_ANSWER")  # ResponseAnalyzer

# Initialize OpenAI client only if API key is available
openai_api_key = os.getenv("OPENAI_API_KEY")
openai_client = OpenAI(api_key=openai_api_key) if openai_api_key else None

# Groq model names are subject to deprecations.
# Prefer your per-feature env vars from the repo-root `.env`, and keep a safe default.
# Primary stable model as of 2025: llama-3.3-70b-versatile
# Secondary: llama3-70b-8192 (older but still active)
FALLBACK_GROQ_MODEL = "llama-3.3-70b-versatile"

_decommissioned_models = {
    "llama3-8b-8192",  # decommissioned
    "llama-3.1-8b-instant",  # user requested not to use this
    "openai/gpt-oss-120b",  # was incorrectly set as fallback; not a valid Groq model
}


def _pick_groq_model(*env_keys: str, default: str) -> str:
    for key in env_keys:
        val = (os.getenv(key) or "").strip()
        if val:
            if val.lower() in _decommissioned_models:
                continue
            return val
    return default


GROQ_MODEL_RESUME = _pick_groq_model(
    "GROQ_MODEL_RESUME", "GROQ_MODEL", default=FALLBACK_GROQ_MODEL
)
GROQ_MODEL_QUESTION = _pick_groq_model(
    "GROQ_MODEL_QUESTION", "GROQ_MODEL", default=FALLBACK_GROQ_MODEL
)
GROQ_MODEL_EVALUATE = _pick_groq_model(
    "GROQ_MODEL_EVALUATE", "GROQ_MODEL", default=FALLBACK_GROQ_MODEL
)
GROQ_MODEL_ANSWER = _pick_groq_model(
    "GROQ_MODEL_ANSWER", "GROQ_MODEL", default=FALLBACK_GROQ_MODEL
)

# Backwards-compatible default for existing calls
GROQ_DEFAULT_MODEL = GROQ_MODEL_QUESTION


class QuestionGenerator:
    """AI-powered question generation using Groq models."""

    class AIConfigError(RuntimeError):
        pass

    @staticmethod
    def _require_groq_key() -> str:
        # Accept any of the 5 dedicated keys; they all fall back to GROQ_API_KEY at client-init time.
        for env_var in (
            "GROQ_API_KEY",
            "GROQ_RESUME",
            "GROQ_DOMAIN",
            "GROQ_EVALUATE",
            "GROQ_ANSWER",
        ):
            key = (os.getenv(env_var) or "").strip()
            if key and not key.lower().startswith("your-"):
                return key
        raise QuestionGenerator.AIConfigError(
            "No Groq API key is configured. Create a repo-root .env and set GROQ_API_KEY (and optionally "
            "GROQ_RESUME, GROQ_DOMAIN, GROQ_EVALUATE, GROQ_ANSWER) to valid Groq API keys."
        )

    @staticmethod
    def _heuristic_resume_qna(resume_text: str, num_questions: int) -> List[Dict]:
        """Non-AI fallback that still derives questions from resume text.

        This avoids the appearance of hardcoded questions when AI is unavailable.
        """
        text = (resume_text or "").strip()
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

        # Try to capture meaningful lines (projects/experience bullets)
        candidate_lines = [ln for ln in lines if 25 <= len(ln) <= 160]
        if not candidate_lines:
            candidate_lines = lines[:25]

        # Extract possible skills/tech keywords
        tech_vocab = [
            "python",
            "java",
            "javascript",
            "typescript",
            "react",
            "node",
            "fastapi",
            "django",
            "sql",
            "mysql",
            "postgres",
            "mongodb",
            "redis",
            "docker",
            "kubernetes",
            "aws",
            "azure",
            "gcp",
            "git",
            "linux",
            "tensorflow",
            "pytorch",
        ]
        lower = text.lower()
        found_tech = [
            t for t in tech_vocab if re.search(r"\b" + re.escape(t) + r"\b", lower)
        ]
        found_tech = found_tech[:8]

        # Build questions
        out: List[Dict] = []
        n = max(1, min(int(num_questions), 25))

        # 1) Project/experience-driven questions
        for ln in candidate_lines:
            if len(out) >= n:
                break
            out.append(
                {
                    "question": f"In your resume you mention: '{ln}'. Can you walk me through what you did and the impact?",
                    "type": "experience",
                    "difficulty": "medium",
                    "expected_duration": "120",
                    "sample_answer": "I’ll summarize the context, my responsibilities, the key decisions I made, and the measurable outcome (metrics, time saved, accuracy, cost).",
                }
            )

        # 2) Skill/tech-driven questions
        for tech in found_tech:
            if len(out) >= n:
                break
            out.append(
                {
                    "question": f"You list {tech} on your resume. What’s one challenging problem you solved using {tech}, and how did you validate the result?",
                    "type": "technical",
                    "difficulty": "medium",
                    "expected_duration": "120",
                    "sample_answer": "I’ll describe the problem, why I chose this approach in the given stack, how I implemented it, and how I tested/validated it (benchmarks, tests, monitoring).",
                }
            )

        # 3) Fill remaining slots with structured resume-grounded prompts
        while len(out) < n:
            out.append(
                {
                    "question": "Pick one item from your resume you’re most proud of. Why was it difficult, and what did you learn?",
                    "type": "behavioral",
                    "difficulty": "easy",
                    "expected_duration": "90",
                    "sample_answer": "I’ll explain the challenge, my actions, the outcome, and a specific lesson I applied later.",
                }
            )

        return out

    @staticmethod
    def _normalize_question_text(q: str) -> str:
        q = (q or "").strip().lower()
        q = re.sub(r"\s+", " ", q)
        q = re.sub(r"[^a-z0-9 \-\?\.]", "", q)
        return q

    @staticmethod
    def _dedupe_and_fill_questions(
        items: List[Dict], resume_text: str, num_questions: int
    ) -> List[Dict]:
        """Ensure we return exactly num_questions items with unique questions.

        If the model output is short or contains repeats, we fill using heuristic resume-derived QnA.
        """
        target = max(1, min(int(num_questions), 25))

        unique: List[Dict] = []
        seen: set[str] = set()

        for item in items or []:
            if not isinstance(item, dict):
                continue
            question = item.get("question")
            if not isinstance(question, str) or not question.strip():
                continue
            norm = QuestionGenerator._normalize_question_text(question)
            if not norm or norm in seen:
                continue
            seen.add(norm)
            unique.append(item)
            if len(unique) >= target:
                break

        if len(unique) < target:
            filler = QuestionGenerator._heuristic_resume_qna(resume_text, target)
            for item in filler:
                if len(unique) >= target:
                    break
                question = item.get("question")
                norm = QuestionGenerator._normalize_question_text(question)
                if norm and norm not in seen:
                    seen.add(norm)
                    unique.append(item)

        return unique[:target]

    @staticmethod
    def _parse_json_from_model(text: str):
        """Parse JSON from model output.

        Groq/chat models sometimes wrap JSON in prose/markdown. This method
        extracts the first JSON array/object it can find.
        """
        if text is None:
            raise ValueError("Empty model output")

        raw = str(text)

        # Remove common markdown fences if present.
        # (We still keep a fallback that searches for the first JSON token.)
        if "```" in raw:
            parts = raw.split("```")
            if len(parts) >= 3:
                # Take the first fenced block content.
                raw = parts[1]
                # Strip leading language tag like "json\n"
                raw = re.sub(r"^\s*[a-zA-Z0-9_-]+\s*\n", "", raw)

        raw = raw.strip()

        # Fast path: strict JSON only.
        try:
            return json.loads(raw)
        except Exception:
            pass

        # Robust path: decode the first JSON value and ignore trailing content.
        decoder = json.JSONDecoder()

        # Find the earliest JSON start token.
        starts = [i for i in (raw.find("["), raw.find("{")) if i != -1]
        start = min(starts) if starts else -1
        if start != -1:
            candidate = raw[start:].lstrip()
            try:
                obj, _end = decoder.raw_decode(candidate)
                return obj
            except Exception:
                pass

        raise ValueError("Could not parse JSON from model output")

    @staticmethod
    async def generate_resume_questions(
        resume_text: str, num_questions: int = 10
    ) -> List[Dict]:
        """Generate interview questions based on resume content."""
        try:
            QuestionGenerator._require_groq_key()
            prompt = f"""
            Based on the following resume, generate {num_questions} relevant interview questions. 
            Focus on the candidate's experience, skills, and achievements mentioned in the resume.
            
            Resume content:
            {resume_text}
            
            Return the questions in JSON format as a list of objects with this structure:
            {{
                "question": "The interview question",
                "type": "technical|behavioral|experience",
                "difficulty": "easy|medium|hard",
                "expected_duration": "duration in seconds"
            }}
            """

            response = groq_client_resume.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert interview coach. Generate relevant, professional interview questions.",
                    },
                    {"role": "user", "content": prompt},
                ],
                model=GROQ_DEFAULT_MODEL,
                temperature=0.7,
                max_tokens=1500,
            )

            questions_text = response.choices[0].message.content
            questions = QuestionGenerator._parse_json_from_model(questions_text)
            return questions

        except QuestionGenerator.AIConfigError:
            raise
        except Exception as e:
            print(f"Error generating resume questions: {e}")
            return QuestionGenerator._heuristic_resume_qna(resume_text, num_questions)

    @staticmethod
    async def generate_resume_qna(
        resume_text: str, num_questions: int = 10
    ) -> List[Dict]:
        """Generate interview questions + sample answers based on resume content."""
        try:
            QuestionGenerator._require_groq_key()

            prompt = f"""
You are an expert interview coach.

TASK
Generate EXACTLY {num_questions} UNIQUE interview questions that are grounded in the resume content.
Questions must focus on the candidate's:
- Experience (roles, responsibilities, outcomes)
- Projects (what they built, architecture, tools, tradeoffs)
- Achievements (metrics, awards, leadership)
- Certifications (what was learned, applied knowledge)

STRICT RULES
- No repeated questions (even paraphrases). Every question must be distinct.
- Avoid generic questions like "Tell me about yourself" unless the resume is empty.
- Each question MUST reference a specific resume detail (e.g., a project name, skill, role, certification, metric, tool).
- Output MUST be valid JSON ONLY (no markdown, no commentary).
- Output MUST be a JSON array of exactly {num_questions} objects.
- Every object MUST have these keys:
  - question (string)
  - type (one of: technical, behavioral, experience)
  - difficulty (one of: easy, medium, hard)
  - expected_duration (string seconds, e.g. "120")
  - sample_answer (string; a detailed, elaborated answer — 4-6 sentences minimum — written in first person as a strong candidate. Cover what was done, how, why that approach, tools/technologies used, and the outcome or impact.)
  - resume_anchor (string; short phrase copied/summarized from resume that this question is based on)

Resume content:
{resume_text}
            """

            response = groq_client_resume.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert interview coach. Return only strict JSON as requested.",
                    },
                    {"role": "user", "content": prompt},
                ],
                model=GROQ_DEFAULT_MODEL,
                temperature=0.2,
                max_tokens=4000,
            )

            out = response.choices[0].message.content
            parsed = QuestionGenerator._parse_json_from_model(out)

            if (
                isinstance(parsed, dict)
                and "items" in parsed
                and isinstance(parsed["items"], list)
            ):
                parsed = parsed["items"]

            if not isinstance(parsed, list):
                raise ValueError("Model did not return a JSON array")

            return QuestionGenerator._dedupe_and_fill_questions(
                parsed, resume_text, num_questions
            )

        except QuestionGenerator.AIConfigError:
            raise
        except Exception as e:
            print(f"Error generating resume QnA: {e}")
            return QuestionGenerator._heuristic_resume_qna(resume_text, num_questions)

    @staticmethod
    async def generate_domain_questions(
        domain: str, num_questions: int = 10
    ) -> List[Dict]:
        """Generate interview questions based on specific domain."""
        try:
            QuestionGenerator._require_groq_key()
            prompt = f"""
            Generate {num_questions} interview questions for the {domain} domain.
            Include a mix of technical, conceptual, and practical questions.
            
            Return the questions in JSON format as a list of objects with this structure:
            {{
                "question": "The interview question",
                "type": "technical|behavioral|conceptual",
                "difficulty": "easy|medium|hard",
                "expected_duration": "duration in seconds"
            }}
            """

            response = groq_client_domain.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": f"You are an expert in {domain} interviews. Generate relevant, challenging questions.",
                    },
                    {"role": "user", "content": prompt},
                ],
                model=GROQ_DEFAULT_MODEL,
                temperature=0.7,
                max_tokens=1500,
            )

            questions_text = response.choices[0].message.content
            questions = QuestionGenerator._parse_json_from_model(questions_text)
            return questions

        except QuestionGenerator.AIConfigError:
            raise
        except Exception as e:
            print(f"Error generating domain questions: {e}")
            # Keep it domain-relevant even if AI fails
            return [
                {
                    "question": f"What are the core concepts in {domain} that you’ve worked with, and how did you apply them?",
                    "type": "conceptual",
                    "difficulty": "easy",
                    "expected_duration": "90",
                },
                {
                    "question": f"Describe a real problem you solved in {domain}. What trade-offs did you consider?",
                    "type": "technical",
                    "difficulty": "medium",
                    "expected_duration": "120",
                },
                {
                    "question": f"In {domain}, how do you evaluate if a solution is correct and production-ready?",
                    "type": "practical",
                    "difficulty": "hard",
                    "expected_duration": "150",
                },
            ][: max(1, min(int(num_questions), 3))]

    @staticmethod
    async def generate_domain_qna(domain: str, num_questions: int = 10) -> List[Dict]:
        """Generate interview questions + strong sample answers for a domain."""
        try:
            QuestionGenerator._require_groq_key()

            target = max(1, min(int(num_questions), 25))
            prompt = f"""
You are an expert interviewer for the domain: {domain}.

Generate EXACTLY {target} UNIQUE interview questions and provide a strong reference sample answer for each.

Output MUST be valid JSON ONLY (no markdown, no commentary).
Output MUST be a JSON array of exactly {target} objects.
Each object MUST contain:
  - question (string)
  - type (technical|conceptual|behavioral|practical)
  - difficulty (easy|medium|hard)
  - expected_duration (string seconds, e.g. "120")
  - sample_answer (string; a detailed, elaborated model answer — 4-6 sentences minimum — written in first person. Explain the concept clearly, give a concrete example or scenario, mention relevant tools/techniques, and describe the outcome or best practice.)
""".strip()

            response = groq_client_domain.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "Return only strict JSON. No markdown.",
                    },
                    {"role": "user", "content": prompt},
                ],
                model=GROQ_MODEL_QUESTION,
                temperature=0.2,
                max_tokens=4000,
            )

            out = response.choices[0].message.content if response.choices else ""
            parsed = QuestionGenerator._parse_json_from_model(out)
            if (
                isinstance(parsed, dict)
                and "items" in parsed
                and isinstance(parsed["items"], list)
            ):
                parsed = parsed["items"]
            if not isinstance(parsed, list):
                raise ValueError("Model did not return a JSON array")

            # Dedupe (domain-safe, no resume fallback)
            unique: List[Dict] = []
            seen: set[str] = set()
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                q = item.get("question")
                if not isinstance(q, str) or not q.strip():
                    continue
                norm = QuestionGenerator._normalize_question_text(q)
                if not norm or norm in seen:
                    continue
                seen.add(norm)
                unique.append(item)
                if len(unique) >= target:
                    break

            # If model returned too few, do one fill round via Groq
            if len(unique) < target:
                remaining = target - len(unique)
                used_block = "\n".join(f"- {it.get('question')}" for it in unique[:50])
                fill_prompt = f"""
You are an expert interviewer for the domain: {domain}.

We already have these questions (do NOT repeat or paraphrase them):
{used_block}

Generate EXACTLY {remaining} NEW UNIQUE interview questions for {domain}, each with a detailed elaborated sample answer.

Output MUST be valid JSON ONLY.
Output MUST be a JSON array of exactly {remaining} objects.
Each object MUST contain: question, type, difficulty, expected_duration, sample_answer (4-6 sentences minimum, detailed and elaborated).
                """.strip()

                fill = groq_client_domain.chat.completions.create(
                    messages=[
                        {
                            "role": "system",
                            "content": "Return only strict JSON. No markdown.",
                        },
                        {"role": "user", "content": fill_prompt},
                    ],
                    model=GROQ_MODEL_QUESTION,
                    temperature=0.2,
                    max_tokens=3500,
                )

                fill_out = fill.choices[0].message.content if fill.choices else ""
                fill_parsed = QuestionGenerator._parse_json_from_model(fill_out)
                if (
                    isinstance(fill_parsed, dict)
                    and "items" in fill_parsed
                    and isinstance(fill_parsed["items"], list)
                ):
                    fill_parsed = fill_parsed["items"]
                if isinstance(fill_parsed, list):
                    for item in fill_parsed:
                        if not isinstance(item, dict):
                            continue
                        q = item.get("question")
                        if not isinstance(q, str) or not q.strip():
                            continue
                        norm = QuestionGenerator._normalize_question_text(q)
                        if not norm or norm in seen:
                            continue
                        seen.add(norm)
                        unique.append(item)
                        if len(unique) >= target:
                            break

            return unique[:target]

        except QuestionGenerator.AIConfigError:
            raise
        except Exception as e:
            print(f"Error generating domain QnA: {e}")
            # Fallback: generate questions then attach a generic sample answer
            questions = await QuestionGenerator.generate_domain_questions(
                domain, num_questions
            )
            out: List[Dict] = []
            for q in questions:
                if not isinstance(q, dict):
                    continue
                q2 = dict(q)
                q2.setdefault(
                    "sample_answer",
                    "I will explain the concept clearly, give a real example, mention trade-offs, and describe how I would validate the solution in production.",
                )
                out.append(q2)
            return out


class GroqResumeInterviewAgent:
    """Groq-only agent to generate resume-grounded interview Q&A as strict JSON.

    This is the single path used for resume-based interview question generation.
    No OpenAI is involved.
    """

    MODEL = GROQ_MODEL_RESUME

    @staticmethod
    def _require_key() -> str:
        key = (os.getenv("GROQ_RESUME") or os.getenv("GROQ_API_KEY") or "").strip()
        if not key or key.lower().startswith("your-"):
            raise RuntimeError(
                "GROQ_RESUME (or GROQ_API_KEY) is not configured. Create a repo-root .env and set GROQ_RESUME to a valid Groq API key."
            )
        return key

    @staticmethod
    def _normalize(q: str) -> str:
        q = (q or "").strip().lower()
        q = re.sub(r"\s+", " ", q)
        q = re.sub(r"[^a-z0-9 \-\?\.]", "", q)
        return q

    @staticmethod
    def _mode_rules(mode: str) -> str:
        m = (mode or "").strip().lower() or "intermediate"
        if m == "beginner":
            return """
DIFFICULTY MODE: BEGINNER
- Aim for mostly easy questions with a few medium.
- Avoid extremely deep system design; focus on fundamentals, clear explanations, and practical basics.
- difficulty field: use only easy/medium (no hard).
- sample_answer MUST be a detailed, elaborated answer (4-6 sentences minimum). Cover what was done, how it was done, why that approach was chosen, and the outcome. Write as if a strong candidate is speaking in an interview — use first person, be specific, mention tools/technologies/decisions.
- Keep resume_anchor short (<= 12 words).
""".strip()
        if m == "expert":
            return """
DIFFICULTY MODE: EXPERT
- Aim for mostly hard questions with some medium.
- Push for depth: tradeoffs, edge cases, performance, scaling, reliability, security, and architecture decisions.
- difficulty field: use mostly hard, some medium (rarely easy).
- sample_answer MUST be a detailed, elaborated answer (5-8 sentences minimum). Cover the technical depth expected at expert level — include architecture decisions, tradeoffs, edge cases handled, metrics/results, and lessons learned. Write as if a senior engineer is answering — first person, highly specific.
- Keep resume_anchor short (<= 12 words).
""".strip()
        return """
DIFFICULTY MODE: INTERMEDIATE
- Balanced difficulty: mostly medium with a few easy/hard.
- Include some deeper follow-ups on design/tradeoffs, but keep it reasonable.
- sample_answer MUST be a detailed, elaborated answer (4-6 sentences minimum). Explain the context, the approach taken, the tools or technologies used, any challenges overcome, and the final result or impact. Write in first person as a strong interview candidate would speak.
- Keep resume_anchor short (<= 12 words).
""".strip()

    @staticmethod
    def _sanitize_items(items: List[Dict], mode: str) -> List[Dict]:
        """Normalize model output to the schema expected by the frontend/storage."""
        mode_norm = (mode or "").strip().lower() or "intermediate"
        out: List[Dict] = []
        for item in items or []:
            if not isinstance(item, dict):
                continue
            q = item.get("question")
            if not isinstance(q, str) or not q.strip():
                continue

            it = dict(item)

            # type
            t = str(it.get("type") or "experience").strip().lower()
            if t not in {"technical", "behavioral", "experience"}:
                t = "experience"
            it["type"] = t

            # difficulty
            d = str(it.get("difficulty") or "medium").strip().lower()
            if d not in {"easy", "medium", "hard"}:
                d = "medium"
            if mode_norm == "beginner" and d == "hard":
                d = "medium"
            if mode_norm == "expert" and d == "easy":
                d = "medium"
            it["difficulty"] = d

            # expected_duration (seconds as string)
            dur_raw = it.get("expected_duration")
            dur_s = "120"
            try:
                if isinstance(dur_raw, (int, float)):
                    dur_s = str(int(dur_raw))
                elif isinstance(dur_raw, str) and dur_raw.strip():
                    dur_s = str(int(float(dur_raw.strip())))
            except Exception:
                dur_s = "120"
            # Clamp 30s..600s
            try:
                dur_i = max(30, min(int(dur_s), 600))
            except Exception:
                dur_i = 120
            it["expected_duration"] = str(dur_i)

            # sample_answer + resume_anchor
            sa = it.get("sample_answer")
            if not isinstance(sa, str) or not sa.strip():
                it["sample_answer"] = (
                    "I will explain my approach, key decisions, and measurable impact, grounded in the resume detail referenced."
                )
            ra = it.get("resume_anchor")
            if not isinstance(ra, str):
                ra = ""
            it["resume_anchor"] = ra.strip()[:200]

            out.append(it)

        return out

    @staticmethod
    def _base_prompt(resume_text: str, num_questions: int, mode: str) -> str:
        return f"""
You are an expert interview coach.

{GroqResumeInterviewAgent._mode_rules(mode)}

Generate EXACTLY {num_questions} UNIQUE interview questions that are directly grounded in the resume content.
Focus on: experience, projects, achievements, and certifications.

STRICT RULES
- No repeated questions (including paraphrases).
- No generic questions like "Tell me about yourself".
- Every question MUST cite a specific resume detail.
- Output MUST be valid JSON only.
- Output MUST be a JSON array of exactly {num_questions} objects.
- Each object MUST have keys:
  - question (string)
  - type (technical|behavioral|experience)
  - difficulty (easy|medium|hard)
  - expected_duration (string seconds, e.g. "120")
  - sample_answer (string; realistic answer matching the resume)
  - resume_anchor (string; short phrase from the resume that this question is based on)

Resume content:
{resume_text}
        """.strip()

    @staticmethod
    def _fill_prompt(
        resume_text: str, remaining: int, used_questions: List[str], mode: str
    ) -> str:
        used_block = "\n".join(f"- {q}" for q in used_questions[:50])
        return f"""
You are an expert interview coach.

{GroqResumeInterviewAgent._mode_rules(mode)}

We already asked these questions (do NOT repeat or paraphrase them):
{used_block}

Generate EXACTLY {remaining} NEW UNIQUE interview questions grounded in the same resume.

Rules:
- Must be non-overlapping with the previous list.
- Must reference specific resume details.
- Output MUST be valid JSON only.
- Output MUST be a JSON array of exactly {remaining} objects.
- Each object MUST have keys: question, type, difficulty, expected_duration, sample_answer, resume_anchor.

Resume content:
{resume_text}
        """.strip()

    @staticmethod
    def _parse_json(text: str):
        return QuestionGenerator._parse_json_from_model(text)

    @staticmethod
    def _dedupe(items: List[Dict]) -> List[Dict]:
        unique: List[Dict] = []
        seen: set[str] = set()
        for item in items or []:
            if not isinstance(item, dict):
                continue
            q = item.get("question")
            if not isinstance(q, str) or not q.strip():
                continue
            norm = GroqResumeInterviewAgent._normalize(q)
            if not norm or norm in seen:
                continue
            seen.add(norm)
            unique.append(item)
        return unique

    @staticmethod
    async def generate_resume_qna(
        resume_text: str, num_questions: int, mode: str = "intermediate"
    ) -> List[Dict]:
        """Return exactly N unique questions+answers generated by Groq."""
        GroqResumeInterviewAgent._require_key()
        target = max(1, min(int(num_questions), 25))
        mode_norm = (mode or "").strip().lower() or "intermediate"

        def _create(
            messages, model_name: str, max_tokens: int, temperature: float = 0.2
        ):
            return groq_client_resume.chat.completions.create(
                messages=messages,
                model=model_name,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        def _build_messages(strict: bool) -> List[Dict[str, str]]:
            prompt = GroqResumeInterviewAgent._base_prompt(
                resume_text, target, mode=mode_norm
            )
            if strict:
                prompt = (
                    prompt
                    + "\n\nIMPORTANT:\n- Output ONLY a JSON array.\n- Do not add any text before or after the JSON.\n- Do not wrap in markdown fences.\n"
                )
            return [
                {"role": "system", "content": "Return only strict JSON. No markdown."},
                {"role": "user", "content": prompt},
            ]

        model_name = GroqResumeInterviewAgent.MODEL
        parsed: Any = None
        last_err: Optional[Exception] = None

        for attempt in range(2):
            strict = attempt == 1
            temperature = 0.2 if attempt == 0 else 0.1
            messages = _build_messages(strict)
            try:
                try:
                    response = _create(
                        messages, model_name, 4500, temperature=temperature
                    )
                except Exception as e:
                    # If Groq reports the model is decommissioned, retry once with fallback.
                    msg = str(e).lower()
                    if (
                        "decommissioned" in msg
                        or "model_decommissioned" in msg
                        or "invalid model" in msg
                        or "invalid_request_error" in msg
                    ) and model_name != GROQ_DEFAULT_MODEL:
                        response = _create(
                            messages, GROQ_DEFAULT_MODEL, 3000, temperature=temperature
                        )
                    else:
                        raise

                parsed = GroqResumeInterviewAgent._parse_json(
                    response.choices[0].message.content
                )
                if isinstance(parsed, dict):
                    # Common wrappers
                    for key in ("items", "questions", "data"):
                        if key in parsed and isinstance(parsed[key], list):
                            parsed = parsed[key]
                            break
                if not isinstance(parsed, list):
                    raise RuntimeError("Groq did not return a JSON array")
                last_err = None
                break
            except Exception as e:
                last_err = e
                continue

        if last_err is not None:
            raise last_err

        items = GroqResumeInterviewAgent._sanitize_items(
            GroqResumeInterviewAgent._dedupe(parsed), mode=mode_norm
        )

        # If not enough unique questions, do one fill round via Groq (still Groq-only)
        if len(items) < target:
            used = [
                it.get("question", "")
                for it in items
                if isinstance(it.get("question"), str)
            ]
            remaining = target - len(items)
            fill_prompt = GroqResumeInterviewAgent._fill_prompt(
                resume_text, remaining, used, mode=mode_norm
            )
            fill_messages = [
                {"role": "system", "content": "Return only strict JSON. No markdown."},
                {"role": "user", "content": fill_prompt},
            ]
            try:
                fill_response = _create(
                    fill_messages, GroqResumeInterviewAgent.MODEL, 2000, temperature=0.2
                )
            except Exception as e:
                msg = str(e).lower()
                if (
                    "decommissioned" in msg
                    or "model_decommissioned" in msg
                    or "invalid model" in msg
                    or "invalid_request_error" in msg
                ) and GroqResumeInterviewAgent.MODEL != GROQ_DEFAULT_MODEL:
                    fill_response = _create(
                        fill_messages, GROQ_DEFAULT_MODEL, 2000, temperature=0.2
                    )
                else:
                    raise
            fill_parsed = GroqResumeInterviewAgent._parse_json(
                fill_response.choices[0].message.content
            )
            if (
                isinstance(fill_parsed, dict)
                and "items" in fill_parsed
                and isinstance(fill_parsed["items"], list)
            ):
                fill_parsed = fill_parsed["items"]
            if isinstance(fill_parsed, list):
                items = GroqResumeInterviewAgent._sanitize_items(
                    GroqResumeInterviewAgent._dedupe(items + fill_parsed),
                    mode=mode_norm,
                )

        if len(items) < target:
            raise RuntimeError(
                f"Groq returned only {len(items)} unique questions, expected {target}"
            )

        return items[:target]

    @staticmethod
    def _get_fallback_questions(domain: str = "general") -> List[Dict]:
        """Fallback questions when AI generation fails."""
        fallback_questions = {
            "general": [
                {
                    "question": "Tell me about yourself and your background.",
                    "type": "behavioral",
                    "difficulty": "easy",
                    "expected_duration": "120",
                },
                {
                    "question": "What are your greatest strengths and how do they apply to this role?",
                    "type": "behavioral",
                    "difficulty": "medium",
                    "expected_duration": "90",
                },
                {
                    "question": "Describe a challenging situation you faced and how you overcame it.",
                    "type": "behavioral",
                    "difficulty": "medium",
                    "expected_duration": "150",
                },
            ],
            "software engineering": [
                {
                    "question": "Explain the difference between object-oriented and functional programming.",
                    "type": "technical",
                    "difficulty": "medium",
                    "expected_duration": "120",
                },
                {
                    "question": "How would you optimize a slow database query?",
                    "type": "technical",
                    "difficulty": "hard",
                    "expected_duration": "180",
                },
            ],
        }

        return fallback_questions.get(domain.lower(), fallback_questions["general"])


class VoiceProcessor:
    """Handle voice recognition and processing using Groq Whisper."""

    @staticmethod
    async def transcribe_audio(audio_file_path: str) -> str:
        """Transcribe audio file to text using Groq Whisper.

        Uses Groq's OpenAI-compatible endpoint: /audio/transcriptions
        """
        try:
            key = (os.getenv("GROQ_API_KEY") or "").strip()
            if not key or key.lower().startswith("your-"):
                print(
                    "Warning: GROQ_API_KEY not configured, audio transcription unavailable"
                )
                return ""

            api_base = (
                os.getenv("GROQ_API_BASE_URL") or "https://api.groq.com/openai/v1"
            ).rstrip("/")
            model = (
                os.getenv("GROQ_WHISPER_MODEL")
                or os.getenv("GROQ_AUDIO_MODEL")
                or "whisper-large-v3"
            ).strip()
            language = (os.getenv("GROQ_WHISPER_LANGUAGE") or "").strip() or None

            if not audio_file_path or not os.path.exists(audio_file_path):
                return ""

            timeout = httpx.Timeout(120.0)
            headers = {"Authorization": f"Bearer {key}"}

            # Multipart form: file + model + optional language
            with open(audio_file_path, "rb") as f:
                files = {
                    "file": (
                        os.path.basename(audio_file_path),
                        f,
                        "application/octet-stream",
                    )
                }
                data = {"model": model, "response_format": "text"}
                if language:
                    data["language"] = language

                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        f"{api_base}/audio/transcriptions",
                        headers=headers,
                        data=data,
                        files=files,
                    )

            if resp.status_code >= 400:
                print(
                    f"Groq Whisper transcription failed: {resp.status_code} {resp.text[:500]}"
                )
                return ""

            # response_format=text yields plain text body
            return (resp.text or "").strip()

        except Exception as e:
            print(f"Error transcribing audio: {e}")
            return ""

    @staticmethod
    async def analyze_speech_confidence(audio_file_path: str) -> Dict:
        """Analyze speech patterns for confidence scoring."""
        try:
            # This is a placeholder for advanced speech analysis
            # In a real implementation, you might use additional tools
            # for speech analysis like speech rate, pauses, etc.

            transcript = await VoiceProcessor.transcribe_audio(audio_file_path)

            # Basic analysis based on transcript
            word_count = len(transcript.split())
            has_filler_words = any(
                word in transcript.lower() for word in ["um", "uh", "like", "you know"]
            )

            confidence_score = min(
                100, max(0, 70 + word_count * 2 - (20 if has_filler_words else 0))
            )

            return {
                "confidence_score": confidence_score,
                "word_count": word_count,
                "has_filler_words": has_filler_words,
                "transcript": transcript,
            }

        except Exception as e:
            print(f"Error analyzing speech confidence: {e}")
            return {
                "confidence_score": 50,
                "word_count": 0,
                "has_filler_words": False,
                "transcript": "",
            }


class ResponseAnalyzer:
    """Analyze interview responses for scoring and feedback."""

    @staticmethod
    def _safe_parse_json(text: str) -> Dict[str, Any]:
        if not text:
            return {}
        t = text.strip()
        try:
            obj = json.loads(t)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            pass
        try:
            # Extract first JSON object
            m = re.search(r"\{[\s\S]*\}", t)
            if not m:
                return {}
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _num(v: Any) -> float:
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            m = re.search(r"(-?\d+(?:\.\d+)?)", v)
            return float(m.group(1)) if m else 0.0
        return 0.0

    @staticmethod
    def _as_list(v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, list):
            out: List[str] = []
            for it in v:
                if it is None:
                    continue
                s = str(it).strip()
                if s:
                    out.append(s)
            return out
        s = str(v).strip()
        return [s] if s else []

    @staticmethod
    def _heuristic_fallback(
        question: str, sample_answer: Optional[str], response: str, response_time: int
    ) -> Dict[str, Any]:
        """Deterministic fallback when Groq is unavailable.

        Uses simple length + keyword overlap heuristics (not a fixed hardcoded score).
        """
        q = (question or "").strip()
        sa = (sample_answer or "").strip()
        ans = (response or "").strip()

        # Token-ish words
        ans_words = re.findall(r"[a-zA-Z0-9]+", ans.lower())
        sa_words = re.findall(r"[a-zA-Z0-9]+", sa.lower())

        ans_len = len(ans_words)
        overlap = 0
        if sa_words and ans_words:
            sa_set = set(sa_words)
            overlap = sum(1 for w in set(ans_words) if w in sa_set)

        # Scores roughly: coverage + clarity proxy
        relevance = (
            min(100.0, max(0.0, (overlap * 8.0) + (ans_len * 0.6)))
            if sa_words
            else min(100.0, ans_len * 1.2)
        )
        communication = min(100.0, max(0.0, 40.0 + (ans_len * 0.8)))
        technical = (
            min(100.0, max(0.0, 35.0 + (overlap * 10.0)))
            if sa_words
            else min(100.0, 35.0 + (ans_len * 0.9))
        )

        strengths: List[str] = []
        improvements: List[str] = []
        if ans_len >= 40:
            strengths.append("Answer has sufficient detail")
        else:
            improvements.append("Add more detail and concrete examples")
        if sa_words and overlap >= 5:
            strengths.append("Covers key points relevant to the question")
        elif sa_words:
            improvements.append(
                "Cover more of the key points expected for this question"
            )
        if response_time and response_time > 180:
            improvements.append("Try to structure the answer to be more concise")

        overall_feedback = (
            "Good attempt." if strengths else "Response needs improvement."
        )
        if improvements:
            overall_feedback += " " + " ".join(improvements[:2])

        return {
            "technical_score": round(float(technical), 2),
            "communication_score": round(float(communication), 2),
            "relevance_score": round(float(relevance), 2),
            "strengths": strengths or ["Attempted to answer the question"],
            "improvements": improvements or ["Include specific points and examples"],
            "weaknesses": improvements or ["Include specific points and examples"],
            "overall_feedback": overall_feedback,
            "used_sample_answer": bool(sa),
        }

    @staticmethod
    async def analyze_response(
        question: str,
        response: str,
        response_time: int,
        sample_answer: Optional[str] = None,
        domain: Optional[str] = None,
    ) -> Dict:
        """Analyze a single interview response.

        If a Groq-provided sample answer exists for the question, the evaluator compares the
        candidate response against it to produce per-question feedback/strengths/weaknesses.
        """
        try:
            # Keep the prompt extremely explicit so the model returns strict JSON.
            prompt = f"""
You are an expert interview evaluator.

Evaluate the candidate's answer against the question and the reference sample answer.

Domain (optional): {domain or ""}

Question:
{question}

Reference sample answer (what an excellent answer should cover):
{sample_answer or ""}

Candidate answer:
{response}

Response time (seconds): {response_time}

Return ONLY valid JSON with this exact schema:
{{
  "technical_score": number,        // 0-100
  "communication_score": number,    // 0-100
  "relevance_score": number,        // 0-100
  "strengths": [string, ...],
  "weaknesses": [string, ...],
  "improvements": [string, ...],    // can be same as weaknesses
  "overall_feedback": string        // 1-3 sentences
}}

Rules:
- Ground everything in the candidate answer; do not invent content.
- Keep strengths/weaknesses lists short (2-5 items each).
- Scores must be numbers (not strings like "85/100").
            """.strip()

            response_obj = groq_client_answer.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "Return only strict JSON. No markdown.",
                    },
                    {"role": "user", "content": prompt},
                ],
                model=GROQ_MODEL_EVALUATE,
                temperature=0.3,
                max_tokens=1000,
            )

            analysis_text = (
                response_obj.choices[0].message.content if response_obj.choices else ""
            )
            parsed = ResponseAnalyzer._safe_parse_json(analysis_text)

            out = {
                "technical_score": ResponseAnalyzer._num(parsed.get("technical_score")),
                "communication_score": ResponseAnalyzer._num(
                    parsed.get("communication_score")
                ),
                "relevance_score": ResponseAnalyzer._num(parsed.get("relevance_score")),
                "strengths": ResponseAnalyzer._as_list(parsed.get("strengths")),
                "weaknesses": ResponseAnalyzer._as_list(parsed.get("weaknesses")),
                "improvements": ResponseAnalyzer._as_list(parsed.get("improvements")),
                "overall_feedback": str(parsed.get("overall_feedback") or "").strip(),
                "used_sample_answer": bool((sample_answer or "").strip()),
            }

            # If the model returned weaknesses but not improvements, mirror.
            if not out["improvements"] and out["weaknesses"]:
                out["improvements"] = list(out["weaknesses"])
            if not out["weaknesses"] and out["improvements"]:
                out["weaknesses"] = list(out["improvements"])

            # Clamp scores
            for k in ("technical_score", "communication_score", "relevance_score"):
                out[k] = max(0.0, min(100.0, float(out[k] or 0.0)))

            # Ensure minimal structure
            if not out["strengths"]:
                out["strengths"] = ["Attempted to answer the question"]
            if not out["improvements"]:
                out["improvements"] = ["Add more specific points and examples"]
            if not out["weaknesses"]:
                out["weaknesses"] = list(out["improvements"])
            if not out["overall_feedback"]:
                out["overall_feedback"] = (
                    "Good attempt; add more structure and specific examples."
                )

            return out

        except Exception as e:
            print(f"Error analyzing response: {e}")
            return ResponseAnalyzer._heuristic_fallback(
                question, sample_answer, response, response_time
            )


class ResumeProfiler:
    """Extract a compact structured profile from resume text (Groq + heuristic fallback)."""

    @staticmethod
    def _guess_name_from_text(resume_text: str) -> str:
        """Best-effort name extraction from the top of a resume."""
        text = (resume_text or "").strip()
        if not text:
            return ""

        try:
            for ln in [l.strip() for l in text.splitlines() if l.strip()][:15]:
                # Skip lines that look like contact info
                if (
                    "@" in ln
                    or re.search(r"\b\d{8,}\b", ln)
                    or "http" in ln.lower()
                    or "linkedin" in ln.lower()
                ):
                    continue

                # Strip non-letters and collapse whitespace
                words = re.findall(r"[A-Za-z]+", ln)
                if not (1 <= len(words) <= 5):
                    continue

                candidate = " ".join(words).strip()
                # Avoid picking headings like "SUMMARY" etc.
                if candidate.lower() in {
                    "summary",
                    "education",
                    "experience",
                    "projects",
                    "skills",
                }:
                    continue
                if len(candidate) >= 3:
                    return candidate
        except Exception:
            return ""

        return ""

    @staticmethod
    def _safe_parse_json(text: str) -> Dict[str, Any]:
        if not text:
            return {}
        t = text.strip()
        try:
            obj = json.loads(t)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            pass
        try:
            m = re.search(r"\{[\s\S]*\}", t)
            if not m:
                return {}
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _as_list(v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, list):
            out: List[str] = []
            for it in v:
                if it is None:
                    continue
                s = str(it).strip()
                if s:
                    out.append(s)
            return out
        s = str(v).strip()
        return [s] if s else []

    @staticmethod
    def _compact(profile: Dict[str, Any]) -> Dict[str, Any]:
        full_name = str(profile.get("full_name") or profile.get("name") or "").strip()
        # If the model didn't return a name, keep it empty here; caller may fill from heuristics.
        skills = ResumeProfiler._as_list(profile.get("skills"))[:30]
        strengths = ResumeProfiler._as_list(profile.get("strengths"))[:10]

        projects_in = profile.get("projects")
        projects: List[Dict[str, Any]] = []
        if isinstance(projects_in, list):
            for p in projects_in[:6]:
                if not isinstance(p, dict):
                    continue
                projects.append(
                    {
                        "name": str(p.get("name") or "").strip(),
                        "tech": ResumeProfiler._as_list(p.get("tech"))[:12],
                        "concepts": ResumeProfiler._as_list(p.get("concepts"))[:12],
                    }
                )

        internships_in = profile.get("internships") or profile.get("experience")
        internships: List[Dict[str, Any]] = []
        if isinstance(internships_in, list):
            for it in internships_in[:5]:
                if not isinstance(it, dict):
                    continue
                internships.append(
                    {
                        "company": str(
                            it.get("company") or it.get("org") or ""
                        ).strip(),
                        "role": str(it.get("role") or it.get("title") or "").strip(),
                        "tech": ResumeProfiler._as_list(it.get("tech"))[:10],
                    }
                )

        return {
            "full_name": full_name,
            "skills": skills,
            "projects": [p for p in projects if p.get("name")],
            "internships": [
                i for i in internships if i.get("company") or i.get("role")
            ],
            "strengths": strengths,
        }

    @staticmethod
    def _heuristic(resume_text: str) -> Dict[str, Any]:
        text = (resume_text or "").strip()
        lower = text.lower()

        full_name = ResumeProfiler._guess_name_from_text(text)
        tech_vocab = [
            "python",
            "java",
            "javascript",
            "typescript",
            "react",
            "node",
            "fastapi",
            "django",
            "sql",
            "mysql",
            "postgres",
            "mongodb",
            "redis",
            "docker",
            "kubernetes",
            "aws",
            "azure",
            "git",
            "linux",
            "tensorflow",
            "pytorch",
        ]
        skills = [
            t for t in tech_vocab if re.search(r"\b" + re.escape(t) + r"\b", lower)
        ][:20]

        # Naive project capture: lines that look like headings with tech nearby
        projects: List[Dict[str, Any]] = []
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        for ln in lines[:120]:
            if len(ln) > 70:
                continue
            if any(
                tok in ln.lower()
                for tok in ["project", "capstone", "system", "app", "platform"]
            ):
                projects.append({"name": ln[:60], "tech": skills[:8], "concepts": []})
                if len(projects) >= 4:
                    break

        return {
            "full_name": full_name,
            "skills": skills,
            "projects": projects,
            "internships": [],
            "strengths": [],
        }

    @staticmethod
    async def extract_profile(resume_text: str) -> Dict[str, Any]:
        try:
            QuestionGenerator._require_groq_key()

            excerpt = (resume_text or "").strip().replace("\r", "")
            if len(excerpt) > 6000:
                excerpt = excerpt[:6000]

            prompt = f"""
Extract a structured profile from the resume text below.

Return ONLY valid JSON with this exact schema:
{{
    "full_name": string,
  "skills": [string, ...],
  "projects": [{{"name": string, "tech": [string, ...], "concepts": [string, ...]}}, ...],
  "internships": [{{"company": string, "role": string, "tech": [string, ...]}}, ...],
  "strengths": [string, ...]
}}

Rules:
- Only include items supported by the resume text.
- Keep it compact.

Important:
- "full_name" must match the name printed at the top of the resume (if present).

Resume:
{excerpt}
            """.strip()

            resp = groq_client_resume.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "Return only strict JSON. No markdown.",
                    },
                    {"role": "user", "content": prompt},
                ],
                model=GROQ_MODEL_RESUME,
                temperature=0.2,
                max_tokens=1200,
            )

            raw = resp.choices[0].message.content if resp.choices else ""
            parsed = ResumeProfiler._safe_parse_json(raw)
            if not parsed:
                return ResumeProfiler._heuristic(resume_text)

            compact = ResumeProfiler._compact(parsed)
            # Ensure full_name is filled even if the model omitted it.
            if not str(compact.get("full_name") or "").strip():
                guessed = ResumeProfiler._guess_name_from_text(resume_text)
                if guessed:
                    compact["full_name"] = guessed

            return compact
        except Exception:
            logger.warning(
                "ResumeProfiler.extract_profile failed, using heuristic fallback",
                exc_info=True,
            )
            return ResumeProfiler._heuristic(resume_text)


class AgenticInterviewer:
    """Generate follow-up questions that adapt to performance.

    This is intentionally lightweight and designed to work with the existing
    Interview.questions JSON list (append-only).
    """

    @staticmethod
    def _safe_parse_json(text: str) -> Dict[str, Any]:
        if not text:
            return {}
        t = text.strip()
        try:
            obj = json.loads(t)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            pass
        try:
            m = re.search(r"\{[\s\S]*\}", t)
            if not m:
                return {}
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _clamp_difficulty(score: float) -> str:
        # Map 0-100 to easy/medium/hard
        if score >= 80:
            return "hard"
        if score >= 55:
            return "medium"
        return "easy"

    @staticmethod
    def _is_refusal(answer: str) -> bool:
        a = (answer or "").strip().lower()
        if not a:
            return True
        patterns = [
            "i will not answer",
            "i won't answer",
            "i dont want to answer",
            "i don't want to answer",
            "prefer not to answer",
            "can't answer",
            "cannot answer",
            "i don't know",
            "i dont know",
            "no comment",
            "skip",
            "pass",
        ]
        return any(p in a for p in patterns)

    @staticmethod
    def _extract_anchor(answer: str) -> str:
        """Return a short phrase from the candidate answer to anchor follow-ups.

        This is used to force the model to reference what the candidate actually said.
        """
        text = (answer or "").strip().replace("\r", " ").replace("\n", " ")
        text = re.sub(r"\s+", " ", text)
        if not text:
            return ""

        # Prefer a quoted substring if the candidate used quotes.
        m = re.search(r"['\"]([^'\"]{8,80})['\"]", text)
        if m:
            return m.group(1).strip()

        # Otherwise take the first sentence-ish chunk and cap word count.
        first = re.split(r"[\.!\?]", text, maxsplit=1)[0].strip() or text
        words = first.split(" ")
        return " ".join(words[:14]).strip()

    @staticmethod
    def _normalize_token(s: str) -> str:
        s = (s or "").strip().lower()
        s = re.sub(r"[^a-z0-9 ]+", "", s)
        s = re.sub(r"\s+", " ", s)
        return s

    @staticmethod
    def _extract_claimed_name(answer: str) -> str:
        """Extract a claimed name from common intro patterns."""
        a = (answer or "").strip()
        if not a:
            return ""
        # my name is X
        m = re.search(
            r"\bmy\s+name\s+is\s+([A-Za-z][A-Za-z\- ]{1,40})", a, flags=re.IGNORECASE
        )
        if m:
            return " ".join(re.findall(r"[A-Za-z]+", m.group(1))[:4]).strip()
        # i'm X / i am X
        m = re.search(
            r"\b(?:i\s*am|i\s*'m|im)\s+([A-Za-z][A-Za-z\- ]{1,60})",
            a,
            flags=re.IGNORECASE,
        )
        if m:
            cand = m.group(1)
            # stop at common separators
            cand = re.split(
                r"\b(at|from|and|with|working|intern|student)\b",
                cand,
                maxsplit=1,
                flags=re.IGNORECASE,
            )[0]
            # also stop if they immediately continue with filler like "I" / "my"
            cand = re.split(
                r"\b(i|my|we|our)\b", cand, maxsplit=1, flags=re.IGNORECASE
            )[0]
            words = re.findall(r"[A-Za-z]+", cand)
            # Name should be 1-3 words; avoid capturing sentences.
            return " ".join(words[:3]).strip()
        return ""

    @staticmethod
    def _extract_intern_company(answer: str) -> str:
        a = (answer or "").strip()
        if not a:
            return ""
        m = re.search(
            r"\b(?:intern(?:ship)?\s+at|interned\s+at|worked\s+at)\s+([A-Za-z0-9&\- ]{2,60})",
            a,
            flags=re.IGNORECASE,
        )
        if not m:
            return ""
        cand = m.group(1)
        cand = re.split(r"[\.,;\n]", cand, maxsplit=1)[0]
        cand = cand.strip()
        return cand[:60]

    @staticmethod
    def _heuristic_followup(
        question: str, answer: str, difficulty: str
    ) -> Dict[str, Any]:
        base = (question or "").strip()
        ans = (answer or "").strip()
        if len(ans) < 40:
            q = f"Your answer was a bit high-level. Can you explain the step-by-step approach you used for: {base}?"
        else:
            q = f"Good. Now go deeper: what edge cases, tradeoffs, or failure modes did you consider for: {base}?"
        return {
            "question": q,
            "type": "technical",
            "difficulty": difficulty,
            "expected_duration": "120",
            "sample_answer": "A strong answer explains the approach, key decisions, edge cases, and tradeoffs clearly.",
            "is_followup": True,
        }

    @staticmethod
    async def generate_next_question(
        resume_text: str,
        resume_profile: Optional[Dict[str, Any]],
        previous_question: str,
        previous_answer: str,
        previous_analysis: Dict[str, Any],
        history: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Return a single question object for appending into Interview.questions."""

        # Score-based difficulty control
        tech = float(previous_analysis.get("technical_score") or 0.0)
        comm = float(previous_analysis.get("communication_score") or 0.0)
        rel = float(previous_analysis.get("relevance_score") or 0.0)
        overall = (tech * 0.5) + (rel * 0.3) + (comm * 0.2)
        difficulty = AgenticInterviewer._clamp_difficulty(overall)

        refused = AgenticInterviewer._is_refusal(previous_answer)
        anchor = "" if refused else AgenticInterviewer._extract_anchor(previous_answer)

        # Short memory summary (avoid sending full transcripts)
        mem_strengths: List[str] = []
        mem_weaknesses: List[str] = []
        recent_qa: List[Dict[str, str]] = []
        try:
            for r in list(history or [])[-5:]:
                a = (r or {}).get("analysis") if isinstance(r, dict) else None
                if isinstance(a, dict):
                    mem_strengths += [str(s) for s in (a.get("strengths") or [])][:2]
                    mem_weaknesses += [str(w) for w in (a.get("weaknesses") or [])][:2]

                if isinstance(r, dict):
                    rq = str(r.get("question") or "").strip()
                    ra = str(r.get("answer") or "").strip()
                    if rq and ra:
                        recent_qa.append({"q": rq[:220], "a": ra[:300]})
        except Exception:
            pass

        recent_qa = recent_qa[-3:]

        resume_excerpt = (resume_text or "").strip().replace("\r", "")
        if len(resume_excerpt) > 3500:
            resume_excerpt = resume_excerpt[:3500]

        profile = resume_profile if isinstance(resume_profile, dict) else {}
        # Compact again defensively (avoid storing / sending huge payloads)
        try:
            profile = {
                "skills": list(profile.get("skills") or [])[:30],
                "projects": list(profile.get("projects") or [])[:6],
                "internships": list(profile.get("internships") or [])[:5],
                "strengths": list(profile.get("strengths") or [])[:10],
            }
        except Exception:
            profile = {}

        project_names: List[str] = []
        try:
            for p in list(profile.get("projects") or [])[:6]:
                if isinstance(p, dict):
                    name = str(p.get("name") or "").strip()
                    if name:
                        project_names.append(name)
        except Exception:
            project_names = []

        # --- Deterministic resume consistency checks (run before the LLM) ---
        # 1) Name mismatch: if resume has a full name and the candidate claims a different one, ask to clarify.
        if not refused:
            resume_name = str(profile.get("full_name") or "").strip()
            claimed_name = AgenticInterviewer._extract_claimed_name(previous_answer)
            if resume_name and claimed_name:
                rn = AgenticInterviewer._normalize_token(resume_name)
                cn = AgenticInterviewer._normalize_token(claimed_name)
                rn_first = (rn.split(" ")[:1] or [""])[0]
                cn_first = (cn.split(" ")[:1] or [""])[0]
                if rn_first and cn_first and rn_first != cn_first:
                    # Enforce the anchor inclusion requirement by quoting the claimed name.
                    return {
                        "question": f'You introduced yourself as "{claimed_name}", but your resume shows the name "{resume_name}". Can you clarify your full name as it appears on the resume, and whether you go by a different name?',
                        "type": "behavioral",
                        "difficulty": "easy",
                        "expected_duration": "90",
                        "sample_answer": "Clarify the name on the resume and explain if it's a nickname or preferred name.",
                        "is_followup": True,
                    }

            # 2) Internship/company mismatch (best-effort): if they claim an intern company not in resume, ask verification.
            claimed_company = AgenticInterviewer._extract_intern_company(
                previous_answer
            )
            if claimed_company:
                companies = []
                try:
                    for it in list(profile.get("internships") or [])[:8]:
                        if isinstance(it, dict):
                            c = str(it.get("company") or "").strip()
                            if c:
                                companies.append(c)
                except Exception:
                    companies = []

                claimed_norm = AgenticInterviewer._normalize_token(claimed_company)
                companies_norm = [
                    AgenticInterviewer._normalize_token(c) for c in companies
                ]

                in_profile = any(
                    claimed_norm and (claimed_norm in c or c in claimed_norm)
                    for c in companies_norm
                )
                in_resume_text = (
                    claimed_norm
                    and claimed_norm
                    in AgenticInterviewer._normalize_token(resume_excerpt)
                )

                if (not in_profile) and (not in_resume_text):
                    return {
                        "question": f'I heard you say you interned at "{claimed_company}". I don\'t see that on your resume. Where should it appear, and what exactly was your role and timeline there?',
                        "type": "experience",
                        "difficulty": "easy",
                        "expected_duration": "120",
                        "sample_answer": "State the exact company name, role, dates, and what you worked on; clarify if it's the same org under a different name.",
                        "is_followup": True,
                    }

        prompt = f"""
You are a strict technical interviewer.

You MUST follow these rules:
1) Your next question must be based on what the candidate just said AND grounded in the resume.
2) If the candidate refused/declined to answer, do NOT pretend they answered. Politely pivot to a different resume-grounded question.
3) If the candidate did answer, your question MUST quote an exact phrase from their answer (copy/paste) and ask them to justify/expand it.
4) Also use the resume profile: mention at least one resume project/skill and tie it to the answer.
5) Consistency check: if the candidate mentions a technology/project/claim that is not supported by the resume profile/text, ask a verification question ("I don't see X on your resume — where did you use it?") instead of digging deeper.
6) Increase difficulty if their answer was strong; simplify/clarify if weak.

Candidate refused/declined: {str(refused).lower()}
Required anchor phrase (only if not refused): "{anchor}"

Resume excerpt:
{resume_excerpt}

Resume profile JSON (authoritative):
{json.dumps(profile, ensure_ascii=False)}

Known resume project names:
{project_names}

Previous question:
{previous_question}

Candidate answer:
{previous_answer}

Recent Q/A context:
{recent_qa}

Evaluator signals (0-100):
- technical_score: {tech}
- relevance_score: {rel}
- communication_score: {comm}

Memory hints:
- strengths: {mem_strengths[:6]}
- weaknesses: {mem_weaknesses[:6]}

Return ONLY valid JSON with this schema:
{{
    "question": string,
    "type": "technical"|"behavioral"|"experience",
    "difficulty": "easy"|"medium"|"hard",
    "expected_duration": "90"|"120"|"180",
    "sample_answer": string,
    "is_followup": true
}}

Hard constraints:
- If refused=true: ask a NEW resume-grounded question.
- If refused=false: the question text must include the exact anchor phrase in double quotes.
- Every question must explicitly reference the resume (a project name or a skill from the profile).
""".strip()

        try:
            # Ensure key exists; reuse existing validation helper.
            QuestionGenerator._require_groq_key()

            resp = groq_client_resume.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "Return only strict JSON. No markdown.",
                    },
                    {"role": "user", "content": prompt},
                ],
                model=GROQ_MODEL_QUESTION,
                temperature=0.4,
                max_tokens=900,
            )

            text = resp.choices[0].message.content if resp.choices else ""
            parsed = AgenticInterviewer._safe_parse_json(text)

            q = str(parsed.get("question") or "").strip()
            if not q:
                return AgenticInterviewer._heuristic_followup(
                    previous_question, previous_answer, difficulty
                )

            out = {
                "question": q,
                "type": str(parsed.get("type") or "technical").strip() or "technical",
                "difficulty": str(parsed.get("difficulty") or difficulty).strip()
                or difficulty,
                "expected_duration": str(
                    parsed.get("expected_duration") or "120"
                ).strip()
                or "120",
                "sample_answer": str(parsed.get("sample_answer") or "").strip()
                or "A strong answer explains the key concepts, decisions, and tradeoffs.",
                "is_followup": True,
            }

            # Enforce anchor inclusion when not refused (best-effort guardrail).
            if (not refused) and anchor:
                if f'"{anchor}"' not in out["question"]:
                    # If the model ignored the instruction, fall back to deterministic follow-up.
                    return {
                        "question": f'You said "{anchor}". Explain exactly what you mean by that, and how you implemented it.',
                        "type": "technical",
                        "difficulty": difficulty,
                        "expected_duration": "120",
                        "sample_answer": "A strong answer defines the term, describes the implementation, and covers tradeoffs/edge cases.",
                        "is_followup": True,
                    }

            if out["difficulty"] not in {"easy", "medium", "hard"}:
                out["difficulty"] = difficulty
            if out["type"] not in {"technical", "behavioral", "experience"}:
                out["type"] = "technical"
            if out["expected_duration"] not in {"90", "120", "180"}:
                out["expected_duration"] = "120"

            return out
        except Exception:
            logger.warning(
                "AgenticInterviewer.generate_next_question failed, using heuristic fallback",
                exc_info=True,
            )
            # If refused, pivot instead of following up.
            if refused:
                return {
                    "question": "No problem—let’s move on. Pick one project from your resume and explain the architecture, your role, and the hardest tradeoff you faced.",
                    "type": "experience",
                    "difficulty": "easy",
                    "expected_duration": "120",
                    "sample_answer": "A strong answer covers requirements, components, data flow, your contributions, and tradeoffs with evidence/metrics.",
                    "is_followup": False,
                }
            return AgenticInterviewer._heuristic_followup(
                previous_question, previous_answer, difficulty
            )


class StrictTurnEvaluator:
    """Strict evaluator that produces depth/correctness/clarity and next_action.

    This is used only for orchestration. It is NOT exposed to the UI.
    """

    @staticmethod
    def _safe_parse_json(text: str) -> Dict[str, Any]:
        if not text:
            return {}
        t = text.strip()
        try:
            obj = json.loads(t)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            pass
        try:
            m = re.search(r"\{[\s\S]*\}", t)
            if not m:
                return {}
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _clamp_1_10(v: Any, default: int = 5) -> int:
        try:
            n = int(float(v))
        except Exception:
            n = default
        return max(1, min(10, n))

    @staticmethod
    def _as_list(v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, list):
            out: List[str] = []
            for it in v:
                if it is None:
                    continue
                s = str(it).strip()
                if s:
                    out.append(s)
            return out
        s = str(v).strip()
        return [s] if s else []

    @staticmethod
    async def evaluate(
        resume_profile: Dict[str, Any],
        question: str,
        answer: str,
        history: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        # Compact context for the model
        rp = resume_profile if isinstance(resume_profile, dict) else {}
        rp = {
            "skills": list(rp.get("skills") or [])[:30],
            "projects": list(rp.get("projects") or [])[:6],
            "internships": list(rp.get("internships") or [])[:5],
        }

        recent = []
        for r in list(history or [])[-3:]:
            if isinstance(r, dict):
                q = str(r.get("question") or "").strip()
                a = str(r.get("answer") or "").strip()
                if q and a:
                    recent.append({"q": q[:200], "a": a[:250]})

        prompt = f"""
You are a strict technical interviewer AI used for placement and SDE interviews.

You are evaluating the candidate's answer using ONLY resume data in the provided resume JSON. If the answer references things not present in the resume JSON, mark correctness lower and list it in missing_points.

Resume JSON:
{json.dumps(rp, ensure_ascii=False)}

Conversation history (recent):
{recent}

Question:
{question}

Candidate answer:
{answer}

Return ONLY valid JSON with this exact schema:
{{
  "depth": 1-10,
  "correctness": 1-10,
  "clarity": 1-10,
  "missing_points": [string, ...],
  "next_action": "deepen" | "simplify" | "move_harder" | "change_topic"
}}

Rules:
- Be strict. If the answer is vague, depth must be <=4.
- If the answer is wrong or contradicts resume, correctness must be <=4.
- next_action:
  - deepen: shallow/hand-wavy on same topic
  - simplify: wrong/confused on same topic
  - move_harder: strong answer on same topic
  - change_topic: topic exhausted OR candidate refused repeatedly
""".strip()

        try:
            QuestionGenerator._require_groq_key()
            resp = groq_client_eval.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "Return only strict JSON. No markdown.",
                    },
                    {"role": "user", "content": prompt},
                ],
                model=GROQ_MODEL_EVALUATE,
                temperature=0.2,
                max_tokens=700,
            )

            raw = resp.choices[0].message.content if resp.choices else ""
            parsed = StrictTurnEvaluator._safe_parse_json(raw)
            out = {
                "depth": StrictTurnEvaluator._clamp_1_10(parsed.get("depth"), 5),
                "correctness": StrictTurnEvaluator._clamp_1_10(
                    parsed.get("correctness"), 5
                ),
                "clarity": StrictTurnEvaluator._clamp_1_10(parsed.get("clarity"), 5),
                "missing_points": StrictTurnEvaluator._as_list(
                    parsed.get("missing_points")
                )[:8],
                "next_action": str(parsed.get("next_action") or "deepen").strip()
                or "deepen",
            }
            if out["next_action"] not in {
                "deepen",
                "simplify",
                "move_harder",
                "change_topic",
            }:
                out["next_action"] = "deepen"
            return out
        except Exception:
            logger.warning(
                "StrictTurnEvaluator.evaluate failed, using heuristic fallback",
                exc_info=True,
            )
            # Heuristic fallback
            a = (answer or "").strip()
            shallow = len(a.split()) < 25
            return {
                "depth": 3 if shallow else 5,
                "correctness": 5,
                "clarity": 5,
                "missing_points": ["Answer did not cover implementation details"]
                if shallow
                else [],
                "next_action": "deepen" if shallow else "move_harder",
            }


class ResumeGroundedInterviewAgent:
    """Resume-grounded interviewer brain.

    Produces next question objects compatible with Interview.questions storage.
    """

    @staticmethod
    def _pick_strongest_project(
        resume_profile: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        projects = list((resume_profile or {}).get("projects") or [])
        best = None
        best_score = -1
        for p in projects:
            if not isinstance(p, dict):
                continue
            name = str(p.get("name") or "").strip()
            if not name:
                continue
            tech = p.get("tech") or []
            concepts = p.get("concepts") or []
            score = len(tech) * 2 + len(concepts) * 3 + min(20, len(name))
            if score > best_score:
                best_score = score
                best = p
        return best

    @staticmethod
    def first_question(
        resume_profile: Dict[str, Any],
        time_limit_minutes: int,
        mode: str = "intermediate",
    ) -> Dict[str, Any]:
        proj = (
            ResumeGroundedInterviewAgent._pick_strongest_project(resume_profile) or {}
        )
        pname = str(proj.get("name") or "").strip() or "one of your projects"
        tech = ", ".join([str(t) for t in (proj.get("tech") or [])][:6])
        tech_part = f" using {tech}" if tech else ""

        m = (mode or "").strip().lower() or "intermediate"
        if m == "beginner":
            question = f"Let’s start with your project: {pname}{tech_part}. In simple terms, what problem does it solve, what did you build, and what was your role? Then explain one key technical decision you made and why."
            difficulty = "easy"
            expected_duration = "150"
        elif m == "expert":
            question = f"Let’s start with your strongest project: {pname}{tech_part}. Walk me through the architecture end-to-end (components, data flow), then propose how you’d scale it 10x (bottlenecks, caching, DB/indexing, reliability). Finally, defend the hardest tradeoff you made."
            difficulty = "hard"
            expected_duration = "240"
        else:
            question = f"Let’s start with your strongest project: {pname}{tech_part}. Walk me through the architecture end-to-end (components, data flow), then tell me the single hardest technical tradeoff you made and why."
            difficulty = "medium"
            expected_duration = "180"

        return {
            "question": question,
            "type": "experience",
            "difficulty": difficulty,
            "expected_duration": expected_duration,
            "sample_answer": "Cover requirements, architecture, key components, data flow, your role, tradeoffs, and measurable impact.",
            "is_followup": False,
            "followups_enabled": True,
            "max_questions": 25,
            "time_limit_minutes": max(5, min(int(time_limit_minutes), 120)),
            "resume_profile": resume_profile,
            "topic": {"kind": "project", "name": pname},
        }

    @staticmethod
    async def next_question(
        resume_text: str,
        resume_profile: Dict[str, Any],
        previous_question: str,
        previous_answer: str,
        strict_eval: Dict[str, Any],
        history: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        # Delegate to AgenticInterviewer for guardrails (refusal, anchor quoting, name/company checks)
        # but enforce the “FAANG style” rules in the prompt via strict_eval + resume_profile.
        next_action = (
            str((strict_eval or {}).get("next_action") or "deepen").strip() or "deepen"
        )

        # If changing topic, force a resume-grounded new project/skill question.
        if next_action == "change_topic":
            return {
                "question": "Let’s switch topics. Pick another project from your resume (not the one we just discussed) and explain the toughest bug or failure you hit, and how you diagnosed it.",
                "type": "experience",
                "difficulty": "medium",
                "expected_duration": "120",
                "sample_answer": "Explain the symptom, root cause analysis, tools/metrics used, fix, and how you prevented regression.",
                "is_followup": False,
            }

        # For deepen/simplify/move_harder, ask a strict follow-up on the same topic.
        return await AgenticInterviewer.generate_next_question(
            resume_text=resume_text,
            resume_profile=resume_profile,
            previous_question=previous_question,
            previous_answer=previous_answer,
            previous_analysis={
                # Map 1-10 back to 0-100-ish signals for difficulty control
                "technical_score": float((strict_eval or {}).get("correctness") or 5)
                * 10.0,
                "relevance_score": float((strict_eval or {}).get("depth") or 5) * 10.0,
                "communication_score": float((strict_eval or {}).get("clarity") or 5)
                * 10.0,
            },
            history=history,
        )


# ---------------------------------------------------------------------------
# LangGraph Interview Agent
# ---------------------------------------------------------------------------
# State that flows through every node of the graph.
# `messages` uses LangGraph's built-in reducer so each node can append
# messages and the graph accumulates a proper conversation thread.
# ---------------------------------------------------------------------------


class _AgentState(TypedDict):
    # Full LangChain message thread (system + human turns the agent sees)
    messages: Annotated[List, add_messages]
    # Raw interview context passed in at graph entry
    interview_type: str
    domain: Optional[str]
    resume_profile: Optional[Dict[str, Any]]
    conversation_history: List[Dict[str, Any]]
    current_question: str
    current_answer: str
    current_analysis: Dict[str, Any]
    questions_answered: int
    max_questions: int
    # How many consecutive shallow/incorrect verdicts on the current topic chain
    consecutive_struggles: int
    # Outputs written by the nodes as the graph executes
    evaluation: Optional[Dict[str, Any]]  # filled by evaluate_node
    follow_up_decision: Optional[Dict[str, Any]]  # filled by decide_node
    follow_up_question: Optional[Dict[str, Any]]  # filled by generate_node


# ---------------------------------------------------------------------------
# LangGraph tools — these are what the agent "calls" internally.
# They are bound to the LLM so the model can invoke them via tool-calling.
# ---------------------------------------------------------------------------


@tool
def evaluate_answer(
    depth: int,
    correctness: int,
    clarity: int,
    coverage_gaps: List[str],
    verdict: Literal["shallow", "incorrect", "adequate", "strong"],
) -> str:
    """
    Evaluate the candidate's answer on four axes and return a structured verdict.

    Args:
        depth: How deep the answer went (1-10).
        correctness: Factual accuracy (1-10).
        clarity: How clearly it was communicated (1-10).
        coverage_gaps: Key points the candidate missed.
        verdict: Overall quality — shallow / incorrect / adequate / strong.
    """
    return json.dumps(
        {
            "depth": depth,
            "correctness": correctness,
            "clarity": clarity,
            "coverage_gaps": coverage_gaps,
            "verdict": verdict,
        }
    )


@tool
def decide_follow_up(
    should_follow_up: bool,
    follow_up_type: Literal[
        "clarification", "deep_dive", "edge_case", "challenge", "change_topic"
    ],
    rationale: str,
) -> str:
    """
    Decide whether to ask a follow-up question and what kind.

    Args:
        should_follow_up: True if a follow-up is warranted.
        follow_up_type: The strategy the interviewer should apply next.
        rationale: One sentence explaining why this follow-up type was chosen.
    """
    return json.dumps(
        {
            "should_follow_up": should_follow_up,
            "follow_up_type": follow_up_type,
            "rationale": rationale,
        }
    )


@tool
def generate_question(
    question: str,
    question_type: Literal["technical", "behavioral", "experience"],
    difficulty: Literal["easy", "medium", "hard"],
    sample_answer: str,
) -> str:
    """
    Generate the actual follow-up question to ask the candidate.

    Args:
        question: The follow-up question text.
        question_type: Category of question.
        difficulty: Expected difficulty level.
        sample_answer: A 1-2 sentence hint describing an ideal answer.
    """
    return json.dumps(
        {
            "question": question,
            "type": question_type,
            "difficulty": difficulty,
            "expected_duration": "120",
            "sample_answer": sample_answer,
            "is_followup": True,
        }
    )


# ---------------------------------------------------------------------------
# FollowUpAgent — the public interface, backed by a LangGraph StateGraph.
# ---------------------------------------------------------------------------


class FollowUpAgent:
    """
    LangGraph-powered interview agent.

    Architecture (three nodes wired into a StateGraph):

        [evaluate_node]  →  [decide_node]  →  [generate_node]  →  END
              ↑                    |
              |           (skip if no follow-up)
              └────────────────────┘

    Each node is an LLM call with tool-binding:
      • evaluate_node  — ChatGroq bound to `evaluate_answer` tool
      • decide_node    — ChatGroq bound to `decide_follow_up` tool
      • generate_node  — ChatGroq bound to `generate_question` tool

    The graph state (_AgentState) flows from node to node and accumulates
    the full message thread, so each node sees everything the previous ones said.
    No manual if-else strategy logic anywhere — the LLM decides.
    """

    # One shared graph compiled once at class level.
    _graph = None

    # ---------------------------------------------------------------------------
    # Graph construction
    # ---------------------------------------------------------------------------

    @classmethod
    def _get_graph(cls):
        if cls._graph is not None:
            return cls._graph

        api_key = os.getenv("GROQ_API_KEY", "")
        llm = ChatGroq(
            api_key=api_key,
            model=GROQ_MODEL_QUESTION,
            temperature=0.4,
            max_tokens=800,
        )

        # Bind each tool to a dedicated LLM instance so the model is forced
        # to use exactly the right tool at each node.
        eval_llm = llm.bind_tools([evaluate_answer], tool_choice="evaluate_answer")
        decide_llm = llm.bind_tools([decide_follow_up], tool_choice="decide_follow_up")
        gen_llm = llm.bind_tools([generate_question], tool_choice="generate_question")

        # ------------------------------------------------------------------ #
        # Node 1: Evaluate the candidate's answer                             #
        # ------------------------------------------------------------------ #
        def evaluate_node(state: _AgentState) -> Dict:
            history_block = _fmt_history(state["conversation_history"])
            context_block = _fmt_context(
                state["interview_type"],
                state["domain"],
                state["resume_profile"],
            )
            system = SystemMessage(
                content=(
                    "You are a strict technical interview evaluator. "
                    "You MUST call the evaluate_answer tool. "
                    "Do not output any prose — only the tool call."
                )
            )
            human = HumanMessage(
                content=(
                    f"{context_block}\n\n"
                    f"=== CONVERSATION HISTORY ===\n{history_block}\n\n"
                    f"=== CURRENT Q&A ===\n"
                    f"Question: {state['current_question']}\n"
                    f"Answer:   {state['current_answer']}\n\n"
                    "Evaluate this answer using the evaluate_answer tool."
                )
            )
            response = eval_llm.invoke([system, human])
            evaluation = _parse_tool_result(response, "evaluate_answer")
            return {
                "messages": [human, response],
                "evaluation": evaluation,
            }

        # ------------------------------------------------------------------ #
        # Node 2: Decide whether and what kind of follow-up to ask            #
        # ------------------------------------------------------------------ #
        def decide_node(state: _AgentState) -> Dict:
            eval_json = json.dumps(state.get("evaluation") or {})
            budget_left = state["max_questions"] - state["questions_answered"]
            consecutive_struggles = state.get("consecutive_struggles", 0)
            verdict = (state.get("evaluation") or {}).get("verdict", "adequate")
            system = SystemMessage(
                content=(
                    "You are an expert interview strategist. "
                    "You MUST call the decide_follow_up tool. "
                    "Do not output any prose — only the tool call.\n\n"
                    "FOLLOW THIS POLICY STRICTLY — do not deviate:\n"
                    "1. If consecutive_struggles >= 2 → should_follow_up = False. HARD STOP. The candidate has struggled twice in a row; the next question will pivot to a new topic automatically.\n"
                    "2. If budget_left <= 1 → should_follow_up = False.\n"
                    "3. If verdict = 'strong' → should_follow_up = True, follow_up_type = 'deep_dive'. They answered well; probe deeper on a specific detail they mentioned or explore an advanced aspect of the same topic.\n"
                    "4. If verdict = 'adequate' → should_follow_up = True, follow_up_type = 'edge_case'. They gave a solid answer; explore an edge case or a nuanced aspect they did not mention.\n"
                    "5. If verdict = 'shallow' → should_follow_up = True, follow_up_type = 'clarification'. Help them elaborate with a gentle open-ended follow-up.\n"
                    "6. If verdict = 'incorrect' → should_follow_up = True, follow_up_type = 'clarification'. One gentle clarification to see if they partially understand — do NOT challenge them harshly.\n"
                    "7. 'change_topic' is ONLY allowed when consecutive_struggles >= 2 (but rule 1 already returns False in that case — effectively never use change_topic).\n"
                    "The goal is a dynamic interview that digs into what the candidate knows — not a static list of unrelated questions."
                )
            )
            human = HumanMessage(
                content=(
                    f"Evaluation result: {eval_json}\n"
                    f"Verdict: {verdict}\n"
                    f"Consecutive struggles on this topic: {consecutive_struggles}\n"
                    f"Questions answered so far: {state['questions_answered']}\n"
                    f"Remaining budget: {budget_left} question(s)\n\n"
                    "Apply the policy above and call decide_follow_up."
                )
            )
            all_msgs = list(state.get("messages") or []) + [system, human]
            response = decide_llm.invoke(all_msgs)
            decision = _parse_tool_result(response, "decide_follow_up")
            return {
                "messages": [human, response],
                "follow_up_decision": decision,
            }

        # ------------------------------------------------------------------ #
        # Node 3: Generate the actual follow-up question                       #
        # ------------------------------------------------------------------ #
        def generate_node(state: _AgentState) -> Dict:
            decision = state.get("follow_up_decision") or {}
            follow_up_type = decision.get("follow_up_type", "deep_dive")
            rationale = decision.get("rationale", "")
            verdict = (state.get("evaluation") or {}).get("verdict", "adequate")
            context_block = _fmt_context(
                state["interview_type"],
                state["domain"],
                state["resume_profile"],
            )
            # Tone guidance based on how the candidate is doing
            if follow_up_type == "clarification" and verdict in (
                "incorrect",
                "shallow",
            ):
                tone_instruction = (
                    "The candidate struggled with this. Ask a GENTLE, open-ended clarification — "
                    "give them a chance to share what they do know. "
                    "Do NOT make it feel like a trick or a challenge. "
                    "Example style: 'Could you walk me through what you understand about X?' "
                    "or 'What aspects of this are you most familiar with?'"
                )
            elif follow_up_type in ("edge_case", "change_topic"):
                tone_instruction = (
                    "The candidate gave an adequate answer. Pivot naturally — "
                    "either explore an edge case or move to a related but distinct concept. "
                    "Keep the tone conversational, not interrogative."
                )
            else:
                tone_instruction = "Generate a sharp, specific follow-up that references what the candidate said."
            system = SystemMessage(
                content=(
                    "You are a world-class technical interviewer. "
                    "You MUST call the generate_question tool. "
                    "Do not output any prose — only the tool call."
                )
            )
            human = HumanMessage(
                content=(
                    f"{context_block}\n\n"
                    f"Follow-up strategy: {follow_up_type}\n"
                    f"Rationale: {rationale}\n"
                    f"Tone instruction: {tone_instruction}\n\n"
                    f'The candidate just answered: "{state["current_answer"]}"\n\n'
                    "Call generate_question now."
                )
            )
            all_msgs = list(state.get("messages") or []) + [system, human]
            response = gen_llm.invoke(all_msgs)
            question_obj = _parse_tool_result(response, "generate_question")
            if question_obj and decision.get("follow_up_type"):
                question_obj["follow_up_type"] = decision["follow_up_type"]
            return {
                "messages": [human, response],
                "follow_up_question": question_obj,
            }

        # ------------------------------------------------------------------ #
        # Routing: skip generate_node if the agent decided no follow-up       #
        # ------------------------------------------------------------------ #
        def should_generate(state: _AgentState) -> str:
            decision = state.get("follow_up_decision") or {}
            if decision.get("should_follow_up"):
                return "generate"
            return END

        # ------------------------------------------------------------------ #
        # Wire the graph                                                       #
        # ------------------------------------------------------------------ #
        graph = StateGraph(_AgentState)
        graph.add_node("evaluate", evaluate_node)
        graph.add_node("decide", decide_node)
        graph.add_node("generate", generate_node)

        graph.set_entry_point("evaluate")
        graph.add_edge("evaluate", "decide")
        graph.add_conditional_edges(
            "decide",
            should_generate,
            {
                "generate": "generate",
                END: END,
            },
        )
        graph.add_edge("generate", END)

        cls._graph = graph.compile()
        return cls._graph

    # ---------------------------------------------------------------------------
    # Public async entry point — called from students.py submit-answer
    # ---------------------------------------------------------------------------

    @staticmethod
    async def decide(
        interview_type: str,
        domain: Optional[str],
        resume_profile: Optional[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
        current_question: str,
        current_answer: str,
        current_analysis: Dict[str, Any],
        questions_answered: int,
        max_questions: int,
    ) -> Dict[str, Any]:
        """
        Run the LangGraph agent and return:
        {
          "should_follow_up": bool,
          "follow_up_type":   str | None,
          "follow_up_question": { question, type, difficulty, ... } | None,
          "reasoning": str,
        }
        """
        if questions_answered >= max_questions:
            return _no_followup("Budget exhausted.")

        try:
            graph = FollowUpAgent._get_graph()

            # Count how many consecutive shallow/incorrect answers the candidate
            # has given at the tail of the conversation history (including current).
            consecutive_struggles = _count_consecutive_struggles(
                conversation_history, current_analysis
            )

            initial_state: _AgentState = {
                "messages": [],
                "interview_type": interview_type,
                "domain": domain,
                "resume_profile": resume_profile,
                "conversation_history": conversation_history,
                "current_question": current_question,
                "current_answer": current_answer,
                "current_analysis": current_analysis,
                "questions_answered": questions_answered,
                "max_questions": max_questions,
                "consecutive_struggles": consecutive_struggles,
                "evaluation": None,
                "follow_up_decision": None,
                "follow_up_question": None,
            }
            # LangGraph .invoke() is sync; run it in a thread pool so we don't
            # block FastAPI's async event loop.
            final_state = await asyncio.get_event_loop().run_in_executor(
                None, graph.invoke, initial_state
            )

            decision = final_state.get("follow_up_decision") or {}
            evaluation = final_state.get("evaluation") or {}
            fq = final_state.get("follow_up_question")

            should_follow_up = bool(decision.get("should_follow_up"))
            follow_up_type = (
                decision.get("follow_up_type") if should_follow_up else None
            )
            reasoning = (
                f"Eval → depth:{evaluation.get('depth')} correct:{evaluation.get('correctness')} "
                f"clarity:{evaluation.get('clarity')} verdict:{evaluation.get('verdict')} | "
                f"Decision → {decision.get('rationale', '')}"
            )

            return {
                "should_follow_up": should_follow_up,
                "follow_up_type": follow_up_type,
                "follow_up_question": fq if should_follow_up else None,
                "reasoning": reasoning,
            }

        except Exception as exc:
            logger.warning("FollowUpAgent graph execution failed: %s", exc)
            return _no_followup(f"Graph error: {exc}")


# ---------------------------------------------------------------------------
# Private helpers used by the graph nodes
# ---------------------------------------------------------------------------


def _no_followup(reason: str) -> Dict[str, Any]:
    return {
        "should_follow_up": False,
        "follow_up_type": None,
        "follow_up_question": None,
        "reasoning": reason,
    }


async def generate_pivot_question(
    interview_type: str,
    domain: Optional[str],
    resume_profile: Optional[Dict[str, Any]],
    conversation_history: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Generate a fresh question on a completely NEW topic, used when the candidate
    has struggled 2+ times in a row and the interview must move on.

    First tries the GROQ LLM for a personalised question; if that fails (e.g.
    rate-limit), falls back to a curated static bank so the interview never ends
    abruptly due to an API error.

    Returns a question dict compatible with the interview.questions schema,
    or None on total failure.
    """
    # Collect topics already covered so we can avoid repeating them
    covered_questions = set()
    for turn in list(conversation_history or []):
        q = str(turn.get("question") or "").strip().lower()
        if q:
            covered_questions.add(q[:80])

    # ------------------------------------------------------------------ #
    # Attempt 1: LLM-generated personalised pivot question                #
    # ------------------------------------------------------------------ #
    try:
        api_key = os.getenv("GROQ_API_KEY", "")
        llm = ChatGroq(
            api_key=api_key,
            model=GROQ_MODEL_QUESTION,
            temperature=0.5,
            max_tokens=600,
            max_retries=0,  # no retries — fail fast, fall back to static bank
        )
        pivot_llm = llm.bind_tools([generate_question], tool_choice="generate_question")

        covered_block = (
            "\n".join(f"- {q}" for q in list(covered_questions)[:10])
            if covered_questions
            else "None yet."
        )
        context_block = _fmt_context(interview_type, domain, resume_profile)

        system = SystemMessage(
            content=(
                "You are a professional technical interviewer. "
                "You MUST call the generate_question tool. "
                "Do not output any prose — only the tool call."
            )
        )
        human = HumanMessage(
            content=(
                f"{context_block}\n\n"
                f"=== TOPICS ALREADY COVERED (do NOT repeat these) ===\n{covered_block}\n\n"
                "The candidate struggled with the previous topic. "
                "Move on completely — pick a DIFFERENT topic from the candidate's background. "
                "For RESUME_BASED: pick a different project, skill, or internship. "
                "For DOMAIN_BASED: pick a different concept within the domain. "
                "Ask a clear, fresh question at medium difficulty. "
                "Call generate_question now."
            )
        )

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, pivot_llm.invoke, [system, human])
        question_obj = _parse_tool_result(response, "generate_question")
        if question_obj and question_obj.get("question"):
            question_obj["is_followup"] = False
            question_obj["follow_up_type"] = "change_topic"
            logger.info("generate_pivot_question: LLM generated pivot OK")
            return question_obj

    except Exception as exc:
        logger.warning(
            "generate_pivot_question LLM call failed: %s — falling back to static bank",
            exc,
        )

    # ------------------------------------------------------------------ #
    # Attempt 2: Static fallback bank — always works, no API needed       #
    # ------------------------------------------------------------------ #
    return _static_pivot_question(
        interview_type, domain, resume_profile, covered_questions
    )


def _static_pivot_question(
    interview_type: str,
    domain: Optional[str],
    resume_profile: Optional[Dict[str, Any]],
    covered_questions: set,
) -> Optional[Dict[str, Any]]:
    """
    Return a question from a curated static bank when the LLM is unavailable.
    Tries to personalise using resume_profile if available, otherwise uses
    domain/generic fallbacks. Skips questions whose text appears in covered_questions.
    """
    import random

    def _make(
        question: str,
        qtype: str = "technical",
        difficulty: str = "medium",
        sample: str = "",
    ) -> Dict[str, Any]:
        return {
            "question": question,
            "type": qtype,
            "difficulty": difficulty,
            "expected_duration": "120",
            "sample_answer": sample,
            "is_followup": False,
            "follow_up_type": "change_topic",
        }

    candidates: List[Dict[str, Any]] = []

    # --- Resume-personalised questions ---
    rp = resume_profile or {}
    projects = [p for p in list(rp.get("projects") or []) if isinstance(p, dict)]
    skills = list(rp.get("skills") or [])
    internships = [i for i in list(rp.get("internships") or []) if isinstance(i, dict)]

    for proj in projects:
        name = proj.get("name", "your project")
        tech = ", ".join(list(proj.get("tech") or [])[:4]) or "the tech stack"
        candidates.append(
            _make(
                f"For your {name} project, explain how you structured the data layer and why you chose {tech}.",
                sample=f"Discuss schema design, storage choices, and tradeoffs specific to {name}.",
            )
        )
        candidates.append(
            _make(
                f"What was the biggest scalability challenge in {name} and how did you address it?",
                sample=f"Talk about bottlenecks, load, and the solutions implemented in {name}.",
            )
        )
        candidates.append(
            _make(
                f"Walk me through how you would write unit tests for the core logic of {name}.",
                qtype="technical",
                difficulty="medium",
                sample="Describe test cases, mocking strategy, and coverage goals.",
            )
        )

    for skill in skills[:6]:
        candidates.append(
            _make(
                f"Explain a real scenario where you applied {skill} and what you learned from it.",
                sample=f"Describe a concrete use case, challenges, and outcome using {skill}.",
            )
        )

    for intern in internships[:2]:
        company = intern.get("company", "your internship")
        role = intern.get("role", "your role")
        candidates.append(
            _make(
                f"At {company} as {role}, what was the most impactful contribution you made and how did you measure it?",
                qtype="experience",
                sample="Describe the problem, your solution, and a quantifiable outcome.",
            )
        )

    # --- Domain-based fallbacks ---
    domain_lower = (domain or "").lower()
    if (
        "machine learning" in domain_lower
        or "ml" in domain_lower
        or "ai" in domain_lower
    ):
        candidates += [
            _make(
                "Explain the bias-variance tradeoff and how you handle it in practice.",
                sample="Discuss underfitting, overfitting, and regularisation techniques.",
            ),
            _make(
                "How would you detect and handle data drift in a production ML model?",
                sample="Talk about monitoring, retraining triggers, and evaluation metrics.",
            ),
            _make(
                "Compare supervised and unsupervised learning with a real use case for each.",
                sample="Give concrete examples and explain when to choose which approach.",
            ),
        ]
    elif (
        "web" in domain_lower or "frontend" in domain_lower or "backend" in domain_lower
    ):
        candidates += [
            _make(
                "Explain REST vs GraphQL — when would you choose one over the other?",
                sample="Discuss data fetching patterns, over-fetching, and use case fit.",
            ),
            _make(
                "How do you handle authentication and session management securely in a web app?",
                sample="Cover JWT, refresh tokens, HTTPS, and CSRF protection.",
            ),
            _make(
                "Describe how you would optimise a slow database query in a production system.",
                sample="Talk about indexing, query plans, caching, and connection pooling.",
            ),
        ]
    elif "data" in domain_lower:
        candidates += [
            _make(
                "Explain the difference between OLTP and OLAP systems and when to use each.",
                sample="Discuss transactional vs analytical workloads and schema design differences.",
            ),
            _make(
                "How would you design a data pipeline to process 1 million records per hour?",
                sample="Cover ingestion, transformation, storage, and monitoring.",
            ),
        ]

    # --- Generic fallbacks (always available) ---
    candidates += [
        _make(
            "Describe a time you had to debug a production issue under pressure. What was your process?",
            qtype="behavioral",
            sample="Explain the problem, your debugging approach, and what you fixed.",
        ),
        _make(
            "How do you approach learning a new technology or framework quickly?",
            qtype="behavioral",
            sample="Describe your learning strategy with a concrete recent example.",
        ),
        _make(
            "Explain the CAP theorem and give an example of a system that prioritises each combination.",
            sample="Cover consistency, availability, partition tolerance with real databases as examples.",
        ),
        _make(
            "What is the difference between horizontal and vertical scaling? When would you use each?",
            sample="Discuss cost, complexity, and real-world trade-offs.",
        ),
        _make(
            "How do you ensure code quality in a team environment?",
            qtype="behavioral",
            sample="Mention code reviews, testing strategies, linting, and CI/CD.",
        ),
        _make(
            "Explain how you would design a URL shortener like bit.ly.",
            difficulty="hard",
            sample="Cover hashing, redirect logic, storage, and scalability.",
        ),
        _make(
            "What are the SOLID principles? Give a real example where you applied one of them.",
            sample="Pick one principle, explain it clearly, and tie it to actual code you wrote.",
        ),
    ]

    # Filter out already-covered questions
    uncovered = [
        q for q in candidates if q["question"].lower()[:80] not in covered_questions
    ]

    if not uncovered:
        # All bank questions are covered — return any random one
        uncovered = candidates

    if not uncovered:
        return None

    chosen = random.choice(uncovered)
    logger.info(
        "generate_pivot_question: using static fallback — '%s'", chosen["question"][:80]
    )
    return chosen


def _count_consecutive_struggles(
    conversation_history: List[Dict[str, Any]],
    current_analysis: Dict[str, Any],
) -> int:
    """
    Count how many consecutive 'struggle' turns appear at the tail of the
    conversation, including the current answer.

    A turn is a 'struggle' if ANY of these are true:
      - strict_eval.next_action in ("simplify", "change_topic")   ← confused/refused
      - strict_eval.correctness <= 3  (out of 10)
      - strict_eval.depth <= 2        (out of 10)
      - technical_score < 20          (out of 100, from ResponseAnalyzer)

    Stops counting the moment a non-struggle turn is found in history.
    """

    def is_struggle(analysis: Dict[str, Any]) -> bool:
        if not isinstance(analysis, dict):
            return False
        strict = analysis.get("strict_eval") or {}
        # next_action signals
        next_action = str(strict.get("next_action") or "").lower()
        if next_action in ("simplify", "change_topic"):
            return True
        # Numeric score signals from StrictTurnEvaluator
        try:
            if float(strict.get("correctness", 10)) <= 3:
                return True
            if float(strict.get("depth", 10)) <= 2:
                return True
        except (TypeError, ValueError):
            pass
        # Fallback: ResponseAnalyzer technical_score (0-100)
        try:
            tech = analysis.get("technical_score")
            if tech is not None and float(tech) < 20:
                return True
        except (TypeError, ValueError):
            pass
        return False

    count = 1 if is_struggle(current_analysis) else 0

    # Walk backwards through saved history (most recent first), stop at first non-struggle.
    # NOTE: conversation_history should NOT include the current turn — callers are
    # responsible for excluding it. The current turn is already counted above via
    # current_analysis to avoid double-counting.
    for turn in reversed(list(conversation_history or [])):
        analysis = turn.get("analysis") or {}
        if is_struggle(analysis):
            count += 1
        else:
            break  # Chain is broken — stop counting

    return count


def _fmt_history(history: List[Dict[str, Any]], max_turns: int = 5) -> str:
    recent = list(history or [])[-max_turns:]
    if not recent:
        return "No previous turns."
    parts = []
    for i, turn in enumerate(recent, 1):
        q = str(turn.get("question") or "").strip()[:300]
        a = str(turn.get("answer") or "").strip()[:400]
        parts.append(f"Turn {i}:\n  Q: {q}\n  A: {a}")
    return "\n\n".join(parts)


def _fmt_context(
    interview_type: str,
    domain: Optional[str],
    resume_profile: Optional[Dict[str, Any]],
) -> str:
    itype = (interview_type or "").upper()
    if itype == "RESUME_BASED" and resume_profile:
        skills = list((resume_profile.get("skills") or []))[:20]
        projects = [
            f"{p.get('name', '')} ({', '.join((p.get('tech') or [])[:4])})"
            for p in list(resume_profile.get("projects") or [])[:5]
            if isinstance(p, dict)
        ]
        internships = [
            f"{i.get('company', '')} — {i.get('role', '')}"
            for i in list(resume_profile.get("internships") or [])[:3]
            if isinstance(i, dict)
        ]
        return (
            f"Interview type: RESUME_BASED\n"
            f"Candidate skills: {', '.join(skills)}\n"
            f"Projects: {'; '.join(projects)}\n"
            f"Internships: {'; '.join(internships)}"
        )
    if itype == "DOMAIN_BASED":
        return f"Interview type: DOMAIN_BASED\nDomain: {domain or 'General'}"
    return f"Interview type: {itype}\nDomain: {domain or 'General'}"


def _parse_tool_result(response: Any, tool_name: str) -> Optional[Dict[str, Any]]:
    """Extract the JSON payload from a tool_call on a ChatGroq response."""
    try:
        calls = getattr(response, "tool_calls", None) or []
        for call in calls:
            name = getattr(call, "name", None) or (
                call.get("name") if isinstance(call, dict) else None
            )
            if name == tool_name:
                args = getattr(call, "args", None) or (
                    call.get("args") if isinstance(call, dict) else {}
                )
                if isinstance(args, str):
                    args = json.loads(args)
                return args if isinstance(args, dict) else {}
        # Fallback: try parsing raw content as JSON
        content = getattr(response, "content", "") or ""
        if content:
            content = re.sub(
                r"^```(?:json)?\s*", "", content.strip(), flags=re.IGNORECASE
            )
            content = re.sub(r"\s*```$", "", content)
            m = re.search(r"\{[\s\S]*\}", content)
            if m:
                return json.loads(m.group(0))
    except Exception as e:
        logger.debug("_parse_tool_result failed for %s: %s", tool_name, e)
    return None


class GroqInterviewEvaluator:
    """Generate a final, holistic evaluation for a completed interview (Groq-only)."""

    @staticmethod
    def _safe_parse_json(text: str) -> Dict:
        if not text:
            return {}
        t = text.strip()
        # Try direct JSON first
        try:
            obj = json.loads(t)
            return obj if isinstance(obj, dict) else {}
        except Exception:
            pass

        # Try extracting the first JSON object
        try:
            m = re.search(r"\{[\s\S]*\}", t)
            if not m:
                return {}
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    @staticmethod
    async def evaluate_interview(
        interview_type: str,
        domain: str | None,
        questions: List[Dict],
        responses: List[Dict],
    ) -> Dict:
        """Return strict JSON evaluation used for saving + UI display."""

        QuestionGenerator._require_groq_key()

        # Keep payload reasonably sized: include Q/A + per-answer analysis if present.
        qa = []
        for r in responses or []:
            qa.append(
                {
                    "question_id": r.get("question_id"),
                    "question": r.get("question"),
                    "answer": r.get("answer"),
                    "response_time": r.get("response_time"),
                    "analysis": r.get("analysis"),
                }
            )

        prompt = f"""
You are an expert mock interview evaluator.

Interview type: {interview_type}
Domain (if any): {domain or ""}

Questions asked (may include sample answers):
{json.dumps(questions or [], ensure_ascii=False)}

Student responses (with per-question analysis if available):
{json.dumps(qa, ensure_ascii=False)}

Return ONLY a single JSON object with this exact schema:
{{
  "overall_score": number,              // 0-100
  "technical_score": number,            // 0-100
  "communication_score": number,        // 0-100
  "confidence_score": number,           // 0-100 (estimate from clarity, structure, hesitation)
  "strengths": [string, ...],
  "areas_for_improvement": [string, ...],
  "recommendations": [string, ...],     // concrete next steps
  "feedback": string                   // 2-5 sentences summary
}}

Rules:
- Ground the evaluation in the provided answers (do not invent answers).
- Scores must be numbers (not strings like "85/100").
- Keep lists short: 3-6 items each.
"""

        try:
            completion = groq_client_eval.chat.completions.create(
                model=GROQ_MODEL_EVALUATE,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=900,
            )
        except Exception:
            # Retry with safe fallback model
            completion = groq_client_eval.chat.completions.create(
                model=FALLBACK_GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=900,
            )

        content = completion.choices[0].message.content if completion.choices else ""
        parsed = GroqInterviewEvaluator._safe_parse_json(content)

        # Light normalization
        def _num(v) -> float:
            if isinstance(v, (int, float)):
                return float(v)
            if isinstance(v, str):
                m = re.search(r"(-?\d+(?:\.\d+)?)", v)
                return float(m.group(1)) if m else 0.0
            return 0.0

        out = {
            "overall_score": _num(parsed.get("overall_score")),
            "technical_score": _num(parsed.get("technical_score")),
            "communication_score": _num(parsed.get("communication_score")),
            "confidence_score": _num(parsed.get("confidence_score")),
            "strengths": parsed.get("strengths")
            if isinstance(parsed.get("strengths"), list)
            else [],
            "areas_for_improvement": parsed.get("areas_for_improvement")
            if isinstance(parsed.get("areas_for_improvement"), list)
            else [],
            "recommendations": parsed.get("recommendations")
            if isinstance(parsed.get("recommendations"), list)
            else [],
            "feedback": parsed.get("feedback")
            if isinstance(parsed.get("feedback"), str)
            else "",
        }

        # Clamp scores into [0, 100]
        for k in (
            "overall_score",
            "technical_score",
            "communication_score",
            "confidence_score",
        ):
            out[k] = max(0.0, min(100.0, float(out[k] or 0.0)))

        return out
