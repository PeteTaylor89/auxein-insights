from __future__ import annotations
from typing import List, Dict, Any
from .metrics import mean, stdev, ci95

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
