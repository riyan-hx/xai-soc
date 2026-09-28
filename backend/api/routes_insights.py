"""Aggregate views for the dashboard and the Model Observatory.

Everything here is computed in Python from plain row reads instead of
DB-specific date functions, so it behaves identically on SQLite (dev) and
Postgres (prod). Alert volumes are small enough for that to be fine; if this
ever needs to scale, move the bucketing into SQL.
"""

import json
import math
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from statistics import median
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from db.models import Alert as AlertRow, Explanation, AttackAnalysis, Feedback as FeedbackRow, OPEN_STATUSES
from db.session import get_db
from ml.features import FEATURE_NAMES
from .schemas import _as_utc_iso
from .security import get_current_user

router = APIRouter(prefix="/api", tags=["insights"])

PRIORITY_WEIGHT = {"P1": 8, "P2": 4, "P3": 2, "P4": 1}
POSTURE_SATURATION = 40.0  # weighted open-alert load at which the index reaches ~63


def _val(x):
    return x.value if hasattr(x, "value") else x


def _delta_pct(current: float, prev: float) -> Optional[float]:
    if not prev:
        return None
    return round((current - prev) / prev * 100, 1)


def _window(rows, start: datetime, end: datetime):
    return [r for r in rows if start <= r.timestamp < end]


def _posture(open_rows) -> dict:
    counts = Counter(_val(r.priority) for r in open_rows if r.priority is not None)
    load = sum(PRIORITY_WEIGHT.get(p, 1) * n for p, n in counts.items())
    index = round(100 * (1 - math.exp(-load / POSTURE_SATURATION))) if load else 0
    if index < 25:
        band = "Calm"
    elif index < 55:
        band = "Elevated"
    elif index < 80:
        band = "High"
    else:
        band = "Severe"
    return {
        "index": index,
        "band": band,
        "open_by_priority": {p: counts.get(p, 0) for p in ("P1", "P2", "P3", "P4")},
        "open_total": sum(counts.values()),
        "formula": (
            "Open alerts from the last 24 hours weighted P1=8, P2=4, P3=2, P4=1, "
            "then squashed to 0-100 so a handful of critical alerts moves the needle "
            "more than a pile of low-priority ones."
        ),
    }


def _leaders(rows, now: datetime, days: int) -> dict:
    cur_start = now - timedelta(days=days)
    prev_start = now - timedelta(days=2 * days)
    cur = Counter(_val(r.attack_type) for r in _window(rows, cur_start, now + timedelta(seconds=1)))
    prev = Counter(_val(r.attack_type) for r in _window(rows, prev_start, cur_start))
    total = sum(cur.values()) or 1
    items = [
        {
            "attack_type": t,
            "count": n,
            "prev": prev.get(t, 0),
            "delta_pct": _delta_pct(n, prev.get(t, 0)),
            "share": round(n / total, 4),
        }
        for t, n in cur.most_common(5)
    ]
    return {"items": items, "start": _as_utc_iso(cur_start), "end": _as_utc_iso(now), "total": sum(cur.values())}


def _entities(rows, now: datetime, attr: str, limit: int = 6) -> List[dict]:
    cur_start = now - timedelta(days=7)
    prev_start = now - timedelta(days=14)
    cur_rows = _window(rows, cur_start, now + timedelta(seconds=1))
    prev_rows = _window(rows, prev_start, cur_start)
    prev_count = Counter(getattr(r, attr) for r in prev_rows)
    by_entity: Dict[str, list] = defaultdict(list)
    for r in cur_rows:
        if getattr(r, attr):
            by_entity[getattr(r, attr)].append(r)
    out = []
    for ip, group in by_entity.items():
        types = Counter(_val(r.attack_type) for r in group)
        out.append(
            {
                "ip": ip,
                "alerts": len(group),
                "max_risk": round(max((r.risk_score or 0) for r in group), 3),
                "delta_pct": _delta_pct(len(group), prev_count.get(ip, 0)),
                "top_attack": types.most_common(1)[0][0],
            }
        )
    out.sort(key=lambda e: (e["alerts"], e["max_risk"]), reverse=True)
    return out[:limit]


@router.get("/stats/overview")
def stats_overview(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    now = datetime.utcnow()
    horizon = now - timedelta(days=60)
    rows = db.query(AlertRow).filter(AlertRow.timestamp >= horizon).all()

    w_cur = _window(rows, now - timedelta(days=7), now + timedelta(seconds=1))
    w_prev = _window(rows, now - timedelta(days=14), now - timedelta(days=7))

    critical_cur = sum(1 for r in w_cur if _val(r.severity) == "CRITICAL")
    critical_prev = sum(1 for r in w_prev if _val(r.severity) == "CRITICAL")

    feedback = (
        db.query(FeedbackRow, AlertRow)
        .join(AlertRow, FeedbackRow.alert_id == AlertRow.id)
        .filter(FeedbackRow.created_at >= now - timedelta(days=14))
        .all()
    )

    def triage_minutes(pairs):
        return [max((fb.created_at - a.timestamp).total_seconds() / 60, 0) for fb, a in pairs]

    fb_cur = [(fb, a) for fb, a in feedback if fb.created_at >= now - timedelta(days=7)]
    fb_prev = [(fb, a) for fb, a in feedback if fb.created_at < now - timedelta(days=7)]
    med_cur = median(triage_minutes(fb_cur)) if fb_cur else None
    med_prev = median(triage_minutes(fb_prev)) if fb_prev else None

    def precision(pairs):
        if not pairs:
            return None
        return round(sum(1 for fb, _ in pairs if fb.is_true_positive) / len(pairs) * 100, 1)

    prec_cur, prec_prev = precision(fb_cur), precision(fb_prev)

    open_last_day = [
        r
        for r in rows
        if r.timestamp >= now - timedelta(hours=24) and r.status in OPEN_STATUSES
    ]

    return {
        "generated_at": _as_utc_iso(now),
        "kpis": {
            "alerts": {"value": len(w_cur), "prev": len(w_prev), "delta_pct": _delta_pct(len(w_cur), len(w_prev))},
            "critical": {
                "value": critical_cur,
                "prev": critical_prev,
                "delta_pct": _delta_pct(critical_cur, critical_prev),
            },
            "triage_minutes": {
                "value": round(med_cur, 1) if med_cur is not None else None,
                "prev": round(med_prev, 1) if med_prev is not None else None,
                "delta_pct": _delta_pct(med_cur, med_prev) if med_cur is not None and med_prev else None,
                "n": len(fb_cur),
            },
            "precision": {
                "value": prec_cur,
                "prev": prec_prev,
                "delta_pts": round(prec_cur - prec_prev, 1) if prec_cur is not None and prec_prev is not None else None,
                "n": len(fb_cur),
            },
        },
        "posture": _posture(open_last_day),
        "leaders": {"week": _leaders(rows, now, 7), "month": _leaders(rows, now, 30)},
        "top_sources": _entities(rows, now, "source_ip"),
        "top_targets": _entities(rows, now, "dest_ip"),
    }


_RANGES = {
    # range -> (bucket minutes, bucket count)
    "24h": (60, 24),
    "7d": (360, 28),
    "30d": (1440, 30),
    "90d": (1440, 90),
}


@router.get("/stats/timeseries")
def stats_timeseries(
    window: str = Query("7d", alias="range"),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    if window not in _RANGES:
        raise HTTPException(status_code=422, detail=f"range must be one of {sorted(_RANGES)}")
    step_min, n = _RANGES[window]
    step = timedelta(minutes=step_min)
    now = datetime.utcnow()
    # align bucket edges to the step so the same window always buckets the same way
    epoch = datetime(1970, 1, 1)
    aligned = epoch + timedelta(minutes=((now - epoch).total_seconds() // 60 // step_min) * step_min)
    start = aligned - step * (n - 1)

    rows = db.query(AlertRow.timestamp, AlertRow.risk_score, AlertRow.attack_type).filter(
        AlertRow.timestamp >= start
    ).all()

    points = [
        {"t": start + step * i, "count": 0, "max_risk": 0.0, "by_type": Counter()} for i in range(n)
    ]
    for ts, risk, atype in rows:
        idx = int((ts - start) / step)
        if 0 <= idx < n:
            p = points[idx]
            p["count"] += 1
            p["max_risk"] = max(p["max_risk"], risk or 0.0)
            p["by_type"][_val(atype)] += 1

    peak = max(points, key=lambda p: p["count"])
    return {
        "range": window,
        "step_minutes": step_min,
        "total": sum(p["count"] for p in points),
        "peak": {"t": _as_utc_iso(peak["t"]), "count": peak["count"]},
        "points": [
            {
                "t": _as_utc_iso(p["t"]),
                "count": p["count"],
                "max_risk": round(p["max_risk"], 3),
                "by_type": dict(p["by_type"]),
            }
            for p in points
        ],
    }


def _load_sidecar_metrics(model_path: str) -> dict:
    path = os.path.join(os.path.dirname(model_path) or ".", "model_metrics.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _calibration(db: Session) -> dict:
    pairs = (
        db.query(FeedbackRow.is_true_positive, AlertRow.confidence, AlertRow.origin)
        .join(AlertRow, FeedbackRow.alert_id == AlertRow.id)
        .all()
    )
    edges = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0001]
    buckets = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        inside = [(tp, c) for tp, c, _ in pairs if c is not None and lo <= c < hi]
        n = len(inside)
        buckets.append(
            {
                "lo": lo,
                "hi": min(hi, 1.0),
                "n": n,
                "mean_confidence": round(sum(c for _, c in inside) / n, 4) if n else None,
                "confirmed_rate": round(sum(1 for tp, _ in inside if tp) / n, 4) if n else None,
            }
        )
    total = len(pairs)
    ece = None
    if total >= 10:
        ece = round(
            sum(b["n"] / total * abs(b["confirmed_rate"] - b["mean_confidence"]) for b in buckets if b["n"]), 4
        )
    seeded = sum(1 for _, _, origin in pairs if origin in ("seed", "simulator"))
    return {
        "verdicts": total,
        "confirmed": sum(1 for tp, _, _ in pairs if tp),
        "agreement": round(sum(1 for tp, _, _ in pairs if tp) / total, 4) if total else None,
        "ece": ece,
        "seeded_share": round(seeded / total, 4) if total else 0,
        "buckets": buckets,
    }


def _observed_attribution(db: Session) -> dict:
    """Mean |SHAP| per feature across the explanations actually stored with
    alerts. Complements the model's global importances with what drove real
    verdicts, and splits it per attack class."""
    rows = (
        db.query(AttackAnalysis.attack_type, Explanation.important_features)
        .join(Explanation, Explanation.attack_analysis_id == AttackAnalysis.id)
        .all()
    )
    overall: Dict[str, list] = defaultdict(list)
    by_class: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for atype, feats in rows:
        for f in feats or []:
            v = abs(f.get("shap_value", 0.0))
            overall[f["feature"]].append(v)
            by_class[_val(atype)][f["feature"]].append(v)

    def rank(d, k=8):
        items = [
            {"feature": name, "mean_abs_shap": round(sum(v) / len(v), 5), "n": len(v)}
            for name, v in d.items()
        ]
        items.sort(key=lambda i: i["mean_abs_shap"], reverse=True)
        return items[:k]

    return {
        "sample_size": len(rows),
        "overall": rank(overall, 10),
        "by_class": {cls: rank(feats, 6) for cls, feats in by_class.items()},
    }


@router.get("/model/insights")
def model_insights(request: Request, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    pipeline = request.app.state.pipeline
    model_path = os.getenv("MODEL_PATH", "../ml_training/model.joblib")
    sidecar = _load_sidecar_metrics(model_path)
    estimator = pipeline.model.model

    importances = getattr(estimator, "feature_importances_", None)
    importance = []
    if importances is not None:
        importance = sorted(
            ({"feature": n, "importance": round(float(v), 5)} for n, v in zip(FEATURE_NAMES, importances)),
            key=lambda i: i["importance"],
            reverse=True,
        )

    report = sidecar.get("report", {})
    per_class = [
        {
            "class": cls,
            "precision": round(v["precision"], 4),
            "recall": round(v["recall"], 4),
            "f1": round(v["f1-score"], 4),
            "support": int(v["support"]),
        }
        for cls, v in report.items()
        if cls in list(estimator.classes_)
    ]

    volume = Counter()
    for (atype,) in db.query(AlertRow.attack_type).all():
        volume[_val(atype)] += 1

    return {
        "algorithm": pipeline.model.algorithm,
        "n_estimators": getattr(estimator, "n_estimators", None),
        "classes": [str(c) for c in estimator.classes_],
        "features": FEATURE_NAMES,
        "trained_at": sidecar.get("trained_at"),
        "dataset": {
            "label": "Synthetic flow data (ml_training/synthetic_data.py)",
            "synthetic": True,
            "n_train": sidecar.get("n_train"),
            "n_test": sidecar.get("n_test"),
        },
        "metrics": {
            "accuracy": sidecar.get("accuracy"),
            "macro_f1": sidecar.get("macro_f1"),
            "weighted_f1": sidecar.get("weighted_f1"),
        },
        "per_class": per_class,
        "importance": importance,
        "observed_attribution": _observed_attribution(db),
        "calibration": _calibration(db),
        "alert_volume_by_class": dict(volume),
    }
