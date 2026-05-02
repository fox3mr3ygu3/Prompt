"""add currency to payouts unique constraint.

The original ``uq_payout_period`` constraint excluded ``currency`` from the
key, so the cron payout job — which aggregates per ``(org_id, currency)``
— silently dropped every-second-currency row via ``ON CONFLICT DO NOTHING``.
Including currency in the key lets a single org settle multiple currencies
on the same day.

Revision ID: 0004_payouts_ccy
Revises: 0003_zones_cards
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004_payouts_ccy"
down_revision: str | Sequence[str] | None = "0003_zones_cards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_payout_period", "payouts", type_="unique")
    op.create_unique_constraint(
        "uq_payout_period_ccy",
        "payouts",
        ["organisation_id", "period_start", "period_end", "currency"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_payout_period_ccy", "payouts", type_="unique")
    op.create_unique_constraint(
        "uq_payout_period",
        "payouts",
        ["organisation_id", "period_start", "period_end"],
    )
