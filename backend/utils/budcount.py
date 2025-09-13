from __future__ import annotations
from typing import Iterable, Dict, Any
from .metrics import mean, stdev, ci95

def budcount_summary(values: Iterable[float], target: float | None = None) -> Dict[str, Any]:
    vals = [float(v) for v in values if v is not None]
    if not vals: return {"n": 0}
    m = mean(vals); s = stdev(vals); lo, hi = ci95(vals)
    out = {"n": len(vals), "mean": m, "stdev": s, "ci95": (lo, hi)}
    if target is not None:
        out["target"] = float(target)
        out["delta_to_target"] = m - float(target)
    return out
