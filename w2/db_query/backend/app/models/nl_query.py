from typing import Any, List, Optional
from pydantic import BaseModel, Field


class NLQueryRequest(BaseModel):
    connection_id: int = Field(..., alias="connectionId")
    prompt: str
    api_key: str | None = Field(None, alias="apiKey")

    class Config:
        populate_by_name = True


class NLQueryResponse(BaseModel):
    generated_sql: str = Field(..., alias="generatedSql")
    columns: List[str]
    rows: List[List[Any]]
    limit_added: bool = Field(False, alias="limitAdded")
    message: Optional[str] = None

    class Config:
        populate_by_name = True

