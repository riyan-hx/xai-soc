"""
Interactive explanation tools built on the same model + SHAP explainer the
pipeline uses:

* `score_features`   what does the model say about this (possibly edited) flow?
* `find_counterfactual`  the smallest set of feature changes that makes the
  model call the flow NORMAL, searched greedily along the features SHAP says
  mattered most and moving each toward the normal-traffic profile.

Counterfactuals answer the question an analyst actually asks of an AI
verdict, "what would have to be different for you to disagree?", and they
are checkable: every suggestion is re-scored by the real model.
"""

from typing import Dict, List, Optional

import pandas as pd

from ml.attack_analyzer import AttackAnalysis
from ml.features import FEATURE_NAMES, normalize_feature_names, to_feature_key
from ml.profiles import BASE_STATS, complete_features

# fraction of the way from the observed value to the normal-traffic value
_STEPS = (0.25, 0.5, 0.75, 1.0)


def _row(pipeline, features: Dict[str, float]) -> pd.DataFrame:
    complete = complete_features(normalize_feature_names(features))
    return pipeline.preprocessor.preprocess_features_only(complete, pipeline.model.scaler)


def score_features(
    pipeline, features: Dict[str, float], top_k: int = 8, with_shap: bool = True
) -> dict:
    """Model verdict (+ SHAP attribution for the predicted class when asked)."""
    row = _row(pipeline, features)
    prediction = pipeline.model.predict(row)[0]
    shap_rows: List[dict] = []
    if with_shap:
        analysis = AttackAnalysis(
            attack_type=prediction.label, features=features, score=prediction.score
        )
        shap_rows = pipeline.explainer.explain(analysis, row).important_features[:top_k]
    return {
        "label": prediction.label,
        "score": prediction.score,
        "is_attack": pipeline.classifier.is_attack(prediction),
        "probabilities": {k: round(v, 4) for k, v in prediction.probabilities.items()},
        "shap": shap_rows,
    }


def find_counterfactual(
    pipeline, features: Dict[str, float], shap_ranking: Optional[List[dict]] = None
) -> dict:
    """Greedy search for a NORMAL verdict.

    Features are visited in order of |SHAP| (from the stored explanation when
    given, otherwise recomputed). Each visited feature is moved toward its
    normal-traffic value in quarter steps and kept at the smallest step that
    helps; the search stops as soon as the model's verdict flips.
    """
    base = complete_features(normalize_feature_names(features))
    baseline = score_features(pipeline, base)
    ranking = shap_ranking or baseline["shap"]
    ordered = [r["feature"] for r in sorted(ranking, key=lambda r: abs(r["shap_value"]), reverse=True)]
    # rankings stored under the old 17-feature names still point at the right feature
    ordered = [k for k in map(to_feature_key, ordered) if k is not None]
    ordered += [n for n in FEATURE_NAMES if n not in ordered]

    if not baseline["is_attack"]:
        return {"found": True, "already_normal": True, "changes": [], "baseline": baseline, "result": baseline}

    current = dict(base)
    changes: List[dict] = []
    result = baseline

    for name in ordered:
        target = BASE_STATS[name]
        original = current[name]
        if abs(original - target) < 1e-9:
            continue
        best_step = None
        for step in _STEPS:
            trial = dict(current)
            trial[name] = original + (target - original) * step
            trial_result = score_features(pipeline, trial, with_shap=False)
            # keep the smallest move that lowers the attack probability
            if trial_result["probabilities"].get(baseline["label"], 1.0) < result["probabilities"].get(
                baseline["label"], 1.0
            ) - 1e-6:
                best_step = (step, trial, trial_result)
                break
        if best_step is None:
            continue
        step, trial, trial_result = best_step
        changes.append(
            {
                "feature": name,
                "from": round(base[name], 4),
                "to": round(trial[name], 4),
                "normal_value": target,
            }
        )
        current, result = trial, trial_result
        if not result["is_attack"]:
            return {
                "found": True,
                "already_normal": False,
                "changes": changes,
                "baseline": baseline,
                "result": result,
            }

    return {
        "found": False,
        "already_normal": False,
        "changes": changes,
        "baseline": baseline,
        "result": result,
    }
