# quick-conf.app — top-level entry points.
# Usage: `make help`

SHELL := /bin/bash

.PHONY: help up down logs ps restart \
        build pull \
        backend-shell db-shell redis-shell \
        migrate seed reset-db \
        lint lint-py lint-ts \
        format format-py format-ts \
        test test-py test-ts \
        clean

help: ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Compose lifecycle ─────────────────────────────────────────────────────────
up: ## Bring the full stack up in the background.
	docker compose up -d

down: ## Stop the stack (keep volumes).
	docker compose down

logs: ## Tail logs of all services.
	docker compose logs -f --tail=100

ps: ## Show service status.
	docker compose ps

restart: ## Restart everything.
	docker compose restart

build: ## Rebuild local images.
	docker compose build

pull: ## Pull upstream images.
	docker compose pull

# ── Shells / introspection ────────────────────────────────────────────────────
backend-shell: ## Open a shell inside the backend container.
	docker compose exec backend1 bash

db-shell: ## psql into the running Postgres.
	docker compose exec postgres psql -U $${POSTGRES_USER:-app} -d $${POSTGRES_DB:-app}

redis-shell: ## redis-cli into the running Redis.
	docker compose exec redis redis-cli

# ── DB lifecycle ──────────────────────────────────────────────────────────────
migrate: ## Apply all Alembic migrations.
	docker compose exec backend1 alembic upgrade head

seed: ## Seed the DB with demo data.
	docker compose exec backend1 python -m app.seed

reset-db: ## Drop & recreate the DB volume. DESTRUCTIVE.
	docker compose rm -sfv postgres
	docker volume rm -f quick-conf_postgres-data
	docker compose up -d postgres
	sleep 5
	$(MAKE) migrate
	$(MAKE) seed

# ── Lint / format / test ──────────────────────────────────────────────────────
lint: lint-py lint-ts ## Lint everything.

lint-py:
	cd backend && ruff check app tests && black --check app tests && mypy app

lint-ts:
	cd frontend && npm run lint

format: format-py format-ts ## Format everything.

format-py:
	cd backend && ruff check --fix app tests && black app tests

format-ts:
	cd frontend && npm run format

test: test-py test-ts ## Run all tests.

test-py:
	cd backend && pytest -q

test-ts:
	cd frontend && npm test --silent

clean: ## Remove caches and build artifacts.
	rm -rf backend/.ruff_cache backend/.mypy_cache backend/.pytest_cache backend/.coverage
	rm -rf frontend/dist frontend/.vite frontend/node_modules/.cache
