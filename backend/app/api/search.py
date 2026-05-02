"""Public search endpoint — anonymous, full-text via Meilisearch."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.services import search as svc

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(
    q: str = Query(default="", description="Free-text query"),
    tag: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    hits = svc.search_events(q, tag=tag, limit=limit)
    return {"hits": hits, "count": len(hits)}
