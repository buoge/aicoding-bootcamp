"""Base SQLAlchemy metadata and model imports."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared base class for all ORM models."""

    pass


# Import models so that Base.metadata is aware of them for create_all
from app.models import ticket, tag, ticket_tag  # noqa: E402,F401


