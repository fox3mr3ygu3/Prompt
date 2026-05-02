"""drop zones — single-tier pricing per event.

Pricing was originally split across ``zones`` (per-event positional bands) and
``price_tiers`` (legacy / GA fallback). The product decision is now to charge
a single price for every seat in an event, so the zones machinery is dropped:

- the per-event ``zones`` table is removed;
- ``seats.zone_id`` FK + index disappear;
- ``mv_event_browse_card`` is rebuilt without the ``zones`` join — min/max
  price now collapses to ``price_tiers.price_cents``.

Revision ID: 0005_drop_zones
Revises: 0004_payouts_ccy
Create Date: 2026-04-29
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0005_drop_zones"
down_revision: str | Sequence[str] | None = "0004_payouts_ccy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Drop the matview first — it joins zones, so it has to go before the table.
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_event_browse_card")

    op.drop_index("ix_seats_zone_id", table_name="seats")
    op.drop_column("seats", "zone_id")

    op.drop_index("ix_zones_event_id_level", table_name="zones")
    op.drop_index("ix_zones_event_id", table_name="zones")
    op.drop_table("zones")

    # Rebuild the browse-card matview without the zones join. min/max
    # collapse to price_tiers; events without a tier read 0/0 (the matview
    # default), which the SPA already renders as "—".
    op.execute(
        """
        CREATE MATERIALIZED VIEW mv_event_browse_card AS
        SELECT
            e.id                                AS event_id,
            e.slug,
            e.title,
            e.description,
            e.cover_image_url,
            e.starts_at,
            e.ends_at,
            e.tags,
            e.status,
            e.organisation_id,
            e.category_id,
            v.id                                AS venue_id,
            v.name                              AS venue_name,
            v.city                              AS venue_city,
            v.country                           AS venue_country,
            r.kind                              AS room_kind,
            c.slug                              AS category_slug,
            c.name                              AS category_name,
            c.icon                              AS category_icon,
            COALESCE(MIN(pt.price_cents), 0)    AS min_price_cents,
            COALESCE(MAX(pt.price_cents), 0)    AS max_price_cents
        FROM events e
        LEFT JOIN rooms       r  ON r.id  = e.room_id
        LEFT JOIN venues      v  ON v.id  = r.venue_id
        LEFT JOIN categories  c  ON c.id  = e.category_id
        LEFT JOIN price_tiers pt ON pt.event_id = e.id
        GROUP BY e.id, v.id, r.id, c.id;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX ux_mv_event_browse_card_event_id "
        "ON mv_event_browse_card (event_id)"
    )
    op.execute(
        "CREATE INDEX ix_mv_event_browse_card_status_starts_at "
        "ON mv_event_browse_card (status, starts_at)"
    )
    op.execute(
        "CREATE INDEX ix_mv_event_browse_card_category "
        "ON mv_event_browse_card (category_id) WHERE category_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX ix_mv_event_browse_card_tags_gin "
        "ON mv_event_browse_card USING GIN (tags jsonb_path_ops)"
    )
    op.execute("REFRESH MATERIALIZED VIEW mv_event_browse_card")


def downgrade() -> None:
    # Best-effort reverse: recreate empty zones + seats.zone_id, rebuild the
    # original matview shape (with the zones join). Existing zone data is
    # gone; that's the price of the irreversible product decision.
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql

    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_event_browse_card")

    op.create_table(
        "zones",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("color_hint", sa.String(16), nullable=False, server_default=""),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("event_id", "name", name="uq_zone_per_event"),
        sa.CheckConstraint("price_cents >= 0", name="ck_zones_price_nonneg"),
        sa.CheckConstraint("level >= 1", name="ck_zones_level_positive"),
    )
    op.create_index("ix_zones_event_id", "zones", ["event_id"])
    op.create_index("ix_zones_event_id_level", "zones", ["event_id", "level"])
    op.add_column(
        "seats",
        sa.Column(
            "zone_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("zones.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_seats_zone_id", "seats", ["zone_id"])

    op.execute(
        """
        CREATE MATERIALIZED VIEW mv_event_browse_card AS
        SELECT
            e.id                                AS event_id,
            e.slug,
            e.title,
            e.description,
            e.cover_image_url,
            e.starts_at,
            e.ends_at,
            e.tags,
            e.status,
            e.organisation_id,
            e.category_id,
            v.id                                AS venue_id,
            v.name                              AS venue_name,
            v.city                              AS venue_city,
            v.country                           AS venue_country,
            r.kind                              AS room_kind,
            c.slug                              AS category_slug,
            c.name                              AS category_name,
            c.icon                              AS category_icon,
            COALESCE(MIN(z.price_cents),
                     COALESCE(MIN(pt.price_cents), 0))  AS min_price_cents,
            COALESCE(MAX(z.price_cents),
                     COALESCE(MAX(pt.price_cents), 0))  AS max_price_cents
        FROM events e
        LEFT JOIN rooms       r  ON r.id  = e.room_id
        LEFT JOIN venues      v  ON v.id  = r.venue_id
        LEFT JOIN categories  c  ON c.id  = e.category_id
        LEFT JOIN zones       z  ON z.event_id = e.id
        LEFT JOIN price_tiers pt ON pt.event_id = e.id
        GROUP BY e.id, v.id, r.id, c.id;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX ux_mv_event_browse_card_event_id "
        "ON mv_event_browse_card (event_id)"
    )
    op.execute(
        "CREATE INDEX ix_mv_event_browse_card_status_starts_at "
        "ON mv_event_browse_card (status, starts_at)"
    )
    op.execute(
        "CREATE INDEX ix_mv_event_browse_card_category "
        "ON mv_event_browse_card (category_id) WHERE category_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX ix_mv_event_browse_card_tags_gin "
        "ON mv_event_browse_card USING GIN (tags jsonb_path_ops)"
    )
    op.execute("REFRESH MATERIALIZED VIEW mv_event_browse_card")
