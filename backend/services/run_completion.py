# backend/services/observations/run_completion.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import json

import sqlalchemy as sa
from sqlalchemy.orm import Session

# utils (the ones we created earlier)
from utils.metrics import mean, stdev, ci95
from utils.yield_calc import yield_t_per_ha, vines_per_ha, adjust_for_missing
from utils.flowering import flowers_per_shoot, fruit_set_percent
from utils.budcount import budcount_summary
from utils.maturity import maturity_summary
from utils.irrigation import runtime_minutes, irrigation_volume_l, pressure_delta_kpa, is_irrigation_anomaly
from utils.el_utils import el_order, validate_split, dominant_stage
from utils.frost import fan_runtime_minutes, frost_severity
from utils.quality import confidence_score

# ---- configurable table/column names (edit here if your schema differs) ----
T_RUNS  = "observation_runs"
T_SPOTS = "observation_spots"
T_TPL   = "observation_templates"

# Assuming:
# observation_runs: id, template_id, company_id, status, started_at, completed_at, summary_json
# observation_spots: id, run_id, block_id, row_label, gps_lat, gps_lng, data_json
# observation_templates: id, type_key
#
# If your JSON columns are named differently, change DATA_COL below.
DATA_COL = "data_json"  # e.g., 'data', 'measurements_json' -> swap here

def _fetch_run_meta(db: Session, run_id: int) -> Optional[Dict[str, Any]]:
    sql = sa.text(f"""
        SELECT r.id, r.company_id, r.template_id, r.status, r.started_at, r.completed_at, r.summary_json,
               t.type_key
        FROM {T_RUNS} r
        JOIN {T_TPL}  t ON t.id = r.template_id
        WHERE r.id = :rid
    """)
    row = db.execute(sql, {"rid": run_id}).mappings().first()
    return dict(row) if row else None

def _fetch_spots(db: Session, run_id: int) -> List[Dict[str, Any]]:
    sql = sa.text(f"""
        SELECT id, run_id, block_id, row_label, gps_lat, gps_lng, {DATA_COL} AS data
        FROM {T_SPOTS}
        WHERE run_id = :rid
        ORDER BY id ASC
    """)
    rows = db.execute(sql, {"rid": run_id}).mappings().all()
    return [dict(r) for r in rows]

# ---- per-type calculators ----

def _calc_phenology(spots: List[Dict[str, Any]]) -> Dict[str, Any]:
    # expect each spot.data = {"stage_split":[{"stage_key":"EL-27","percent":40}, ...], "notes": "..."}
    splits = []
    for s in spots:
        data = s.get("data") or {}
        if isinstance(data, str):
            data = json.loads(data)
        ss = data.get("stage_split") or []
        if ss:
            splits.extend(ss)

    # validate and derive dominant
    ok = validate_split(splits, tol=5.0) if splits else True
    dom = dominant_stage(splits)
    order = el_order(dom) if dom else None

    return {
        "dominant_stage": dom,
        "dominant_stage_order": order,
        "valid_split": ok,
        "n_spots": len(spots),
    }

def _calc_budcount(spots: List[Dict[str, Any]]) -> Dict[str, Any]:
    vals = []
    target = None
    for s in spots:
        data = s.get("data") or {}
        if isinstance(data, str): data = json.loads(data)
        if "buds_per_vine" in data:
            vals.append(float(data["buds_per_vine"]))
        if target is None and "target_buds_per_vine" in data:
            target = float(data["target_buds_per_vine"])
    summary = budcount_summary(vals, target)
    summary["n_spots"] = len(spots)
    summary["confidence"] = confidence_score(summary.get("n", 0))
    return summary

def _calc_flowering(spots: List[Dict[str, Any]]) -> Dict[str, Any]:
    sets = []
    fps = []
    for s in spots:
        data = s.get("data") or {}
        if isinstance(data, str): data = json.loads(data)
        ips = data.get("inflorescences_per_shoot")
        fpi = data.get("flowers_per_inflorescence")
        bpi = data.get("berries_per_inflorescence")
        if ips is not None and fpi is not None:
            fps.append(flowers_per_shoot(float(ips), float(fpi)))
        if fpi and bpi:
            sets.append(fruit_set_percent(float(bpi), float(fpi)))

    out: Dict[str, Any] = {"n_spots": len(spots)}
    if fps:
        out["mean_flowers_per_shoot"] = mean(fps)
        out["stdev_flowers_per_shoot"] = stdev(fps)
        out["ci95_flowers_per_shoot"] = ci95(fps)
    if sets:
        out["mean_set_percent"] = mean(sets)
        out["stdev_set_percent"] = stdev(sets)
        out["ci95_set_percent"] = ci95(sets)
    out["confidence"] = confidence_score(len(sets) or len(fps))
    return out

def _calc_yield(spots: List[Dict[str, Any]], vines_per_ha_val: Optional[float]) -> Dict[str, Any]:
    bpv_vals, bwg_vals = [], []
    for s in spots:
        data = s.get("data") or {}
        if isinstance(data, str): data = json.loads(data)
        if "bunches_per_vine" in data:
            bpv_vals.append(float(data["bunches_per_vine"]))
        if "bunch_weight_g" in data:
            bwg_vals.append(float(data["bunch_weight_g"]))

    out: Dict[str, Any] = {
        "n_bunches_per_vine": len(bpv_vals),
        "n_bunch_weight_g": len(bwg_vals),
        "n_spots": len(spots),
    }
    if bpv_vals:
        out["mean_bunches_per_vine"] = mean(bpv_vals)
        out["stdev_bunches_per_vine"] = stdev(bpv_vals)
        out["ci95_bunches_per_vine"] = ci95(bpv_vals)
    if bwg_vals:
        out["mean_bunch_weight_g"] = mean(bwg_vals)
        out["stdev_bunch_weight_g"] = stdev(bwg_vals)
        out["ci95_bunch_weight_g"] = ci95(bwg_vals)

    if vines_per_ha_val and bpv_vals and bwg_vals:
        out["yield_t_per_ha"] = yield_t_per_ha(out["mean_bunches_per_vine"], out["mean_bunch_weight_g"], vines_per_ha_val)
    out["confidence"] = confidence_score(min(len(bpv_vals), len(bwg_vals)))
    return out

def _calc_maturity(spots: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Expect spot.data has keys like brix, pH, TA, YAN, berry_weight_100g -> derive berry_weight_g
    samples = []
    for s in spots:
        data = s.get("data") or {}
        if isinstance(data, str): data = json.loads(data)
        row = {}
        for k in ("brix", "pH", "TA", "YAN", "berry_weight_g"):
            if k in data: row[k] = float(data[k])
        if "berry_weight_100g" in data and "berry_weight_g" not in row:
            row["berry_weight_g"] = float(data["berry_weight_100g"]) / 100.0
        if row:
            samples.append(row)
    out = maturity_summary(samples)
    out["n_spots"] = len(spots)
    out["confidence"] = confidence_score(max(out.get("n_brix", 0), out.get("n_pH", 0), out.get("n_TA", 0)))
    return out

def _calc_irrigation(spots: List[Dict[str, Any]], cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    vols, deltas = [], []
    anom = False
    for s in spots:
        data = s.get("data") or {}
        if isinstance(data, str): data = json.loads(data)
        mins = data.get("run_minutes")
        if mins is None and data.get("start_time") and data.get("stop_time"):
            try:
                mins = runtime_minutes(datetime.fromisoformat(data["start_time"]), datetime.fromisoformat(data["stop_time"]))
            except Exception:
                mins = None
        flow = data.get("flow_lpm")
        if mins is not None and flow is not None:
            vols.append(irrigation_volume_l(float(flow), float(mins)))
        if "pressure_start_kpa" in data and "pressure_end_kpa" in data:
            deltas.append(pressure_delta_kpa(float(data["pressure_start_kpa"]), float(data["pressure_end_kpa"])))
        if deltas:
            if is_irrigation_anomaly(deltas[-1], vols[-1] if vols else None, cfg or {}):
                anom = True
    out: Dict[str, Any] = {
        "n_spots": len(spots),
        "mean_volume_l": mean(vols) if vols else None,
        "mean_pressure_delta_kpa": mean(deltas) if deltas else None,
        "anomaly": anom,
    }
    return out

def _calc_frost(spots: List[Dict[str, Any]]) -> Dict[str, Any]:
    mins = []
    min_temps = []
    for s in spots:
        data = s.get("data") or {}
        if isinstance(data, str): data = json.loads(data)
        if data.get("min_temp_c") is not None:
            min_temps.append(float(data["min_temp_c"]))
        rt = fan_runtime_minutes(
            datetime.fromisoformat(data["fan_on"]) if data.get("fan_on") else None,
            datetime.fromisoformat(data["fan_off"]) if data.get("fan_off") else None,
        )
        if rt is not None:
            mins.append(rt)
    out: Dict[str, Any] = {
        "n_spots": len(spots),
        "min_temp_c": min(min_temps) if min_temps else None,
        "mean_fan_runtime_min": mean(mins) if mins else None,
        "severity": frost_severity(min(min_temps), mean(mins)) if min_temps else None,
    }
    return out

def _calc_simple_count(spots: List[Dict[str, Any]]) -> Dict[str, Any]:
    # fallback for types like pest/disease/beneficials/soil/etc.
    return {"n_spots": len(spots)}

# ---- vines/ha helper (optional fetch from blocks) ----
def _compute_vines_per_ha(db: Session, spots: List[Dict[str, Any]]) -> Optional[float]:
    # try grab block spacing -> compute; fallback to None
    block_ids = list({s.get("block_id") for s in spots if s.get("block_id")})
    if not block_ids:
        return None
    # expects blocks have either (row_spacing_m, vine_spacing_m) or (vines_per_ha)
    rows = db.execute(sa.text("""
        SELECT id, vines_per_ha, row_spacing_m, vine_spacing_m
        FROM blocks
        WHERE id = ANY(:bids)
    """), {"bids": block_ids}).mappings().all()
    vph_vals = []
    for r in rows:
        if r.get("vines_per_ha"):
            vph_vals.append(float(r["vines_per_ha"]))
        elif r.get("row_spacing_m") and r.get("vine_spacing_m"):
            try:
                vph_vals.append(vines_per_ha(float(r["row_spacing_m"]), float(r["vine_spacing_m"])))
            except Exception:
                pass
    return mean(vph_vals) if vph_vals else None

# ---- dispatcher ----
def _compute_summary_for_type(
    db: Session,
    type_key: str,
    spots: List[Dict[str, Any]],
) -> Dict[str, Any]:
    k = (type_key or "").lower()
    if k in {"phenology", "el", "phenology_el"}:
        return _calc_phenology(spots)
    if k in {"bud_count", "buds", "budcount"}:
        return _calc_budcount(spots)
    if k in {"flowering", "fruit_set"}:
        return _calc_flowering(spots)
    if k in {"yield_pre_veraison", "yield_post_veraison", "yield"}:
        vph = _compute_vines_per_ha(db, spots)
        return _calc_yield(spots, vph)
    if k in {"maturity", "ripeness"}:
        return _calc_maturity(spots)
    if k in {"irrigation_check", "irrigation"}:
        return _calc_irrigation(spots, cfg={})
    if k in {"frost_event", "frost"}:
        return _calc_frost(spots)
    # default fallback
    return _calc_simple_count(spots)

# ---- public API ----
def complete_run(db: Session, run_id: int) -> Dict[str, Any]:
    meta = _fetch_run_meta(db, run_id)
    if not meta:
        raise ValueError("Run not found")

    spots = _fetch_spots(db, run_id)
    summary = _compute_summary_for_type(db, meta["type_key"], spots)
    # add some shared rollups
    summary["_meta"] = {
        "template_type": meta["type_key"],
        "spots": len(spots),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }

    # store + close the run (don’t overwrite existing completed_at if present)
    db.execute(sa.text(f"""
        UPDATE {T_RUNS}
        SET summary_json = :summary::jsonb,
            status = COALESCE(status, 'completed'),
            completed_at = COALESCE(completed_at, NOW())
        WHERE id = :rid
    """), {"summary": json.dumps(summary), "rid": run_id})
    db.commit()
    return summary
