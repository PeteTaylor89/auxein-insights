from __future__ import annotations
from typing import Iterable, Tuple, List
import math

# small t critical table (two-tailed 95%) for df=1..30; >30 use 1.96
_T95 = {
    1:12.706, 2:4.303, 3:3.182, 4:2.776, 5:2.571, 6:2.447, 7:2.365, 8:2.306, 9:2.262, 10:2.228,
    11:2.201, 12:2.179, 13:2.160, 14:2.145, 15:2.131, 16:2.120, 17:2.110, 18:2.101, 19:2.093, 20:2.086,
    21:2.080, 22:2.074, 23:2.069, 24:2.064, 25:2.060, 26:2.056, 27:2.052, 28:2.048, 29:2.045, 30:2.042
}

def _to_list(values: Iterable[float]) -> List[float]:
    arr = [float(v) for v in values if v is not None]
    if not arr:
        raise ValueError("empty data")
    return arr

def mean(values: Iterable[float]) -> float:
    arr = _to_list(values); return sum(arr)/len(arr)

def variance(values: Iterable[float]) -> float:
    arr = _to_list(values); n = len(arr)
    if n < 2: return 0.0
    m = mean(arr)
    return sum((x-m)**2 for x in arr)/(n-1)

def stdev(values: Iterable[float]) -> float:
    return math.sqrt(variance(values))

def se(values: Iterable[float]) -> float:
    arr = _to_list(values); n = len(arr)
    if n < 2: return 0.0
    return stdev(arr)/math.sqrt(n)

def ci95(values: Iterable[float]) -> Tuple[float, float]:
    arr = _to_list(values); n = len(arr)
    m = mean(arr); s = se(arr)
    if n <= 1: return (m, m)
    t = _T95.get(n-1, 1.96)
    return (m - t*s, m + t*s)
