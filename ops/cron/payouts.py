"""Nightly payout job — aggregates yesterday's paid orders per organisation.

Idempotent. ``payouts`` has a uniqueness constraint on
``(organisation_id, period_start, period_end)``, so re-running for the same
day is a no-op (UPSERT on conflict do nothing).
"""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import Event, Order, OrderStatus, Payout
from app.db.session import SessionLocal

log = logging.getLogger("cron.payouts")


def yesterday_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    now = now or datetime.now(timezone.utc)
    today = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    return today - timedelta(days=1), today


def run(now: datetime | None = None) -> int:
    """Returns the number of payout rows written."""
    period_start, period_end = yesterday_window(now)
    written = 0
    with SessionLocal() as db:
        # Aggregate paid orders by organisation in the window.
        rows = db.execute(
            select(Event.organisation_id, Order.currency, Order.total_cents)
            .join(Order, Order.event_id == Event.id)
            .where(
                Order.status == OrderStatus.paid,
                Order.paid_at >= period_start,
                Order.paid_at < period_end,
            )
        ).all()
        per_org: dict[tuple, int] = {}
        for org_id, ccy, cents in rows:
            per_org[(org_id, ccy)] = per_org.get((org_id, ccy), 0) + cents

        for (org_id, ccy), cents in per_org.items():
            stmt = (
                pg_insert(Payout.__table__)  # type: ignore[attr-defined]
                .values(
                    organisation_id=org_id,
                    period_start=period_start,
                    period_end=period_end,
                    amount_cents=cents,
                    currency=ccy,
                )
                .on_conflict_do_nothing(constraint="uq_payout_period_ccy")
            )
            res = db.execute(stmt)
            written += int(getattr(res, "rowcount", 0) or 0)
        db.commit()
    log.info(
        "payouts run window=%s..%s wrote=%d",
        period_start.isoformat(),
        period_end.isoformat(),
        written,
    )
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run()
