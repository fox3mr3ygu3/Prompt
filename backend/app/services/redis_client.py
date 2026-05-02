"""Lazy Redis client — one shared connection pool per process.

Used for seat-hold locks (R5/R7), hot-page cache (R6), and rate-limiter
counters if the backend ever serves traffic without nginx.
"""

from __future__ import annotations

from functools import lru_cache

import redis

from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_redis() -> redis.Redis:
    settings = get_settings()
    return redis.Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


__all__ = ["get_redis"]
