"""zones, hierarchical categories, ticket holder split, card-on-order, browse matview.

Adds:
- ``categories``  — top-level + child categories via ``parent_id`` self-FK.
- ``zones``       — per-event price tiers with a ``level`` (1=closest-to-stage).
                    Replaces ``price_tiers`` for seated rooms; the latter is
                    kept for back-compat with existing seed/data but new
                    seated events should use zones for per-section pricing.
- ``seats.zone_id`` FK so the seat-map UI can colour by zone + price.
- ``events.category_id``, ``events.cover_image_url``.
- ``tickets.first_name`` + ``tickets.last_name`` (drop ``holder_name``).
- ``orders.card_pan`` + ``card_last4`` + ``card_brand`` + ``card_holder`` +
  ``card_exp_month`` + ``card_exp_year``.

  ⚠ Demo-only: storing a full PAN in plaintext is a PCI violation in any real
  deployment. We persist it because the coursework spec asks for it and the
  ``orders → tickets`` FK lets the admin/refund flow trace cards-to-tickets.

Revision ID: 0003_zones_categories_card_holders
Revises: 0002_matview
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_zones_cards"
down_revision: str | Sequence[str] | None = "0002_matview"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── categories ──────────────────────────────────────────────────────────
    op.create_table(
        "categories",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("icon", sa.String(32), nullable=False, server_default=""),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])

    # ── zones ───────────────────────────────────────────────────────────────
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
        # 1 = closest to stage / VIP; higher numbers = further back.
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        # Hex colour used by the seat-map UI for unsold seats in this zone.
        sa.Column("color_hint", sa.String(16), nullable=False, server_default=""),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("event_id", "name", name="uq_zone_per_event"),
        sa.CheckConstraint("price_cents >= 0", name="ck_zones_price_nonneg"),
        sa.CheckConstraint("level >= 1", name="ck_zones_level_positive"),
    )
    op.create_index("ix_zones_event_id", "zones", ["event_id"])
    op.create_index("ix_zones_event_id_level", "zones", ["event_id", "level"])

    # ── seats.zone_id ───────────────────────────────────────────────────────
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

    # ── events: category + cover image ─────────────────────────────────────
    op.add_column(
        "events",
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "events",
        sa.Column("cover_image_url", sa.String(512), nullable=False, server_default=""),
    )
    op.create_index(
        "ix_events_category_starts_at",
        "events",
        ["category_id", "starts_at"],
    )

    # ── tickets: first_name + last_name (drop holder_name) ─────────────────
    op.add_column(
        "tickets",
        sa.Column("first_name", sa.String(128), nullable=False, server_default=""),
    )
    op.add_column(
        "tickets",
        sa.Column("last_name", sa.String(128), nullable=False, server_default=""),
    )
    # Backfill from holder_name: split on the first space.
    op.execute(
        "UPDATE tickets "
        "SET first_name = COALESCE(NULLIF(split_part(holder_name, ' ', 1), ''), ''), "
        "    last_name  = COALESCE(NULLIF(substring(holder_name FROM position(' ' IN holder_name) + 1), ''), '') "
        "WHERE holder_name IS NOT NULL AND holder_name <> ''"
    )
    op.drop_column("tickets", "holder_name")

    # ── orders: card details ────────────────────────────────────────────────
    # Demo-only — see module docstring.
    op.add_column("orders", sa.Column("card_pan", sa.String(19), nullable=True))
    op.add_column("orders", sa.Column("card_last4", sa.String(4), nullable=True))
    op.add_column("orders", sa.Column("card_brand", sa.String(16), nullable=True))
    op.add_column("orders", sa.Column("card_holder", sa.String(255), nullable=True))
    op.add_column("orders", sa.Column("card_exp_month", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("card_exp_year", sa.Integer(), nullable=True))

    # ── browse-card matview (R6) ───────────────────────────────────────────
    # One indexed scan per Browse-page render. Refreshed CONCURRENTLY by the
    # rollup cron alongside mv_org_dashboard_kpis.
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
    # GIN on tags so JSONB containment hits the matview as fast as the base table.
    op.execute(
        "CREATE INDEX ix_mv_event_browse_card_tags_gin "
        "ON mv_event_browse_card USING GIN (tags jsonb_path_ops)"
    )
    op.execute("REFRESH MATERIALIZED VIEW mv_event_browse_card")


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_event_browse_card")

    for col in (
        "card_exp_year",
        "card_exp_month",
        "card_holder",
        "card_brand",
        "card_last4",
        "card_pan",
    ):
        op.drop_column("orders", col)

    op.add_column(
        "tickets",
        sa.Column("holder_name", sa.String(255), nullable=False, server_default=""),
    )
    op.execute(
        "UPDATE tickets SET holder_name = TRIM(BOTH ' ' FROM (first_name || ' ' || last_name))"
    )
    op.drop_column("tickets", "last_name")
    op.drop_column("tickets", "first_name")

    op.drop_index("ix_events_category_starts_at", table_name="events")
    op.drop_column("events", "cover_image_url")
    op.drop_column("events", "category_id")

    op.drop_index("ix_seats_zone_id", table_name="seats")
    op.drop_column("seats", "zone_id")

    op.drop_index("ix_zones_event_id_level", table_name="zones")
    op.drop_index("ix_zones_event_id", table_name="zones")
    op.drop_table("zones")

    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_table("categories")
