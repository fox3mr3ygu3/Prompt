"""backfill row-priced tiers on events that still have only a "Standard" tier.

Events approved via the pre-row-pricing ``approve_proposal`` endpoint kept
a single ``PriceTier(name='Standard')``. The booking + seat-map services
read the band-named tiers (Front/Middle/Back) and fall back to the only
tier when those are missing — which silently disables row pricing for
those events. This data-migration replaces the lone ``Standard`` tier
with the canonical 3-band set:

  Front  = round(price * 1.5),  capacity = ⌊cap/3⌋
  Middle = price,               capacity = ⌊cap/3⌋
  Back   = round(price * 0.7),  capacity = cap - 2·⌊cap/3⌋

The legacy ``Standard`` tier is dropped *only* if no tickets reference
it; otherwise it is left in place so existing tickets keep their FK.
The multipliers + capacity split mirror ``app.services.pricing`` so this
SQL stays in lockstep with the Python helpers.

Idempotent: events that already have any of Front/Middle/Back are
skipped, so re-running this migration on top of itself is a no-op.

Revision ID: 0007_backfill_row_tiers
Revises: 0006_event_proposals
Create Date: 2026-05-06
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0007_backfill_row_tiers"
down_revision: str | Sequence[str] | None = "0006_event_proposals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Insert Front/Middle/Back for events that only have a Standard tier ──
    op.execute(
        """
        WITH standard_only AS (
            SELECT pt.event_id,
                   pt.price_cents,
                   pt.currency,
                   r.capacity AS room_capacity
            FROM price_tiers pt
            JOIN events e ON e.id = pt.event_id
            JOIN rooms  r ON r.id = e.room_id
            WHERE pt.name = 'Standard'
              AND NOT EXISTS (
                  SELECT 1 FROM price_tiers x
                  WHERE x.event_id = pt.event_id
                    AND x.name IN ('Front', 'Middle', 'Back')
              )
        )
        INSERT INTO price_tiers (event_id, name, price_cents, currency, capacity)
        SELECT event_id, 'Front',  ROUND(price_cents * 1.5)::int, currency,
               room_capacity / 3
          FROM standard_only
        UNION ALL
        SELECT event_id, 'Middle', price_cents,                   currency,
               room_capacity / 3
          FROM standard_only
        UNION ALL
        SELECT event_id, 'Back',   ROUND(price_cents * 0.7)::int, currency,
               room_capacity - 2 * (room_capacity / 3)
          FROM standard_only
        """
    )

    # ── Drop orphan Standard tiers when nothing references them ────────────
    op.execute(
        """
        DELETE FROM price_tiers pt
        WHERE pt.name = 'Standard'
          AND EXISTS (
              SELECT 1 FROM price_tiers x
              WHERE x.event_id = pt.event_id
                AND x.name IN ('Front', 'Middle', 'Back')
          )
          AND NOT EXISTS (
              SELECT 1 FROM tickets t WHERE t.price_tier_id = pt.id
          )
        """
    )

    # ── Bump schema_ver on every event that now has row tiers ──────────────
    # The event-detail cache key includes schema_ver, so this guarantees the
    # next request reads fresh tier data instead of a stale Standard payload.
    op.execute(
        """
        UPDATE events e
        SET schema_ver = schema_ver + 1
        WHERE EXISTS (
            SELECT 1 FROM price_tiers pt
            WHERE pt.event_id = e.id
              AND pt.name IN ('Front', 'Middle', 'Back')
        )
        """
    )

    # ── Refresh the browse-card matview so min/max prices reflect new tiers ─
    op.execute("REFRESH MATERIALIZED VIEW mv_event_browse_card")


def downgrade() -> None:
    # No-op: this is a one-way data fix. Reverting would require re-collapsing
    # Front/Middle/Back into a single Standard tier and rewriting any tickets
    # that already reference Front/Back, which is destructive and out of scope.
    pass
