"""Postgres-only persistence wiring for the v2 backend.

Schema is owned by `backend/db/migrations/0001_decision_intelligence.sql`, which
is applied via the Supabase SQL Editor. We do not call ``Base.metadata.create_all``
here — the migration is source of truth.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings


settings = get_settings()

if not settings.database_url.startswith(("postgres://", "postgresql://", "postgresql+")):
    raise RuntimeError(
        "DATABASE_URL must point at a Postgres instance (Supabase). "
        f"Got: {settings.database_url!r}. SQLite is no longer supported."
    )

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
