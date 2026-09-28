from dataclasses import dataclass
from typing import List, Optional

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from .preprocess import Dataset


@dataclass
class PredictionResult:
    label: str
    score: float
    probabilities: dict


class MLIDSModel:
    """Maps to UML class `MLIDSModel`. RandomForest baseline (fast to train,
    SHAP TreeExplainer support) -- see PRD §8 for why, and for the XGBoost
    swap-in path if you need it later."""

    def __init__(self, algorithm: str = "random_forest"):
        self.algorithm = algorithm
        self.model_type = "classification"
        self.model = RandomForestClassifier(
            n_estimators=200, max_depth=12, random_state=42, class_weight="balanced"
        )
        self.scaler = None

    def train(self, dataset: Dataset):
        self.model.fit(dataset.X, dataset.y)
        self.scaler = dataset.scaler
        return self

    def predict(self, X: pd.DataFrame) -> List[PredictionResult]:
        proba = self.model.predict_proba(X)
        labels = self.model.classes_
        results = []
        for row in proba:
            best_idx = row.argmax()
            results.append(
                PredictionResult(
                    label=labels[best_idx],
                    score=float(row[best_idx]),
                    probabilities=dict(zip(labels, row.tolist())),
                )
            )
        return results

    def save(self, path: str):
        """Persists the fitted model *and* its training-time scaler together
        -- they must always travel as a pair (see `preprocess.py`)."""
        joblib.dump({"algorithm": self.algorithm, "model": self.model, "scaler": self.scaler}, path)

    def load_model(self, path: str):
        bundle = joblib.load(path)
        if isinstance(bundle, dict):
            self.algorithm = bundle.get("algorithm", self.algorithm)
            self.model = bundle["model"]
            self.scaler: Optional[object] = bundle.get("scaler")
        else:
            # backwards compat with older artifacts saved as a bare estimator
            self.model = bundle
            self.scaler = None
        return self
