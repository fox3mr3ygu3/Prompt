"""Pydantic Settings — single source of truth for runtime config."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_env: Literal["dev", "test", "prod"] = "dev"
    app_debug: bool = True
    app_name: str = "quick-conf"

    # Postgres
    postgres_dsn: str = "postgresql+psycopg://app:app@postgres:5432/app"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Meilisearch
    meili_url: str = "http://meili:7700"
    meili_master_key: str = "devmasterkey_change_me"

    # Auth
    jwt_secret: str = "devsecret_change_me_in_prod"
    jwt_algo: str = "HS256"
    jwt_ttl_minutes: int = 60

    # Tickets
    ticket_signing_key: str = "devticketsecret_change_me"
    seat_hold_ttl_seconds: int = 300

    # Payments
    payment_provider: Literal["mock"] = "mock"
    payment_mock_delay_ms: int = 200
    payment_mock_fail_rate: float = Field(default=0.0, ge=0.0, le=1.0)

    # Rate limiter
    rate_limit_rps: int = 20
    rate_limit_burst: int = 40

    # Observability
    otel_exporter_otlp_endpoint: str = "http://otel-collector:4317"
    otel_service_name: str = "quick-conf-backend"
    otel_traces_sampler: str = "parentbased_always_on"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
