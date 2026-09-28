"""Threat Simulator: fire synthetic flows through the *real* pipeline.

The flows come from the same per-class profiles the model was trained on
(`ml/profiles.py`), with an `intensity` control that makes attacks stealthier
or louder. That turns the console into a live demonstration of the whole
chain and a small robustness probe: turn the intensity down and watch the
model's confidence, and its explanations, change.

Every alert created here carries `origin="simulator"` (or `"seed"` for the
demo history) so the UI can always say the data is synthetic.
"""

import random
from datetime import datetime, timedelta
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from db.models import (
    Alert as AlertRow,
    AlertEvent,
    AlertStatus,
    AttackAnalysis,
    Explanation,
    Feedback as FeedbackRow,
    User,
)
from db.session import get_db
from ml.features import ATTACK_TYPES
from ml.profiles import sample_flow_dict
from xai.whatif import score_features
from .persist import persist_alert
from .schemas import AlertOut, BackfillRequest, SimulateRequest
from .security import require_role

router = APIRouter(prefix="/api/simulate", tags=["simulator"])

SCENARIOS = list(ATTACK_TYPES) + ["MIXED"]
ATTACKS_ONLY = [t for t in ATTACK_TYPES if t != "NORMAL"]

# Documentation-only ranges (RFC 5737) for "external" attackers, so a demo can
# never point at a real address; internal assets use RFC 1918.
ATTACKER_NET = ("203.0.113", "198.51.100", "192.0.2")


def _attacker_ip(rng: random.Random) -> str:
    return f"{rng.choice(ATTACKER_NET)}.{rng.randint(2, 250)}"


def _asset_ip(rng: random.Random) -> str:
    return f"10.0.{rng.randint(1, 4)}.{rng.randint(10, 60)}"


def _internal_host(rng: random.Random) -> str:
    return f"10.0.{rng.randint(5, 9)}.{rng.randint(20, 200)}"


@router.post("")
def simulate(
    payload: SimulateRequest,
    request: Request,
    db: Session = Depends(get_db),
    _user=Depends(require_role("ANALYST", "ADMIN")),
):
    if payload.scenario not in SCENARIOS:
        raise HTTPException(status_code=422, detail=f"scenario must be one of {SCENARIOS}")

    pipeline = request.app.state.pipeline
    rng = np.random.default_rng()
    py = random.Random()

    # One attacker and one target for the whole burst, so the risk scorer's
    # repeat-frequency term and the Grouped view behave like a real campaign.
    src = payload.source_ip or (
        _internal_host(py) if payload.scenario in ("NORMAL", "MIXED") else _attacker_ip(py)
    )
    dst = payload.dest_ip or _asset_ip(py)

    results = []
    created: List[AlertRow] = []
    for i in range(payload.count):
        if payload.scenario == "MIXED":
            intended = py.choices(ATTACK_TYPES, weights=[4, 2, 3, 2, 2, 1], k=1)[0]
        else:
            intended = payload.scenario
        features = sample_flow_dict(intended, rng, payload.intensity)
        verdict = score_features(pipeline, features, with_shap=False)
        flow_src = _internal_host(py) if intended == "NORMAL" and payload.scenario == "MIXED" else src

        row = None
        if payload.dry_run:
            detected = verdict["is_attack"]
        else:
            alert = pipeline.process(features, flow_src, dst)
            detected = alert is not None
            if alert is not None:
                row = persist_alert(db, alert, features, origin="simulator")
                created.append(row)
        results.append(
            {
                "index": i,
                "intended": intended,
                "predicted": verdict["label"],
                "confidence": round(verdict["score"], 4),
                "probabilities": verdict["probabilities"],
                "source_ip": flow_src,
                "dest_ip": dst,
                "detected": detected,
                "alert_id": row.id if row else None,
            }
        )
    db.commit()
    for row in created:
        db.refresh(row)

    by_id = {row.id: AlertOut.model_validate(row) for row in created}
    for r in results:
        r["alert"] = by_id.get(r["alert_id"])

    attacks = [r for r in results if r["intended"] != "NORMAL"]
    mean_conf = (
        round(sum(r["probabilities"].get(r["intended"], 0.0) for r in attacks) / len(attacks), 4)
        if attacks
        else None
    )
    return {
        "scenario": payload.scenario,
        "intensity": payload.intensity,
        "dry_run": payload.dry_run,
        "results": results,
        "summary": {
            "sent": len(results),
            "alerts": len(created),
            "attacks_sent": len(attacks),
            "attacks_detected": sum(1 for r in attacks if r["detected"]),
            "attacks_misclassified": sum(
                1 for r in attacks if r["detected"] and r["predicted"] != r["intended"]
            ),
            "benign_sent": len(results) - len(attacks),
            "false_alarms": sum(1 for r in results if r["intended"] == "NORMAL" and r["detected"]),
            # mean probability the model gave the class that was actually sent
            "mean_true_class_probability": mean_conf,
        },
    }


def _clear_seeded(db: Session):
    ids = [i for (i,) in db.query(AlertRow.id).filter(AlertRow.origin == "seed").all()]
    if not ids:
        return 0
    analysis_ids = [i for (i,) in db.query(AttackAnalysis.id).filter(AttackAnalysis.alert_id.in_(ids)).all()]
    if analysis_ids:
        db.query(Explanation).filter(Explanation.attack_analysis_id.in_(analysis_ids)).delete(
            synchronize_session=False
        )
    db.query(AttackAnalysis).filter(AttackAnalysis.alert_id.in_(ids)).delete(synchronize_session=False)
    db.query(AlertEvent).filter(AlertEvent.alert_id.in_(ids)).delete(synchronize_session=False)
    db.query(FeedbackRow).filter(FeedbackRow.alert_id.in_(ids)).delete(synchronize_session=False)
    db.query(AlertRow).filter(AlertRow.id.in_(ids)).delete(synchronize_session=False)
    return len(ids)


def _diurnal_weight(hour: int) -> float:
    """Business-hours-heavy alert volume with a smaller overnight shoulder."""
    if 9 <= hour <= 17:
        return 1.0
    if 6 <= hour < 9 or 17 < hour <= 21:
        return 0.55
    return 0.25


@router.post("/backfill")
def backfill(
    payload: BackfillRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("ADMIN")),
):
    """Generate a believable stretch of history (campaign bursts, business-hour
    peaks, analyst verdicts and case states) so charts, calibration and the
    grouped view have something to show. Labeled `origin="seed"`; re-running
    with `reset=true` replaces the previous seed instead of piling on."""
    pipeline = request.app.state.pipeline
    rng = np.random.default_rng(7)
    py = random.Random(7)
    now = datetime.utcnow()

    removed = _clear_seeded(db) if payload.reset else 0

    # 1) plan events: (timestamp, attack type, src, dst, intensity)
    plan = []
    for d in range(payload.days, -1, -1):  # d=0 is today; events after now are dropped below
        day_start = (now - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
        weekday_factor = 0.6 if day_start.weekday() >= 5 else 1.0
        n_singletons = max(1, int(payload.per_day * weekday_factor * py.uniform(0.7, 1.25)))

        hours = [h for h in range(24)]
        weights = [_diurnal_weight(h) for h in hours]
        for _ in range(n_singletons):
            hour = py.choices(hours, weights=weights, k=1)[0]
            ts = day_start + timedelta(hours=hour, minutes=py.randint(0, 59), seconds=py.randint(0, 59))
            atype = py.choices(ATTACKS_ONLY, weights=[3, 4, 3, 2, 2], k=1)[0]
            plan.append((ts, atype, _attacker_ip(py), _asset_ip(py), py.uniform(0.35, 1.05)))

        # one or two coordinated campaigns a day: same source, same target, a tight burst
        for _ in range(py.randint(1, 2)):
            atype = py.choice(ATTACKS_ONLY)
            src, dst = _attacker_ip(py), _asset_ip(py)
            start = day_start + timedelta(hours=py.choice([2, 3, 10, 11, 14, 15, 22]), minutes=py.randint(0, 40))
            for k in range(py.randint(4, 9)):
                plan.append((start + timedelta(minutes=k * py.uniform(0.5, 3)), atype, src, dst, py.uniform(0.5, 1.1)))
    plan = [p for p in plan if p[0] < now - timedelta(minutes=5)]
    plan.sort(key=lambda p: p[0])

    # 2) run every event through the real pipeline, oldest first
    created: List[AlertRow] = []
    for ts, atype, src, dst, intensity in plan:
        features = sample_flow_dict(atype, rng, intensity)
        alert = pipeline.process(features, src, dst, timestamp=ts)
        if alert is not None:
            created.append(persist_alert(db, alert, features, origin="seed"))

    # 3) analyst verdicts and case states for the older ones
    triaged = 0
    for row in created:
        age_h = (now - row.timestamp).total_seconds() / 3600
        if age_h < 1.5:
            continue
        p_triaged = min(0.92, 0.1 + age_h / 48)  # recent alerts stay in the queue
        if py.random() > p_triaged:
            if py.random() < 0.3:
                row.status = AlertStatus.INVESTIGATING.value
                row.assignee_id = admin.id
            continue
        # analysts confirm somewhat less often than the model's confidence implies,
        # so the calibration view has something honest to show
        p_true = min(0.98, max(0.2, (row.confidence or 0.7) - 0.07 + py.gauss(0, 0.05)))
        is_tp = py.random() < p_true
        delay = timedelta(minutes=min(max(py.lognormvariate(3.1, 0.8), 2), age_h * 60 - 1))
        fb_time = row.timestamp + delay
        db.add(FeedbackRow(alert_id=row.id, user_id=admin.id, is_true_positive=is_tp, created_at=fb_time))
        db.add(
            AlertEvent(
                alert_id=row.id,
                user_id=admin.id,
                kind="VERDICT",
                meta={"is_true_positive": is_tp},
                created_at=fb_time,
            )
        )
        status = AlertStatus.CONFIRMED.value if is_tp else AlertStatus.FALSE_POSITIVE.value
        if is_tp and py.random() < 0.6:
            status = AlertStatus.RESOLVED.value
        db.add(
            AlertEvent(
                alert_id=row.id,
                user_id=admin.id,
                kind="STATUS",
                meta={"from": "NEW", "to": status},
                created_at=fb_time + timedelta(seconds=1),
            )
        )
        row.status = status
        if is_tp:
            row.assignee_id = admin.id  # confirmed and resolved cases were worked by someone
        row.updated_at = fb_time
        triaged += 1

    db.commit()
    return {"removed": removed, "created": len(created), "triaged": triaged, "days": payload.days}
