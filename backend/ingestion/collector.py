"""Maps to UML class `TrafficCollector`.

For the academic build, traffic is read from a pre-extracted flow-feature
CSV (see ml_training/) rather than captured live. This stub is where a real
capture (Scapy / CICFlowMeter) would plug in later without changing anything
downstream -- `get_traffic()` just needs to keep yielding feature dicts that
match `ml.features.FEATURE_NAMES`.
"""

from typing import Iterator, Dict
import pandas as pd

from ml.features import FEATURE_NAMES


class TrafficCollector:
    def __init__(self, source: str):
        self.source = source

    def start_capture(self):
        pass  # no-op for file-based source

    def stop_capture(self):
        pass

    def get_traffic(self) -> Iterator[Dict[str, float]]:
        df = pd.read_csv(self.source)
        for _, row in df.iterrows():
            yield {name: float(row[name]) for name in FEATURE_NAMES if name in row}
