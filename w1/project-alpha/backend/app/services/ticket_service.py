"""Service layer for Ticket operations."""

from typing import List, Optional, Sequence

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models import Ticket, Tag, ticket_tags
from app.schemas.ticket import TicketCreate, TicketUpdate


def _apply_ticket_filters(
    stmt,
    tag_ids: Optional[List[int]] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
):
    if status:
        stmt = stmt.where(Ticket.status == status)

    if search:
        like = f"%{search}%"
        stmt = stmt.where(Ticket.title.ilike(like))

    if tag_ids:
        # AND 逻辑：ticket 必须同时包含所有 tag_ids
        stmt = (
            stmt.join(ticket_tags, Ticket.id == ticket_tags.c.ticket_id)
            .where(ticket_tags.c.tag_id.in_(tag_ids))
            .group_by(Ticket.id)
            .having(func.count(func.distinct(ticket_tags.c.tag_id)) == len(tag_ids))
        )
    return stmt


def list_tickets(
    db: Session,
    *,
    tag_ids: Optional[List[int]] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[Ticket], int]:
    base_stmt = select(Ticket).order_by(Ticket.created_at.desc())
    base_stmt = _apply_ticket_filters(base_stmt, tag_ids, search, status)

    items: Sequence[Ticket] = db.scalars(
        base_stmt.offset(offset).limit(limit)
    ).all()

    count_stmt = select(func.count(func.distinct(Ticket.id)))
    count_stmt = _apply_ticket_filters(count_stmt, tag_ids, search, status)
    total = db.scalar(count_stmt) or 0

    # 预加载 tags
    for t in items:
        _ = t.tags  # access relationship

    return list(items), int(total)


def get_ticket(db: Session, ticket_id: int) -> Optional[Ticket]:
    stmt = select(Ticket).where(Ticket.id == ticket_id)
    ticket = db.scalar(stmt)
    if ticket:
        _ = ticket.tags
    return ticket


def create_ticket(db: Session, ticket_in: TicketCreate) -> Ticket:
    ticket = Ticket(title=ticket_in.title, description=ticket_in.description)
    if ticket_in.tag_ids:
        tags = db.scalars(select(Tag).where(Tag.id.in_(ticket_in.tag_ids))).all()
        ticket.tags = list(tags)

    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    _ = ticket.tags
    return ticket


def update_ticket(
    db: Session,
    ticket_id: int,
    ticket_in: TicketUpdate,
) -> Optional[Ticket]:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        return None

    data = ticket_in.model_dump(exclude_unset=True)

    if "title" in data:
        ticket.title = data["title"]
    if "description" in data:
        ticket.description = data["description"]
    if "status" in data:
        ticket.status = data["status"]

    if "tag_ids" in data and data["tag_ids"] is not None:
        tags = db.scalars(select(Tag).where(Tag.id.in_(data["tag_ids"]))).all()
        ticket.tags = list(tags)

    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    _ = ticket.tags
    return ticket


def delete_ticket(db: Session, ticket_id: int) -> bool:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        return False
    db.delete(ticket)
    db.commit()
    return True


