from datetime import datetime, timezone
from typing import Annotated, Any, Optional, List, Dict

from pydantic import BaseModel, Field, PlainSerializer


def _as_utc_iso(d: datetime) -> str:
    """The DB stores naive UTC. Serialize with an explicit `Z` so browsers do
    not re-interpret the timestamp in the viewer's local timezone."""
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[datetime, PlainSerializer(_as_utc_iso, return_type=str, when_used="json")]


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "VIEWER"


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class ExplanationOut(BaseModel):
    reason: str
    important_features: List[Dict]
    confidence: float

    class Config:
        from_attributes = True


class AlertOut(BaseModel):
    id: str
    alert_id: str
    attack_type: str
    severity: str
    source_ip: Optional[str]
    dest_ip: Optional[str]
    timestamp: UTCDateTime
    confidence: float
    description: Optional[str]
    risk_score: Optional[float]
    priority: Optional[str]
    status: str = "NEW"
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    origin: str = "ingest"
    updated_at: Optional[UTCDateTime] = None
    top_features: List[Dict[str, Any]] = Field(default_factory=list)

    class Config:
        from_attributes = True


class AlertDetailOut(AlertOut):
    explanation: Optional[ExplanationOut] = None
    features: Dict[str, float] = Field(default_factory=dict)
    techniques: List[Dict[str, Any]] = Field(default_factory=list)
    playbook: Optional[Dict[str, Any]] = None


class AlertListOut(BaseModel):
    items: List[AlertOut]
    total: int


class AlertGroupOut(BaseModel):
    source_ip: Optional[str]
    dest_ip: Optional[str]
    attack_type: str
    count: int
    max_risk_score: Optional[float]
    max_severity: str
    first_seen: UTCDateTime
    last_seen: UTCDateTime
    latest_alert_id: str


class AlertGroupListOut(BaseModel):
    items: List[AlertGroupOut]
    total: int


class IngestRequest(BaseModel):
    features: Dict[str, float]
    source_ip: str = "unknown"
    dest_ip: str = "unknown"


class FeedbackRequest(BaseModel):
    is_true_positive: bool
    notes: Optional[str] = None


class FeedbackOut(BaseModel):
    id: str
    alert_id: str
    is_true_positive: bool
    notes: Optional[str]
    created_at: UTCDateTime

    class Config:
        from_attributes = True


class AlertUpdate(BaseModel):
    """Partial case update. `assignee_id: ""` clears the assignee."""

    status: Optional[str] = None
    assignee_id: Optional[str] = None


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class AlertEventOut(BaseModel):
    id: str
    kind: str
    body: Optional[str]
    meta: Optional[Dict[str, Any]] = None
    user_id: Optional[str]
    user_name: Optional[str]
    created_at: UTCDateTime


class LogEntryOut(BaseModel):
    id: str
    alert_id: str
    kind: str
    body: Optional[str]
    meta: Optional[Dict[str, Any]] = None
    user_id: Optional[str]
    user_name: Optional[str]
    created_at: UTCDateTime


class LogListOut(BaseModel):
    items: List[LogEntryOut]
    total: int


class WhatIfRequest(BaseModel):
    overrides: Dict[str, float] = Field(default_factory=dict)


class SimulateRequest(BaseModel):
    scenario: str = "DOS_DDOS"  # an attack type, NORMAL, or MIXED
    count: int = Field(default=5, ge=1, le=25)
    intensity: float = Field(default=1.0, ge=0.2, le=1.6)
    source_ip: Optional[str] = None
    dest_ip: Optional[str] = None
    dry_run: bool = False  # score only: nothing is stored, no alerts are created


class BackfillRequest(BaseModel):
    days: int = Field(default=30, ge=1, le=30)
    per_day: int = Field(default=14, ge=2, le=40)
    reset: bool = False
