from datetime import datetime
from typing import List, Tuple

import os
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Boolean, Text, create_engine, select, delete
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session

from app.core.config import get_settings

Base = declarative_base()
settings = get_settings()

# ensure sqlite directory exists before creating engine
os.makedirs(os.path.dirname(settings.sqlite_path), exist_ok=True)

engine = create_engine(
    f"sqlite:///{settings.sqlite_path}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Connection(Base):
    __tablename__ = "connections"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    connection_url = Column(String, nullable=False, unique=True)
    last_synced = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    tables = relationship("TableMetadata", back_populates="connection", cascade="all, delete-orphan")


class TableMetadata(Base):
    __tablename__ = "table_metadata"
    id = Column(Integer, primary_key=True, index=True)
    connection_id = Column(Integer, ForeignKey("connections.id", ondelete="CASCADE"))
    schema = Column(String, nullable=False)
    name = Column(String, nullable=False)
    is_view = Column(Boolean, default=False)
    columns_json = Column(Text, nullable=False)  # store columns as JSON string

    connection = relationship("Connection", back_populates="tables")


def init_db():
    Base.metadata.create_all(bind=engine)


def upsert_connection(db: Session, connection_url: str, name: str | None = None) -> Connection:
    url_str = str(connection_url)
    conn = db.execute(select(Connection).where(Connection.connection_url == url_str)).scalar_one_or_none()
    if conn is None:
        conn = Connection(connection_url=url_str, name=name)
        db.add(conn)
        db.commit()
        db.refresh(conn)
    return conn


def replace_metadata(db: Session, connection_id: int, tables: List[Tuple[str, str, bool, str]]):
    # tables: list of (schema, name, is_view, columns_json)
    db.execute(delete(TableMetadata).where(TableMetadata.connection_id == connection_id))
    for schema, name, is_view, columns_json in tables:
        db.add(TableMetadata(connection_id=connection_id, schema=schema, name=name, is_view=is_view, columns_json=columns_json))
    db.commit()


def update_last_synced(db: Session, connection_id: int):
    conn = db.execute(select(Connection).where(Connection.id == connection_id)).scalar_one()
    conn.last_synced = datetime.utcnow()
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def list_connections(db: Session) -> List[Connection]:
    return db.execute(select(Connection).order_by(Connection.created_at.desc())).scalars().all()


def get_metadata(db: Session, connection_id: int) -> tuple[Connection, List[TableMetadata]] | None:
    conn = db.execute(select(Connection).where(Connection.id == connection_id)).scalar_one_or_none()
    if not conn:
        return None
    tables = db.execute(select(TableMetadata).where(TableMetadata.connection_id == connection_id)).scalars().all()
    return conn, tables

