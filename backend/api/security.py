import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import Role, User

log = logging.getLogger("xai_soc.security")

# Values that ship in the repo, the README or docker-compose. Anyone can read
# them, so a server signing with one lets anyone mint an ADMIN token.
_PLACEHOLDER_SECRETS = {"change-me-in-.env", "change-me-to-a-long-random-string", "dev-secret"}
_configured_secret = os.getenv("JWT_SECRET")

if not _configured_secret:
    # fail safe: a random per-process key. Sessions end on restart, which is the
    # visible cost of forgetting to configure it, and nothing is forgeable.
    SECRET_KEY = secrets.token_urlsafe(48)
    SECRET_IS_PLACEHOLDER = False
    log.warning("JWT_SECRET is not set: using a random key for this process; sessions reset on restart.")
else:
    SECRET_KEY = _configured_secret
    SECRET_IS_PLACEHOLDER = _configured_secret in _PLACEHOLDER_SECRETS
    if SECRET_IS_PLACEHOLDER:
        log.warning("JWT_SECRET is a published placeholder value: set a long random secret before exposing this app.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8

# OPEN_ACCESS=true drops the login: requests without a token act as the
# seeded admin. Only for demos -- anyone who can reach the API gets full access.
OPEN_ACCESS = os.getenv("OPEN_ACCESS", "").strip().lower() in {"1", "true", "yes"}
if OPEN_ACCESS:
    log.warning("OPEN_ACCESS is on: unauthenticated requests are treated as the admin user.")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        if OPEN_ACCESS:
            admin = (
                db.query(User)
                .filter(User.role == Role.ADMIN, User.is_active.is_(True))
                .first()
            )
            if admin:
                return admin
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_role(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return checker
