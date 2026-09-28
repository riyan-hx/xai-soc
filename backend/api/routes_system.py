"""Security posture of this deployment, for the admin status panel.

Reports *states*, never secrets: whether the ingest endpoint is open, whether an
admin still uses the well-known seed password, whether the JWT secret is a
published placeholder. Admin-only.
"""

import os

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.models import Role, User
from db.session import get_db
from .security import SECRET_IS_PLACEHOLDER, require_role, verify_password

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/security", dependencies=[Depends(require_role("ADMIN"))])
def security_posture(db: Session = Depends(get_db)):
    admins = db.query(User).filter(User.role == Role.ADMIN, User.is_active.is_(True)).all()
    default_pw = any(verify_password("changeme", a.password_hash) for a in admins)
    findings = []
    if not os.getenv("INGEST_API_KEY"):
        findings.append(
            {
                "id": "ingest-open",
                "title": "Ingest endpoint is open",
                "detail": "Anyone who can reach /api/ingest can inject alerts. Set INGEST_API_KEY.",
            }
        )
    if default_pw:
        findings.append(
            {
                "id": "default-admin-password",
                "title": "Default admin password in use",
                "detail": "An admin account still uses the well-known seed password. Change it.",
            }
        )
    if SECRET_IS_PLACEHOLDER:
        findings.append(
            {
                "id": "jwt-placeholder",
                "title": "JWT secret is a published placeholder",
                "detail": "Set JWT_SECRET to a long random value.",
            }
        )
    return {"findings": findings}
