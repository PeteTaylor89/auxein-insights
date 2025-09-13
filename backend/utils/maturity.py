from __future__ import annotations
from typing import List, Dict, Any
from .metrics import mean, stdev

def berry_weight_from_100(grams_100: float) -> float:
    return float(grams_100) / 100.0

def maturity_summary(samples: List[Dict[str, float]]) -> Dict[str, Any]:
    fields = ["brix", "pH", "TA", "YAN", "berry_weight_g"]
    out: Dict[str, Any] = {}
    for f in fields:
        arr = [float(s[f]) for s in samples if s.get(f) is not None]
        if arr:
            out[f"mean_{f}"] = mean(arr)
            out[f"stdev_{f}"] = stdev(arr)
            out[f"n_{f}"] = len(arr)
    return out
