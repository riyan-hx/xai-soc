"""
Trains the MLIDSModel end-to-end (PreprocessingModule -> MLIDSModel) and
saves the artifact for the API to load. Swap `synthetic_data.build_dataset()`
for a real CSV loader once the dataset (PRD §3) is confirmed -- everything
else in this script stays the same as long as the columns match
backend/ml/features.FEATURE_NAMES + "label".
"""

import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

from ml.preprocess import PreprocessingModule
from ml.model import MLIDSModel
from synthetic_data import build_dataset


def main():
    df = build_dataset()
    train_df, test_df = train_test_split(
        df, test_size=0.2, random_state=42, stratify=df["label"]
    )

    pre = PreprocessingModule()
    train_ds = pre.preprocess(train_df)

    model = MLIDSModel()
    model.train(train_ds)

    # test set must go through the SAME fitted scaler as training, not a
    # fresh min/max fit on the test data itself
    X_test = pre.extract_features(test_df)
    X_test = pd.DataFrame(
        train_ds.scaler.transform(X_test), columns=X_test.columns, index=X_test.index
    )
    y_test = test_df["label"]
    predictions = model.predict(X_test)
    y_pred = [p.label for p in predictions]

    report_text = classification_report(y_test, y_pred)
    report_dict = classification_report(y_test, y_pred, output_dict=True)
    print(report_text)

    out_dir = os.path.dirname(__file__)
    model_path = os.path.join(out_dir, "model.joblib")
    model.save(model_path)
    print(f"Saved model to {model_path}")

    metrics = {
        "algorithm": model.algorithm,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "classes": sorted(df["label"].unique().tolist()),
        "n_train": int(len(train_df)),
        "n_test": int(len(test_df)),
        "accuracy": report_dict.get("accuracy"),
        "macro_f1": report_dict.get("macro avg", {}).get("f1-score"),
        "weighted_f1": report_dict.get("weighted avg", {}).get("f1-score"),
        "report": report_dict,
    }
    metrics_path = os.path.join(out_dir, "model_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"Saved metrics to {metrics_path}")


if __name__ == "__main__":
    main()
