from __future__ import annotations
from typing import Iterable, List
import math

def weighted_mean(values: Iterable[float], weights: Iterable[float]) -> float:
    vs = [float(v) for v in values]
    ws = [float(w) for w in weights]
    if len(vs) != len(ws) or not vs:
        raise ValueError("values and weights must be same non-zero length")
    s = sum(ws)
    if s == 0: return 0.0
    return sum(v*w for v, w in zip(vs, ws))/s

def confidence_score(n: int, se: float | None = None) -> float:
    # quick heuristic: n-only if se missing
    if n <= 0: return 0.0
    base = min(1.0, math.log10(max(1, n))/2.0)  # ~0.5 @ n=100
    if se is None: return round(base, 3)
    # combine: lower SE -> higher confidence
    se_part = 1.0/(1.0 + se)
    return round(min(1.0, 0.6*base + 0.4*se_part), 3)

def flag_outliers(values: Iterable[float], method: str = "z", z: float = 3.0) -> List[int]:
    arr = [float(v) for v in values]
    if not arr: return []
    m = sum(arr)/len(arr)
    var = sum((x-m)**2 for x in arr)/len(arr)
    s = math.sqrt(var)
    if s == 0: return []
    return [i for i, x in enumerate(arr) if abs((x-m)/s) >= z]
