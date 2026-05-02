"""OpenTelemetry wiring (R12).

Exports OTLP/gRPC to the collector. We auto-instrument FastAPI, SQLAlchemy,
and Redis so a single `hold → pay → confirm` request shows up as one trace
with spans across all three.
"""

from __future__ import annotations

import logging

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.core.config import get_settings
from app.db.session import engine

log = logging.getLogger(__name__)


def setup_telemetry(app: object) -> None:
    settings = get_settings()
    resource = Resource.create(
        {"service.name": settings.otel_service_name, "deployment.environment": settings.app_env}
    )
    provider = TracerProvider(resource=resource)
    try:
        exporter = OTLPSpanExporter(
            endpoint=settings.otel_exporter_otlp_endpoint, insecure=True
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
    except Exception:  # noqa: BLE001 — collector might be down in dev
        log.warning("OTLP exporter init failed; tracing disabled", exc_info=True)
    trace.set_tracer_provider(provider)

    LoggingInstrumentor().instrument(set_logging_format=True)
    FastAPIInstrumentor.instrument_app(app)  # type: ignore[arg-type]
    try:
        SQLAlchemyInstrumentor().instrument(engine=engine)
    except Exception:  # noqa: BLE001
        log.warning("sqlalchemy instrumentation failed", exc_info=True)
    try:
        RedisInstrumentor().instrument()
    except Exception:  # noqa: BLE001
        log.warning("redis instrumentation failed", exc_info=True)
