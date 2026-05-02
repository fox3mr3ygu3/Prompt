"""org dashboard materialised view (R6).

Refreshed CONCURRENTLY by the analytics cron. The unique index on
``organisation_id`` is the prerequisite for ``REFRESH ... CONCURRENTLY``.

Revision ID: 0002_matview
Revises: 0001_init
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002_matview"
down_revision: str | Sequence[str] | None = "0001_init"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


CREATE_VIEW = """
CREATE MATERIALIZED VIEW mv_org_dashboard_kpis AS
SELECT
    e.organisation_id                                              AS organisation_id,
    COUNT(DISTINCT e.id)                                           AS event_count,
    COUNT(t.id) FILTER (WHERE t.status IN ('valid', 'used'))       AS tickets_sold,
    COUNT(t.id) FILTER (WHERE t.status = 'used')                   AS tickets_scanned,
    COALESCE(SUM(o.total_cents) FILTER (WHERE o.status = 'paid'),0) AS gross_cents,
    COALESCE(SUM(o.total_cents) FILTER (WHERE o.status = 'refunded'),0) AS refunds_cents,
    NOW()                                                          AS refreshed_at
FROM events e
LEFT JOIN tickets t ON t.event_id = e.id
LEFT JOIN orders o ON o.id = t.order_id
GROUP BY e.organisation_id
WITH NO DATA;
"""

CREATE_INDEX = (
    "CREATE UNIQUE INDEX ux_mv_org_dashboard_kpis_org_id "
    "ON mv_org_dashboard_kpis (organisation_id)"
)


def upgrade() -> None:
    op.execute(CREATE_VIEW)
    op.execute(CREATE_INDEX)
    # Initial population so first dashboard hit isn't empty.
    op.execute("REFRESH MATERIALIZED VIEW mv_org_dashboard_kpis")


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_org_dashboard_kpis")
