from dataclasses import dataclass
from typing import List, Dict, Optional

import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.preprocessing import MinMaxScaler

from .features import FEATURE_NAMES


@dataclass
class Dataset:
    X: pd.DataFrame
    y: pd.Series
    scaler: Optional[MinMaxScaler] = None


class PreprocessingModule:
    """Maps to UML class `PreprocessingModule`: clean, extract features,
    normalize, balance. Real capture parsing (pcap -> flow features) is out
    of scope here -- plug a flow-feature extractor (e.g. CICFlowMeter output)
    in `extract_features` if working from raw packets instead of a labeled
    dataset.

    The scaler fitted during `preprocess()` (training) must be reused, not
    refit, at inference time -- otherwise a lone flow's own min/max is a
    degenerate [0,1] range and the model sees values on a completely
    different scale than it was trained on. `preprocess_features_only`
    takes that fitted scaler explicitly; `ml.model.MLIDSModel` persists it
    alongside the trained model so the API loads both together.
    """

    def __init__(self, feature_names: List[str] = None):
        self.feature_names = feature_names or FEATURE_NAMES

    def clean(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.drop_duplicates()
        df = df.replace([np.inf, -np.inf], np.nan)
        df = df.dropna()
        return df

    def extract_features(self, df: pd.DataFrame) -> pd.DataFrame:
        missing = [c for c in self.feature_names if c not in df.columns]
        if missing:
            raise ValueError(f"Missing expected feature columns: {missing}")
        return df[self.feature_names].astype(float)

    def fit_normalize(self, X: pd.DataFrame) -> tuple:
        scaler = MinMaxScaler()
        X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=X.columns, index=X.index)
        return X_scaled, scaler

    def balance(self, X: pd.DataFrame, y: pd.Series) -> tuple:
        try:
            sm = SMOTE(random_state=42)
            X_res, y_res = sm.fit_resample(X, y)
            return X_res, y_res
        except ValueError:
            # too few samples in a class for SMOTE (e.g. tiny demo data)
            return X, y

    def preprocess(self, df: pd.DataFrame, label_col: str = "label") -> Dataset:
        df = self.clean(df)
        y = df[label_col]
        X = self.extract_features(df)
        X, scaler = self.fit_normalize(X)
        X, y = self.balance(X, y)
        return Dataset(X=X, y=y, scaler=scaler)

    def preprocess_features_only(
        self, feature_row: Dict[str, float], scaler: Optional[MinMaxScaler] = None
    ) -> pd.DataFrame:
        """Single-flow inference path: raw feature dict -> model-ready row,
        scaled with the *fitted training* scaler (required for correct
        predictions -- see class docstring)."""
        row = pd.DataFrame([feature_row])[self.feature_names].astype(float)
        if scaler is not None:
            row = pd.DataFrame(scaler.transform(row), columns=row.columns)
        return row
