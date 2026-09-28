from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from ml.attack_analyzer import AttackAnalysis
from xai.shap_explainer import Explanation


@dataclass
class Alert:
    attack_type: str
    severity: str
    confidence: float
    source_ip: str
    dest_ip: str
    description: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    explanation: Optional[Explanation] = None
    risk_score: Optional[float] = None
    priority: Optional[str] = None


class SOCAlertGenerator:
    """Maps to UML class `SOCAlertGenerator` (PRD §10)."""

    def calculate_severity(self, analysis: AttackAnalysis) -> str:
        c = analysis.score
        if c >= 0.9:
            return "CRITICAL"
        if c >= 0.75:
            return "HIGH"
        if c >= 0.5:
            return "MEDIUM"
        return "LOW"

    def calculate_confidence(self, analysis: AttackAnalysis) -> float:
        return analysis.score

    def generate(
        self,
        analysis: AttackAnalysis,
        explanation: Explanation,
        source_ip: str = "unknown",
        dest_ip: str = "unknown",
    ) -> Alert:
        severity = self.calculate_severity(analysis)
        confidence = self.calculate_confidence(analysis)
        return Alert(
            attack_type=analysis.attack_type,
            severity=severity,
            confidence=confidence,
            source_ip=source_ip,
            dest_ip=dest_ip,
            description=explanation.reason,
            explanation=explanation,
        )
