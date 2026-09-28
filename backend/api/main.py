import json
import logging
import os
import sys
from datetime import datetime

# allow `import db`, `import ml`, etc. from backend/ regardless of cwd
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # must run before any os.getenv() below or in imported modules

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.session import init_db, SessionLocal
from db.models import User, Role, MLModel
from api.security import hash_password
from api.routes_auth import router as auth_router
from api.routes_users import router as users_router
from api.routes_alerts import router as alerts_router
from api.routes_insights import router as insights_router
from api.routes_sim import router as sim_router
from api.routes_system import router as system_router
from pipeline import SOCPipeline

MODEL_PATH = os.getenv("MODEL_PATH", "../ml_training/model.joblib")


def seed_admin():
    """First-run admin. Set ADMIN_PASSWORD to seed a real password; without it
    the well-known dev default is used and the console warns admins about it."""
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.role == Role.ADMIN).first():
            password = os.getenv("ADMIN_PASSWORD")
            if not password:
                password = "changeme"
                logging.getLogger("xai_soc").warning(
                    "Seeded admin@xai-soc.local with the default password. Set ADMIN_PASSWORD or change it after signing in."
                )
            db.add(
                User(
                    name="Admin",
                    email="admin@xai-soc.local",
                    password_hash=hash_password(password),
                    role=Role.ADMIN,
                )
            )
            db.commit()
    finally:
        db.close()


def sync_model_metadata(model_path: str):
    """Registers the currently-loaded model artifact in the `ml_models`
    table (UML `MLModel`), reading the metrics sidecar `train.py` writes
    next to the artifact. No-op if the artifact wasn't produced by
    `ml_training/train.py` (no sidecar) or is already registered."""
    metrics_path = os.path.join(os.path.dirname(model_path) or ".", "model_metrics.json")
    if not os.path.exists(metrics_path):
        return
    with open(metrics_path) as f:
        metrics = json.load(f)

    db = SessionLocal()
    try:
        version = metrics.get("trained_at", "unknown")
        exists = db.query(MLModel).filter(MLModel.version == version).first()
        if exists:
            return
        try:
            trained_at = datetime.fromisoformat(version)
        except ValueError:
            trained_at = datetime.utcnow()
        db.add(
            MLModel(
                model_type="classification",
                algorithm=metrics.get("algorithm", "unknown"),
                version=version,
                artifact_path=model_path,
                trained_at=trained_at,
                metrics={
                    "accuracy": metrics.get("accuracy"),
                    "macro_f1": metrics.get("macro_f1"),
                    "weighted_f1": metrics.get("weighted_f1"),
                    "n_train": metrics.get("n_train"),
                    "n_test": metrics.get("n_test"),
                    "classes": metrics.get("classes"),
                },
            )
        )
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_admin()
    app.state.pipeline = SOCPipeline(MODEL_PATH)
    sync_model_metadata(MODEL_PATH)
    yield


app = FastAPI(title="Explainable AI for SOC Alert Triage", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if o.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(alerts_router)
app.include_router(insights_router)
app.include_router(sim_router)
app.include_router(system_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
