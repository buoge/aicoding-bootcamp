"""Pydantic schemas for Tag."""

from datetime import datetime
from pydantic import BaseModel


class TagBase(BaseModel):
    name: str


class TagCreate(TagBase):
    pass


class TagOut(TagBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


