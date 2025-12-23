from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.models.schemas import HealthResponse, ErrorResponse
from app.services.sql_guard import SqlValidationError
from app.api import api_router

settings = get_settings()

app = FastAPI(title="db_query API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse()


@app.exception_handler(SqlValidationError)
async def sql_validation_exception_handler(_: Request, exc: SqlValidationError):
    return JSONResponse(
        status_code=400,
        content=ErrorResponse(detail=str(exc), code="SQL_VALIDATION_ERROR").model_dump(by_alias=True),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(_: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(detail="Internal server error", code="INTERNAL_ERROR", data=str(exc)).model_dump(by_alias=True),
    )


app.include_router(api_router)

