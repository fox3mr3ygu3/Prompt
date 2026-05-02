"""Pydantic v2 request/response schemas — kept in one file for review.

Schemas are deliberately permissive on read (``model_config = ConfigDict(from_attributes=True)``)
and strict on write (``extra="forbid"``).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.db.models import (
    EventStatus,
    OrderStatus,
    ProposalStatus,
    RoomKind,
    ScanResult,
    TicketStatus,
    UserRole,
)


class _ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, frozen=False)


class _WriteModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ── Auth ─────────────────────────────────────────────────────────────────────
class TokenResponse(_ReadModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserRegister(_WriteModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=255)


class UserOut(_ReadModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    created_at: datetime


# ── Events ───────────────────────────────────────────────────────────────────
class SpeakerOut(_ReadModel):
    id: uuid.UUID
    name: str
    affiliation: str


class PriceTierOut(_ReadModel):
    id: uuid.UUID
    name: str
    price_cents: int
    currency: str
    capacity: int


class RoomOut(_ReadModel):
    id: uuid.UUID
    name: str
    kind: RoomKind
    capacity: int
    rows: int
    cols: int


class VenueOut(_ReadModel):
    id: uuid.UUID
    name: str
    city: str
    country: str


class CategoryOut(_ReadModel):
    id: uuid.UUID
    slug: str
    name: str
    icon: str
    parent_id: uuid.UUID | None


class CategoryTreeNode(_ReadModel):
    """Top-level category with its direct children flattened in."""

    id: uuid.UUID
    slug: str
    name: str
    icon: str
    children: list[CategoryOut]


class EventListItem(_ReadModel):
    id: uuid.UUID
    slug: str
    title: str
    cover_image_url: str
    starts_at: datetime
    ends_at: datetime
    status: EventStatus
    tags: list[str]
    venue_name: str | None = None
    venue_city: str | None = None
    category_slug: str | None = None
    category_name: str | None = None
    category_icon: str | None = None
    min_price_cents: int = 0
    max_price_cents: int = 0


class EventDetail(_ReadModel):
    id: uuid.UUID
    slug: str
    title: str
    description: str
    cover_image_url: str
    starts_at: datetime
    ends_at: datetime
    status: EventStatus
    tags: list[str]
    venue: VenueOut
    room: RoomOut
    category: CategoryOut | None = None
    price_tiers: list[PriceTierOut]
    speakers: list[SpeakerOut]


class SeatOut(_ReadModel):
    id: uuid.UUID
    row_label: str
    col_number: int
    state: str  # "free" | "held" | "sold"


class SeatMap(_ReadModel):
    event_id: uuid.UUID
    room: RoomOut
    seats: list[SeatOut]


# ── Holds ────────────────────────────────────────────────────────────────────
class HoldRequest(_WriteModel):
    seat_ids: list[uuid.UUID] = Field(default_factory=list)
    quantity: int = Field(default=0, ge=0, le=20)
    price_tier_id: uuid.UUID


class HoldResponse(_ReadModel):
    hold_token: str
    seat_ids: list[uuid.UUID]
    quantity: int
    expires_at: datetime
    price_tier_id: uuid.UUID


# ── Orders / Tickets ────────────────────────────────────────────────────────
class HolderForm(_WriteModel):
    """Per-seat (or per-quantity slot) attendee details captured at checkout."""

    seat_id: uuid.UUID | None = None
    first_name: str = Field(min_length=1, max_length=128)
    last_name: str = Field(min_length=1, max_length=128)


class CardForm(_WriteModel):
    """Mock-card-form payload. The full PAN is persisted on the order so the
    admin/refund flow can trace cards-to-tickets — demo-only, see Order model
    docstring."""

    card_number: str = Field(min_length=12, max_length=19)
    card_holder: str = Field(min_length=1, max_length=255)
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=2024, le=2099)
    cvv: str = Field(min_length=3, max_length=4)


class OrderCreate(_WriteModel):
    hold_token: str
    holders: list[HolderForm] = Field(default_factory=list)
    payment: CardForm


class TicketOut(_ReadModel):
    """Slim ticket shape returned from the order-create endpoint."""

    id: uuid.UUID
    event_id: uuid.UUID
    seat_id: uuid.UUID | None
    first_name: str = ""
    last_name: str = ""
    status: TicketStatus
    issued_at: datetime
    qr_payload: str | None = None  # signed QR JWT, only on order POST


class MyTicketOut(_ReadModel):
    """Enriched ticket shape for /me/tickets — joins event + seat + venue.

    DB-driven: every field is materialised from a SQL join in
    ``orders.my_tickets`` so the SPA never has to make a second round trip
    just to render the ticket card.
    """

    id: uuid.UUID
    event_id: uuid.UUID
    event_title: str
    event_starts_at: datetime
    venue_name: str
    venue_city: str
    room_name: str
    seat_label: str | None = None  # e.g. "A2" — None for general-admission
    first_name: str
    last_name: str
    status: TicketStatus
    issued_at: datetime
    price_cents: int
    currency: str


class OrderOut(_ReadModel):
    id: uuid.UUID
    event_id: uuid.UUID
    status: OrderStatus
    total_cents: int
    currency: str
    paid_at: datetime | None
    card_last4: str | None = None
    card_brand: str | None = None
    tickets: list[TicketOut]


# ── Scans ────────────────────────────────────────────────────────────────────
class ScanRequest(_WriteModel):
    qr_payload: str


class ScanResponse(_ReadModel):
    result: ScanResult
    ticket_id: uuid.UUID | None
    event_id: uuid.UUID | None
    detail: str


# ── Org dashboard ────────────────────────────────────────────────────────────
class DashboardKPI(_ReadModel):
    organisation_id: uuid.UUID
    event_count: int
    tickets_sold: int
    tickets_scanned: int
    gross_cents: int
    refunds_cents: int
    refreshed_at: datetime


class OrgEventOut(_ReadModel):
    """Per-event row on the organiser's "My events" page.

    Joined directly from ``events`` + ``tickets`` so the count reflects live
    state (the matview is org-level, not event-level).
    """

    id: uuid.UUID
    slug: str
    title: str
    starts_at: datetime
    ends_at: datetime
    venue_name: str
    venue_city: str
    room_name: str
    status: EventStatus
    attendee_count: int
    scanned_count: int
    capacity: int
    gross_cents: int
    currency: str


class AttendeeOut(_ReadModel):
    """One row per ticket on the organiser's per-event attendee list."""

    ticket_id: uuid.UUID
    order_id: uuid.UUID
    seat_label: str | None
    first_name: str
    last_name: str
    buyer_email: str
    status: TicketStatus
    issued_at: datetime


# ── Admin ────────────────────────────────────────────────────────────────────
class RefundRequest(_WriteModel):
    order_id: uuid.UUID
    reason: str = Field(default="", max_length=255)


# ── Event proposals (organiser → admin) ────────────────────────────────────
class ProposalCreate(_WriteModel):
    """Organiser-side payload for the "Add Event" form."""

    title: str = Field(min_length=3, max_length=255)
    description: str = Field(default="", max_length=4000)
    city: str = Field(min_length=1, max_length=128)
    venue_name: str = Field(min_length=1, max_length=255)
    tags: list[str] = Field(default_factory=list, max_length=20)
    cover_image_url: str = Field(default="", max_length=512)
    seats: int = Field(ge=1, le=100_000)
    price_cents: int = Field(ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    category_slug: str = Field(default="", max_length=64)
    starts_at: datetime
    ends_at: datetime


class ProposalRejectRequest(_WriteModel):
    reason: str = Field(min_length=1, max_length=1000)


class ProposalOut(_ReadModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    submitted_by_user_id: uuid.UUID
    title: str
    description: str
    city: str
    venue_name: str
    tags: list[str]
    cover_image_url: str
    seats: int
    price_cents: int
    currency: str
    category_slug: str
    starts_at: datetime
    ends_at: datetime
    status: ProposalStatus
    reject_reason: str
    created_at: datetime
    decided_at: datetime | None
    decided_by_user_id: uuid.UUID | None
    created_event_id: uuid.UUID | None
    organisation_name: str | None = None
    submitter_email: str | None = None


class AdminTicketOut(_ReadModel):
    """One row on the admin tickets table.

    Single-query DB join (Ticket → Order → Event → User → Seat → PriceTier);
    refund button posts the ``order_id`` to /admin/refunds.
    """

    ticket_id: uuid.UUID
    order_id: uuid.UUID
    event_title: str
    event_slug: str
    buyer_email: str
    buyer_full_name: str
    holder_first_name: str
    holder_last_name: str
    seat_label: str | None
    price_cents: int
    currency: str
    ticket_status: TicketStatus
    order_status: OrderStatus
    issued_at: datetime


__all__ = [
    "AdminTicketOut",
    "AttendeeOut",
    "CardForm",
    "CategoryOut",
    "CategoryTreeNode",
    "DashboardKPI",
    "EventDetail",
    "EventListItem",
    "HoldRequest",
    "HoldResponse",
    "HolderForm",
    "MyTicketOut",
    "OrderCreate",
    "OrderOut",
    "OrgEventOut",
    "PriceTierOut",
    "ProposalCreate",
    "ProposalOut",
    "ProposalRejectRequest",
    "RefundRequest",
    "RoomOut",
    "ScanRequest",
    "ScanResponse",
    "SeatMap",
    "SeatOut",
    "SpeakerOut",
    "TicketOut",
    "TokenResponse",
    "UserOut",
    "UserRegister",
    "VenueOut",
]
