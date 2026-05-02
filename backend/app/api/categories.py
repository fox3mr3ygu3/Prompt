"""Category tree — top-level categories with their direct children inlined.

Used by the Browse filter chips. The list is small (≤30 rows) and changes
rarely, so we don't cache it explicitly — Postgres + the connection pool
serve it in <1 ms.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.schemas import CategoryOut, CategoryTreeNode
from app.core.deps import DbDep
from app.db.models import Category

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryTreeNode])
def list_categories(db: DbDep) -> list[CategoryTreeNode]:
    """Return top-level categories with their children flattened in.

    Two-tier shape matches the Browse UI exactly: top-level chip plus an
    optional row of sub-chips per top-level selection.
    """
    rows = (
        db.execute(
            select(Category)
            .where(Category.parent_id.is_(None))
            .options(selectinload(Category.children))
            .order_by(Category.name)
        )
        .scalars()
        .all()
    )
    return [
        CategoryTreeNode(
            id=top.id,
            slug=top.slug,
            name=top.name,
            icon=top.icon,
            children=[
                CategoryOut.model_validate(c)
                for c in sorted(top.children, key=lambda c: c.name)
            ],
        )
        for top in rows
    ]
