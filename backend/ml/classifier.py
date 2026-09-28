from dataclasses import dataclass

from .model import PredictionResult


@dataclass
class ClassificationResult:
    is_attack: bool
    label: str
    score: float
    probabilities: dict


class AttackClassifier:
    """Maps to UML class `AttackClassifier`. Applies the normal/attack
    threshold on top of the raw model prediction."""

    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold

    def is_attack(self, result: PredictionResult) -> bool:
        return result.label != "NORMAL" and result.score >= self.threshold

    def classify(self, result: PredictionResult) -> ClassificationResult:
        return ClassificationResult(
            is_attack=self.is_attack(result),
            label=result.label,
            score=result.score,
            probabilities=result.probabilities,
        )
