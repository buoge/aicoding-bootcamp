from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    database_url: str = "postgresql+psycopg://compass:compass_local_only@127.0.0.1:55432/compass"
    compass_demo_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
