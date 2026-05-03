"""Profile endpoint — DB-backed user profile for attendee and organiser roles.

The profile page reads everything it needs from Postgres in one round trip:
- User identity (users)
- Attendee branch: ticket counts by status, lifetime spend, last 5 purchased
  tickets joined with event/venue/seat/price.
- Organiser branch: organisation, event counts, lifetime attendees and gross,
  last 5 events joined with venue/room and live ticket aggregates.

Database is the only source of truth — no Redis-cached snapshots, no
matview reads here. Aggregates are computed inline so the page reflects
state changes (refunds, sweeper voids, scans) on the next request.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.api.schemas import (
    AttendeeProfileOut,
    MyTicketOut,
    OrganiserProfileOut,
    OrgEventOut,
    ProfileOut,
    ProfileStats,
    UserOut,
)
from app.core.deps import CurrentUserDep, DbDep
from app.db.models import (
    Event,
    Order,
    Organisation,
    PriceTier,
    Room,
    Seat,
    Ticket,
    TicketStatus,
    User,
    UserRole,
    Venue,
)

router = APIRouter(prefix="/me", tags=["profile"])


@router.get("/profile", response_model=ProfileOut)
def my_profile(db: DbDep, user: CurrentUserDep) -> ProfileOut:
    """Combined identity + role-specific aggregates for the profile page."""
    user_out = UserOut.model_validate(user)

    if user.role is UserRole.organiser:
        return ProfileOut(user=user_out, organiser=_build_organiser(db, user))
    # attendee, gate, admin all see the attendee summary by default — gate and
    # admin rarely have purchases but the join still returns an empty list.
    return ProfileOut(user=user_out, attendee=_build_attendee(db, user))


# ── Attendee branch ─────────────────────────────────────────────────────────
def _build_attendee(db: Session, user: User) -> AttendeeProfileOut:
    """Aggregate ticket counts + spend + last 5 purchased tickets in DB."""
    counted = case(
        (Ticket.status == TicketStatus.valid, 1),
        (Ticket.status == TicketStatus.used, 1),
        (Ticket.status == TicketStatus.refunded, 1),
        else_=0,
    )
    valid_expr = case((Ticket.status == TicketStatus.valid, 1), else_=0)
    used_expr = case((Ticket.status == TicketStatus.used, 1), else_=0)
    refunded_expr = case((Ticket.status == TicketStatus.refunded, 1), else_=0)
    spend_expr = case(
        (
            Ticket.status.in_((TicketStatus.valid, TicketStatus.used)),
            PriceTier.price_cents,
        ),
        else_=0,
    )

    agg_row = db.execute(
        select(
            func.coalesce(func.sum(counted), 0).label("total"),
            func.coalesce(func.sum(valid_expr), 0).label("valid"),
            func.coalesce(func.sum(used_expr), 0).label("used"),
            func.coalesce(func.sum(refunded_expr), 0).label("refunded"),
            func.coalesce(func.sum(spend_expr), 0).label("spent"),
            func.coalesce(func.min(PriceTier.currency), "USD").label("currency"),
        )
        .select_from(Ticket)
        .join(Order, Order.id == Ticket.order_id)
        .join(PriceTier, PriceTier.id == Ticket.price_tier_id)
        .where(
            Order.user_id == user.id,
            Ticket.status != TicketStatus.void,
        )
    ).one()

    stats = ProfileStats(
        total=int(agg_row.total),
        valid=int(agg_row.valid),
        used=int(agg_row.used),
        refunded=int(agg_row.refunded),
        spent_cents=int(agg_row.spent),
        currency=agg_row.currency,
    )

    rows = db.execute(
        select(
            Ticket.id,
            Ticket.event_id,
            Event.title.label("event_title"),
            Event.starts_at.label("event_starts_at"),
            Venue.name.label("venue_name"),
            Venue.city.label("venue_city"),
            Room.name.label("room_name"),
            Seat.row_label,
            Seat.col_number,
            Ticket.first_name,
            Ticket.last_name,
            Ticket.status,
            Ticket.issued_at,
            PriceTier.price_cents,
            PriceTier.currency,
        )
        .join(Order, Order.id == Ticket.order_id)
        .join(Event, Event.id == Ticket.event_id)
        .join(Room, Room.id == Event.room_id)
        .join(Venue, Venue.id == Room.venue_id)
        .join(PriceTier, PriceTier.id == Ticket.price_tier_id)
        .outerjoin(Seat, Seat.id == Ticket.seat_id)
        .where(
            Order.user_id == user.id,
            Ticket.status != TicketStatus.void,
        )
        .order_by(Ticket.issued_at.desc())
        .limit(5)
    ).all()

    recent: list[MyTicketOut] = []
    for r in rows:
        seat_label = f"{r.row_label}{r.col_number}" if r.row_label else None
        recent.append(
            MyTicketOut(
                id=r.id,
                event_id=r.event_id,
                event_title=r.event_title,
                event_starts_at=r.event_starts_at,
                venue_name=r.venue_name,
                venue_city=r.venue_city,
                room_name=r.room_name,
                seat_label=seat_label,
                first_name=r.first_name,
                last_name=r.last_name,
                status=r.status,
                issued_at=r.issued_at,
                price_cents=r.price_cents,
                currency=r.currency,
            )
        )
    return AttendeeProfileOut(stats=stats, recent_tickets=recent)


# ── Organiser branch ────────────────────────────────────────────────────────
def _build_organiser(db: Session, user: User) -> OrganiserProfileOut:
    """Aggregate org KPIs + last 5 events directly from the events / tickets tables."""
    org = db.execute(
        select(Organisation).where(Organisation.owner_id == user.id)
    ).scalar_one_or_none()

    if org is None:
        return OrganiserProfileOut(
            organisation_id=None,
            organisation_name="",
            organisation_slug="",
            event_count=0,
            attendee_count=0,
            gross_cents=0,
            currency="USD",
            recent_events=[],
        )

    sold_filter = case(
        (Ticket.status.in_((TicketStatus.valid, TicketStatus.used)), 1),
        else_=0,
    )
    gross_expr = case(
        (
            Ticket.status.in_((TicketStatus.valid, TicketStatus.used)),
            PriceTier.price_cents,
        ),
        else_=0,
    )

    agg_row = db.execute(
        select(
            func.count(func.distinct(Event.id)).label("event_count"),
            func.coalesce(func.sum(sold_filter), 0).label("attendee_count"),
            func.coalesce(func.sum(gross_expr), 0).label("gross_cents"),
            func.coalesce(func.min(PriceTier.currency), "USD").label("currency"),
        )
        .select_from(Event)
        .outerjoin(Ticket, Ticket.event_id == Event.id)
        .outerjoin(PriceTier, PriceTier.id == Ticket.price_tier_id)
        .where(Event.organisation_id == org.id)
    ).one()

    scanned_filter = case((Ticket.status == TicketStatus.used, 1), else_=0)

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
        .order_by(Event.starts_at.desc())
        .limit(5)
    ).all()

    recent_events = [
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

    return OrganiserProfileOut(
        organisation_id=org.id,
        organisation_name=org.name,
        organisation_slug=org.slug,
        event_count=int(agg_row.event_count),
        attendee_count=int(agg_row.attendee_count),
        gross_cents=int(agg_row.gross_cents),
        currency=agg_row.currency,
        recent_events=recent_events,
    )
