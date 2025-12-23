from fastapi import APIRouter
from app.api import metadata, query, nl_query

api_router = APIRouter()
api_router.include_router(metadata.router)
api_router.include_router(query.router)
api_router.include_router(nl_query.router)

