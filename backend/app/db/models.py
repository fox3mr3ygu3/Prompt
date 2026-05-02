"""SQLAlchemy 2.x typed ORM models — all entities in one file for reviewability.

Entity overview (R1, R3, R5, R7):
- ``User``        — every actor; role claim drives RBAC
- ``Organisation``— owns events, receives payouts
- ``Venue``       — physical or virtual location
- ``Room``        — a section inside a venue (general-admission OR seated grid)
- ``Seat``        — a single chair (only present for seated rooms)
- ``Event``       — what a buyer purchases tickets for; tied to one Room
- ``PriceTier``   — named price within an event (e.g. Early-bird / Standard)
- ``Speaker``     — searchable, M2M with ``Event``
- ``Order``       — paid bag of tickets
- ``Ticket``      — issued at order time; QR-scannable, single-use
- ``Scan``        — gate-scan log; one row per (successful or replayed) scan
- ``Payout``      — cron output: per-organisation payout for a settled day
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(StrEnum):
    attendee = "attendee"
    organiser = "organiser"
    gate = "gate"
    admin = "admin"


class EventStatus(StrEnum):
    draft = "draft"
    published = "published"
    cancelled = "cancelled"
    completed = "completed"


class RoomKind(StrEnum):
    general = "general"  # general-admission, capacity-only
    seated = "seated"  # individual seats addressable


class OrderStatus(StrEnum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class TicketStatus(StrEnum):
    valid = "valid"
    used = "used"
    refunded = "refunded"
    void = "void"


class ScanResult(StrEnum):
    ok = "ok"
    replay = "replay"
    invalid = "invalid"


class ProposalStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


# ── User ─────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", native_enum=False, length=16),
        nullable=False,
        default=UserRole.attendee,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    organisations: Mapped[list[Organisation]] = relationship(back_populates="owner")
    orders: Mapped[list[Order]] = relationship(back_populates="user")


# ── Organisation ─────────────────────────────────────────────────────────────
class Organisation(Base):
    __tablename__ = "organisations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    payout_balance_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    owner: Mapped[User] = relationship(back_populates="organisations")
    events: Mapped[list[Event]] = relationship(back_populates="organisation")


# ── Venue / Room / Seat ──────────────────────────────────────────────────────
class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    address: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    city: Mapped[str] = mapped_column(String(128), nullable=False, default="", index=True)
    country: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    rooms: Mapped[list[Room]] = relationship(back_populates="venue")


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = _uuid_pk()
    venue_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[RoomKind] = mapped_column(
        SAEnum(RoomKind, name="room_kind", native_enum=False, length=16), nullable=False
    )
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cols: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    venue: Mapped[Venue] = relationship(back_populates="rooms")
    seats: Mapped[list[Seat]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )
    events: Mapped[list[Event]] = relationship(back_populates="room")

    __table_args__ = (
        CheckConstraint("capacity >= 0", name="capacity_nonneg"),
        CheckConstraint(
            "(kind = 'general' AND rows = 0 AND cols = 0) "
            "OR (kind = 'seated' AND rows > 0 AND cols > 0)",
            name="seated_grid_required",
        ),
    )


class Seat(Base):
    __tablename__ = "seats"

    id: Mapped[uuid.UUID] = _uuid_pk()
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False
    )
    row_label: Mapped[str] = mapped_column(String(8), nullable=False)
    col_number: Mapped[int] = mapped_column(Integer, nullable=False)

    room: Mapped[Room] = relationship(back_populates="seats")

    __table_args__ = (
        UniqueConstraint("room_id", "row_label", "col_number", name="uq_seat_position"),
        Index("ix_seats_room_id", "room_id"),
    )

    @property
    def label(self) -> str:
        """Human-readable seat label, e.g. ``"A2"``."""
        return f"{self.row_label}{self.col_number}"


# ── Event ────────────────────────────────────────────────────────────────────
class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(96), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[EventStatus] = mapped_column(
        SAEnum(EventStatus, name="event_status", native_enum=False, length=16),
        nullable=False,
        default=EventStatus.draft,
    )
    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    schema_ver: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    # category + cover added in migration 0003
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    cover_image_url: Mapped[str] = mapped_column(String(512), nullable=False, default="")

    organisation: Mapped[Organisation] = relationship(back_populates="events")
    room: Mapped[Room] = relationship(back_populates="events")
    category: Mapped[Category | None] = relationship(back_populates="events")
    price_tiers: Mapped[list[PriceTier]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    speakers: Mapped[list[Speaker]] = relationship(
        secondary="event_speakers", back_populates="events"
    )
    tickets: Mapped[list[Ticket]] = relationship(back_populates="event")

    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ends_after_starts"),
        # GIN index on tags is created in the same migration via op.execute.
    )


class Category(Base):
    """Hierarchical category tree.

    Top-level categories have ``parent_id IS NULL``. A child points its
    ``parent_id`` at a top-level row. The UI surfaces the top tier as primary
    chips and the children as a second row.
    """

    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = _uuid_pk()
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    parent: Mapped[Category | None] = relationship(
        "Category", remote_side="Category.id", back_populates="children"
    )
    children: Mapped[list[Category]] = relationship(
        "Category", back_populates="parent"
    )
    events: Mapped[list[Event]] = relationship(back_populates="category")


class PriceTier(Base):
    __tablename__ = "price_tiers"

    id: Mapped[uuid.UUID] = _uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    event: Mapped[Event] = relationship(back_populates="price_tiers")

    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_price_tier_per_event"),
        CheckConstraint("price_cents >= 0", name="price_nonneg"),
    )


# ── Speaker (M2M with Event) ─────────────────────────────────────────────────
class Speaker(Base):
    __tablename__ = "speakers"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    bio: Mapped[str] = mapped_column(Text, nullable=False, default="")
    affiliation: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    events: Mapped[list[Event]] = relationship(
        secondary="event_speakers", back_populates="speakers"
    )


class EventSpeaker(Base):
    __tablename__ = "event_speakers"

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    speaker_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("speakers.id", ondelete="CASCADE"), primary_key=True
    )


# ── Order / Ticket ───────────────────────────────────────────────────────────
class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[OrderStatus] = mapped_column(
        SAEnum(OrderStatus, name="order_status", native_enum=False, length=16),
        nullable=False,
        default=OrderStatus.pending,
        index=True,
    )
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    payment_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Card details captured at checkout (added in migration 0003). The full
    # PAN is stored so admin/refund flows can trace cards-to-tickets via
    # tickets.order_id. Demo-only — storing a full PAN in plaintext is a PCI
    # violation in any real deployment; in production we'd keep only
    # card_last4 + a tokenised reference from the PSP.
    card_pan: Mapped[str | None] = mapped_column(String(19), nullable=True)
    card_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    card_brand: Mapped[str | None] = mapped_column(String(16), nullable=True)
    card_holder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    card_exp_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    card_exp_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, index=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="orders")
    tickets: Mapped[list[Ticket]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = _uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    seat_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("seats.id", ondelete="RESTRICT"), nullable=True
    )
    price_tier_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("price_tiers.id", ondelete="RESTRICT"), nullable=False
    )
    # Holder name split into first/last in migration 0003. Each ticket gets
    # its own holder so a multi-seat order can carry per-seat names.
    first_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    last_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    status: Mapped[TicketStatus] = mapped_column(
        SAEnum(TicketStatus, name="ticket_status", native_enum=False, length=16),
        nullable=False,
        default=TicketStatus.valid,
        index=True,
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order: Mapped[Order] = relationship(back_populates="tickets")
    event: Mapped[Event] = relationship(back_populates="tickets")
    scans: Mapped[list[Scan]] = relationship(back_populates="ticket")

    __table_args__ = (
        # One seat may not be issued twice for a given event among non-void tickets.
        # Implemented as a partial unique index in the migration (Alembic can't
        # express partial-unique cleanly via ORM constraints).
    )


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = _uuid_pk()
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gate_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    result: Mapped[ScanResult] = mapped_column(
        SAEnum(ScanResult, name="scan_result", native_enum=False, length=16), nullable=False
    )
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, index=True
    )

    ticket: Mapped[Ticket] = relationship(back_populates="scans")


# ── EventProposal (organiser → admin approval workflow) ─────────────────────
class EventProposal(Base):
    """Organiser-submitted draft of a new event, awaiting admin decision.

    The DB is the single source of truth for the workflow: the organiser
    inserts a row in ``pending``; the admin flips it to ``approved`` (which
    materialises Venue/Room/Seats/Event/PriceTier in one transaction) or
    ``rejected`` with a non-empty ``reject_reason``.
    """

    __tablename__ = "event_proposals"

    id: Mapped[uuid.UUID] = _uuid_pk()
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    city: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    venue_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    cover_image_url: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    seats: Mapped[int] = mapped_column(Integer, nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    category_slug: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    status: Mapped[ProposalStatus] = mapped_column(
        SAEnum(ProposalStatus, name="proposal_status", native_enum=False, length=16),
        nullable=False,
        default=ProposalStatus.pending,
        index=True,
    )
    reject_reason: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, index=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint("seats > 0", name="proposal_seats_positive"),
        CheckConstraint("price_cents >= 0", name="proposal_price_nonneg"),
        CheckConstraint("ends_at > starts_at", name="proposal_ends_after_starts"),
    )


# ── Payout (cron output) ─────────────────────────────────────────────────────
class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[uuid.UUID] = _uuid_pk()
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "organisation_id",
            "period_start",
            "period_end",
            "currency",
            name="uq_payout_period_ccy",
        ),
    )


__all__ = [
    "Category",
    "Event",
    "EventProposal",
    "EventSpeaker",
    "EventStatus",
    "Order",
    "OrderStatus",
    "Organisation",
    "Payout",
    "PriceTier",
    "ProposalStatus",
    "Room",
    "RoomKind",
    "Scan",
    "ScanResult",
    "Seat",
    "Speaker",
    "Ticket",
    "TicketStatus",
    "User",
    "UserRole",
    "Venue",
]
