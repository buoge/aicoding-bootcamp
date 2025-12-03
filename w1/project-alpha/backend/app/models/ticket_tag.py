"""Association table between tickets and tags."""

from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint, Table

from app.db.base import Base


ticket_tags = Table(
    "ticket_tags",
    Base.metadata,
    Column("ticket_id", Integer, ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint("ticket_id", "tag_id", name="uq_ticket_tag"),
)


