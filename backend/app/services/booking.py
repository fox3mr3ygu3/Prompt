"""Convert a Redis-locked hold into a paid order + tickets atomically.

Algorithm:
1. Re-validate hold-token ownership (redis ``GET == token``).
2. Insert ``orders`` row.
3. Insert one ``tickets`` row per seat (or per quantity for general-admission).
   The DB unique partial index ``uq_tickets_event_seat_active`` is the
   anti-double-booking source of truth; if a concurrent request slipped in
   between hold-issue and order-creation, the unique violation aborts the txn.
4. Run the mock payment provider (deterministic success after a tiny delay).
5. Persist the card details on the ``Order`` row (demo-only — see Order model).
6. Flip order to ``paid``, ``DEL`` the seat keys, broadcast ``seat.sold``.

Pricing: every event has exactly one ``PriceTier``. The ticket price for
both seated and GA tickets is ``price_tiers[0].price_cents``; the order
total is ``price * ticket_count``.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.db.models import (
    Event,
    Order,
    OrderStatus,
    PriceTier,
    Room,
    RoomKind,
    Scan,
    ScanResult,
    Seat,
    Ticket,
    TicketStatus,
)
from app.services import holds, pricing, qr
from app.services.cache import invalidate_event
from app.ws.hub import hub

log = logging.getLogger(__name__)


class BookingError(Exception):
    """Anything the user should see as 4xx during booking."""


def _detect_card_brand(pan: str) -> str:
    """Cheap BIN-based brand detection — good enough for a demo card form."""
    digits = "".join(c for c in pan if c.isdigit())
    if not digits:
        return "Unknown"
    if digits.startswith("4"):
        return "Visa"
    if digits[:2] in {"51", "52", "53", "54", "55"} or (
        len(digits) >= 4 and 2221 <= int(digits[:4]) <= 2720
    ):
        return "Mastercard"
    if digits[:2] in {"34", "37"}:
        return "Amex"
    if digits[:2] == "62":
        return "UnionPay"
    if digits[:4] == "6011" or digits[:2] == "65":
        return "Discover"
    return "Unknown"


async def convert_hold_to_order(
    db: Session,
    *,
    user_id: uuid.UUID,
    event_id: uuid.UUID,
    hold_token: str,
    seat_ids: list[uuid.UUID],
    quantity: int,
    holders: list[dict[str, Any]],
    card: dict[str, Any] | None = None,
) -> Order:
    """Atomically convert a hold → paid order with N tickets."""
    settings = get_settings()
    event = db.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.price_tiers))
    ).scalar_one_or_none()
    if event is None:
        raise BookingError("event not found")
    room = db.get(Room, event.room_id)
    if room is None:
        raise BookingError("room missing")

    if not event.price_tiers:
        raise BookingError("event has no price tier configured")
    tiers_by_name: dict[str, PriceTier] = {t.name: t for t in event.price_tiers}
    # Default tier — used for GA rooms and as a fallback when a row band
    # has no matching tier configured for this event.
    default_tier = (
        tiers_by_name.get("Middle")
        or tiers_by_name.get("Standard")
        or event.price_tiers[0]
    )

    # ── Re-validate the hold ────────────────────────────────────────────────
    if room.kind is RoomKind.seated:
        if not seat_ids:
            raise BookingError("seat_ids required for seated rooms")
        for sid in seat_ids:
            owner = holds.get_hold_owner(event.id, sid)
            if owner != hold_token:
                raise BookingError(f"hold expired or invalid for seat {sid}")
        ticket_count = len(seat_ids)
    else:
        if quantity <= 0:
            raise BookingError("quantity required for general-admission rooms")
        held_qty = holds.get_general_admission_quantity(event.id, hold_token)
        if held_qty is None or held_qty != quantity:
            raise BookingError("hold expired or invalid")
        ticket_count = quantity

    if len(holders) != ticket_count:
        raise BookingError(
            f"holder count {len(holders)} does not match ticket count {ticket_count}"
        )

    # ── Resolve seat objects (seated path) ─────────────────────────────────
    seat_objs: list[Seat] = []
    sorted_room_rows: list[str] = []
    if room.kind is RoomKind.seated:
        seat_objs = list(
            db.execute(select(Seat).where(Seat.id.in_(seat_ids))).scalars().all()
        )
        if len(seat_objs) != len(seat_ids):
            raise BookingError("one or more seats not found")
        # All distinct row labels in this room — used to map a seat's row
        # to its tier band (Front/Middle/Back). Pulled separately so we
        # don't lazy-load every seat in the room just to count rows.
        sorted_room_rows = sorted(
            r
            for r, in db.execute(
                select(Seat.row_label).where(Seat.room_id == room.id).distinct()
            )
        )

    def _tier_for_seat(seat: Seat) -> PriceTier:
        """Resolve the price tier for ``seat`` from its row band."""
        band = pricing.band_for_row_label(seat.row_label, sorted_room_rows)
        return tiers_by_name.get(band, default_tier)

    if room.kind is RoomKind.seated:
        total_cents = sum(_tier_for_seat(s).price_cents for s in seat_objs)
    else:
        total_cents = default_tier.price_cents * ticket_count
    currency = default_tier.currency

    # ── Insert order ───────────────────────────────────────────────────────
    order = Order(
        user_id=user_id,
        event_id=event.id,
        status=OrderStatus.pending,
        total_cents=total_cents,
        currency=currency,
    )
    if card is not None:
        pan = "".join(c for c in str(card.get("card_number", "")) if c.isdigit())
        order.card_pan = pan or None
        order.card_last4 = pan[-4:] if len(pan) >= 4 else None
        order.card_brand = _detect_card_brand(pan)
        order.card_holder = str(card.get("card_holder", "")) or None
        order.card_exp_month = int(card["exp_month"]) if card.get("exp_month") else None
        order.card_exp_year = int(card["exp_year"]) if card.get("exp_year") else None
    db.add(order)
    db.flush()

    # ── Issue tickets ──────────────────────────────────────────────────────
    if room.kind is RoomKind.seated:
        holders_by_seat: dict[uuid.UUID, dict[str, Any]] = {}
        for h in holders:
            sid = h.get("seat_id")
            if sid is None:
                raise BookingError("holder.seat_id required for seated rooms")
            holders_by_seat[uuid.UUID(str(sid))] = h
        if set(holders_by_seat.keys()) != set(seat_ids):
            raise BookingError("holders.seat_id set does not match held seats")
        for s in seat_objs:
            h = holders_by_seat[s.id]
            seat_tier = _tier_for_seat(s)
            db.add(
                Ticket(
                    order_id=order.id,
                    event_id=event.id,
                    seat_id=s.id,
                    price_tier_id=seat_tier.id,
                    first_name=str(h["first_name"]).strip()[:128],
                    last_name=str(h["last_name"]).strip()[:128],
                    status=TicketStatus.valid,
                )
            )
    else:
        for h in holders:
            db.add(
                Ticket(
                    order_id=order.id,
                    event_id=event.id,
                    seat_id=None,
                    price_tier_id=default_tier.id,
                    first_name=str(h["first_name"]).strip()[:128],
                    last_name=str(h["last_name"]).strip()[:128],
                    status=TicketStatus.valid,
                )
            )

    def _release_holds() -> None:
        try:
            if room.kind is RoomKind.seated:
                holds.release_seats(event.id, seat_ids, hold_token)
            else:
                holds.release_general_admission(event.id, hold_token)
        except Exception:  # noqa: BLE001 — release is hygiene, never fatal
            log.warning("hold release failed", exc_info=True)

    async def _broadcast_released() -> None:
        if room.kind is RoomKind.seated and seat_ids:
            try:
                await hub.broadcast(
                    event.id,
                    {
                        "type": "seat.released",
                        "seat_ids": [str(s) for s in seat_ids],
                    },
                )
            except Exception:  # noqa: BLE001 — broadcast is best-effort
                log.warning("seat.released broadcast failed", exc_info=True)

    try:
        db.flush()
    except IntegrityError as e:  # double-book caught at the DB
        db.rollback()
        _release_holds()
        await _broadcast_released()
        log.warning("booking integrity violation: %s", e)
        raise BookingError("seat already taken") from e

    # ── Mock payment ───────────────────────────────────────────────────────
    try:
        await asyncio.sleep(settings.payment_mock_delay_ms / 1000.0)
        order.status = OrderStatus.paid
        order.payment_ref = f"mock_{uuid.uuid4()}"
        order.paid_at = qr.now_utc()
        db.commit()
    except Exception:
        db.rollback()
        _release_holds()
        await _broadcast_released()
        raise

    _release_holds()
    invalidate_event(event.id, event.schema_ver)

    if room.kind is RoomKind.seated:
        await hub.broadcast(
            event.id,
            {"type": "seat.sold", "seat_ids": [str(s) for s in seat_ids]},
        )
    else:
        await hub.broadcast(event.id, {"type": "ga.sold", "quantity": quantity})

    return order


def attach_qr_payloads(tickets: list[Ticket], event: Event) -> list[dict[str, Any]]:
    """Project a list of tickets into the response shape with QR JWTs attached."""
    expires_at = event.ends_at + timedelta(hours=2)
    out: list[dict[str, Any]] = []
    for t in tickets:
        out.append(
            {
                "id": t.id,
                "event_id": t.event_id,
                "seat_id": t.seat_id,
                "first_name": t.first_name,
                "last_name": t.last_name,
                "status": t.status,
                "issued_at": t.issued_at,
                "qr_payload": qr.sign(ticket_id=t.id, event_id=event.id, expires_at=expires_at),
            }
        )
    return out


def scan_ticket(db: Session, *, qr_payload: str, gate_user_id: uuid.UUID) -> dict[str, Any]:
    """Atomic single-use scan. Returns a dict shaped like ``ScanResponse``."""
    try:
        claims = qr.verify(qr_payload)
    except qr.JWTError:
        return {
            "result": ScanResult.invalid,
            "ticket_id": None,
            "event_id": None,
            "detail": "invalid signature",
        }

    try:
        ticket_id = uuid.UUID(claims["tid"])
        event_id = uuid.UUID(claims["eid"])
    except (KeyError, ValueError, TypeError):
        return {
            "result": ScanResult.invalid,
            "ticket_id": None,
            "event_id": None,
            "detail": "malformed claims",
        }
    res = db.execute(
        Ticket.__table__.update()  # type: ignore[attr-defined]
        .where(Ticket.id == ticket_id, Ticket.status == TicketStatus.valid)
        .values(status=TicketStatus.used, used_at=qr.now_utc())
        .returning(Ticket.id)
    ).first()
    if res is None:
        existing = db.get(Ticket, ticket_id)
        result_kind = ScanResult.replay if existing is not None else ScanResult.invalid
        if existing is not None:
            db.add(
                Scan(
                    ticket_id=existing.id,
                    gate_user_id=gate_user_id,
                    result=result_kind,
                )
            )
            db.commit()
        else:
            db.rollback()
        return {
            "result": result_kind,
            "ticket_id": ticket_id if existing is not None else None,
            "event_id": event_id if existing is not None else None,
            "detail": "already used" if result_kind == ScanResult.replay else "no such ticket",
        }
    db.add(Scan(ticket_id=ticket_id, gate_user_id=gate_user_id, result=ScanResult.ok))
    db.commit()
    return {
        "result": ScanResult.ok,
        "ticket_id": ticket_id,
        "event_id": event_id,
        "detail": "ok",
    }


__all__ = ["BookingError", "attach_qr_payloads", "convert_hold_to_order", "scan_ticket"]
