"""Smoke tests — service boots, /healthz reachable, /docs renders.

These deliberately don't touch the DB so they pass without a running Postgres
on the CI box. The `APP_ENV=test` env disables telemetry + meili bootstrap.
"""

from __future__ import annotations

import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("APP_DEBUG", "false")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def test_healthz() -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_openapi_schema_present() -> None:
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert r.json()["info"]["title"] == "quick-conf"


def test_docs_renders() -> None:
    r = client.get("/docs")
    assert r.status_code == 200
    assert "swagger" in r.text.lower()


def test_login_requires_credentials() -> None:
    r = client.post("/api/auth/token", data={"username": "", "password": ""})
    # Form-validation 4xx is acceptable; we just want the route to exist.
    assert r.status_code in (400, 401, 422)
