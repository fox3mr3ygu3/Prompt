"""Refresh the org dashboard materialised view (R6)."""

from __future__ import annotations

import logging

from sqlalchemy import text

from app.db.session import engine

log = logging.getLogger("cron.rollup")


def run() -> None:
    with engine.begin() as conn:
        # CONCURRENTLY requires a unique index — provided in 0002_matview /
        # 0003_zones_categories_card_holders.
        conn.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_org_dashboard_kpis"))
        conn.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_event_browse_card"))
    log.info("matviews refreshed: mv_org_dashboard_kpis, mv_event_browse_card")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run()
