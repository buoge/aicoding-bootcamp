"""Tag API routes."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.tag import TagCreate, TagOut
from app.services import tag_service

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=List[TagOut])
def list_tags(search: Optional[str] = None, db: Session = Depends(get_db)):
    return tag_service.get_tags(db, search=search)


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
def create_tag(tag_in: TagCreate, db: Session = Depends(get_db)):
    # 简单处理唯一约束冲突：如果已存在则返回 400
    existing = tag_service.get_tags(db, search=tag_in.name)
    if any(t.name == tag_in.name for t in existing):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tag with this name already exists.",
        )
    return tag_service.create_tag(db, tag_in)


