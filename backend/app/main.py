"""FastAPI entrypoint.

All routers live under ``/api`` so the nginx upstream can split SPA vs API
traffic by prefix. WebSockets live under ``/ws``. ``/docs`` and ``/openapi.json``
are kept top-level so they're trivially reachable in dev.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import (
    admin,
    auth,
    categories,
    events,
    holds as holds_router,
    orders,
    org,
    scans,
    search,
    ws,
)
from app.core.config import get_settings
from app.db.session import engine

log = logging.getLogger(__name__)


def _bootstrap_meili() -> None:
    """Run ``search.ensure_index()`` off the lifespan critical path."""
    try:
        from app.services import search as search_svc

        search_svc.ensure_index()
    except Exception:  # noqa: BLE001
        log.warning("meili index bootstrap skipped", exc_info=True)


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    bg: asyncio.Task[None] | None = None
    if settings.app_env != "test":
        # Run in a thread so a slow Meili doesn't block FastAPI startup —
        # the search router fails open if the index isn't ready yet.
        bg = asyncio.create_task(asyncio.to_thread(_bootstrap_meili))
    try:
        yield
    finally:
        if bg is not None and not bg.done():
            bg.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        debug=settings.app_debug,
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
        lifespan=_lifespan,
    )

    # Permissive CORS for dev; nginx tightens this in prod.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Meta ────────────────────────────────────────────────────────────────
    @app.get("/healthz", tags=["meta"])
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz", tags=["meta"])
    def readyz() -> dict[str, object]:
        ok_db = True
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception:  # noqa: BLE001
            ok_db = False
        return {"status": "ready" if ok_db else "degraded", "db": ok_db}

    # ── Routers ─────────────────────────────────────────────────────────────
    api_prefix = "/api"
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(categories.router, prefix=api_prefix)
    app.include_router(events.router, prefix=api_prefix)
    app.include_router(holds_router.router, prefix=api_prefix)
    app.include_router(orders.router, prefix=api_prefix)
    app.include_router(orders.me_router, prefix=api_prefix)
    app.include_router(scans.router, prefix=api_prefix)
    app.include_router(org.router, prefix=api_prefix)
    app.include_router(admin.router, prefix=api_prefix)
    app.include_router(search.router, prefix=api_prefix)
    app.include_router(ws.router)  # /ws/... at root

    # ── Telemetry — opt-in (off by default in tests) ───────────────────────
    if settings.app_env != "test":
        try:
            from app.core.telemetry import setup_telemetry

            setup_telemetry(app)
        except Exception:  # noqa: BLE001
            log.warning("telemetry init failed; continuing without it", exc_info=True)

    return app


app = create_app()
