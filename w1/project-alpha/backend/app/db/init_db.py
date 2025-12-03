"""One-off database initialization script.

Run `python -m app.db.init_db` from the backend directory to create tables.
"""

from app.db.session import engine
from app.db.base import Base  # noqa: F401  - imports models for metadata side effects


def init_db() -> None:
    """Create all database tables based on ORM models."""
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database tables created.")


