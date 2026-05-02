"""Hold endpoint — POST /events/{ref}/hold."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.api.events import resolve_event
from app.api.schemas import HoldRequest, HoldResponse
from app.core.deps import CurrentUserDep, DbDep
from app.db.models import PriceTier, Room, RoomKind
from app.services import holds
from app.ws.hub import hub

router = APIRouter(prefix="/events", tags=["holds"])


@router.post("/{event_ref}/hold", response_model=HoldResponse, status_code=201)
async def create_hold(
    event_ref: str,
    payload: HoldRequest,
    db: DbDep,
    user: CurrentUserDep,
) -> HoldResponse:
    _ = user  # auth required, but holds aren't bound to a user — token is the proof
    event = resolve_event(db, event_ref)
    if event is None:
        raise HTTPException(404, "event not found")
    tier = db.get(PriceTier, payload.price_tier_id)
    if tier is None or tier.event_id != event.id:
        raise HTTPException(400, "invalid price tier")
    room = db.get(Room, event.room_id)
    if room is None:
        raise HTTPException(500, "room missing")

    if room.kind is RoomKind.seated:
        if not payload.seat_ids:
            raise HTTPException(400, "seat_ids required for seated rooms")
        outcome = holds.hold_seats(event_id=event.id, seat_ids=payload.seat_ids)
        if not outcome.held:
            raise HTTPException(409, f"seats already held: {outcome.failed}")
        await hub.broadcast(
            event.id,
            {"type": "seat.held", "seat_ids": [str(s) for s in outcome.held]},
        )
        return HoldResponse(
            hold_token=outcome.hold_token,
            seat_ids=outcome.held,
            quantity=len(outcome.held),
            expires_at=datetime.fromtimestamp(outcome.expires_at, tz=timezone.utc),
            price_tier_id=tier.id,
        )

    # General admission
    if payload.quantity <= 0:
        raise HTTPException(400, "quantity required for general-admission rooms")
    outcome = holds.hold_general_admission(event_id=event.id, quantity=payload.quantity)
    return HoldResponse(
        hold_token=outcome.hold_token,
        seat_ids=[],
        quantity=payload.quantity,
        expires_at=datetime.fromtimestamp(outcome.expires_at, tz=timezone.utc),
        price_tier_id=tier.id,
    )
