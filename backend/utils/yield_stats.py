# app/utils/yield_stats.py
from typing import List, Dict, Any, Optional
import math

def basic_confidence_summary(values: List[float]) -> Dict[str, Any]:
    """Return mean, stdev (sample), n, and a naive confidence proxy."""
    n = len(values)
    if n == 0:
        return {"n": 0, "mean": None, "stdev": None, "confidence": 0.0}
    mean = sum(values) / n
    if n > 1:
        variance = sum((v - mean) ** 2 for v in values) / (n - 1)
        stdev = math.sqrt(variance)
    else:
        stdev = 0.0
    # very simple confidence proxy: min(1, sqrt(n)/10) -> tune later
    confidence = min(1.0, math.sqrt(n) / 10.0)
    return {"n": n, "mean": mean, "stdev": stdev, "confidence": confidence}

def extract_numeric(values: Dict[str, Any], keys: List[str]) -> List[float]:
    out: List[float] = []
    for k in keys:
        v = values.get(k)
        if isinstance(v, (int, float)):
            out.append(float(v))
    return out
