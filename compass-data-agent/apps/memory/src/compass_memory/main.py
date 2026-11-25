from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

app = FastAPI(
    title="Compass Memory",
    version="0.1.0",
    description="Service scaffold. Memory storage and tools are not enabled yet.",
)


class Health(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ok"] = "ok"
    service: Literal["compass-memory"] = "compass-memory"
    stage: Literal["scaffold"] = "scaffold"


@app.get("/healthz", response_model=Health, operation_id="memory_health")
def health() -> Health:
    return Health()


@app.get("/readyz", response_model=Health, operation_id="memory_readiness")
def readiness() -> Health:
    """Readiness covers only the current dependency-free scaffold."""
    return Health()
