"""Root API router definitions."""

from fastapi import APIRouter

from app.api import tags, tickets

router = APIRouter()


@router.get("/health", tags=["health"])
def health_check():
    """Simple health probe endpoint."""
    return {"status": "ok"}


router.include_router(tags.router)
router.include_router(tickets.router)

