import numpy as np
import pandas as pd
import pytest

from ml.preprocess import PreprocessingModule


def test_clean_drops_duplicates_inf_and_na():
    df = pd.DataFrame(
        {
            "flow_duration": [1.0, 1.0, np.inf, np.nan],
            "label": ["NORMAL", "NORMAL", "NORMAL", "NORMAL"],
        }
    )
    pre = PreprocessingModule(feature_names=["flow_duration"])
    cleaned = pre.clean(df)
    assert len(cleaned) == 1


def test_extract_features_raises_on_missing_column():
    pre = PreprocessingModule()
    df = pd.DataFrame({"flow_duration": [1.0]})
    with pytest.raises(ValueError):
        pre.extract_features(df)


def test_fit_normalize_scales_each_column_to_unit_range():
    pre = PreprocessingModule(feature_names=["a", "b"])
    X = pd.DataFrame({"a": [0.0, 5.0, 10.0], "b": [100.0, 150.0, 200.0]})
    X_scaled, _scaler = pre.fit_normalize(X)
    assert X_scaled["a"].min() == pytest.approx(0.0)
    assert X_scaled["a"].max() == pytest.approx(1.0)
    assert X_scaled["b"].min() == pytest.approx(0.0)
    assert X_scaled["b"].max() == pytest.approx(1.0)


def test_preprocess_features_only_reuses_fitted_scaler():
    """Regression test: a single inference row must be scaled against the
    *training* range, not its own (degenerate) min/max. Before this fix,
    inference skipped scaling entirely, so a model trained on ~[0,1] values
    was fed raw-magnitude features at serve time."""
    pre = PreprocessingModule(feature_names=["a"])
    X = pd.DataFrame({"a": [0.0, 10.0, 20.0]})
    _, scaler = pre.fit_normalize(X)

    row = pre.preprocess_features_only({"a": 10.0}, scaler)
    assert row["a"].iloc[0] == pytest.approx(0.5)


def test_preprocess_features_only_without_scaler_passes_through_raw():
    pre = PreprocessingModule(feature_names=["a"])
    row = pre.preprocess_features_only({"a": 42.0}, None)
    assert row["a"].iloc[0] == pytest.approx(42.0)
