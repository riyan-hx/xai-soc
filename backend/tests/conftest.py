"""
Test bootstrap. Runs at *module import* time (not inside a fixture) because
`test_api.py` imports `api.main:app` at module scope, and `db.session`
reads `DATABASE_URL` from the environment as an import-time default -- by
the time an autouse fixture would run, that import has already happened.
Setting env vars and training a small throwaway model here, before any
other test module is collected, guarantees the app sees an isolated SQLite
DB and a real (if tiny) model artifact instead of the dev Postgres DB or a
missing model file.
"""

import os
import sys
import tempfile

import pytest

_TEST_DIR = tempfile.mkdtemp(prefix="xai_soc_test_")
_DB_PATH = os.path.join(_TEST_DIR, "test.db")
_MODEL_PATH = os.path.join(_TEST_DIR, "model.joblib")

os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["MODEL_PATH"] = _MODEL_PATH

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ML_TRAINING_DIR = os.path.abspath(os.path.join(_BACKEND_DIR, "..", "ml_training"))
sys.path.insert(0, _BACKEND_DIR)
sys.path.insert(0, _ML_TRAINING_DIR)

from synthetic_data import build_dataset  # noqa: E402
from ml.preprocess import PreprocessingModule  # noqa: E402
from ml.model import MLIDSModel  # noqa: E402
from ml.features import FEATURE_NAMES  # noqa: E402

_df = build_dataset(n_per_class=50)
_pre = PreprocessingModule()
_dataset = _pre.preprocess(_df)
_model = MLIDSModel()
_model.train(_dataset)
_model.save(_MODEL_PATH)


@pytest.fixture(scope="session")
def dos_features():
    """A raw (unscaled) feature dict sampled from the DOS_DDOS class
    profile -- clearly non-NORMAL, for exercising the alert path."""
    row = _df[_df["label"] == "DOS_DDOS"].iloc[0]
    return {name: float(row[name]) for name in FEATURE_NAMES}


@pytest.fixture(scope="session")
def port_scan_features():
    row = _df[_df["label"] == "PORT_SCAN"].iloc[0]
    return {name: float(row[name]) for name in FEATURE_NAMES}
