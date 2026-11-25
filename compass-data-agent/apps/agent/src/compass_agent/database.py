from collections.abc import Iterator
from datetime import date
from functools import lru_cache

from sqlalchemy import CheckConstraint, Date, Integer, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from compass_agent.settings import get_settings


class Base(DeclarativeBase):
    pass


class DemoSale(Base):
    """Synthetic fixture only. Real tenant data requires the future authorization layer."""

    __tablename__ = "demo_daily_sales"
    __table_args__ = (
        CheckConstraint("revenue_minor >= 0", name="ck_demo_revenue_nonnegative"),
        CheckConstraint("orders >= 0", name="ck_demo_orders_nonnegative"),
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    revenue_minor: Mapped[int] = mapped_column(Integer)
    orders: Mapped[int] = mapped_column(Integer)


@lru_cache
def get_engine() -> Engine:
    return create_engine(
        get_settings().database_url, pool_pre_ping=True, connect_args={"connect_timeout": 3}
    )


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
