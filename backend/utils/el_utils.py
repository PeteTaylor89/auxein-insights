from __future__ import annotations
from typing import List, Optional

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
