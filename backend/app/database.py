from collections.abc import Generator
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()


def _ensure_sqlite_columns() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    inspector = inspect(engine)
    if "apartments" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("apartments")}
    additions = {
        "agent_name": "VARCHAR(300)",
        "agent_phone": "VARCHAR(80)",
        "agent_broker": "VARCHAR(300)",
        "listing_url": "TEXT",
        "source": "VARCHAR(80)",
    }
    with engine.begin() as connection:
        for column, column_type in additions.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE apartments ADD COLUMN {column} {column_type}"))
    if "commutes" in inspector.get_table_names():
        commute_existing = {column["name"] for column in inspector.get_columns("commutes")}
        if "total_distance_km" not in commute_existing:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE commutes ADD COLUMN total_distance_km FLOAT"))
