from typing import List, Optional
from pydantic import BaseModel, AnyUrl, Field
from datetime import datetime


class DbUrl(AnyUrl):
    # allow common DB schemes
    allowed_schemes = {
        "postgres",
        "postgresql",
        "mysql",
        "sqlite",
        "mssql",
        "oracle",
        "redshift",
    }


class ConnectionCreate(BaseModel):
    connection_url: DbUrl = Field(..., alias="connectionUrl")
    refresh: bool = False
    name: Optional[str] = None


class ConnectionOut(BaseModel):
    id: int
    name: Optional[str]
    connection_url: str = Field(..., alias="connectionUrl")
    last_synced: Optional[datetime] = Field(None, alias="lastSynced")

    class Config:
        populate_by_name = True


class ColumnInfo(BaseModel):
    name: str
    data_type: str


class TableInfo(BaseModel):
    schema: str
    name: str
    is_view: bool
    columns: List[ColumnInfo]


class MetadataResponse(BaseModel):
    connection: ConnectionOut
    tables: List[TableInfo]

