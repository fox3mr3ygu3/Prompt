"""Expired-hold sweeper.

Two responsibilities — both *hygiene*, not correctness (see ADR-001):

1. Cancel ``orders`` rows still in ``pending`` after 30 minutes. This catches
   the rare case where a payment crashed mid-flight and never flipped the
   status. Their tickets get marked ``void`` so the partial unique index
   stops protecting their seat.
2. Fire a broadcast for any seat whose Redis hold has expired but the SPA
   may not have observed (best-effort — the WS broadcast on TTL expiry
   isn't guaranteed because Redis ``notify-keyspace-events`` is off by
   default).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db.models import Order, OrderStatus, TicketStatus
from app.db.session import SessionLocal

log = logging.getLogger("cron.sweeper")

PENDING_GRACE_MINUTES = 30


def _sweep_pending_orders() -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=PENDING_GRACE_MINUTES)
    swept = 0
    with SessionLocal() as db:
        stale = db.execute(
            select(Order).where(
                Order.status == OrderStatus.pending,
                Order.created_at < cutoff,
            )
        ).scalars().all()
        for order in stale:
            order.status = OrderStatus.failed
            for t in order.tickets:
                if t.status == TicketStatus.valid:
                    t.status = TicketStatus.void
            swept += 1
        db.commit()
    return swept


def run() -> None:
    n = _sweep_pending_orders()
    log.info("sweeper voided=%d pending-orders", n)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run()
