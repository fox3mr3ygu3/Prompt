"""Seed script — populates the DB with one user per role + a rich set of demo events.

Idempotent: re-running upserts on natural keys (email, slug, slug-of-category,
event_id+name for price tiers). Use::

    docker compose exec backend1 python -m app.seed

or via the Make target ``make seed``.

What gets seeded:
- 4 users (one per role) and a "Demo Buyer" attendee. Tickets start at zero
  on every event — the demo flow is to log in as the attendee, buy a ticket,
  then watch the organiser's "My events" attendee count tick up live.
- 1 Organisation owned by the organiser. Every demo event belongs to it,
  so the organiser dashboard and "My events" page have rich data to show.
- A category tree: Tech > IT/ML/Python/AI/Web/DevOps, plus Music, Sports,
  Business, Academic, Art (top-level).
- 1 venue with 7 distinct rooms — every event gets a real seated hall so
  the user can pick a labelled seat ("A2") on every page. Music goes into
  the Concert Hall, sports into the Stadium Section, etc.
- 12 events spread across categories. Each event has three ``PriceTier``
  rows — Front (1.5×), Middle (1.0×), Back (0.7×) — derived from the spec
  base price. The seat → tier mapping is by row band: closer to the stage
  is more expensive.
- Meilisearch is bulk-indexed at the end (best-effort).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.security import hash_password
from app.db.models import (
    Category,
    Event,
    EventStatus,
    Organisation,
    PriceTier,
    Room,
    RoomKind,
    Seat,
    Speaker,
    Ticket,
    User,
    UserRole,
    Venue,
)
from app.db.session import SessionLocal
from app.services import pricing
from app.services import search as search_svc

log = logging.getLogger("seed")

DEMO_PASSWORD = "demo1234"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _upsert_user(db: Session, *, email: str, role: UserRole, full_name: str) -> User:
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(DEMO_PASSWORD),
            full_name=full_name,
            role=role,
        )
        db.add(user)
        db.flush()
    return user


def _upsert_org(db: Session, *, slug: str, name: str, owner: User) -> Organisation:
    org = db.execute(
        select(Organisation).where(Organisation.slug == slug)
    ).scalar_one_or_none()
    if org is None:
        org = Organisation(slug=slug, name=name, owner_id=owner.id)
        db.add(org)
        db.flush()
    return org


def _upsert_venue(db: Session, *, name: str, city: str) -> Venue:
    venue = db.execute(select(Venue).where(Venue.name == name)).scalar_one_or_none()
    if venue is None:
        venue = Venue(name=name, city=city, country="UZ", address="Demo address")
        db.add(venue)
        db.flush()
    return venue


def _ensure_seated_room(
    db: Session, *, venue: Venue, name: str, rows: int, cols: int
) -> Room:
    """Idempotently create a seated room with rows×cols labelled seats.

    If a room with this name already exists in the venue *and* its grid
    differs from rows×cols, the function silently rebuilds the seat
    inventory (delete + recreate) — handy when the seed is changed and
    re-run against an existing DB.
    """
    room = db.execute(
        select(Room).where(Room.venue_id == venue.id, Room.name == name)
    ).scalar_one_or_none()
    if room is None:
        room = Room(
            venue_id=venue.id,
            name=name,
            kind=RoomKind.seated,
            rows=rows,
            cols=cols,
            capacity=rows * cols,
        )
        db.add(room)
        db.flush()
        for r in range(rows):
            row_label = chr(ord("A") + r)
            for c in range(1, cols + 1):
                db.add(Seat(room_id=room.id, row_label=row_label, col_number=c))
        db.flush()
        return room

    # Existing room — repair grid if it changed (e.g. seed redefined a hall).
    if room.kind is not RoomKind.seated or room.rows != rows or room.cols != cols:
        # Drop seats only if no tickets reference them — otherwise leave the
        # current grid alone so we don't violate FK constraints. The
        # database-management story is: never silently break referential
        # integrity. The seed will warn instead.
        seat_ids = [
            sid
            for sid, in db.execute(select(Seat.id).where(Seat.room_id == room.id)).all()
        ]
        if seat_ids:
            referenced = db.execute(
                select(Ticket.id).where(Ticket.seat_id.in_(seat_ids)).limit(1)
            ).scalar_one_or_none()
            if referenced is not None:
                log.warning(
                    "room %s grid mismatch but seats are referenced by tickets — keeping existing grid",
                    name,
                )
                return room
        # Safe to rebuild.
        db.execute(
            Seat.__table__.delete().where(Seat.room_id == room.id)  # type: ignore[attr-defined]
        )
        room.kind = RoomKind.seated
        room.rows = rows
        room.cols = cols
        room.capacity = rows * cols
        db.flush()
        for r in range(rows):
            row_label = chr(ord("A") + r)
            for c in range(1, cols + 1):
                db.add(Seat(room_id=room.id, row_label=row_label, col_number=c))
        db.flush()
    return room


def _upsert_category(
    db: Session, *, slug: str, name: str, icon: str, parent: Category | None = None
) -> Category:
    cat = db.execute(select(Category).where(Category.slug == slug)).scalar_one_or_none()
    if cat is None:
        cat = Category(slug=slug, name=name, icon=icon, parent_id=parent.id if parent else None)
        db.add(cat)
        db.flush()
    else:
        cat.name = name
        cat.icon = icon
        cat.parent_id = parent.id if parent else None
    return cat


def _ensure_event(
    db: Session,
    *,
    org: Organisation,
    room: Room,
    category: Category,
    slug: str,
    title: str,
    description: str,
    tags: list[str],
    cover_image_url: str,
    starts_at: datetime,
    duration_hours: int = 8,
) -> Event:
    event = db.execute(select(Event).where(Event.slug == slug)).scalar_one_or_none()
    if event is None:
        event = Event(
            organisation_id=org.id,
            room_id=room.id,
            category_id=category.id,
            slug=slug,
            title=title,
            description=description,
            tags=tags,
            cover_image_url=cover_image_url,
            status=EventStatus.published,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=duration_hours),
        )
        db.add(event)
        db.flush()
    else:
        event.organisation_id = org.id
        event.room_id = room.id
        event.category_id = category.id
        event.title = title
        event.description = description
        event.tags = tags
        event.cover_image_url = cover_image_url
        event.starts_at = starts_at
        event.ends_at = starts_at + timedelta(hours=duration_hours)
        event.status = EventStatus.published
        db.flush()
    return event


def _ensure_tier(
    db: Session, *, event: Event, name: str, price_cents: int, capacity: int
) -> PriceTier:
    tier = db.execute(
        select(PriceTier).where(PriceTier.event_id == event.id, PriceTier.name == name)
    ).scalar_one_or_none()
    if tier is None:
        tier = PriceTier(
            event_id=event.id,
            name=name,
            price_cents=price_cents,
            capacity=capacity,
        )
        db.add(tier)
        db.flush()
    else:
        tier.price_cents = price_cents
        tier.capacity = capacity
    return tier


def _ensure_row_priced_tiers(
    db: Session, *, event: Event, base_price_cents: int, total_seats: int
) -> list[PriceTier]:
    """Materialise the canonical Front/Middle/Back tiers off ``base_price_cents``.

    Multipliers + capacity split come from ``app.services.pricing`` so the
    seat-map endpoint and the booking service agree on which seat falls in
    which band.
    """
    capacity = pricing.split_capacity(total_seats)
    out: list[PriceTier] = []
    for name, price in pricing.tiered_prices(base_price_cents):
        out.append(
            _ensure_tier(
                db,
                event=event,
                name=name,
                price_cents=price,
                capacity=capacity[name],
            )
        )
    # Drop any orphan "Standard" tier from before the row-priced switch.
    legacy = db.execute(
        select(PriceTier).where(
            PriceTier.event_id == event.id, PriceTier.name == "Standard"
        )
    ).scalar_one_or_none()
    if legacy is not None:
        from app.db.models import Ticket as _Ticket

        referenced = db.execute(
            select(_Ticket.id).where(_Ticket.price_tier_id == legacy.id).limit(1)
        ).scalar_one_or_none()
        if referenced is None:
            db.delete(legacy)
            db.flush()
    return out


def _ensure_speaker(db: Session, *, name: str, affiliation: str) -> Speaker:
    sp = db.execute(select(Speaker).where(Speaker.name == name)).scalar_one_or_none()
    if sp is None:
        sp = Speaker(name=name, affiliation=affiliation, bio=f"{name} from {affiliation}.")
        db.add(sp)
        db.flush()
    return sp


# ── Cover image picker ──────────────────────────────────────────────────────
# Per-slug curated covers — each event gets a thematic photo via
# loremflickr's keyword search (Flickr-backed). The ``lock`` query param
# pins the image so re-runs of the seed don't churn the demo.
_COVER_KEYWORDS: dict[str, str] = {
    "ml-summit-2026": "machine-learning,ai,laboratory",
    "distsys-day": "datacenter,server,network",
    "pyconf-tashkent": "python,coding,conference",
    "ai-frontiers": "artificial-intelligence,robotics,neural",
    "webdev-modern": "webdesign,laptop,coding",
    "devops-summit": "cloud,kubernetes,server",
    "indie-night-1": "concert,band,stage",
    "electronic-pulse": "dj,nightclub,electronic-music",
    "football-derby": "stadium,football,crowd",
    "founders-meetup": "startup,office,meeting",
    "research-day": "university,research,students",
    "contemporary-art-2026": "modernart,gallery,exhibition",
}


def _cover(slug: str) -> str:
    keywords = _COVER_KEYWORDS.get(slug, "conference,event")
    digest = sum(ord(c) for c in slug) % 10000
    return f"https://loremflickr.com/1200/600/{keywords}?lock={digest}"


# ── Top-level run() ─────────────────────────────────────────────────────────


def run() -> None:
    """Top-level entrypoint — used by `python -m app.seed` and tests."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    with SessionLocal() as db:
        # ── Users ──────────────────────────────────────────────────────────
        attendee = _upsert_user(
            db, email="attendee@quick-conf.app", role=UserRole.attendee, full_name="Demo Attendee"
        )
        organiser = _upsert_user(
            db,
            email="organiser@quick-conf.app",
            role=UserRole.organiser,
            full_name="Demo Organiser",
        )
        gate = _upsert_user(
            db, email="gate@quick-conf.app", role=UserRole.gate, full_name="Gate Operator"
        )
        admin = _upsert_user(
            db, email="admin@quick-conf.app", role=UserRole.admin, full_name="Site Admin"
        )
        buyer = _upsert_user(
            db,
            email="buyer@quick-conf.app",
            role=UserRole.attendee,
            full_name="Demo Buyer",
        )

        org = _upsert_org(db, slug="demo-org", name="Demo Org", owner=organiser)

        # ── Categories ─────────────────────────────────────────────────────
        tech = _upsert_category(db, slug="tech", name="Tech", icon="💻")
        _upsert_category(db, slug="it", name="IT", icon="🖥️", parent=tech)
        _upsert_category(db, slug="ml", name="ML", icon="🤖", parent=tech)
        _upsert_category(db, slug="python", name="Python", icon="🐍", parent=tech)
        _upsert_category(db, slug="ai", name="AI", icon="🧠", parent=tech)
        _upsert_category(db, slug="web", name="Web", icon="🌐", parent=tech)
        _upsert_category(db, slug="devops", name="DevOps", icon="⚙️", parent=tech)
        music = _upsert_category(db, slug="music", name="Music", icon="🎵")
        sports = _upsert_category(db, slug="sports", name="Sports", icon="⚽")
        business = _upsert_category(db, slug="business", name="Business", icon="💼")
        academic = _upsert_category(db, slug="academic", name="Academic", icon="🎓")
        art = _upsert_category(db, slug="art", name="Art", icon="🎨")
        cat_it = db.execute(select(Category).where(Category.slug == "it")).scalar_one()
        cat_ml = db.execute(select(Category).where(Category.slug == "ml")).scalar_one()
        cat_py = db.execute(select(Category).where(Category.slug == "python")).scalar_one()
        cat_ai = db.execute(select(Category).where(Category.slug == "ai")).scalar_one()
        cat_web = db.execute(select(Category).where(Category.slug == "web")).scalar_one()
        cat_devops = db.execute(select(Category).where(Category.slug == "devops")).scalar_one()

        # ── Venue + halls (every hall is seated, so every event has labelled seats) ──
        venue = _upsert_venue(db, name="Tashkent Convention Center", city="Tashkent")
        # 7 distinct halls — chosen so each category gets a hall that fits.
        auditorium_a = _ensure_seated_room(
            db, venue=venue, name="Auditorium A", rows=10, cols=10
        )
        auditorium_b = _ensure_seated_room(
            db, venue=venue, name="Auditorium B", rows=10, cols=10
        )
        small_theatre = _ensure_seated_room(
            db, venue=venue, name="Small Theatre", rows=6, cols=8
        )
        concert_hall = _ensure_seated_room(
            db, venue=venue, name="Concert Hall", rows=12, cols=15
        )
        stadium_a = _ensure_seated_room(
            db, venue=venue, name="Stadium Section A", rows=15, cols=20
        )
        business_hall = _ensure_seated_room(
            db, venue=venue, name="Business Lounge", rows=8, cols=12
        )
        gallery = _ensure_seated_room(
            db, venue=venue, name="Art Gallery", rows=6, cols=10
        )

        now = datetime.now(timezone.utc)

        events_spec: list[dict] = [
            dict(
                slug="ml-summit-2026",
                title="ML Summit 2026 — Tashkent",
                description="Practitioner-focused machine-learning summit with hands-on workshops.",
                tags=["ml", "ai", "python", "research"],
                category=cat_ml,
                room=auditorium_a,
                days_out=14,
                price_cents=12000,
            ),
            dict(
                slug="distsys-day",
                title="Distributed Systems Day",
                description="A single-track day of distributed-systems talks. Gilbert + Lynch tribute.",
                tags=["distributed-systems", "databases", "research"],
                category=cat_it,
                room=auditorium_b,
                days_out=28,
                price_cents=8000,
            ),
            dict(
                slug="pyconf-tashkent",
                title="PyConf Tashkent",
                description="The Central-Asia Python community gathers for two days of Python talks.",
                tags=["python", "django", "fastapi", "asyncio"],
                category=cat_py,
                room=auditorium_a,
                days_out=42,
                price_cents=6000,
            ),
            dict(
                slug="ai-frontiers",
                title="AI Frontiers — Printed in Tashkent",
                description="LLM evals, RAG, agents — the next-12-months edition.",
                tags=["ai", "llm", "rag", "agents"],
                category=cat_ai,
                room=small_theatre,
                days_out=56,
                price_cents=15000,
            ),
            dict(
                slug="webdev-modern",
                title="Modern Web Day",
                description="React, Astro, edge runtimes, and the year of the form.",
                tags=["web", "react", "astro", "frontend"],
                category=cat_web,
                room=auditorium_b,
                days_out=70,
                price_cents=7000,
            ),
            dict(
                slug="devops-summit",
                title="DevOps Summit Tashkent",
                description="Platform engineering, observability, and SRE — practical track.",
                tags=["devops", "kubernetes", "observability", "sre"],
                category=cat_devops,
                room=small_theatre,
                days_out=84,
                price_cents=9000,
            ),
            dict(
                slug="indie-night-1",
                title="Indie Night Vol. 1",
                description="Three local indie acts. Bring earplugs.",
                tags=["music", "indie", "live"],
                category=music,
                room=concert_hall,
                days_out=10,
                price_cents=4500,
            ),
            dict(
                slug="electronic-pulse",
                title="Electronic Pulse",
                description="Techno + house DJ marathon, doors at 22:00.",
                tags=["music", "electronic", "dj"],
                category=music,
                room=concert_hall,
                days_out=21,
                price_cents=5500,
            ),
            dict(
                slug="football-derby",
                title="Tashkent Derby",
                description="The annual derby — full-stadium tickets.",
                tags=["sports", "football", "derby"],
                category=sports,
                room=stadium_a,
                days_out=35,
                price_cents=7500,
            ),
            dict(
                slug="founders-meetup",
                title="Founders Meetup Q3",
                description="Quarterly get-together for early-stage founders. Pitches + Q&A.",
                tags=["business", "startup", "vc"],
                category=business,
                room=business_hall,
                days_out=49,
                price_cents=9900,
            ),
            dict(
                slug="research-day",
                title="Inha Research Day",
                description="Undergraduate + graduate research showcase. Free coffee.",
                tags=["academic", "research", "students"],
                category=academic,
                room=auditorium_b,
                days_out=63,
                price_cents=0,
            ),
            dict(
                slug="contemporary-art-2026",
                title="Contemporary Art Walk 2026",
                description="Curated walking tour of contemporary art spaces in old Tashkent.",
                tags=["art", "exhibition", "tour"],
                category=art,
                room=gallery,
                days_out=77,
                price_cents=2000,
            ),
        ]

        seeded_events: list[tuple[Event, list[PriceTier], Room]] = []
        for spec in events_spec:
            ev = _ensure_event(
                db,
                org=org,
                room=spec["room"],
                category=spec["category"],
                slug=spec["slug"],
                title=spec["title"],
                description=spec["description"],
                tags=spec["tags"],
                cover_image_url=_cover(spec["slug"]),
                starts_at=now + timedelta(days=spec["days_out"]),
            )
            tiers = _ensure_row_priced_tiers(
                db,
                event=ev,
                base_price_cents=spec["price_cents"],
                total_seats=spec["room"].capacity,
            )
            seeded_events.append((ev, tiers, spec["room"]))

        # ── Speakers (M2M) ─────────────────────────────────────────────────
        sp_alice = _ensure_speaker(db, name="Dr. Alice Kim", affiliation="Inha University")
        sp_bob = _ensure_speaker(db, name="Bob Tanaka", affiliation="OpenLab")
        sp_carol = _ensure_speaker(db, name="Dr. Carol Singh", affiliation="DeepMind")
        sp_dave = _ensure_speaker(db, name="Dave Park", affiliation="Vercel")
        sp_emma = _ensure_speaker(db, name="Emma Brown", affiliation="HashiCorp")
        for ev, _, _ in seeded_events:
            slug = ev.slug
            picks: list[Speaker] = []
            if slug in {"ml-summit-2026", "ai-frontiers"}:
                picks = [sp_alice, sp_carol]
            elif slug == "pyconf-tashkent":
                picks = [sp_alice, sp_bob]
            elif slug == "distsys-day":
                picks = [sp_bob, sp_emma]
            elif slug == "webdev-modern":
                picks = [sp_dave]
            elif slug == "devops-summit":
                picks = [sp_emma]
            for sp in picks:
                if sp not in ev.speakers:
                    ev.speakers.append(sp)

        db.commit()

        # ── Refresh the browse-card matview now that data is in place ─────
        from sqlalchemy import text

        try:
            db.execute(text("REFRESH MATERIALIZED VIEW mv_event_browse_card"))
            db.execute(text("REFRESH MATERIALIZED VIEW mv_org_dashboard_kpis"))
            db.commit()
        except Exception:  # noqa: BLE001
            log.warning("matview refresh skipped", exc_info=True)
            db.rollback()

        # ── Index events into Meilisearch (best-effort) ───────────────────
        try:
            search_svc.ensure_index()
            indexed = (
                db.execute(
                    select(Event).options(
                        selectinload(Event.speakers),
                        selectinload(Event.room).selectinload(Room.venue),
                    )
                )
                .scalars()
                .all()
            )
            for ev in indexed:
                search_svc.index_event(ev)
            log.info("indexed %d events into meilisearch", len(indexed))
        except Exception:  # noqa: BLE001
            log.warning("meilisearch indexing skipped", exc_info=True)

        log.info(
            "seed complete: users=5 org=%s venues=1 rooms=7 events=%d "
            "(attendee=%s organiser=%s gate=%s admin=%s buyer=%s) password=%s",
            org.slug,
            len(seeded_events),
            attendee.email,
            organiser.email,
            gate.email,
            admin.email,
            buyer.email,
            DEMO_PASSWORD,
        )


if __name__ == "__main__":
    run()
