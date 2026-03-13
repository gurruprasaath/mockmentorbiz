"""Bootstrap the database for first-time setups.

Creates the database (if missing) and creates tables.

Usage (Windows PowerShell):
  cd backend
  python scripts/bootstrap_db.py

It uses DATABASE_URL from the repo-root .env (preferred) or backend/.env (legacy).
"""

from __future__ import annotations

import asyncio

from app.database import create_tables


def main() -> None:
    asyncio.run(create_tables())
    print("✅ Database is ready (database + tables)")


if __name__ == "__main__":
    main()
