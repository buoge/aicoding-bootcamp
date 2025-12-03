"""Application configuration helpers."""

from functools import lru_cache
from pydantic import BaseModel
import os


class Settings(BaseModel):
    """Holds environment-driven settings for the FastAPI app."""

    app_name: str = "Project Alpha API"
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:@localhost:5432/projectalpha",
    )
    api_prefix: str = "/api"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor."""
    return Settings()

