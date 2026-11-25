from compass_memory.main import app
from fastapi.testclient import TestClient


def test_scaffold_starts_without_other_services_or_credentials(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "invalid://not-used-by-memory")
    monkeypatch.setenv("AGENT_API_URL", "http://127.0.0.1:1")
    with TestClient(app) as client:
        for endpoint in ["/healthz", "/readyz"]:
            response = client.get(endpoint)
            assert response.status_code == 200
            assert response.json() == {
                "status": "ok",
                "service": "compass-memory",
                "stage": "scaffold",
            }
        # Scaffold readiness must not imply that memory business operations exist.
        assert client.post("/v1/memories", json={"content": "example"}).status_code == 404
