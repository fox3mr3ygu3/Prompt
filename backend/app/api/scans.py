"""Gate scan endpoint — flips ticket to ``used`` exactly once."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.schemas import ScanRequest, ScanResponse
from app.core.deps import DbDep, require_role
from app.db.models import User, UserRole
from app.services import booking

router = APIRouter(prefix="/tickets", tags=["scans"])

# Single auth resolution per request — capturing the User off ``require_role``
# avoids a second get_current_user lookup that an extra ``CurrentUserDep``
# parameter would force (each ``require_role(...)`` returns a fresh closure,
# so FastAPI can't dedupe with a parallel ``CurrentUserDep``).
GateUserDep = Annotated[User, Depends(require_role(UserRole.gate))]


@router.post("/scan", response_model=ScanResponse)
def scan(payload: ScanRequest, db: DbDep, user: GateUserDep) -> ScanResponse:
    res = booking.scan_ticket(db, qr_payload=payload.qr_payload, gate_user_id=user.id)
    return ScanResponse(**res)
