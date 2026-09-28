"""
Generates a synthetic labeled dataset with the same schema as
backend/ml/features.py, so the pipeline is runnable end-to-end before a real
dataset (PRD §3/§8 -- e.g. CIC-IDS2017/2018 + CIRA-CIC-DoHBrw-2020) is wired
in. Replace `build_dataset()` with a real CSV loader once the dataset is
chosen; keep the column names identical to FEATURE_NAMES + "label".

Each class is generated from a shared base flow profile with per-feature
mean multipliers loosely modeled on how each attack type is described in
IDS literature (e.g. DoS floods packet/byte rate and SYNs; port scans fan
out across destination ports with tiny packets; DNS tunneling inflates
query length/entropy/frequency while leaving packet volume close to
normal). This keeps classes realistically overlapping rather than
trivially separable, and keeps SHAP explanations pointing at the features
that actually make sense for that attack (see PRD §9).
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
from ml.profiles import BASE_STATS, CLASS_MULTIPLIERS, REL_STD  # noqa: E402,F401


def build_dataset(n_per_class: int = 800) -> pd.DataFrame:
    rows = []
    for attack_type in ATTACK_TYPES:
        multipliers = CLASS_MULTIPLIERS[attack_type]
        means = np.array([BASE_STATS[f] * multipliers.get(f, 1.0) for f in FEATURE_NAMES])
        stds = means * REL_STD + 1e-6
        data = RNG.normal(loc=means, scale=stds, size=(n_per_class, len(FEATURE_NAMES)))
        data = np.clip(data, 0, None)
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
