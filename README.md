# quick-conf.app

> A web platform for selling tickets to academic and tech conferences — seat-mapped or general-admission, with anti-double-booking, live seat updates, QR e-tickets, and post-event analytics.

[![CI](https://img.shields.io/badge/CI-pending-lightgrey)]()
[![Deploy](https://img.shields.io/badge/deploy-pending-lightgrey)]()
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)

**Live**: https://quick-conf.app *(pending deploy)*
**API docs**: https://quick-conf.app/docs *(Swagger UI)*

---

## Why

Selling seats for a real venue at scale is the textbook concurrency problem: two attendees clicking the same chair must not both walk away with a ticket. quick-conf.app is built around that constraint and the operational story around it (search, payment, gate-scan, payouts, analytics) on a single droplet so every moving piece is visible, not hidden behind a managed PaaS.

## Features

- **Discover & search** — full-text + faceted search across events, venues, and speakers (Meilisearch).
- **Hold a seat** — 5-minute Redis-backed lock per seat; provably no double-booking under contention.
- **Live seat map** — WebSocket pushes `seat.held / released / sold` so two attendees never see the same seat as free.
- **Pay** — checkout with mock provider (Stripe-shaped); ticket issued atomically on success.
- **QR e-tickets** — signed, single-use; gate scan flips to `used` exactly once.
- **Organiser dashboard** — sales KPIs from a materialised view, refreshed nightly.
- **Admin** — refunds, cancellations, payouts.
- **Token-bucket rate limiter** at the edge (custom, Redis-backed Nginx Lua module).
- **Full observability** — OpenTelemetry traces / metrics / logs in Grafana, Tempo, Prometheus, Loki.

## Architecture

```
                 ┌──────────────────────────────────────────────┐
   Browser ─────►│  Nginx  (TLS · SPA fallback · token bucket)  │
                 └────────────┬─────────────────────────────────┘
                              │ round-robin
                  ┌───────────┴───────────┐
                  ▼                       ▼
           ┌─────────────┐         ┌─────────────┐
           │  FastAPI #1 │         │  FastAPI #2 │     (REST + WebSocket)
           └──────┬──────┘         └──────┬──────┘
                  │                       │
        ┌─────────┼───────────┬───────────┼──────────┐
        ▼         ▼           ▼           ▼          ▼
   ┌────────┐┌────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐
   │Postgres││ Redis  │ │Meilisearch│ │   OTEL  │ │  Cron  │
   │  16    ││ holds  │ │  search   │ │collector│ │ batch  │
   │+ GIN   ││ cache  │ │           │ │         │ │ jobs   │
   │+ matview│        │ │           │ │         │ │        │
   └────────┘└────────┘ └──────────┘ └────┬────┘ └────────┘
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                       ┌────────────┐         ┌──────────────┐
                       │ Prometheus │         │ Tempo · Loki │
                       │ + Grafana  │         │              │
                       └────────────┘         └──────────────┘
```

Single `docker-compose.yml` brings up everything. Public TLS termination at Nginx; the only externally exposed ports are 80 → 443.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.x, Pydantic v2 |
| DB | Postgres 16 + Alembic migrations + GIN indexes + materialised view |
| Cache / locks | Redis 7 (seat-hold = `SET NX PX`) |
| Search | Meilisearch |
| Realtime | WebSocket channel per event |
| Edge | Nginx + lua-resty (token-bucket rate limiter) |
| Frontend | React + Vite + TypeScript + Tailwind |
| Observability | OpenTelemetry SDK → OTEL Collector → Prometheus, Tempo, Loki, Grafana |
| Batch | cron container (payouts · analytics roll-up · expired-hold sweep) |
| Deploy | DigitalOcean droplet, GitHub Actions → GHCR → `deploy.sh` |

## Quick start (local)

```bash
git clone https://github.com/<user>/quick-conf.app.git
cd quick-conf.app
cp .env.example .env
docker compose up -d
docker compose exec backend1 alembic upgrade head
docker compose exec backend1 python -m app.seed
```

Then open:

- App — http://localhost
- Swagger UI — http://localhost/docs
- Grafana — http://localhost:3001 (admin / admin)

That is the entire bring-up. No external services required.

### Demo accounts (seeded)

All accounts share password `demo1234`:

| Email | Role |
|---|---|
| `attendee@quick-conf.app` | attendee |
| `organiser@quick-conf.app` | organiser |
| `gate@quick-conf.app` | gate operator |
| `admin@quick-conf.app` | admin |

## Environment reference

| Var | Default | Purpose |
|---|---|---|
| `POSTGRES_DSN` | `postgresql+psycopg://app:app@postgres:5432/app` | DB connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Cache & seat-hold locks |
| `MEILI_URL` | `http://meili:7700` | Search engine |
| `MEILI_MASTER_KEY` | *(set me)* | Meili admin key |
| `JWT_SECRET` | *(set me)* | Auth token signing key |
| `TICKET_SIGNING_KEY` | *(set me)* | QR payload signing key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4317` | Telemetry sink |
| `RATE_LIMIT_RPS` | `20` | Default token-bucket refill rate |
| `RATE_LIMIT_BURST` | `40` | Default token-bucket burst |
| `SEAT_HOLD_TTL_SECONDS` | `300` | Hold lifetime |
| `PAYMENT_PROVIDER` | `mock` | `mock` or `stripe` |
| `STRIPE_SECRET_KEY` | — | Required if `PAYMENT_PROVIDER=stripe` |

`.env.example` is always the source of truth — copy it and fill in.

## API

OpenAPI spec is served at `/docs` (Swagger UI) and `/openapi.json`. Highlights:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/events` | Paginated, filterable list (cached) |
| `GET` | `/events/{id}` | Event detail incl. seat map |
| `POST` | `/events/{id}/hold` | Hold one or more seats (5-min TTL) |
| `WS` | `/ws/events/{id}/seats` | Live seat-map updates |
| `POST` | `/orders` | Convert holds into a paid order + tickets |
| `GET` | `/me/tickets` | Attendee's tickets (with QR payload) |
| `POST` | `/tickets/{id}/scan` | Gate-staff endpoint; idempotent fail on replay |
| `GET` | `/org/dashboard` | Sales KPIs (organiser only) |
| `POST` | `/admin/refunds` | Admin only |

## Deployment

CI builds the backend image and pushes to GHCR on every push to `main`. `ops/deploy.sh` SSHes into the droplet and runs:

```bash
docker compose pull
docker compose up -d
docker compose exec backend alembic upgrade head
```

Production target:

- Droplet `167.71.36.92` (s-2vcpu-4gb, Ubuntu 24.04)
- Domain `quick-conf.app` via Porkbun → DigitalOcean nameservers
- TLS via Let's Encrypt (certbot sidecar)

There is no managed PaaS — every container is visible to the grader.

## Performance

The booking and event-listing paths are required to hit p95 < 250 ms. We measure with `k6` scripts under `docs/perf/` and the README will publish **before** (no cache, no GIN, no matview) and **after** numbers.

| Endpoint | Before p95 | After p95 |
|---|---|---|
| `GET /events` | _tbd_ | _tbd_ |
| `GET /events/{id}` | _tbd_ | _tbd_ |
| `POST /events/{id}/hold` | _tbd_ | _tbd_ |

## Observability

A pre-provisioned Grafana dashboard correlates a single `hold → pay → confirm` user journey across:

- **Tempo** — distributed trace across Nginx → FastAPI → Redis → Postgres
- **Loki** — structured logs joined by `trace_id`
- **Prometheus** — request-rate and p95 panels

## Batch jobs

A dedicated cron container runs three jobs nightly. Each has a BPMN diagram in `docs/bpmn/`:

| Job | What it does |
|---|---|
| `payouts` | Aggregates the previous day's settled orders per organiser and writes `payouts` rows |
| `analytics` | Refreshes the materialised view powering the org dashboard |
| `sweeper` | Releases orphaned holds whose Redis TTL has expired but whose DB shadow rows linger |

## Project structure

```
backend/   FastAPI service (Python 3.12)
frontend/  React + Vite SPA
infra/     nginx, otel, grafana, prometheus, tempo, loki configs
ops/       deploy.sh, cron jobs, seed scripts
docs/      architecture, BPMN diagrams, ADRs, perf reports
```

## Contributing

This is coursework, not an open-source project, but PRs that fix bugs or improve docs are welcome. Run `make lint test` before opening one.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

Built as the implementation of a course spec covering R1–R13 (CRUD/event-booking scenario, polyglot persistence, caching, edge gateway, observability, custom DDIA component). Architecture decisions are recorded in `docs/adr/`.
