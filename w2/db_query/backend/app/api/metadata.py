from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json

from app.db.session import get_db
from app.services import metadata_service
from app.models.connection import ConnectionCreate, ConnectionOut, MetadataResponse, TableInfo, ConnectionUpdate
from app.models.schemas import ErrorResponse

router = APIRouter(prefix="/metadata", tags=["metadata"])


@router.post("/sync", response_model=MetadataResponse, responses={400: {"model": ErrorResponse}})
def sync_metadata(payload: ConnectionCreate, db: Session = Depends(get_db)):
    conn, tables = metadata_service.sync_metadata(db, payload.connection_url, payload.name)
    return MetadataResponse(
        connection=ConnectionOut(
            id=conn.id,
            name=conn.name,
            connectionUrl=conn.connection_url,  # alias
            lastSynced=conn.last_synced,
        ),
        tables=tables,
    )


@router.get("", response_model=list[ConnectionOut])
def list_connections(db: Session = Depends(get_db)):
    conns = metadata_service.list_connections(db)
    return [
        ConnectionOut(
            id=c.id,
            name=c.name,
            connectionUrl=c.connection_url,
            lastSynced=c.last_synced,
        )
        for c in conns
    ]


@router.get("/{connection_id}", response_model=MetadataResponse, responses={404: {"model": ErrorResponse}})
def get_connection_metadata(connection_id: int, db: Session = Depends(get_db)):
    result = metadata_service.get_metadata(db, connection_id)
    if not result:
        raise HTTPException(status_code=404, detail="Connection not found")
    conn, tables = result
    parsed_tables = []
    for t in tables:
        cols = json.loads(t.columns_json)
        parsed_tables.append(TableInfo(schema=t.schema, name=t.name, is_view=t.is_view, columns=cols))
    return MetadataResponse(
        connection=ConnectionOut(
            id=conn.id,
            name=conn.name,
            connectionUrl=conn.connection_url,
            lastSynced=conn.last_synced,
        ),
        tables=parsed_tables,
    )


@router.put("/{connection_id}", response_model=ConnectionOut, responses={404: {"model": ErrorResponse}})
def update_connection(connection_id: int, payload: ConnectionUpdate, db: Session = Depends(get_db)):
    updated = metadata_service.update_connection_name(db, connection_id, payload.name)
    if not updated:
        raise HTTPException(status_code=404, detail="Connection not found")
    return ConnectionOut(
        id=updated.id,
        name=updated.name,
        connectionUrl=updated.connection_url,
        lastSynced=updated.last_synced,
    )

