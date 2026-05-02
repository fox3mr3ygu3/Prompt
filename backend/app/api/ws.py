"""WebSocket router — live seat-map updates.

Accepts either a UUID or a slug in the path so the SPA's slug-based URLs
work (e.g. ``/ws/events/ml-summit-2026/seats``).
"""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.db.models import Event
from app.db.session import SessionLocal
from app.ws.hub import hub

router = APIRouter()

# Bound how long we'll wait for inbound traffic before pinging the client.
# Without this, an ungracefully-disconnected socket can sit half-dead until
# proxy / OS keepalive eventually reaps it (minutes — sometimes never).
_IDLE_PING_SECONDS = 30


def _resolve_event_id(ref: str) -> uuid.UUID | None:
    """Resolve a slug-or-UUID reference to the event's UUID.

    Mirrors :func:`app.api.events.resolve_event` but returns just the id —
    the WS hub keys channels by uuid, so we don't need the full row.
    """
    try:
        return uuid.UUID(ref)
    except ValueError:
        with SessionLocal() as db:
            row = db.execute(
                select(Event.id).where(Event.slug == ref)
            ).scalar_one_or_none()
            return row


@router.websocket("/ws/events/{event_ref}/seats")
async def event_seats_ws(ws: WebSocket, event_ref: str) -> None:
    eid = _resolve_event_id(event_ref)
    if eid is None:
        await ws.close(code=1008, reason="event not found")
        return
    await hub.connect(eid, ws)
    try:
        while True:
            # We don't accept inbound traffic; the receive_text() call
            # exists purely to detect a disconnect. Pinging on idle proves
            # liveness and lets us drop sockets the client has half-closed.
            try:
                await asyncio.wait_for(
                    ws.receive_text(), timeout=_IDLE_PING_SECONDS
                )
            except asyncio.TimeoutError:
                await ws.send_text('{"type":"ping"}')
    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError fires when send/receive runs on a closed socket
        # (e.g. peer crashed). Treat the same as a clean disconnect.
        pass
    finally:
        await hub.disconnect(eid, ws)
