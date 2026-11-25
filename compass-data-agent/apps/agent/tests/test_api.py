from collections.abc import Iterator
from unittest.mock import patch

import pytest
from compass_agent.database import Base, get_session
from compass_agent.main import app
from compass_agent.seed import seed
from compass_agent.settings import Settings
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool


@pytest.fixture
def client() -> Iterator[tuple[TestClient, Session]]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:

        def override_session() -> Iterator[Session]:
            yield session

        app.dependency_overrides[get_session] = override_session
        with patch(
            "compass_agent.main.get_settings", return_value=Settings(compass_demo_enabled=True)
        ):
            with TestClient(app) as test_client:
                yield test_client, session
    app.dependency_overrides.clear()
    engine.dispose()


def test_liveness_does_not_require_database() -> None:
    with TestClient(app) as client:
        assert client.get("/healthz").json() == {"status": "ok", "service": "compass-agent"}


def test_seed_is_idempotent_and_report_uses_database(client: tuple[TestClient, Session]) -> None:
    http, session = client
    seed(session)
    seed(session)
    response = http.get("/v1/demo/overview")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "schema_version": "1",
        "source": "synthetic-fixture",
        "currency": "CNY",
        "start_date": "2026-10-01",
        "end_date": "2026-10-03",
        "revenue_minor": 4000000,
        "orders": 397,
        "days": 3,
    }


def test_unseeded_database_is_not_reported_as_success(client: tuple[TestClient, Session]) -> None:
    assert client[0].get("/v1/demo/overview").status_code == 503


def test_demo_is_disabled_by_default(client: tuple[TestClient, Session]) -> None:
    with patch(
        "compass_agent.main.get_settings", return_value=Settings(compass_demo_enabled=False)
    ):
        assert client[0].get("/v1/demo/overview").status_code == 404


def test_readiness_fails_without_database() -> None:
    failure = OperationalError("SELECT", {}, Exception("unavailable"))
    with patch("compass_agent.main.get_engine", side_effect=failure), TestClient(app) as client:
        assert client.get("/readyz").status_code == 503
