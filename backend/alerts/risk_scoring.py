from collections import defaultdict, deque
from datetime import datetime, timedelta
from typing import Dict, Deque, Tuple

from .generator import Alert

SEVERITY_WEIGHT = {"CRITICAL": 1.0, "HIGH": 0.75, "MEDIUM": 0.5, "LOW": 0.25}


class RiskScoringModule:
    """Maps to UML class `RiskScoringModule` (PRD §10). Keeps a short
    in-memory rolling window per (source_ip, attack_type) for the frequency
    correlation term -- move this to Redis/DB if you need it to survive a
    restart or scale across workers."""

    def __init__(
        self,
        w_confidence: float = 0.4,
        w_severity: float = 0.3,
        w_asset: float = 0.15,
        w_frequency: float = 0.15,
        window_minutes: int = 5,
        default_asset_criticality: float = 0.5,
    ):
        self.w_confidence = w_confidence
        self.w_severity = w_severity
        self.w_asset = w_asset
        self.w_frequency = w_frequency
        self.window = timedelta(minutes=window_minutes)
        self.default_asset_criticality = default_asset_criticality
        self._history: Dict[Tuple[str, str], Deque[datetime]] = defaultdict(deque)
        self.asset_criticality: Dict[str, float] = {}  # dest_ip -> 0..1, optional

    def _frequency_correlation(self, alert: Alert) -> float:
        key = (alert.source_ip, alert.attack_type)
        dq = self._history[key]
        dq.append(alert.timestamp)
        cutoff = alert.timestamp - self.window
        while dq and dq[0] < cutoff:
            dq.popleft()
        # 1 occurrence -> 0.0, 5+ occurrences in the window -> capped at 1.0
        return min((len(dq) - 1) / 4, 1.0)

    def score(self, alert: Alert) -> float:
        severity_weight = SEVERITY_WEIGHT.get(alert.severity, 0.25)
        asset_criticality = self.asset_criticality.get(alert.dest_ip, self.default_asset_criticality)
        frequency = self._frequency_correlation(alert)

        risk = (
            self.w_confidence * alert.confidence
            + self.w_severity * severity_weight
            + self.w_asset * asset_criticality
            + self.w_frequency * frequency
        )
        return round(min(risk, 1.0), 4)

    def prioritize(self, risk_score: float) -> str:
        if risk_score >= 0.8:
            return "P1"
        if risk_score >= 0.6:
            return "P2"
        if risk_score >= 0.4:
            return "P3"
        return "P4"

    def calculate(self, alert: Alert) -> Alert:
        alert.risk_score = self.score(alert)
        alert.priority = self.prioritize(alert.risk_score)
        return alert
