"""Ticket API routes."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.ticket import TicketCreate, TicketListResponse, TicketOut, TicketUpdate
from app.services import ticket_service

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("", response_model=TicketListResponse)
def list_tickets(
    tag_ids: Optional[str] = Query(None, description="逗号分隔的标签 ID，如 1,2"),
    search: Optional[str] = None,
    status_param: Optional[str] = Query(None, alias="status"),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    parsed_tag_ids: Optional[List[int]] = None
    if tag_ids:
        parsed_tag_ids = [int(t) for t in tag_ids.split(",") if t.strip().isdigit()]

    items, total = ticket_service.list_tickets(
        db,
        tag_ids=parsed_tag_ids,
        search=search,
        status=status_param,
        limit=limit,
        offset=offset,
    )
    return TicketListResponse(items=items, total=total)


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = ticket_service.get_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(ticket_in: TicketCreate, db: Session = Depends(get_db)):
    ticket = ticket_service.create_ticket(db, ticket_in)
    return ticket


@router.patch("/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: int, ticket_in: TicketUpdate, db: Session = Depends(get_db)):
    ticket = ticket_service.update_ticket(db, ticket_id, ticket_in)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ok = ticket_service.delete_ticket(db, ticket_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return None


