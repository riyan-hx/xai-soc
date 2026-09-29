from dataclasses import dataclass
from typing import List

import numpy as np
import pandas as pd
import shap

from ml.attack_analyzer import AttackAnalysis
from ml.features import FEATURE_LABELS


@dataclass
class Explanation:
    reason: str
    important_features: List[dict]  # [{feature, value, shap_value}]
    confidence: float


class ExplainableAIModule:
    """Maps to UML class `ExplainableAIModule`. Uses SHAP TreeExplainer on
    the trained RandomForest/XGBoost model for fast, exact per-instance
    attributions (PRD §9)."""

    def __init__(self, model, top_features: int = 10):
        self.model = model
        self.top_features = top_features
        self.explainer = shap.TreeExplainer(model)

    def explain(self, analysis: AttackAnalysis, feature_row: pd.DataFrame) -> Explanation:
        shap_values = self.explainer.shap_values(feature_row)

        # multi-class RF: older SHAP returns a list of (n_samples, n_features)
        # arrays (one per class); newer SHAP returns one
        # (n_samples, n_features, n_classes) array. Normalize both to the
        # predicted class's (n_features,) attribution vector for this row.
        classes = list(self.model.classes_)
        class_idx = classes.index(analysis.attack_type) if analysis.attack_type in classes else 0

        if isinstance(shap_values, list):
            values = np.asarray(shap_values[class_idx][0])
        else:
            arr = np.asarray(shap_values)
            if arr.ndim == 3:  # (n_samples, n_features, n_classes)
                values = arr[0, :, class_idx]
            else:  # (n_samples, n_features) -- binary/single-output case
                values = arr[0]

        feature_names = list(feature_row.columns)
        pairs = sorted(
            zip(feature_names, feature_row.iloc[0].tolist(), values),
            key=lambda t: abs(t[2]),
            reverse=True,
        )[: self.top_features]

        important_features = [
            {"feature": name, "value": float(val), "shap_value": float(sv)}
            for name, val, sv in pairs
        ]

        reason = self._build_reason(analysis.attack_type, important_features)

        return Explanation(
            reason=reason,
            important_features=important_features,
            confidence=analysis.score,
        )

    @staticmethod
    def _build_reason(attack_type: str, important_features: List[dict]) -> str:
        top = important_features[:3]
        parts = [f"{FEATURE_LABELS.get(f['feature'], f['feature'])} ({f['value']:.2f})" for f in top]
        return f"Classified as {attack_type}: driven by " + ", ".join(parts) + "."
