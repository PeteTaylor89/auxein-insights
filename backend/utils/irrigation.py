from __future__ import annotations
from datetime import datetime
from typing import Optional

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
