"""Auth router — register + token endpoints. JWT in, JWT out."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.api.schemas import TokenResponse, UserOut, UserRegister
from app.core.config import get_settings
from app.core.deps import CurrentUserDep, DbDep
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: DbDep) -> User:
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="email already registered")
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.attendee,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/token", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), *, db: DbDep) -> TokenResponse:
    user = db.execute(select(User).where(User.email == form.username)).scalar_one_or_none()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    settings = get_settings()
    token = create_access_token(subject=user.id, role=user.role.value)
    return TokenResponse(access_token=token, expires_in=settings.jwt_ttl_minutes * 60)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUserDep) -> User:
    return user
