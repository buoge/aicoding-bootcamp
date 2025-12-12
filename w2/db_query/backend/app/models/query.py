from typing import Any, List, Optional
from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    connection_id: int = Field(..., alias="connectionId")
    sql: str

    class Config:
        populate_by_name = True


class QueryColumn(BaseModel):
    name: str
    type: Optional[str] = None


class QueryResult(BaseModel):
    columns: List[QueryColumn]
    rows: List[List[Any]]
    limit_added: bool = Field(False, alias="limitAdded")
    message: Optional[str] = None

    class Config:
        populate_by_name = True

