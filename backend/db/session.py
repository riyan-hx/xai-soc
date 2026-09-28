import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from .models import Base

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/xai_soc"
)

# SQLite fallback for quick local runs without Postgres set up:
#   DATABASE_URL=sqlite:///./xai_soc.db
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Columns added after the first release. `create_all` only creates missing
# *tables*, so an existing dev database needs these added in place. Each entry
# is (table, column, DDL type/default) and is applied only when absent.
_ADDED_COLUMNS = [
    ("alerts", "status", "VARCHAR NOT NULL DEFAULT 'NEW'"),
    ("alerts", "assignee_id", "VARCHAR"),
    ("alerts", "updated_at", "DATETIME"),
    ("alerts", "origin", "VARCHAR NOT NULL DEFAULT 'ingest'"),
    ("users", "is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
]


def _migrate_added_columns():
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl in _ADDED_COLUMNS:
            if table not in tables:
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
        if "alerts" in tables:
            conn.execute(text("UPDATE alerts SET updated_at = timestamp WHERE updated_at IS NULL"))


def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate_added_columns()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
