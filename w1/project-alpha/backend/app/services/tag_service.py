"""Service layer for Tag operations."""

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Tag
from app.schemas.tag import TagCreate


def get_tags(db: Session, search: Optional[str] = None) -> List[Tag]:
    stmt = select(Tag)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(Tag.name.ilike(like))
    stmt = stmt.order_by(Tag.name.asc())
    return db.scalars(stmt).all()


def create_tag(db: Session, tag_in: TagCreate) -> Tag:
    tag = Tag(name=tag_in.name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


