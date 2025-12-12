from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.query import QueryRequest, QueryResult
from app.models.schemas import ErrorResponse
from app.services import query_service

router = APIRouter(prefix="/query", tags=["query"])


@router.post("", response_model=QueryResult, responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def run_query(payload: QueryRequest, db: Session = Depends(get_db)):
    try:
        return query_service.run_query(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

