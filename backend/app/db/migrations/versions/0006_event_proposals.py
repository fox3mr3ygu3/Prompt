"""event proposals — organiser submits, admin approves/rejects.

The organiser-side "Add Event" flow inserts a row in ``event_proposals``
with status=pending. The admin can flip it to approved (which the API
layer then materialises into Venue/Room/Seats/Event/PriceTier in one
transaction) or rejected (with a non-empty ``reject_reason``). The
table is the single source of truth for the approval workflow.

Revision ID: 0006_event_proposals
Revises: 0005_drop_zones
Create Date: 2026-04-29
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_event_proposals"
down_revision: str | Sequence[str] | None = "0005_drop_zones"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "event_proposals",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organisation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "submitted_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("city", sa.String(128), nullable=False, server_default=""),
        sa.Column("venue_name", sa.String(255), nullable=False, server_default=""),
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("cover_image_url", sa.String(512), nullable=False, server_default=""),
        sa.Column("seats", sa.Integer(), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("category_slug", sa.String(64), nullable=False, server_default=""),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("reject_reason", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "decided_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint("seats > 0", name="proposal_seats_positive"),
        sa.CheckConstraint("price_cents >= 0", name="proposal_price_nonneg"),
        sa.CheckConstraint("ends_at > starts_at", name="proposal_ends_after_starts"),
    )
    op.create_index(
        "ix_event_proposals_organisation_id",
        "event_proposals",
        ["organisation_id"],
    )
    op.create_index(
        "ix_event_proposals_status",
        "event_proposals",
        ["status"],
    )
    op.create_index(
        "ix_event_proposals_created_at",
        "event_proposals",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_event_proposals_created_at", table_name="event_proposals")
    op.drop_index("ix_event_proposals_status", table_name="event_proposals")
    op.drop_index("ix_event_proposals_organisation_id", table_name="event_proposals")
    op.drop_table("event_proposals")
