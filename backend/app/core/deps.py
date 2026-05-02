"""FastAPI dependency-injection helpers.

Three layers:
1. ``get_db`` — request-scoped SQLAlchemy session (re-exported from db.session).
2. ``get_current_user`` — verifies the bearer JWT, returns the ``User`` row.
3. ``require_role`` — RBAC factory for "this endpoint requires role X".
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.exc import DataError, StatementError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.models import User, UserRole
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=True)

DbDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(oauth2_scheme)]


def get_current_user(token: TokenDep, db: DbDep) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if not sub:
            raise credentials_exc
    except JWTError as e:
        raise credentials_exc from e

    # ``sub`` is whatever string we minted at /auth/token — coerce to UUID
    # explicitly so a tampered/garbage value 401s instead of bubbling a
    # psycopg DataError as a 500 from db.get(...).
    try:
        sub_uuid = uuid.UUID(str(sub))
    except (ValueError, TypeError) as e:
        raise credentials_exc from e

    try:
        user = db.get(User, sub_uuid)
    except (DataError, StatementError) as e:
        raise credentials_exc from e
    if user is None:
        raise credentials_exc
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


def require_role(*roles: UserRole) -> Callable[[User], User]:
    """Return a dependency that 403s unless the user holds one of ``roles``."""

    allowed = set(roles)

    def _checker(user: CurrentUserDep) -> User:
        if user.role not in allowed and user.role != UserRole.admin:
            # admin always passes
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="insufficient role",
            )
        return user

    return _checker


__all__ = [
    "CurrentUserDep",
    "DbDep",
    "TokenDep",
    "get_current_user",
    "require_role",
]
