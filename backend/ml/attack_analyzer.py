from dataclasses import dataclass
from typing import Dict

from .classifier import ClassificationResult


@dataclass
class AttackAnalysis:
    attack_type: str
    features: Dict[str, float]
    score: float


class AttackTypeAnalyzer:
    """Maps to UML class `AttackTypeAnalyzer`. In this design the model
    already predicts the specific class directly (multi-class, not a
    binary + separate type step), so this mostly packages the result plus
    the feature vector for the explainer/alert stages downstream."""

    def analyze(self, result: ClassificationResult, features: Dict[str, float]) -> AttackAnalysis:
        return AttackAnalysis(
            attack_type=result.label,
            features=features,
            score=result.score,
        )
