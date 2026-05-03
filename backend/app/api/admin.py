"""Admin endpoints — ticket roster + refunds.

The roster is a single SQL join across Ticket / Order / Event / User /
Seat / PriceTier — every column the admin table renders is materialised
DB-side (this is a database-management project: the backend is supposed
to do the data work, the SPA just paints).
"""

from __future__ import annotations

import logging
import math
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.schemas import (
    AdminTicketOut,
    OrderOut,
    ProposalOut,
    ProposalRejectRequest,
    RefundRequest,
    TicketOut,
)
from app.core.deps import CurrentUserDep, DbDep, require_role
from app.db.models import (
    Category,
    Event,
    EventProposal,
    EventStatus,
    Order,
    OrderStatus,
    Organisation,
    PriceTier,
    ProposalStatus,
    Room,
    RoomKind,
    Seat,
    Ticket,
    TicketStatus,
    User,
    UserRole,
    Venue,
)
from app.services import pricing
from app.services import search as search_svc
from app.services.cache import invalidate_event

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get(
    "/tickets",
    response_model=list[AdminTicketOut],
    dependencies=[Depends(require_role(UserRole.admin))],
)
def list_tickets(
    db: DbDep,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[AdminTicketOut]:
    """Flat list of every ticket — joined with event / buyer / seat / price.

    Hides ``void`` tickets so the admin only sees real money. Sorted by
    most-recently issued first so the latest activity is at the top.
    """
    rows = db.execute(
        select(
            Ticket.id.label("ticket_id"),
            Ticket.order_id,
            Event.title.label("event_title"),
            Event.slug.label("event_slug"),
            User.email.label("buyer_email"),
            User.full_name.label("buyer_full_name"),
            Ticket.first_name.label("holder_first_name"),
            Ticket.last_name.label("holder_last_name"),
            Seat.row_label,
            Seat.col_number,
            PriceTier.price_cents,
            PriceTier.currency,
            Ticket.status.label("ticket_status"),
            Order.status.label("order_status"),
            Ticket.issued_at,
        )
        .join(Order, Order.id == Ticket.order_id)
        .join(User, User.id == Order.user_id)
        .join(Event, Event.id == Ticket.event_id)
        .join(PriceTier, PriceTier.id == Ticket.price_tier_id)
        .outerjoin(Seat, Seat.id == Ticket.seat_id)
        .where(Ticket.status != TicketStatus.void)
        .order_by(Ticket.issued_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return [
        AdminTicketOut(
            ticket_id=r.ticket_id,
            order_id=r.order_id,
            event_title=r.event_title,
            event_slug=r.event_slug,
            buyer_email=r.buyer_email,
            buyer_full_name=r.buyer_full_name,
            holder_first_name=r.holder_first_name,
            holder_last_name=r.holder_last_name,
            seat_label=f"{r.row_label}{r.col_number}" if r.row_label else None,
            price_cents=r.price_cents,
            currency=r.currency,
            ticket_status=r.ticket_status,
            order_status=r.order_status,
            issued_at=r.issued_at,
        )
        for r in rows
    ]


@router.post(
    "/refunds",
    response_model=OrderOut,
    dependencies=[Depends(require_role(UserRole.admin))],
)
def refund(payload: RefundRequest, db: DbDep) -> OrderOut:
    order = db.get(Order, payload.order_id)
    if order is None:
        raise HTTPException(404, "order not found")
    if order.status != OrderStatus.paid:
        raise HTTPException(409, f"cannot refund order in status={order.status}")
    order.status = OrderStatus.refunded
    for t in order.tickets:
        if t.status == TicketStatus.valid:
            t.status = TicketStatus.refunded
    db.commit()
    event = db.get(Event, order.event_id)
    if event is not None:
        invalidate_event(order.event_id, schema_ver=event.schema_ver)
    return OrderOut(
        id=order.id,
        event_id=order.event_id,
        status=order.status,
        total_cents=order.total_cents,
        currency=order.currency,
        paid_at=order.paid_at,
        card_last4=order.card_last4,
        card_brand=order.card_brand,
        tickets=[TicketOut.model_validate(t) for t in order.tickets],
    )


# ── Event proposal review (admin side of the approval workflow) ────────────
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text_in: str) -> str:
    s = _SLUG_RE.sub("-", text_in.lower()).strip("-")
    return s[:80] if s else "event"


def _unique_slug(db: Session, base: str) -> str:
    candidate = base
    n = 1
    while db.execute(select(Event).where(Event.slug == candidate)).scalar_one_or_none() is not None:
        n += 1
        candidate = f"{base}-{n}"[:96]
    return candidate


def _compute_grid(seats: int) -> tuple[int, int]:
    """Pick (rows, cols) for a seated hall holding ``seats`` chairs.

    Slightly wider than tall (theatre-feel), capped so ``row_label`` stays
    inside A–Z. Returns the smallest grid where ``rows*cols >= seats``.
    """
    cols = max(6, min(24, math.ceil(math.sqrt(seats * 1.3))))
    rows = math.ceil(seats / cols)
    while rows > 26 and cols < 30:
        cols += 1
        rows = math.ceil(seats / cols)
    return rows, cols


def _proposal_to_out(p: EventProposal, *, organisation_name: str | None, submitter_email: str | None) -> ProposalOut:
    return ProposalOut(
        id=p.id,
        organisation_id=p.organisation_id,
        submitted_by_user_id=p.submitted_by_user_id,
        title=p.title,
        description=p.description,
        city=p.city,
        venue_name=p.venue_name,
        tags=list(p.tags or []),
        cover_image_url=p.cover_image_url,
        seats=p.seats,
        price_cents=p.price_cents,
        currency=p.currency,
        category_slug=p.category_slug,
        starts_at=p.starts_at,
        ends_at=p.ends_at,
        status=p.status,
        reject_reason=p.reject_reason,
        created_at=p.created_at,
        decided_at=p.decided_at,
        decided_by_user_id=p.decided_by_user_id,
        created_event_id=p.created_event_id,
        organisation_name=organisation_name,
        submitter_email=submitter_email,
    )


@router.get(
    "/proposals",
    response_model=list[ProposalOut],
    dependencies=[Depends(require_role(UserRole.admin))],
)
def list_proposals(
    db: DbDep,
    status: ProposalStatus | None = Query(default=None),
) -> list[ProposalOut]:
    """List event proposals submitted by organisers, newest first.

    The DB is the only source — every column the SPA renders is read live
    from ``event_proposals`` joined to ``organisations`` + ``users``.
    """
    stmt = (
        select(EventProposal, Organisation.name, User.email)
        .join(Organisation, Organisation.id == EventProposal.organisation_id)
        .join(User, User.id == EventProposal.submitted_by_user_id)
        .order_by(EventProposal.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(EventProposal.status == status)
    rows = db.execute(stmt).all()
    return [
        _proposal_to_out(p, organisation_name=org_name, submitter_email=email)
        for p, org_name, email in rows
    ]


@router.post(
    "/proposals/{proposal_id}/approve",
    response_model=ProposalOut,
    dependencies=[Depends(require_role(UserRole.admin))],
)
def approve_proposal(
    proposal_id: uuid.UUID, db: DbDep, user: CurrentUserDep
) -> ProposalOut:
    """Approve a pending proposal — materialise venue/room/event/tier in one tx."""
    proposal = db.get(EventProposal, proposal_id)
    if proposal is None:
        raise HTTPException(404, "proposal not found")
    if proposal.status != ProposalStatus.pending:
        raise HTTPException(409, f"proposal already {proposal.status}")

    # Reuse a venue with the same (name, city) when possible — keeps the
    # browse-card join compact for organisers running recurring events.
    venue = db.execute(
        select(Venue).where(Venue.name == proposal.venue_name, Venue.city == proposal.city)
    ).scalar_one_or_none()
    if venue is None:
        venue = Venue(
            name=proposal.venue_name,
            city=proposal.city,
            country="",
            address="",
        )
        db.add(venue)
        db.flush()

    # Seated hall sized to the seat count the organiser asked for, so the
    # buyer flow renders the live SVG hall (Seats.tsx → SeatedHall) instead
    # of the GA quantity picker.
    rows, cols = _compute_grid(proposal.seats)
    room = Room(
        venue_id=venue.id,
        name=f"{proposal.venue_name} — Hall",
        kind=RoomKind.seated,
        capacity=proposal.seats,
        rows=rows,
        cols=cols,
    )
    db.add(room)
    db.flush()

    # Insert exactly ``seats`` Seat rows: rows are A, B, C, … and each row
    # carries up to ``cols`` chairs. Trailing row may be partial when the
    # requested seat count isn't a perfect multiple of cols.
    remaining = proposal.seats
    for r in range(rows):
        if remaining <= 0:
            break
        row_label = chr(ord("A") + r)
        for c in range(1, cols + 1):
            if remaining <= 0:
                break
            db.add(Seat(room_id=room.id, row_label=row_label, col_number=c))
            remaining -= 1
    db.flush()

    category_id = None
    if proposal.category_slug:
        cat = db.execute(
            select(Category).where(Category.slug == proposal.category_slug)
        ).scalar_one_or_none()
        if cat is not None:
            category_id = cat.id

    slug = _unique_slug(db, _slugify(proposal.title))
    event = Event(
        organisation_id=proposal.organisation_id,
        room_id=room.id,
        category_id=category_id,
        slug=slug,
        title=proposal.title,
        description=proposal.description,
        tags=list(proposal.tags or []),
        cover_image_url=proposal.cover_image_url,
        starts_at=proposal.starts_at,
        ends_at=proposal.ends_at,
        status=EventStatus.published,
    )
    db.add(event)
    db.flush()

    # Three row-priced tiers — Front (1.5×), Middle (1.0×), Back (0.7×).
    # The booking service maps each seat's row to a tier at ticket-issue
    # time (see app.services.pricing + app.services.booking), so the
    # closer-to-stage rows charge the higher tier price.
    tier_capacities = pricing.split_capacity(proposal.seats)
    for tier_name, tier_price in pricing.tiered_prices(proposal.price_cents):
        db.add(
            PriceTier(
                event_id=event.id,
                name=tier_name,
                price_cents=tier_price,
                currency=proposal.currency,
                capacity=tier_capacities[tier_name],
            )
        )

    proposal.status = ProposalStatus.approved
    proposal.decided_at = _now_utc()
    proposal.decided_by_user_id = user.id
    proposal.created_event_id = event.id

    db.commit()

    # Refresh the browse-card matview so the new event shows up on the
    # public list immediately (the cron only runs every minute).
    try:
        db.execute(text("REFRESH MATERIALIZED VIEW mv_event_browse_card"))
        db.commit()
    except Exception:  # noqa: BLE001
        log.warning("matview refresh after approve failed", exc_info=True)
        db.rollback()

    # Push the new event into Meilisearch so search picks it up.
    try:
        fresh = db.get(Event, event.id)
        if fresh is not None:
            search_svc.index_event(fresh)
    except Exception:  # noqa: BLE001
        log.warning("meili index after approve failed", exc_info=True)

    org = db.get(Organisation, proposal.organisation_id)
    submitter = db.get(User, proposal.submitted_by_user_id)
    return _proposal_to_out(
        proposal,
        organisation_name=org.name if org else None,
        submitter_email=submitter.email if submitter else None,
    )


@router.post(
    "/proposals/{proposal_id}/reject",
    response_model=ProposalOut,
    dependencies=[Depends(require_role(UserRole.admin))],
)
def reject_proposal(
    proposal_id: uuid.UUID,
    payload: ProposalRejectRequest,
    db: DbDep,
    user: CurrentUserDep,
) -> ProposalOut:
    proposal = db.get(EventProposal, proposal_id)
    if proposal is None:
        raise HTTPException(404, "proposal not found")
    if proposal.status != ProposalStatus.pending:
        raise HTTPException(409, f"proposal already {proposal.status}")
    proposal.status = ProposalStatus.rejected
    proposal.reject_reason = payload.reason.strip()
    proposal.decided_at = _now_utc()
    proposal.decided_by_user_id = user.id
    db.commit()
    org = db.get(Organisation, proposal.organisation_id)
    submitter = db.get(User, proposal.submitted_by_user_id)
    return _proposal_to_out(
        proposal,
        organisation_name=org.name if org else None,
        submitter_email=submitter.email if submitter else None,
    )


def _now_utc():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)
