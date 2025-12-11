from fastapi import APIRouter
from app.api import metadata

api_router = APIRouter()
api_router.include_router(metadata.router)

