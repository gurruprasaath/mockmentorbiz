from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv

_here = Path(__file__).resolve()
_backend_env = _here.parents[1] / ".env"  # backend/.env (legacy)
_root_env = _here.parents[2] / ".env"  # repo-root/.env (preferred)

if _root_env.exists():
    load_dotenv(dotenv_path=_root_env)
elif _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env)
else:
    load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL", "mysql+pymysql://root:1234@localhost:3306/mockmentorbiz"
)

SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() == "true"
AUTO_CREATE_DB = os.getenv("AUTO_CREATE_DB", "true").lower() == "true"


def _ensure_database_exists() -> None:
    """Best-effort: create the target database if it doesn't exist.

    This is designed for easy college/demo setup. It requires that the MySQL
    user has permission to create databases.
    """

    if not AUTO_CREATE_DB:
        return

    try:
        url = make_url(DATABASE_URL)

        # Only attempt for MySQL.
        if url.get_backend_name() != "mysql":
            return

        db_name = (url.database or "").strip()
        if not db_name:
            return

        # Connect without selecting a database to create it.
        url_no_db = url.set(database=None)
        engine_no_db = create_engine(
            url_no_db,
            pool_pre_ping=True,
            connect_args={"charset": "utf8mb4"},
            echo=False,
        )

        with engine_no_db.begin() as conn:
            conn.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
    except Exception:
        # Don't hard-fail here; the app may still start if DB already exists.
        return


# Ensure DB exists before creating the main engine (best-effort).
_ensure_database_exists()

# Create engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"charset": "utf8mb4"}
    if make_url(DATABASE_URL).get_backend_name() == "mysql"
    else {},
    echo=SQL_ECHO,
)

# Create session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _seed_owner_if_configured() -> None:
    """Optionally seed the first platform Owner user on startup.

    This is meant for first-time local/dev runs where tables are auto-created.
    It is idempotent: if an owner already exists, it does nothing.

    Controlled by env:
      OWNER_SEED_ON_STARTUP=true
      OWNER_SEED_EMAIL, OWNER_SEED_USERNAME, OWNER_SEED_PASSWORD, OWNER_SEED_FULL_NAME
    """

    enabled = os.getenv("OWNER_SEED_ON_STARTUP", "false").lower() == "true"
    if not enabled:
        return

    email = (os.getenv("OWNER_SEED_EMAIL") or "").strip()
    username = (os.getenv("OWNER_SEED_USERNAME") or "").strip()
    password = (os.getenv("OWNER_SEED_PASSWORD") or "").strip()
    full_name = (os.getenv("OWNER_SEED_FULL_NAME") or "").strip()

    if not (email and username and password and full_name):
        # Don't crash startup for partial config.
        return

    # Local imports to avoid circular import issues during module import.
    from datetime import datetime

    from app.models import User, UserRole
    from app.utils.auth import get_password_hash

    db = SessionLocal()
    try:
        existing_owner = db.query(User).filter(User.role == UserRole.OWNER).first()
        if existing_owner:
            return

        # Avoid collisions if the email/username is already taken by a different user.
        if db.query(User).filter(User.email == email).first():
            return
        if db.query(User).filter(User.username == username).first():
            return

        owner = User(
            email=email,
            username=username,
            hashed_password=get_password_hash(password),
            full_name=full_name,
            role=UserRole.OWNER,
            department="Platform",
            college_name=None,
            is_active=True,
            created_at=datetime.utcnow(),
        )
        db.add(owner)
        db.commit()
        print(f"✅ Seeded platform owner: {email}")
    except Exception:
        db.rollback()
        # Never block startup due to optional seeding.
        return
    finally:
        db.close()


# Create all tables
async def create_tables():
    # Retry loop: MySQL may still be initialising even after healthcheck passes.
    max_attempts = 10
    for attempt in range(1, max_attempts + 1):
        try:
            # Ensure DB exists even if it was dropped between restarts.
            _ensure_database_exists()
            Base.metadata.create_all(bind=engine)
            break  # success
        except Exception as exc:
            if attempt == max_attempts:
                raise
            wait = attempt * 2
            print(
                f"[database] MySQL not ready (attempt {attempt}/{max_attempts}): {exc}. Retrying in {wait}s…"
            )
            await asyncio.sleep(wait)

    # Lightweight schema migration for dev setups (this repo doesn't use Alembic yet).
    # Ensure new columns exist on existing tables.
    try:
        inspector = inspect(engine)

        # Ensure MySQL ENUM values exist for users.role
        if inspector.has_table("users"):
            from app.models import UserRole

            expected_roles = [e.value for e in UserRole]

            with engine.begin() as conn:
                row = conn.execute(
                    text(
                        """
                        SELECT COLUMN_TYPE
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'users'
                          AND COLUMN_NAME = 'role'
                        """
                    )
                ).fetchone()

                if row and row[0]:
                    column_type_raw = str(row[0])
                    missing = [
                        v for v in expected_roles if f"'{v}'" not in column_type_raw
                    ]
                    if missing:
                        enum_final = ",".join([f"'{v}'" for v in expected_roles])
                        conn.execute(
                            text(
                                f"ALTER TABLE users MODIFY role ENUM({enum_final}) NOT NULL"
                            )
                        )
        if inspector.has_table("interviews"):
            cols = {c.get("name") for c in inspector.get_columns("interviews")}
            if "num_questions" not in cols:
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "ALTER TABLE interviews ADD COLUMN num_questions INT NOT NULL DEFAULT 10"
                        )
                    )
            if "admin_notice" not in cols:
                with engine.begin() as conn:
                    conn.execute(
                        text("ALTER TABLE interviews ADD COLUMN admin_notice JSON NULL")
                    )

            # Ensure MySQL ENUM values exist and stored values are normalized for interview type/status.
            from app.models import InterviewType, InterviewStatus

            def _normalize_enum_column(
                table: str,
                column: str,
                expected_lower: list[str],
                expected_upper: list[str],
            ):
                with engine.begin() as conn:
                    row = conn.execute(
                        text(
                            f"""
                            SELECT COLUMN_TYPE
                            FROM INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = '{table}'
                              AND COLUMN_NAME = '{column}'
                            """
                        )
                    ).fetchone()

                    if not row or not row[0]:
                        return

                    column_type_raw = str(row[0])
                    has_any_upper = any(
                        f"'{v}'" in column_type_raw for v in expected_upper
                    )
                    has_any_lower = any(
                        f"'{v}'" in column_type_raw for v in expected_lower
                    )

                    # Step 1: ensure lowercase values are allowed before we normalize stored values.
                    if has_any_upper and not has_any_lower:
                        union: list[str] = []
                        for v in expected_upper + expected_lower:
                            if v not in union:
                                union.append(v)
                        enum_union = ",".join([f"'{v}'" for v in union])
                        conn.execute(
                            text(
                                f"ALTER TABLE {table} MODIFY {column} ENUM({enum_union}) NOT NULL"
                            )
                        )

                    # Step 2: normalize stored values to lowercase (RESUME_BASED -> resume_based).
                    if has_any_upper:
                        conn.execute(
                            text(f"UPDATE {table} SET {column} = LOWER({column})")
                        )

                    # Step 3: ensure the final ENUM is lowercase values (what the ORM expects).
                    enum_final = ",".join([f"'{v}'" for v in expected_lower])
                    if has_any_upper or any(
                        f"'{v}'" not in column_type_raw for v in expected_lower
                    ):
                        conn.execute(
                            text(
                                f"ALTER TABLE {table} MODIFY {column} ENUM({enum_final}) NOT NULL"
                            )
                        )

            _normalize_enum_column(
                table="interviews",
                column="interview_type",
                expected_lower=[e.value for e in InterviewType],
                expected_upper=[e.name for e in InterviewType],
            )
            _normalize_enum_column(
                table="interviews",
                column="status",
                expected_lower=[e.value for e in InterviewStatus],
                expected_upper=[e.name for e in InterviewStatus],
            )

        # Ensure MySQL ENUM values exist for malpractice type.
        # MySQL requires modifying the entire ENUM definition to add new values.
        if inspector.has_table("malpractice_records"):
            from app.models import MalpracticeType

            expected_lower = [e.value for e in MalpracticeType]
            expected_upper = [e.name for e in MalpracticeType]

            with engine.begin() as conn:
                row = conn.execute(
                    text(
                        """
                        SELECT COLUMN_TYPE
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'malpractice_records'
                          AND COLUMN_NAME = 'malpractice_type'
                        """
                    )
                ).fetchone()

                if row and row[0]:
                    column_type_raw = str(row[0])

                    has_any_upper = any(
                        f"'{v}'" in column_type_raw for v in expected_upper
                    )
                    has_any_lower = any(
                        f"'{v}'" in column_type_raw for v in expected_lower
                    )

                    # Step 1: if the column is currently based on Enum names (UPPERCASE),
                    # temporarily allow both UPPERCASE + lowercase so we can normalize.
                    if has_any_upper and not has_any_lower:
                        union = []
                        for v in expected_upper + expected_lower:
                            if v not in union:
                                union.append(v)

                        enum_union = ",".join([f"'{v}'" for v in union])
                        conn.execute(
                            text(
                                f"ALTER TABLE malpractice_records MODIFY malpractice_type ENUM({enum_union}) NOT NULL"
                            )
                        )

                        # Normalize stored values to lowercase.
                        conn.execute(
                            text(
                                "UPDATE malpractice_records SET malpractice_type = LOWER(malpractice_type)"
                            )
                        )

                    # Step 2: ensure the final ENUM is lowercase values (what the ORM writes).
                    final_missing = [
                        v for v in expected_lower if f"'{v}'" not in column_type_raw
                    ]
                    if has_any_upper or final_missing:
                        enum_final = ",".join([f"'{v}'" for v in expected_lower])
                        conn.execute(
                            text(
                                f"ALTER TABLE malpractice_records MODIFY malpractice_type ENUM({enum_final}) NOT NULL"
                            )
                        )
    except Exception:
        # Don't block startup if migration check fails; better to surface runtime DB errors.
        pass

    # Optional first-run seed data
    try:
        _seed_owner_if_configured()
    except Exception:
        # Best-effort: never block startup.
        pass
