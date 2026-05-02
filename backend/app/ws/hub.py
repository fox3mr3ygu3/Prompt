"""In-process WebSocket hub for live seat-map updates (R7).

One ``WebSocketHub`` instance per process. ``broadcast(event_id, msg)`` is
called by the booking service when a seat transitions held / released / sold.
Subscribers connect via ``/ws/events/{event_id}/seats``.

Out-of-process fan-out (Redis pub/sub) is intentionally not added here — the
spec runs all FastAPI replicas on one box behind nginx; sticky-by-event-id
upstream hashing keeps the in-process hub correct for now.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class WebSocketHub:
    def __init__(self) -> None:
        self._channels: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, event_id: uuid.UUID, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._channels[event_id].add(ws)
        log.info("ws connect event=%s subs=%d", event_id, len(self._channels[event_id]))

    async def disconnect(self, event_id: uuid.UUID, ws: WebSocket) -> None:
        async with self._lock:
            subs = self._channels.get(event_id)
            if subs is not None:
                subs.discard(ws)
                if not subs:
                    self._channels.pop(event_id, None)
        log.info("ws disconnect event=%s", event_id)

    async def broadcast(self, event_id: uuid.UUID, message: dict[str, Any]) -> None:
        async with self._lock:
            targets: Iterable[WebSocket] = list(self._channels.get(event_id, ()))
        if not targets:
            return
        text = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(text)
            except Exception:  # noqa: BLE001 — drop misbehaving sockets
                dead.append(ws)
        if dead:
            async with self._lock:
                subs = self._channels.get(event_id)
                if subs is not None:
                    for ws in dead:
                        subs.discard(ws)


hub = WebSocketHub()


__all__ = ["WebSocketHub", "hub"]
