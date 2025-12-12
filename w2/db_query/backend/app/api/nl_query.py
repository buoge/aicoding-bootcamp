from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.nl_query import NLQueryRequest, NLQueryResponse
from app.models.schemas import ErrorResponse
from app.services import nl2sql_service

router = APIRouter(prefix="/nl-query", tags=["nl-query"])


@router.post("", response_model=NLQueryResponse, responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def nl_query(payload: NLQueryRequest, db: Session = Depends(get_db)):
    try:
        return nl2sql_service.generate_and_run(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

