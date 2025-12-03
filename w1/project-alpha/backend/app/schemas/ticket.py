"""Pydantic schemas for Ticket."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.tag import TagOut


class TicketBase(BaseModel):
    title: str
    description: Optional[str] = None


class TicketCreate(TicketBase):
    tag_ids: Optional[List[int]] = None


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    tag_ids: Optional[List[int]] = None


class TicketOut(TicketBase):
    id: int
    status: str
    created_at: datetime
    updated_at: datetime
    tags: List[TagOut] = []

    class Config:
        from_attributes = True


class TicketListResponse(BaseModel):
    items: List[TicketOut]
    total: int


