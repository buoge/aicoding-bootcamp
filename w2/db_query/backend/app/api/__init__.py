from fastapi import APIRouter
from app.api import metadata, query

api_router = APIRouter()
api_router.include_router(metadata.router)
api_router.include_router(query.router)

