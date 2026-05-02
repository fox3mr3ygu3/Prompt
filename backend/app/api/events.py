"""Event listing & detail (R6 cache target).

The list endpoint reads from the ``mv_event_browse_card`` materialised view —
a single indexed scan returns the cards the SPA renders, including the
min/max ticket price and the venue + category labels. The view is refreshed
CONCURRENTLY by the rollup cron (see ops/cron/rollup.py).

Free-text ``q`` queries are routed through Meilisearch first (typo-tolerant
prefix-aware search across title/description/tags/speakers/venue/city); the
hit ids are then loaded from the matview so every other field (price, venue,
category) stays consistent with the rest of the list.

The detail endpoint stays cache-backed (Redis, 60 s TTL keyed by schema_ver)
so the hot path on a popular event does at most one Postgres round-trip per
minute.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    CategoryOut,
    EventDetail,
    EventListItem,
    PriceTierOut,
    RoomOut,
    SeatMap,
    SeatOut,
    SpeakerOut,
    VenueOut,
)
from app.core.deps import DbDep
from app.db.models import Event, Room, Ticket, TicketStatus
from app.services import cache, holds
from app.services import search as search_svc

router = APIRouter(prefix="/events", tags=["events"])


def resolve_event(db: Session, ref: str) -> Event | None:
    """Look up an event by either UUID or slug."""
    try:
        return db.get(Event, uuid.UUID(ref))
    except ValueError:
        return db.execute(select(Event).where(Event.slug == ref)).scalar_one_or_none()


@router.get("", response_model=list[EventListItem])
def list_events(
    db: DbDep,
    q: str | None = Query(default=None, description="Typo-tolerant full-text query"),
    tag: str | None = Query(default=None, description="Match a value in the JSONB tags array"),
    category: str | None = Query(default=None, description="Filter by category slug"),
    city: str | None = Query(default=None, description="Filter by venue city"),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[EventListItem]:
    """Browse-card list, served from ``mv_event_browse_card``.

    ``q`` short-circuits via Meilisearch — the engine handles typos
    ("Printed Ta" → events titled "Tashkent…"), prefix matching, and
    cross-field scoring (title/description/tags/speakers/venue/city). The
    hit ids are then loaded from the matview so price/venue/category stay
    consistent with the rest of the list.

    All other filters (tag/category/city) hit the matview directly, where
    the GIN index on tags + B-tree on (status, starts_at) keep the scan
    sub-millisecond.
    """
    if q and q.strip():
        # Pull a wider window from Meilisearch so we can still apply the
        # category/city filters DB-side without losing all results.
        meili_hits = search_svc.search_events(
            q.strip(),
            tag=tag,
            limit=max(limit + offset, 50),
        )
        hit_ids: list[uuid.UUID] = []
        for h in meili_hits:
            try:
                hit_ids.append(uuid.UUID(str(h.get("id"))))
            except (ValueError, TypeError):
                continue
        if not hit_ids:
            return []
        return _load_browse_cards(
            db,
            event_ids=hit_ids,
            tag=tag,
            category=category,
            city=city,
            limit=limit,
            offset=offset,
        )

    return _load_browse_cards(
        db,
        event_ids=None,
        tag=tag,
        category=category,
        city=city,
        limit=limit,
        offset=offset,
    )


def _load_browse_cards(
    db: Session,
    *,
    event_ids: list[uuid.UUID] | None,
    tag: str | None,
    category: str | None,
    city: str | None,
    limit: int,
    offset: int,
) -> list[EventListItem]:
    """Read browse-card rows from the matview with the given filter set."""
    where: list[str] = ["status = 'published'"]
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if event_ids is not None:
        where.append("event_id = ANY(:event_ids)")
        params["event_ids"] = event_ids
    if tag:
        # json.dumps escapes the tag so the JSONB containment check stays safe.
        where.append("tags @> CAST(:tag_arr AS jsonb)")
        params["tag_arr"] = json.dumps([tag])
    if city:
        where.append("venue_city = :city")
        params["city"] = city
    if category:
        ids = (
            db.execute(
                text(
                    "SELECT id FROM categories WHERE slug = :slug "
                    "UNION ALL "
                    "SELECT c.id FROM categories c "
                    "JOIN categories p ON p.id = c.parent_id "
                    "WHERE p.slug = :slug"
                ),
                {"slug": category},
            )
            .scalars()
            .all()
        )
        if ids:
            where.append("category_id = ANY(:cat_ids)")
            params["cat_ids"] = list(ids)
        else:
            return []

    where_sql = " AND ".join(where)
    # Preserve Meilisearch ordering when we have a hit list; otherwise
    # default to chronological.
    order_sql = (
        "array_position(:event_ids, event_id)"
        if event_ids is not None
        else "starts_at ASC"
    )
    sql = text(
        f"""
        SELECT
            event_id            AS id,
            slug,
            title,
            cover_image_url,
            starts_at,
            ends_at,
            status,
            tags,
            venue_name,
            venue_city,
            category_slug,
            category_name,
            category_icon,
            min_price_cents,
            max_price_cents
        FROM mv_event_browse_card
        WHERE {where_sql}
        ORDER BY {order_sql}
        LIMIT :limit OFFSET :offset
        """
    )
    rows = db.execute(sql, params).mappings().all()
    return [EventListItem.model_validate(dict(r)) for r in rows]


@router.get("/{event_ref}", response_model=EventDetail)
def get_event(event_ref: str, db: DbDep) -> dict[str, Any]:
    event = resolve_event(db, event_ref)
    if event is None:
        raise HTTPException(404, "event not found")
    cached = cache.get_event(event.id, event.schema_ver)
    if cached is not None:
        return cached
    payload = _build_event_detail(db, event)
    cache.set_event(event.id, event.schema_ver, payload)
    return payload


def _build_event_detail(db: Session, event: Event) -> dict[str, Any]:
    detail = db.execute(
        select(Event)
        .where(Event.id == event.id)
        .options(
            selectinload(Event.price_tiers),
            selectinload(Event.speakers),
            selectinload(Event.category),
            selectinload(Event.room).selectinload(Room.venue),
        )
    ).scalar_one()
    out = EventDetail(
        id=detail.id,
        slug=detail.slug,
        title=detail.title,
        description=detail.description,
        cover_image_url=detail.cover_image_url,
        starts_at=detail.starts_at,
        ends_at=detail.ends_at,
        status=detail.status,
        tags=detail.tags,
        venue=VenueOut.model_validate(detail.room.venue),
        room=RoomOut.model_validate(detail.room),
        category=(CategoryOut.model_validate(detail.category) if detail.category else None),
        price_tiers=[PriceTierOut.model_validate(t) for t in detail.price_tiers],
        speakers=[SpeakerOut.model_validate(s) for s in detail.speakers],
    )
    return out.model_dump(mode="json")


@router.get("/{event_ref}/seats", response_model=SeatMap)
def get_seat_map(event_ref: str, db: DbDep) -> SeatMap:
    event = resolve_event(db, event_ref)
    if event is None:
        raise HTTPException(404, "event not found")
    room = db.execute(
        select(Room).where(Room.id == event.room_id).options(selectinload(Room.seats))
    ).scalar_one()
    sold_seat_ids = {
        sid
        for sid, in db.execute(
            select(Ticket.seat_id).where(
                Ticket.event_id == event.id,
                Ticket.status.in_((TicketStatus.valid, TicketStatus.used)),
                Ticket.seat_id.is_not(None),
            )
        ).all()
        if sid is not None
    }
    held_set = holds.held_seats(event.id)
    seat_outs: list[SeatOut] = []
    for s in sorted(room.seats, key=lambda s: (s.row_label, s.col_number)):
        if s.id in sold_seat_ids:
            state = "sold"
        elif s.id in held_set:
            state = "held"
        else:
            state = "free"
        seat_outs.append(
            SeatOut(
                id=s.id,
                row_label=s.row_label,
                col_number=s.col_number,
                state=state,
            )
        )
    return SeatMap(
        event_id=event.id,
        room=RoomOut.model_validate(room),
        seats=seat_outs,
    )
