from __future__ import annotations

from sqlalchemy import text

from app.database import engine


def main() -> None:
    # Current DB schema (from inspection):
    # - interviews.interview_type: NOT NULL, enum('RESUME_BASED','DOMAIN_BASED','SCHEDULED')
    # - interviews.status: NULL, enum('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')
    # ORM expects lowercase values: resume_based/domain_based/scheduled, pending/in_progress/completed/cancelled.

    with engine.begin() as conn:
        # interview_type
        conn.execute(
            text(
                "ALTER TABLE interviews MODIFY interview_type "
                "ENUM('RESUME_BASED','DOMAIN_BASED','SCHEDULED','resume_based','domain_based','scheduled') NOT NULL"
            )
        )
        conn.execute(text("UPDATE interviews SET interview_type = LOWER(interview_type)"))
        conn.execute(
            text(
                "ALTER TABLE interviews MODIFY interview_type "
                "ENUM('resume_based','domain_based','scheduled') NOT NULL"
            )
        )

        # status (nullable)
        conn.execute(
            text(
                "ALTER TABLE interviews MODIFY status "
                "ENUM('PENDING','IN_PROGRESS','COMPLETED','CANCELLED','pending','in_progress','completed','cancelled') NULL"
            )
        )
        conn.execute(text("UPDATE interviews SET status = LOWER(status) WHERE status IS NOT NULL"))
        conn.execute(
            text(
                "ALTER TABLE interviews MODIFY status "
                "ENUM('pending','in_progress','completed','cancelled') NULL"
            )
        )

    print("normalized")


if __name__ == "__main__":
    main()
