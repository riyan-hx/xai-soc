"""Shared persistence for pipeline output, used by the ingest endpoint and the
Threat Simulator so every alert is stored the same way."""

from typing import Dict

from sqlalchemy.orm import Session

from alerts.generator import Alert
from db.models import (
    Alert as AlertRow,
    AttackAnalysis as AnalysisRow,
    Explanation as ExplanationRow,
)


def persist_alert(db: Session, alert: Alert, features: Dict[str, float], origin: str = "ingest") -> AlertRow:
    row = AlertRow(
        attack_type=alert.attack_type,
        severity=alert.severity,
        source_ip=alert.source_ip,
        dest_ip=alert.dest_ip,
        timestamp=alert.timestamp,
        updated_at=alert.timestamp,
        confidence=alert.confidence,
        description=alert.description,
        risk_score=alert.risk_score,
        priority=alert.priority,
        origin=origin,
    )
    db.add(row)
    db.flush()

    analysis_row = AnalysisRow(
        alert_id=row.id,
        attack_type=alert.attack_type,
        features=features,
        score=alert.confidence,
    )
    db.add(analysis_row)
    db.flush()

    if alert.explanation:
        db.add(
            ExplanationRow(
                attack_analysis_id=analysis_row.id,
                reason=alert.explanation.reason,
                important_features=alert.explanation.important_features,
                confidence=alert.explanation.confidence,
            )
        )
    return row
