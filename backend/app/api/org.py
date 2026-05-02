"""Organiser endpoints — dashboard KPIs + per-event attendee rosters.

All reads go straight through SQL joins (this is a database-management
project; the matview is reused only for the cross-event KPI summary).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select, text
from sqlalchemy.orm import Session, aliased

from app.api.events import resolve_event
from app.api.schemas import (
    AttendeeOut,
    DashboardKPI,
    OrgEventOut,
    ProposalCreate,
    ProposalOut,
)
from app.core.deps import CurrentUserDep, DbDep, require_role
from app.db.models import (
    Event,
    EventProposal,
    Order,
    Organisation,
    PriceTier,
    ProposalStatus,
    Room,
    Seat,
    Ticket,
    TicketStatus,
    User,
    UserRole,
    Venue,
)

router = APIRouter(prefix="/org", tags=["org"])


def _require_organisation(db: Session, user: User) -> Organisation:
    """Resolve the organisation owned by the current user.

    If the organiser doesn't have an organisation yet, auto-create one
    based on their email/full_name so the "Add Event" flow works for any
    organiser without a separate signup step.
    """
    org = db.execute(
        select(Organisation).where(Organisation.owner_id == user.id)
    ).scalar_one_or_none()
    if org is None:
        base_slug = (user.email.split("@")[0] or "org").lower()
        slug = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in base_slug)[:48] or "org"
        candidate = slug
        n = 1
        while db.execute(
            select(Organisation).where(Organisation.slug == candidate)
        ).scalar_one_or_none() is not None:
            n += 1
            candidate = f"{slug}-{n}"[:64]
        org = Organisation(
            name=user.full_name or user.email,
            slug=candidate,
            owner_id=user.id,
        )
        db.add(org)
        db.flush()
    return org


def _proposal_to_out(
    p: EventProposal, *, organisation_name: str | None = None, submitter_email: str | None = None
) -> ProposalOut:
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
    "/dashboard",
    response_model=DashboardKPI,
    dependencies=[Depends(require_role(UserRole.organiser))],
)
def dashboard(db: DbDep, user: CurrentUserDep) -> DashboardKPI:
    org = _require_organisation(db, user)
    row = db.execute(
        text(
            "SELECT organisation_id, event_count, tickets_sold, tickets_scanned, "
            "gross_cents, refunds_cents, refreshed_at "
            "FROM mv_org_dashboard_kpis WHERE organisation_id = :oid"
        ),
        {"oid": org.id},
    ).mappings().first()
    if row is None:
        # Matview hasn't seen this org yet (no events) — return zeroes.
        return DashboardKPI(
            organisation_id=org.id,
            event_count=0,
            tickets_sold=0,
            tickets_scanned=0,
            gross_cents=0,
            refunds_cents=0,
            refreshed_at=datetime.now(timezone.utc),
        )
    return DashboardKPI(**dict(row))


@router.get(
    "/events",
    response_model=list[OrgEventOut],
    dependencies=[Depends(require_role(UserRole.organiser))],
)
def my_events(db: DbDep, user: CurrentUserDep) -> list[OrgEventOut]:
    """List all events owned by this organiser, with live attendee counts.

    DB-driven: a single grouped join across events / rooms / venues /
    tickets / price_tiers. Attendee count = ``valid + used`` tickets;
    scanned count = ``used`` only. Gross = sum of price * tickets.
    """
    org = _require_organisation(db, user)

    sold_filter = case(
        (Ticket.status.in_((TicketStatus.valid, TicketStatus.used)), 1),
        else_=0,
    )
    scanned_filter = case((Ticket.status == TicketStatus.used, 1), else_=0)
    gross_expr = case(
        (
            Ticket.status.in_((TicketStatus.valid, TicketStatus.used)),
            PriceTier.price_cents,
        ),
        else_=0,
    )

    rows = db.execute(
        select(
            Event.id,
            Event.slug,
            Event.title,
            Event.starts_at,
            Event.ends_at,
            Event.status,
            Venue.name.label("venue_name"),
            Venue.city.label("venue_city"),
            Room.name.label("room_name"),
            Room.capacity,
            func.coalesce(func.sum(sold_filter), 0).label("attendee_count"),
            func.coalesce(func.sum(scanned_filter), 0).label("scanned_count"),
            func.coalesce(func.sum(gross_expr), 0).label("gross_cents"),
            func.coalesce(func.min(PriceTier.currency), "USD").label("currency"),
        )
        .join(Room, Room.id == Event.room_id)
        .join(Venue, Venue.id == Room.venue_id)
        .outerjoin(Ticket, Ticket.event_id == Event.id)
        .outerjoin(PriceTier, PriceTier.id == Ticket.price_tier_id)
        .where(Event.organisation_id == org.id)
        .group_by(Event.id, Room.id, Venue.id)
        .order_by(Event.starts_at.asc())
    ).all()

    return [
        OrgEventOut(
            id=r.id,
            slug=r.slug,
            title=r.title,
            starts_at=r.starts_at,
            ends_at=r.ends_at,
            status=r.status,
            venue_name=r.venue_name,
            venue_city=r.venue_city,
            room_name=r.room_name,
            capacity=r.capacity,
            attendee_count=int(r.attendee_count),
            scanned_count=int(r.scanned_count),
            gross_cents=int(r.gross_cents),
            currency=r.currency,
        )
        for r in rows
    ]


@router.get(
    "/events/{event_ref}/attendees",
    response_model=list[AttendeeOut],
    dependencies=[Depends(require_role(UserRole.organiser))],
)
def event_attendees(
    event_ref: str, db: DbDep, user: CurrentUserDep
) -> list[AttendeeOut]:
    """Per-event attendee roster (organiser-only, scoped to their org).

    Joins Ticket → Order → User (buyer) → Seat. Refunded/void tickets
    are returned alongside valid ones so the organiser can see the full
    timeline of who has held a seat for the event.
    """
    org = _require_organisation(db, user)
    event = resolve_event(db, event_ref)
    if event is None:
        raise HTTPException(404, "event not found")
    if event.organisation_id != org.id:
        raise HTTPException(403, "event belongs to another organisation")

    Buyer = aliased(User)
    rows = db.execute(
        select(
            Ticket.id.label("ticket_id"),
            Ticket.order_id,
            Seat.row_label,
            Seat.col_number,
            Ticket.first_name,
            Ticket.last_name,
            Buyer.email.label("buyer_email"),
            Ticket.status,
            Ticket.issued_at,
        )
        .join(Order, Order.id == Ticket.order_id)
        .join(Buyer, Buyer.id == Order.user_id)
        .outerjoin(Seat, Seat.id == Ticket.seat_id)
        .where(
            Ticket.event_id == event.id,
            Ticket.status != TicketStatus.void,
        )
        .order_by(Seat.row_label.asc().nulls_last(), Seat.col_number.asc().nulls_last())
    ).all()

    return [
        AttendeeOut(
            ticket_id=r.ticket_id,
            order_id=r.order_id,
            seat_label=f"{r.row_label}{r.col_number}" if r.row_label else None,
            first_name=r.first_name,
            last_name=r.last_name,
            buyer_email=r.buyer_email,
            status=r.status,
            issued_at=r.issued_at,
        )
        for r in rows
    ]


# ── Event proposals (organiser side of the approval workflow) ──────────────
@router.post(
    "/proposals",
    response_model=ProposalOut,
    dependencies=[Depends(require_role(UserRole.organiser))],
)
def create_proposal(
    payload: ProposalCreate, db: DbDep, user: CurrentUserDep
) -> ProposalOut:
    """Create a pending event proposal — admin must approve before it goes live."""
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(400, "ends_at must be after starts_at")
    org = _require_organisation(db, user)
    proposal = EventProposal(
        organisation_id=org.id,
        submitted_by_user_id=user.id,
        title=payload.title.strip(),
        description=payload.description,
        city=payload.city.strip(),
        venue_name=payload.venue_name.strip(),
        tags=[t.strip() for t in payload.tags if t.strip()],
        cover_image_url=payload.cover_image_url.strip(),
        seats=payload.seats,
        price_cents=payload.price_cents,
        currency=payload.currency.upper(),
        category_slug=payload.category_slug.strip().lower(),
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        status=ProposalStatus.pending,
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return _proposal_to_out(p=proposal, organisation_name=org.name, submitter_email=user.email)


@router.get(
    "/proposals",
    response_model=list[ProposalOut],
    dependencies=[Depends(require_role(UserRole.organiser))],
)
def list_my_proposals(db: DbDep, user: CurrentUserDep) -> list[ProposalOut]:
    """List proposals submitted by the current organiser's organisation."""
    org = _require_organisation(db, user)
    rows = db.execute(
        select(EventProposal, User.email)
        .join(User, User.id == EventProposal.submitted_by_user_id)
        .where(EventProposal.organisation_id == org.id)
        .order_by(EventProposal.created_at.desc())
    ).all()
    return [
        _proposal_to_out(p=p, organisation_name=org.name, submitter_email=email)
        for p, email in rows
    ]
