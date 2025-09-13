from __future__ import annotations
from datetime import datetime
from typing import Optional

def fan_runtime_minutes(on: Optional[datetime], off: Optional[datetime]) -> Optional[float]:
    if not on or not off: return None
    return max(0.0, (off - on).total_seconds()/60.0)

def frost_severity(min_temp_c: float, runtime_min: Optional[float]) -> str:
    t = float(min_temp_c); r = runtime_min or 0.0
    # Simple rule-of-thumb; tune later
    if t <= -3.0 or r >= 180: return "high"
    if t <= -1.0 or r >= 60:  return "medium"
    return "low"
