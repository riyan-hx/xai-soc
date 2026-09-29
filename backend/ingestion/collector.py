"""Maps to UML class `TrafficCollector`.

For the academic build, traffic is read from a pre-extracted flow-feature
CSV rather than captured live -- e.g. CICFlowMeter output, whose column
names ("Flow Bytes/s", " Fwd IAT Mean", ...) map onto FEATURE_NAMES
automatically. This stub is where a real
capture (Scapy / CICFlowMeter) would plug in later without changing anything
downstream -- `get_traffic()` just needs to keep yielding feature dicts that
match `ml.features.FEATURE_NAMES`.
"""

from typing import Iterator, Dict
import pandas as pd

from ml.features import normalize_feature_names


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
            yield {k: float(v) for k, v in normalize_feature_names(row.to_dict()).items()}
