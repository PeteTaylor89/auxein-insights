from __future__ import annotations

def flowers_per_shoot(inflorescences_per_shoot: float, flowers_per_inflorescence: float) -> float:
    return float(inflorescences_per_shoot) * float(flowers_per_inflorescence)

def fruit_set_percent(berries_per_inflorescence: float, flowers_per_inflorescence: float) -> float:
    if flowers_per_inflorescence <= 0: return 0.0
    return (float(berries_per_inflorescence) / float(flowers_per_inflorescence)) * 100.0
