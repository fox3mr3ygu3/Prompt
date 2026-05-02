"""Meilisearch indexer + query helper (R5 polyglot persistence).

The index is named ``events`` and is keyed by event UUID. Documents are
flattened to make every searchable surface (title, description, speaker
names, tags, venue name, city) a top-level string.

Indexing happens at: event-publish, event-update, and via a startup full
reindex (idempotent).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import meilisearch

from app.core.config import get_settings
from app.db.models import Event

log = logging.getLogger(__name__)

INDEX_NAME = "events"
SEARCHABLE = ["title", "description", "speakers", "tags", "venue_name", "city"]
FILTERABLE = ["tags", "city", "status"]
SORTABLE = ["starts_at"]


def _client() -> meilisearch.Client:
    s = get_settings()
    return meilisearch.Client(s.meili_url, s.meili_master_key)


def ensure_index() -> None:
    """Idempotent — create the index and apply settings.

    Typo tolerance is left at the Meilisearch defaults (1 typo for ≥5 chars,
    2 typos for ≥9 chars) so "Printed Ta" matches Tashkent-titled events.
    Prefix search is on by default, so "Printed Ta" also matches a prefix
    on the last word.
    """
    try:
        c = _client()
        c.create_index(INDEX_NAME, {"primaryKey": "id"})
    except Exception:  # noqa: BLE001 — already-exists is a 4xx in meili
        log.debug("index create skipped (likely exists)")
    try:
        idx = _client().index(INDEX_NAME)
        idx.update_searchable_attributes(SEARCHABLE)
        idx.update_filterable_attributes(FILTERABLE)
        idx.update_sortable_attributes(SORTABLE)
        # Make sure typo tolerance is on (it's the default, but be explicit
        # so a re-index can't silently flip it off).
        idx.update_typo_tolerance(
            {
                "enabled": True,
                "minWordSizeForTypos": {"oneTypo": 4, "twoTypos": 8},
            }
        )
    except Exception:  # noqa: BLE001
        log.warning("meili settings update failed", exc_info=True)


def to_document(event: Event) -> dict[str, Any]:
    return {
        "id": str(event.id),
        "slug": event.slug,
        "title": event.title,
        "description": event.description,
        "tags": list(event.tags or []),
        "starts_at": int(event.starts_at.timestamp()),
        "ends_at": int(event.ends_at.timestamp()),
        "status": event.status.value if hasattr(event.status, "value") else str(event.status),
        "venue_name": event.room.venue.name if event.room and event.room.venue else "",
        "city": event.room.venue.city if event.room and event.room.venue else "",
        "speakers": [s.name for s in (event.speakers or [])],
    }


def index_event(event: Event) -> None:
    try:
        _client().index(INDEX_NAME).add_documents([to_document(event)])
    except Exception:  # noqa: BLE001
        log.warning("meili index failed for event=%s", event.id, exc_info=True)


def remove_event(event_id: uuid.UUID) -> None:
    try:
        _client().index(INDEX_NAME).delete_document(str(event_id))
    except Exception:  # noqa: BLE001
        log.warning("meili remove failed for event=%s", event_id, exc_info=True)


def search_events(query: str, *, tag: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    filters: list[str] = ["status = 'published'"]
    if tag:
        filters.append(f'tags = "{tag}"')
    try:
        res = _client().index(INDEX_NAME).search(
            query,
            {"filter": " AND ".join(filters), "limit": limit, "sort": ["starts_at:asc"]},
        )
        return list(res.get("hits", []))
    except Exception:  # noqa: BLE001
        log.warning("meili search failed", exc_info=True)
        return []


__all__ = [
    "INDEX_NAME",
    "ensure_index",
    "index_event",
    "remove_event",
    "search_events",
    "to_document",
]
