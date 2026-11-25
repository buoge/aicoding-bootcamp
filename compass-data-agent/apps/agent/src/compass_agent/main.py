from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Response
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from compass_agent.database import DemoSale, get_engine, get_session
from compass_agent.schemas import DemoOverview, Health
from compass_agent.settings import get_settings

app = FastAPI(title="Compass Agent", version="0.1.0", description="Commerce analysis scaffold")


@app.get("/healthz", response_model=Health, operation_id="health")
def health() -> Health:
    return Health()


@app.get("/readyz", response_model=Health, operation_id="readiness")
def readiness() -> Health:
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1 FROM demo_daily_sales LIMIT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database or migration unavailable") from exc
    return Health()


@app.get("/v1/demo/overview", response_model=DemoOverview, operation_id="demo_overview")
def demo_overview(
    response: Response, session: Annotated[Session, Depends(get_session)]
) -> DemoOverview:
    # Opt-in fixture endpoint; this never accepts a tenant or a user-supplied query.
    if not get_settings().compass_demo_enabled:
        raise HTTPException(status_code=404, detail="Demo disabled")
    response.headers["Cache-Control"] = "no-store"
    try:
        row = session.execute(
            select(
                func.min(DemoSale.day),
                func.max(DemoSale.day),
                func.sum(DemoSale.revenue_minor),
                func.sum(DemoSale.orders),
                func.count(),
            ).select_from(DemoSale)
        ).one()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Demo database unavailable") from exc
    start, end, revenue, orders, days = row
    if not days:
        raise HTTPException(status_code=503, detail="Run the demo seed first")
    return DemoOverview(
        start_date=start, end_date=end, revenue_minor=revenue, orders=orders, days=days
    )
