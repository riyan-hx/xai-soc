from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db.models import Alert, AlertEvent, Feedback, User
from .schemas import UserCreate, UserOut
from .security import get_current_user, hash_password, require_role

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/directory", response_model=list[UserOut], dependencies=[Depends(get_current_user)])
def user_directory(db: Session = Depends(get_db)):
    """Name/role list for assignee pickers. Available to every signed-in role
    (the admin-only listing below is for account management); the schema has
    no password data."""
    return db.query(User).filter(User.is_active.is_(True)).order_by(User.name).all()


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_role("ADMIN"))])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).filter(User.is_active.is_(True)).all()


@router.post("", response_model=UserOut, dependencies=[Depends(require_role("ADMIN"))])
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("ADMIN")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot remove your own account")

    has_history = (
        db.query(Feedback.id).filter(Feedback.user_id == user_id).first()
        or db.query(AlertEvent.id).filter(AlertEvent.user_id == user_id).first()
    )
    # release any cases assigned to them either way
    db.query(Alert).filter(Alert.assignee_id == user_id).update({Alert.assignee_id: None})
    if has_history:
        # keep the row so past verdicts and notes still point at a real person
        user.is_active = False
        db.commit()
        return {"deactivated": user_id}
    db.delete(user)
    db.commit()
    return {"deleted": user_id}
