"""Redis hot-page cache (R6).

Per-event JSON blob with a 60-second TTL. Cache key embeds ``schema_ver`` so a
schema bump invalidates every pre-existing entry without a DEL sweep.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from app.services.redis_client import get_redis

log = logging.getLogger(__name__)

DEFAULT_TTL_SECONDS = 60


def event_key(event_id: uuid.UUID, schema_ver: int) -> str:
    return f"cache:event:{event_id}:v{schema_ver}"


def get_event(event_id: uuid.UUID, schema_ver: int) -> dict[str, Any] | None:
    try:
        raw = get_redis().get(event_key(event_id, schema_ver))
    except Exception:  # noqa: BLE001 — fail open on cache outage
        log.warning("cache get failed", exc_info=True)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def set_event(
    event_id: uuid.UUID, schema_ver: int, payload: dict[str, Any], ttl: int = DEFAULT_TTL_SECONDS
) -> None:
    try:
        get_redis().set(event_key(event_id, schema_ver), json.dumps(payload, default=str), ex=ttl)
    except Exception:  # noqa: BLE001 — cache writes are best-effort
        log.warning("cache set failed", exc_info=True)


def invalidate_event(event_id: uuid.UUID, schema_ver: int) -> None:
    try:
        get_redis().delete(event_key(event_id, schema_ver))
    except Exception:  # noqa: BLE001
        log.warning("cache invalidate failed", exc_info=True)


__all__ = ["DEFAULT_TTL_SECONDS", "event_key", "get_event", "invalidate_event", "set_event"]
