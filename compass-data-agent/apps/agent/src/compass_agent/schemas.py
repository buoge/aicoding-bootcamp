from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Health(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ok"] = "ok"
    service: Literal["compass-agent"] = "compass-agent"


class DemoOverview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["1"] = "1"
    source: Literal["synthetic-fixture"] = "synthetic-fixture"
    currency: Literal["CNY"] = "CNY"
    start_date: date
    end_date: date
    revenue_minor: int = Field(ge=0)
    orders: int = Field(ge=0)
    days: int = Field(ge=1)
