from __future__ import annotations
from typing import Iterable, Dict, Any, Optional, Tuple

from datetime import datetime
import math

#flowering calcs

def flowers_per_shoot(inflorescences_per_shoot: float, flowers_per_inflorescence: float) -> float:
    return float(inflorescences_per_shoot) * float(flowers_per_inflorescence)

def fruit_set_percent(berries_per_inflorescence: float, flowers_per_inflorescence: float) -> float:
    if flowers_per_inflorescence <= 0: return 0.0
    return (float(berries_per_inflorescence) / float(flowers_per_inflorescence)) * 100.0

#budcount calcs

def budcount_summary(values: Iterable[float], target: float | None = None) -> Dict[str, Any]:
    vals = [float(v) for v in values if v is not None]
    if not vals: return {"n": 0}
    m = mean(vals); s = stdev(vals); lo, hi = ci95(vals)
    out = {"n": len(vals), "mean": m, "stdev": s, "ci95": (lo, hi)}
    if target is not None:
        out["target"] = float(target)
        out["delta_to_target"] = m - float(target)
    return out

#frost calcs

def fan_runtime_minutes(on: Optional[datetime], off: Optional[datetime]) -> Optional[float]:
    if not on or not off: return None
    return max(0.0, (off - on).total_seconds()/60.0)

def frost_severity(min_temp_c: float, runtime_min: Optional[float]) -> str:
    t = float(min_temp_c); r = runtime_min or 0.0
    # Simple rule-of-thumb; tune later
    if t <= -3.0 or r >= 180: return "high"
    if t <= -1.0 or r >= 60:  return "medium"
    return "low"

#irrigation

def runtime_minutes(start: datetime, stop: datetime) -> float:
    return max(0.0, (stop - start).total_seconds()/60.0)

def irrigation_volume_l(flow_lpm: float, minutes: float) -> float:
    return max(0.0, float(flow_lpm) * float(minutes))

def pressure_delta_kpa(start_kpa: float, end_kpa: float) -> float:
    return float(end_kpa) - float(start_kpa)

def is_irrigation_anomaly(delta_kpa: float, volume_l: Optional[float], cfg: dict) -> bool:
    drop_thr = float(cfg.get("pressure_drop_kpa_threshold", 60))
    vol_min  = cfg.get("min_volume_l")  # optional
    if delta_kpa < 0 and abs(delta_kpa) >= drop_thr:
        return True
    if vol_min is not None and volume_l is not None and volume_l < float(vol_min):
        return True
    return False

#maturity

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

#stats Metrics

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

#quality

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

#yield

def vines_per_ha(row_spacing_m: float, vine_spacing_m: float) -> float:
    if row_spacing_m <= 0 or vine_spacing_m <= 0:
        raise ValueError("row_spacing_m and vine_spacing_m must be > 0")
    return 10000.0 / (row_spacing_m * vine_spacing_m)

def adjust_for_missing(vph: float, missing_pct: float = 0.0) -> float:
    pct = max(0.0, min(100.0, missing_pct))
    return vph * (1.0 - pct/100.0)

def yield_t_per_ha(bunches_per_vine: float, bunch_weight_g: float, vines_per_ha_val: float) -> float:
    return (bunches_per_vine * bunch_weight_g * vines_per_ha_val) / 1_000_000.0

def yield_run_summary(spots: List[Dict[str, Any]], vines_per_ha_val: float) -> Dict[str, Any]:
    bpv = [float(s["bunches_per_vine"]) for s in spots if s.get("bunches_per_vine") is not None]
    bwg = [float(s["bunch_weight_g"]) for s in spots if s.get("bunch_weight_g") is not None]
    n_bpv, n_bwg = len(bpv), len(bwg)
    out = {"n_bunches_per_vine": n_bpv, "n_bunch_weight_g": n_bwg}
    if n_bpv: out |= {"mean_bunches_per_vine": mean(bpv), "stdev_bunches_per_vine": stdev(bpv), "ci95_bunches_per_vine": ci95(bpv)}
    if n_bwg: out |= {"mean_bunch_weight_g": mean(bwg), "stdev_bunch_weight_g": stdev(bwg), "ci95_bunch_weight_g": ci95(bwg)}
    if n_bpv and n_bwg:
        tpha = yield_t_per_ha(out["mean_bunches_per_vine"], out["mean_bunch_weight_g"], vines_per_ha_val)
        out["yield_t_per_ha"] = tpha
    return out

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

def el_order(key: str) -> int:
    # "EL-27" -> 27; anything non-numeric becomes 0
    num = ''.join(ch for ch in key if ch.isdigit())
    return int(num) if num.isdigit() else 0

def validate_split(split: List[dict], tol: float = 2.0) -> bool:
    total = sum(float(x.get("percent", 0)) for x in split)
    return abs(total - 100.0) <= tol

def dominant_stage(split: List[dict]) -> Optional[str]:
    if not split: return None
    best = max(split, key=lambda x: float(x.get("percent", 0)))
    return best.get("stage_key") or best.get("key")

