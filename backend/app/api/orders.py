"""Order + ticket endpoints.

The order POST accepts:
- ``hold_token`` from a prior /hold call,
- a per-seat (or per-quantity) ``holders`` array with first/last names,
- a ``payment`` object with the demo card form's contents.

The booking service validates the hold against Redis, inserts the tickets
under the partial-unique anti-double-booking index, runs the mock payment
provider, and persists the card details on the order.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.events import resolve_event
from app.api.schemas import MyTicketOut, OrderCreate, OrderOut, TicketOut
from app.core.deps import CurrentUserDep, DbDep
from app.db.models import (
    Event,
    Order,
    PriceTier,
    Room,
    RoomKind,
    Seat,
    Ticket,
    TicketStatus,
    Venue,
)
from app.services import booking, holds as holds_svc

# One module, two routers — they share the booking service but live under
# different prefixes (events scope vs me scope), so split them so the
# OpenAPI surface and the rate-limit regex stay readable.
router = APIRouter(prefix="/events", tags=["orders"])
me_router = APIRouter(prefix="/me", tags=["orders"])


@router.post("/{event_ref}/orders", response_model=OrderOut, status_code=201)
async def create_order(
    event_ref: str,
    payload: OrderCreate,
    db: DbDep,
    user: CurrentUserDep,
) -> OrderOut:
    event = resolve_event(db, event_ref)
    if event is None:
        raise HTTPException(404, "event not found")
    room = db.get(Room, event.room_id)
    if room is None:
        raise HTTPException(500, "room missing")

    seat_ids: list[uuid.UUID] = []
    quantity = 0
    if room.kind is RoomKind.seated:
        candidate_seats = holds_svc.get_seats_for_token(event.id, payload.hold_token)
        seat_ids = [
            sid
            for sid in candidate_seats
            if holds_svc.get_hold_owner(event.id, sid) == payload.hold_token
        ]
        if not seat_ids:
            raise HTTPException(410, "hold expired")
    else:
        held_qty = holds_svc.get_general_admission_quantity(event.id, payload.hold_token)
        if not held_qty:
            raise HTTPException(410, "hold expired")
        quantity = held_qty

    holders_dicts = [h.model_dump(mode="python") for h in payload.holders]
    card_dict = payload.payment.model_dump(mode="python")

    try:
        order = await booking.convert_hold_to_order(
            db,
            user_id=user.id,
            event_id=event.id,
            hold_token=payload.hold_token,
            seat_ids=seat_ids,
            quantity=quantity,
            holders=holders_dicts,
            card=card_dict,
        )
    except booking.BookingError as e:
        raise HTTPException(409, str(e)) from e

    fresh = db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.tickets))
    ).scalar_one()
    tickets_with_qr = booking.attach_qr_payloads(fresh.tickets, event)
    return OrderOut(
        id=fresh.id,
        event_id=fresh.event_id,
        status=fresh.status,
        total_cents=fresh.total_cents,
        currency=fresh.currency,
        paid_at=fresh.paid_at,
        card_last4=fresh.card_last4,
        card_brand=fresh.card_brand,
        tickets=[TicketOut.model_validate(t) for t in tickets_with_qr],
    )


@me_router.get("/tickets", response_model=list[MyTicketOut])
def my_tickets(db: DbDep, user: CurrentUserDep) -> list[MyTicketOut]:
    """Tickets owned by the current user, joined with event/venue/seat/price.

    Single SQL round-trip — every column the SPA renders is materialised
    here, so the My-tickets page does not have to make a second call. Hides
    ``void`` tickets (orders that the sweeper voided).
    """
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
        .order_by(Event.starts_at.asc(), Seat.row_label.asc(), Seat.col_number.asc())
    ).all()

    out: list[MyTicketOut] = []
    for r in rows:
        seat_label = f"{r.row_label}{r.col_number}" if r.row_label else None
        out.append(
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
    return out
