"""Update MySQL ENUM values for malpractice_records.malpractice_type.

Why this exists:
- `MalpracticeRecord.malpractice_type` is modeled as a SQLAlchemy Enum.
- In MySQL this is typically created as an ENUM column.
- Adding new enum values in `app/models.py` may require an ALTER TABLE.

Run:
  python scripts/update_malpractice_enum.py

Notes:
- Safe to re-run; it will just re-apply the full ENUM set.
- If your DB uses VARCHAR instead of ENUM, this script will no-op.
"""

from __future__ import annotations

from sqlalchemy import text

from app.database import SessionLocal
from app.models import MalpracticeType


def _mysql_enum_sql(values: list[str]) -> str:
    # Quote values for MySQL ENUM
    quoted = ", ".join(["'" + v.replace("'", "''") + "'" for v in values])
    return f"ENUM({quoted})"


def main() -> None:
    values = [e.value for e in MalpracticeType]

    db = SessionLocal()
    try:
        dialect = db.bind.dialect.name if db.bind else ""
        if dialect != "mysql":
            print(f"Skipping: dialect is {dialect!r} (expected 'mysql')")
            return

        # Detect column type
        info = db.execute(
            text(
                """
                SELECT DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'malpractice_records'
                  AND COLUMN_NAME = 'malpractice_type'
                """
            )
        ).fetchone()

        if not info:
            print("Skipping: malpractice_records.malpractice_type column not found")
            return

        data_type = str(info[0] or "").lower()
        if data_type != "enum":
            print(f"Skipping: column DATA_TYPE is {data_type!r} (expected 'enum')")
            return

        enum_sql = _mysql_enum_sql(values)
        print("Applying ENUM values:", values)

        db.execute(
            text(
                f"""
                ALTER TABLE malpractice_records
                MODIFY COLUMN malpractice_type {enum_sql} NOT NULL
                """
            )
        )
        db.commit()
        print("Done: malpractice_type ENUM updated")
    finally:
        db.close()


if __name__ == "__main__":
    main()
