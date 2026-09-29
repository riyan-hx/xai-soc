"""
Generates a synthetic labeled dataset with the same schema as
backend/ml/features.py, so the pipeline is runnable end-to-end before a real
dataset (PRD §3/§8 -- e.g. CIC-IDS2017/2018 + CIRA-CIC-DoHBrw-2020) is wired
in. Replace `build_dataset()` with a real CSV loader once the dataset is
chosen; keep the column names identical to FEATURE_NAMES + "label".

Flows come from `backend/ml/profiles.py`: a few traits per flow (duration,
packet counts, sizes, flags, idle time, DNS behaviour) are sampled around
each class's profile, and the 77 CICFlowMeter features plus the 4 DNS/port
features are derived from them, so related features stay consistent (Flow
Bytes/s really is bytes over duration). Classes overlap realistically
rather than being trivially separable, and SHAP explanations point at the
features that actually make sense for each attack (see PRD §9).
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import numpy as np
import pandas as pd

from ml.features import FEATURE_NAMES, ATTACK_TYPES

RNG = np.random.default_rng(42)

# Profiles live in the backend so the Threat Simulator and the counterfactual
# explainer share exactly what the model was trained on.
from ml.profiles import sample_flows  # noqa: E402


def build_dataset(n_per_class: int = 800) -> pd.DataFrame:
    rows = []
    for attack_type in ATTACK_TYPES:
        data = sample_flows(attack_type, n_per_class, RNG)
        df = pd.DataFrame(data, columns=FEATURE_NAMES)
        df["label"] = attack_type
        rows.append(df)
    full = pd.concat(rows, ignore_index=True)
    return full.sample(frac=1, random_state=42).reset_index(drop=True)


if __name__ == "__main__":
    out_path = os.path.join(os.path.dirname(__file__), "data", "processed", "synthetic.csv")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    build_dataset().to_csv(out_path, index=False)
    print(f"Wrote synthetic dataset to {out_path}")
