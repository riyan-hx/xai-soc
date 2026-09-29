import os
import secrets
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from alerts.playbooks import playbook_for, techniques_for
from db.session import get_db
from db.models import (
    Alert as AlertRow,
    AlertEvent,
    AlertStatus,
    AttackAnalysis as AnalysisRow,
    Feedback as FeedbackRow,
    MLModel,
    User,
)
from ml.features import normalize_feature_names, to_feature_key
from ml.profiles import complete_features
from xai.whatif import find_counterfactual, score_features
from .persist import persist_alert
from .schemas import (
    AlertDetailOut,
    AlertEventOut,
    AlertGroupListOut,
    AlertGroupOut,
    AlertListOut,
    AlertOut,
    AlertUpdate,
    FeedbackRequest,
    IngestRequest,
    LogEntryOut,
    LogListOut,
    NoteCreate,
    WhatIfRequest,
    _as_utc_iso,
)
from .security import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["alerts"])

MAX_PAGE_SIZE = 100
TRIAGE_ROLES = ("ANALYST", "ADMIN")
VALID_STATUSES = {s.value for s in AlertStatus}


def _apply_filters(
    query,
    attack_type,
    severity,
    priority,
    q,
    since,
    status=None,
    source_ip=None,
    dest_ip=None,
    assignee_id=None,
):
    if attack_type:
        query = query.filter(AlertRow.attack_type.in_(attack_type))
    if severity:
        query = query.filter(AlertRow.severity.in_(severity))
    if priority:
        query = query.filter(AlertRow.priority.in_(priority))
    if status:
        query = query.filter(AlertRow.status.in_(status))
    if source_ip:
        query = query.filter(AlertRow.source_ip == source_ip)
    if dest_ip:
        query = query.filter(AlertRow.dest_ip == dest_ip)
    if assignee_id:
        query = query.filter(AlertRow.assignee_id == assignee_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                AlertRow.source_ip.like(like),
                AlertRow.dest_ip.like(like),
                AlertRow.description.like(like),
            )
        )
    if since:
        query = query.filter(AlertRow.timestamp > since)
    return query


def _log_event(db: Session, alert_id: str, user: Optional[User], kind: str, body=None, meta=None):
    db.add(AlertEvent(alert_id=alert_id, user_id=user.id if user else None, kind=kind, body=body, meta=meta))


def _get_alert_or_404(db: Session, alert_id: str) -> AlertRow:
    alert = db.query(AlertRow).filter(AlertRow.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.get("/alerts", response_model=AlertListOut)
def list_alerts(
    attack_type: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    priority: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    q: Optional[str] = None,
    source_ip: Optional[str] = None,
    dest_ip: Optional[str] = None,
    assignee_id: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = 25,
    offset: int = 0,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """`since` powers the frontend's live-update poll: pass the timestamp of
    the newest alert already seen to fetch only what's landed after it."""
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    offset = max(0, offset)

    query = _apply_filters(
        db.query(AlertRow), attack_type, severity, priority, q, since, status, source_ip, dest_ip, assignee_id
    )

    total = query.with_entities(func.count(AlertRow.id)).scalar()
    items = (
        query.options(
            joinedload(AlertRow.analysis).joinedload(AnalysisRow.explanation),
            joinedload(AlertRow.assignee),
        )
        .order_by(AlertRow.risk_score.desc(), AlertRow.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return AlertListOut(items=items, total=total)


@router.get("/alerts/grouped", response_model=AlertGroupListOut)
def list_alerts_grouped(
    attack_type: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    priority: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    q: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Clusters alerts by (source_ip, dest_ip, attack_type) so a burst from
    one attacker (e.g. a port scan firing dozens of alerts) reads as one
    correlated card instead of flooding the flat list."""
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    offset = max(0, offset)

    base = _apply_filters(db.query(AlertRow), attack_type, severity, priority, q, None, status)
    grouped = base.with_entities(
        AlertRow.source_ip,
        AlertRow.dest_ip,
        AlertRow.attack_type,
        func.count(AlertRow.id).label("count"),
        func.max(AlertRow.risk_score).label("max_risk_score"),
        func.max(AlertRow.timestamp).label("last_seen"),
        func.min(AlertRow.timestamp).label("first_seen"),
    ).group_by(AlertRow.source_ip, AlertRow.dest_ip, AlertRow.attack_type)

    total = grouped.count()
    rows = grouped.order_by(func.max(AlertRow.risk_score).desc()).offset(offset).limit(limit).all()

    items = []
    for row in rows:
        latest = (
            db.query(AlertRow)
            .filter(
                AlertRow.source_ip == row.source_ip,
                AlertRow.dest_ip == row.dest_ip,
                AlertRow.attack_type == row.attack_type,
            )
            .order_by(AlertRow.timestamp.desc())
            .first()
        )
        items.append(
            AlertGroupOut(
                source_ip=row.source_ip,
                dest_ip=row.dest_ip,
                attack_type=row.attack_type,
                count=row.count,
                max_risk_score=row.max_risk_score,
                max_severity=latest.severity if latest else "LOW",
                first_seen=row.first_seen,
                last_seen=row.last_seen,
                latest_alert_id=latest.id if latest else "",
            )
        )
    return AlertGroupListOut(items=items, total=total)


@router.get("/alerts/{alert_id}", response_model=AlertDetailOut)
def get_alert(alert_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    alert = _get_alert_or_404(db, alert_id)
    out = AlertDetailOut.model_validate(alert)
    if alert.analysis and alert.analysis.explanation:
        out.explanation = alert.analysis.explanation
    if alert.analysis and alert.analysis.features:
        out.features = {k: float(v) for k, v in alert.analysis.features.items()}
    out.techniques = techniques_for(alert.attack_type.value if hasattr(alert.attack_type, "value") else alert.attack_type)
    out.playbook = playbook_for(alert.attack_type.value if hasattr(alert.attack_type, "value") else alert.attack_type)
    return out


@router.patch("/alerts/{alert_id}", response_model=AlertOut)
def update_alert(
    alert_id: str,
    payload: AlertUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*TRIAGE_ROLES)),
):
    """Move a case through its lifecycle and/or assign it. Every change is
    written to the alert's audit timeline."""
    alert = _get_alert_or_404(db, alert_id)

    if payload.status is not None:
        if payload.status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail=f"status must be one of {sorted(VALID_STATUSES)}")
        if payload.status != alert.status:
            _log_event(db, alert.id, user, "STATUS", meta={"from": alert.status, "to": payload.status})
            alert.status = payload.status

    if payload.assignee_id is not None:
        if payload.assignee_id == "":
            if alert.assignee_id:
                _log_event(db, alert.id, user, "ASSIGN", meta={"to": None})
            alert.assignee_id = None
        else:
            assignee = db.query(User).filter(User.id == payload.assignee_id).first()
            if not assignee:
                raise HTTPException(status_code=404, detail="Assignee not found")
            if alert.assignee_id != assignee.id:
                _log_event(db, alert.id, user, "ASSIGN", meta={"to": assignee.name, "to_id": assignee.id})
            alert.assignee_id = assignee.id

    alert.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return alert


@router.get("/alerts/{alert_id}/events", response_model=List[AlertEventOut])
def alert_events(alert_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    _get_alert_or_404(db, alert_id)
    events = (
        db.query(AlertEvent)
        .options(joinedload(AlertEvent.user))
        .filter(AlertEvent.alert_id == alert_id)
        .order_by(AlertEvent.created_at.desc())
        .all()
    )
    return [
        AlertEventOut(
            id=e.id,
            kind=e.kind,
            body=e.body,
            meta=e.meta,
            user_id=e.user_id,
            user_name=e.user.name if e.user else None,
            created_at=e.created_at,
        )
        for e in events
    ]


@router.post("/alerts/{alert_id}/events", response_model=AlertEventOut)
def add_note(
    alert_id: str,
    payload: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*TRIAGE_ROLES)),
):
    alert = _get_alert_or_404(db, alert_id)
    _log_event(db, alert.id, user, "NOTE", body=payload.body.strip())
    alert.updated_at = datetime.utcnow()
    db.commit()
    event = (
        db.query(AlertEvent)
        .filter(AlertEvent.alert_id == alert_id)
        .order_by(AlertEvent.created_at.desc())
        .first()
    )
    return AlertEventOut(
        id=event.id,
        kind=event.kind,
        body=event.body,
        meta=event.meta,
        user_id=user.id,
        user_name=user.name,
        created_at=event.created_at,
    )


@router.get("/logs", response_model=LogListOut)
def list_logs(
    user_id: Optional[str] = None,
    alert_id: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit: int = 25,
    offset: int = 0,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("ADMIN")),
):
    """Admin-only global audit log (PRD §12: `GET /api/logs`): every
    `AlertEvent` across all alerts, not scoped to one case. The per-alert
    timeline (`/alerts/{id}/events`) covers a single investigation; this
    covers "who did what, when" across the whole system."""
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    offset = max(0, offset)

    query = db.query(AlertEvent).options(joinedload(AlertEvent.user))
    if user_id:
        query = query.filter(AlertEvent.user_id == user_id)
    if alert_id:
        # prefix match: the UI only ever shows the short id (first 8 chars),
        # so requiring the full UUID here would make the filter unusable
        query = query.filter(AlertEvent.alert_id.like(f"{alert_id}%"))
    if date_from:
        query = query.filter(AlertEvent.created_at >= date_from)
    if date_to:
        query = query.filter(AlertEvent.created_at <= date_to)

    total = query.with_entities(func.count(AlertEvent.id)).scalar()
    events = query.order_by(AlertEvent.created_at.desc()).offset(offset).limit(limit).all()

    items = [
        LogEntryOut(
            id=e.id,
            alert_id=e.alert_id,
            kind=e.kind,
            body=e.body,
            meta=e.meta,
            user_id=e.user_id,
            user_name=e.user.name if e.user else None,
            created_at=e.created_at,
        )
        for e in events
    ]
    return LogListOut(items=items, total=total)


@router.post("/alerts/{alert_id}/whatif")
def what_if(
    alert_id: str,
    payload: WhatIfRequest,
    request: Request,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Re-score this alert's flow with some features edited. Read-only: nothing
    is stored, so analysts can probe the model freely."""
    alert = _get_alert_or_404(db, alert_id)
    if not alert.analysis or not alert.analysis.features:
        raise HTTPException(status_code=409, detail="This alert has no stored feature vector")
    pipeline = request.app.state.pipeline
    original = complete_features(normalize_feature_names(alert.analysis.features))
    unknown = [k for k in payload.overrides if to_feature_key(k) is None]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown features: {unknown}")
    overrides = {to_feature_key(k): max(0.0, float(v)) for k, v in payload.overrides.items()}
    edited = {**original, **overrides}
    return {
        "baseline": score_features(pipeline, original, with_shap=False),
        "scenario": score_features(pipeline, edited),
        "features": edited,
        "changed": sorted(k for k in overrides if abs(edited[k] - original[k]) > 1e-9),
    }


@router.post("/alerts/{alert_id}/counterfactual")
def counterfactual(
    alert_id: str,
    request: Request,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Smallest set of feature edits that flips the model's verdict to NORMAL."""
    alert = _get_alert_or_404(db, alert_id)
    if not alert.analysis or not alert.analysis.features:
        raise HTTPException(status_code=409, detail="This alert has no stored feature vector")
    ranking = (
        alert.analysis.explanation.important_features
        if alert.analysis.explanation and alert.analysis.explanation.important_features
        else None
    )
    features = {k: float(v) for k, v in alert.analysis.features.items()}
    return find_counterfactual(request.app.state.pipeline, features, ranking)


@router.post("/alerts/{alert_id}/feedback")
def submit_feedback(
    alert_id: str,
    payload: FeedbackRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*TRIAGE_ROLES)),
):
    alert = _get_alert_or_404(db, alert_id)

    feedback = FeedbackRow(
        alert_id=alert_id,
        user_id=user.id,
        is_true_positive=payload.is_true_positive,
        notes=payload.notes,
    )
    db.add(feedback)

    new_status = AlertStatus.CONFIRMED.value if payload.is_true_positive else AlertStatus.FALSE_POSITIVE.value
    if alert.status != new_status:
        _log_event(db, alert.id, user, "STATUS", meta={"from": alert.status, "to": new_status})
        alert.status = new_status
    _log_event(
        db,
        alert.id,
        user,
        "VERDICT",
        body=payload.notes,
        meta={"is_true_positive": payload.is_true_positive},
    )
    alert.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(feedback)
    return {
        "alert_id": alert_id,
        "recorded": True,
        "is_true_positive": feedback.is_true_positive,
        "status": alert.status,
    }


@router.get("/feedback/recent")
def recent_feedback(limit: int = 6, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """Recent analyst triage verdicts with enough alert/user context to render
    an activity feed -- who confirmed or dismissed what, and when."""
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    rows = (
        db.query(FeedbackRow, AlertRow, User)
        .join(AlertRow, FeedbackRow.alert_id == AlertRow.id)
        .join(User, FeedbackRow.user_id == User.id)
        .order_by(FeedbackRow.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": fb.id,
            "alert_id": alert.id,
            "attack_type": alert.attack_type,
            "is_true_positive": fb.is_true_positive,
            "user_name": user.name,
            "created_at": _as_utc_iso(fb.created_at),
        }
        for fb, alert, user in rows
    ]


@router.get("/stats/heatmap")
def stats_heatmap(days: int = 91, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """Per-day alert count + peak risk score, for the calendar risk heatmap.
    Aggregated in Python rather than a DB-specific date-trunc so this works
    identically on SQLite (dev) and Postgres (prod)."""
    days = max(1, min(days, 366))
    rows = db.query(AlertRow.timestamp, AlertRow.risk_score).all()
    buckets: dict[str, dict] = {}
    for ts, risk in rows:
        key = ts.date().isoformat()
        b = buckets.setdefault(key, {"date": key, "count": 0, "max_risk_score": 0.0})
        b["count"] += 1
        b["max_risk_score"] = max(b["max_risk_score"], risk or 0.0)
    return sorted(buckets.values(), key=lambda b: b["date"])[-days:]


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    total = db.query(func.count(AlertRow.id)).scalar()
    by_type = dict(
        db.query(AlertRow.attack_type, func.count(AlertRow.id)).group_by(AlertRow.attack_type).all()
    )
    by_severity = dict(
        db.query(AlertRow.severity, func.count(AlertRow.id)).group_by(AlertRow.severity).all()
    )
    by_priority = dict(
        db.query(AlertRow.priority, func.count(AlertRow.id))
        .filter(AlertRow.priority.isnot(None))
        .group_by(AlertRow.priority)
        .all()
    )
    by_status = dict(db.query(AlertRow.status, func.count(AlertRow.id)).group_by(AlertRow.status).all())
    recent = (
        db.query(AlertRow)
        .options(joinedload(AlertRow.analysis).joinedload(AnalysisRow.explanation), joinedload(AlertRow.assignee))
        .order_by(AlertRow.timestamp.desc())
        .limit(5)
        .all()
    )
    true_positives = (
        db.query(func.count(FeedbackRow.id)).filter(FeedbackRow.is_true_positive.is_(True)).scalar()
    )
    false_positives = (
        db.query(func.count(FeedbackRow.id)).filter(FeedbackRow.is_true_positive.is_(False)).scalar()
    )
    return {
        "total_alerts": total,
        "by_attack_type": by_type,
        "by_severity": by_severity,
        "by_priority": by_priority,
        "by_status": by_status,
        "recent": [AlertOut.model_validate(a) for a in recent],
        "feedback": {"true_positives": true_positives, "false_positives": false_positives},
    }


@router.get("/model/info")
def model_info(request: Request, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    pipeline = request.app.state.pipeline
    latest = db.query(MLModel).order_by(MLModel.trained_at.desc()).first()
    return {
        "algorithm": pipeline.model.algorithm,
        "classes": list(pipeline.model.model.classes_),
        "version": latest.version if latest else None,
        "trained_at": latest.trained_at.isoformat() + "Z" if latest else None,
        "metrics": latest.metrics if latest else None,
    }


def _require_ingest_key(x_api_key: Optional[str] = Header(default=None)):
    """Optional hardening: when INGEST_API_KEY is set, collectors must send it
    as `X-API-Key`. Unset keeps the open local-dev behaviour."""
    expected = os.getenv("INGEST_API_KEY")
    if expected and not secrets.compare_digest((x_api_key or "").encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid or missing ingest API key")


@router.post("/ingest", response_model=Optional[AlertOut], dependencies=[Depends(_require_ingest_key)])
def ingest(payload: IngestRequest, request: Request, db: Session = Depends(get_db)):
    """Push one flow's features through the pipeline (PRD §4/§5) and persist
    the resulting alert, if any. Intended for a TrafficCollector service rather
    than a logged-in analyst; set `INGEST_API_KEY` to require a shared key, and
    put mTLS or a private network in front of it before exposing it further."""
    pipeline = request.app.state.pipeline
    # accepts CICFlowMeter column names or internal keys; features left out
    # are filled with typical normal-traffic values
    features = complete_features(normalize_feature_names(payload.features))
    alert = pipeline.process(features, payload.source_ip, payload.dest_ip)
    if alert is None:
        return None
    row = persist_alert(db, alert, features, origin="ingest")
    db.commit()
    db.refresh(row)
    return row
