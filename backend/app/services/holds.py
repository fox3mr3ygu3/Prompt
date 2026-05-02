"""Seat-hold locking with Redis (R5).

Hold = ``SET NX PX 300000`` on key ``seat:{event_id}:{seat_id}`` storing a
hold-token UUID. TTL is the source of truth — no DB row exists for a live hold.

Conversion to a ticket happens elsewhere (services.booking) and is gated by:
1. The hold-token still being the value at the seat key.
2. The seat not yet being claimed by a non-void ticket (DB unique index).
"""

from __future__ import annotations

import secrets
import time
import uuid
from dataclasses import dataclass

from app.core.config import get_settings
from app.services.redis_client import get_redis


def _seat_key(event_id: uuid.UUID, seat_id: uuid.UUID) -> str:
    return f"seat:{event_id}:{seat_id}"


def _ga_key(event_id: uuid.UUID, hold_token: str) -> str:
    return f"ga:{event_id}:{hold_token}"


def _hold_seats_key(event_id: uuid.UUID, hold_token: str) -> str:
    """Reverse-lookup key: ``hold:{event}:{token}`` → comma-separated seat ids.

    Lets the order endpoint resolve a token back to its seat list with one
    GET instead of an O(N×M) SCAN+GET sweep across every held seat.
    """
    return f"hold:{event_id}:{hold_token}"


@dataclass(frozen=True)
class HoldOutcome:
    held: list[uuid.UUID]
    failed: list[uuid.UUID]
    hold_token: str
    expires_at: float


def hold_seats(
    *, event_id: uuid.UUID, seat_ids: list[uuid.UUID], ttl_seconds: int | None = None
) -> HoldOutcome:
    """Atomically attempt to hold the given seats. Best-effort all-or-nothing.

    If any seat fails to lock, every successful lock is released and the call
    returns with ``held=[]`` and the failed list populated.
    """
    settings = get_settings()
    ttl = ttl_seconds or settings.seat_hold_ttl_seconds
    r = get_redis()
    token = secrets.token_urlsafe(24)

    held: list[uuid.UUID] = []
    failed: list[uuid.UUID] = []
    for sid in seat_ids:
        ok = r.set(_seat_key(event_id, sid), token, nx=True, ex=ttl)
        if ok:
            held.append(sid)
        else:
            failed.append(sid)

    if failed:
        for sid in held:
            _release_if_owner(event_id, sid, token)
        held = []
    elif held:
        # Index the seat list under the hold token so the order endpoint
        # can resolve token → seats in one GET. Same TTL as the seat keys.
        r.set(
            _hold_seats_key(event_id, token),
            ",".join(str(s) for s in held),
            ex=ttl,
        )

    return HoldOutcome(
        held=held, failed=failed, hold_token=token, expires_at=time.time() + ttl
    )


def hold_general_admission(
    *, event_id: uuid.UUID, quantity: int, ttl_seconds: int | None = None
) -> HoldOutcome:
    """General-admission hold — no seat IDs, just a counted reservation token."""
    settings = get_settings()
    ttl = ttl_seconds or settings.seat_hold_ttl_seconds
    r = get_redis()
    token = secrets.token_urlsafe(24)
    r.set(_ga_key(event_id, token), str(quantity), ex=ttl)
    return HoldOutcome(held=[], failed=[], hold_token=token, expires_at=time.time() + ttl)


def get_general_admission_quantity(event_id: uuid.UUID, hold_token: str) -> int | None:
    raw = get_redis().get(_ga_key(event_id, hold_token))
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def get_hold_owner(event_id: uuid.UUID, seat_id: uuid.UUID) -> str | None:
    return get_redis().get(_seat_key(event_id, seat_id))


def get_seats_for_token(event_id: uuid.UUID, hold_token: str) -> list[uuid.UUID]:
    """Resolve a seated hold token back to its seat list.

    Returns ``[]`` if the token has expired or never indexed any seats
    (general-admission holds use a different key).
    """
    raw = get_redis().get(_hold_seats_key(event_id, hold_token))
    if not raw:
        return []
    out: list[uuid.UUID] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(uuid.UUID(part))
        except ValueError:
            continue
    return out


def held_seats(event_id: uuid.UUID) -> set[uuid.UUID]:
    """Return the set of seat IDs currently held for an event.

    Iterates with ``SCAN`` so it doesn't block Redis under load.
    """
    r = get_redis()
    out: set[uuid.UUID] = set()
    pattern = f"seat:{event_id}:*"
    for k in r.scan_iter(match=pattern, count=200):
        # Key shape: "seat:{event_id}:{seat_id}"
        seat_part = k.split(":", 2)[2]
        try:
            out.add(uuid.UUID(seat_part))
        except ValueError:
            continue
    return out


def release_seats(
    event_id: uuid.UUID, seat_ids: list[uuid.UUID], hold_token: str
) -> list[uuid.UUID]:
    """Release the given seats *only if* the caller still owns the lock."""
    released = []
    for sid in seat_ids:
        if _release_if_owner(event_id, sid, hold_token):
            released.append(sid)
    # Drop the reverse-lookup index for the token regardless — the seat
    # locks are now gone, so the index would only point at stale data.
    get_redis().delete(_hold_seats_key(event_id, hold_token))
    return released


def release_general_admission(event_id: uuid.UUID, hold_token: str) -> bool:
    return bool(get_redis().delete(_ga_key(event_id, hold_token)))


# Compare-and-delete via Lua so the check + delete are atomic.
_RELEASE_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
"""


def _release_if_owner(event_id: uuid.UUID, seat_id: uuid.UUID, token: str) -> bool:
    r = get_redis()
    res = r.eval(_RELEASE_LUA, 1, _seat_key(event_id, seat_id), token)
    return bool(res)


__all__ = [
    "HoldOutcome",
    "get_general_admission_quantity",
    "get_hold_owner",
    "get_seats_for_token",
    "held_seats",
    "hold_general_admission",
    "hold_seats",
    "release_general_admission",
    "release_seats",
]
