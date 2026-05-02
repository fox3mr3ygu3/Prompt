"""QR ticket payload — compact JWT signed with TICKET_SIGNING_KEY.

Claims: ``{tid, eid, exp}``. Signed with HS256, intentionally separate key
from the auth JWT so leaking one doesn't compromise the other.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from jose import JWTError, jwt

from app.core.config import get_settings

TICKET_ALGO = "HS256"


def sign(*, ticket_id: uuid.UUID, event_id: uuid.UUID, expires_at: datetime) -> str:
    settings = get_settings()
    payload = {
        "tid": str(ticket_id),
        "eid": str(event_id),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, settings.ticket_signing_key, algorithm=TICKET_ALGO)


def verify(token: str) -> dict[str, str]:
    """Return the decoded claims. Raises ``JWTError`` on bad signature/expired."""
    settings = get_settings()
    return jwt.decode(token, settings.ticket_signing_key, algorithms=[TICKET_ALGO])


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


__all__ = ["JWTError", "TICKET_ALGO", "now_utc", "sign", "verify"]
