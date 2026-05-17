"""
services/forecast_service.py — MetOcean forecast proxy + cache + normalisation.

Replaces the previous client-side MetOcean call (which leaked the API key in
the web bundle). Both web and mobile now hit /api/v1/forecast/* and get the
same normalised shape from this module.

Caching:
  In-process TTL cache keyed by (lat, lon, hours, interval_h) rounded to
  3 decimal places. Single-instance EB box is fine; a small Redis layer can
  replace this if/when we go multi-instance, with no API change.

MetOcean reference (v2):
  POST/GET /point/time — params: lat, lon, variables (comma-sep), from, to OR
  from + interval + repeat. Response: { dimensions: { time, point }, variables:
  { '<name>': { data: [], units: '...' } } }.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

# MetOcean variable names we request on every call. Kept aligned with the
# previous client implementation so downstream consumers see the same
# coverage (temperature, humidity, cloud, precipitation, radiation, wind).
_METOCEAN_VARIABLES = [
    "air.humidity.at-2m",
    "air.temperature.at-2m",
    "cloud.cover",
    "precipitation.rate",
    "radiation.flux.downward.longwave",
    "radiation.flux.downward.shortwave",
    "wind.direction.at-10m",
    "wind.speed.at-10m",
    "wind.speed.gust.at-10m",
]

_COMPASS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]


# ──────────────────────────────────────────────────────────────────────────
# In-process TTL cache
# ──────────────────────────────────────────────────────────────────────────

_cache_lock = threading.Lock()
_cache: Dict[Tuple, Tuple[float, Dict[str, Any]]] = {}


def _cache_get(key: Tuple) -> Optional[Dict[str, Any]]:
    with _cache_lock:
        item = _cache.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at < time.time():
            _cache.pop(key, None)
            return None
        return value


def _cache_set(key: Tuple, value: Dict[str, Any], ttl: int) -> None:
    with _cache_lock:
        _cache[key] = (time.time() + ttl, value)


def _round_coord(v: float) -> float:
    return round(float(v), 3)


# ──────────────────────────────────────────────────────────────────────────
# Conversion helpers
# ──────────────────────────────────────────────────────────────────────────

def _kelvin_to_c(k: Optional[float]) -> Optional[float]:
    if k is None:
        return None
    return round(k - 273.15, 1)


def _mps_to_kmh(mps: Optional[float]) -> Optional[float]:
    if mps is None:
        return None
    return round(mps * 3.6, 1)


def _compass(deg: Optional[float]) -> Optional[str]:
    if deg is None:
        return None
    idx = int(round(deg / 22.5)) % 16
    return _COMPASS[idx]


def _condition(cloud_pct: Optional[float], precip: Optional[float]) -> str:
    if precip is not None and precip > 1:
        return "Rainy"
    if cloud_pct is None:
        return "Unknown"
    if cloud_pct > 80:
        return "Overcast"
    if cloud_pct > 50:
        return "Partly Cloudy"
    if cloud_pct > 20:
        return "Mostly Sunny"
    return "Clear"


def _safe_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        f = float(v)
        if f != f:  # NaN check
            return None
        return f
    except (TypeError, ValueError):
        return None


# ──────────────────────────────────────────────────────────────────────────
# MetOcean → normalised shape
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class ForecastSlice:
    timestamp: str
    temperature_c: Optional[float]
    humidity_pct: Optional[float]
    cloud_cover_pct: Optional[float]
    wind_speed_kmh: Optional[float]
    wind_gust_kmh: Optional[float]
    wind_direction_deg: Optional[float]
    wind_direction_compass: Optional[str]
    precipitation_mm_h: Optional[float]
    shortwave_radiation_w_m2: Optional[float]
    condition: str

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


def _slice_from_index(raw: Dict[str, Any], idx: int, times: List[str]) -> ForecastSlice:
    variables = raw.get("variables", {}) or {}

    def value(key: str) -> Optional[float]:
        var = variables.get(key)
        if not var:
            return None
        data = var.get("data") or []
        if idx >= len(data):
            return None
        return _safe_float(data[idx])

    temp_raw = value("air.temperature.at-2m")
    temp_units = (variables.get("air.temperature.at-2m") or {}).get("units")
    temperature_c = _kelvin_to_c(temp_raw) if temp_units in ("K", "degreeK") else (
        round(temp_raw, 1) if temp_raw is not None else None
    )

    cloud = value("cloud.cover")
    if cloud is not None and cloud <= 1:
        cloud *= 100  # fraction → percent

    wind_mps = value("wind.speed.at-10m")
    gust_mps = value("wind.speed.gust.at-10m")
    wind_deg = value("wind.direction.at-10m")

    precip = value("precipitation.rate")

    timestamp = times[idx] if idx < len(times) else datetime.now(timezone.utc).isoformat()

    return ForecastSlice(
        timestamp=timestamp,
        temperature_c=temperature_c,
        humidity_pct=round(value("air.humidity.at-2m"), 1) if value("air.humidity.at-2m") is not None else None,
        cloud_cover_pct=round(cloud, 1) if cloud is not None else None,
        wind_speed_kmh=_mps_to_kmh(wind_mps),
        wind_gust_kmh=_mps_to_kmh(gust_mps),
        wind_direction_deg=round(wind_deg, 0) if wind_deg is not None else None,
        wind_direction_compass=_compass(wind_deg),
        precipitation_mm_h=round(precip, 2) if precip is not None else None,
        shortwave_radiation_w_m2=round(value("radiation.flux.downward.shortwave"), 0)
            if value("radiation.flux.downward.shortwave") is not None else None,
        condition=_condition(round(cloud, 1) if cloud is not None else None,
                              round(precip, 2) if precip is not None else None),
    )


def _normalise(raw: Dict[str, Any]) -> List[ForecastSlice]:
    times = ((raw.get("dimensions") or {}).get("time") or {}).get("data") or []
    if not times:
        return []
    return [_slice_from_index(raw, i, times) for i in range(len(times))]


# ──────────────────────────────────────────────────────────────────────────
# MetOcean HTTP call
# ──────────────────────────────────────────────────────────────────────────

class ForecastError(Exception):
    pass


def _check_configured() -> None:
    if not settings.METOCEAN_API_KEY:
        raise ForecastError(
            "MetOcean API key not configured (METOCEAN_API_KEY env var missing)"
        )


def _fetch_metocean(lat: float, lon: float, *, hours: int, interval_h: int) -> Dict[str, Any]:
    """Sync httpx call. interval_h=1 + hours=1 → current only; interval_h=3 +
    hours=24 → 9 data points (00, 03, 06, ..., 24)."""
    _check_configured()

    now = datetime.now(timezone.utc)
    repeat = max(0, hours // interval_h)

    params = {
        "lat": lat,
        "lon": lon,
        "variables": ",".join(_METOCEAN_VARIABLES),
        "from": now.replace(microsecond=0).isoformat(),
        "interval": f"{interval_h}h",
        "repeat": repeat,
    }
    headers = {
        "x-api-key": settings.METOCEAN_API_KEY,
        "Content-Type": "application/json",
    }

    url = f"{settings.METOCEAN_BASE_URL.rstrip('/')}/point/time"
    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.get(url, params=params, headers=headers)
            res.raise_for_status()
            return res.json()
    except httpx.HTTPStatusError as e:
        logger.warning("MetOcean returned %s: %s", e.response.status_code, e.response.text[:200])
        raise ForecastError(f"Forecast provider error ({e.response.status_code})") from e
    except httpx.HTTPError as e:
        logger.warning("MetOcean network error: %s", e)
        raise ForecastError("Forecast provider unreachable") from e


# ──────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────

def get_conditions(lat: float, lon: float, *, hours: int = 24, interval_h: int = 3) -> Dict[str, Any]:
    """Return { location, current, forecast } for the given coordinate.

    hours=0 collapses to current-only (single time point at "now").
    """
    cache_key = (_round_coord(lat), _round_coord(lon), int(hours), int(interval_h))
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    raw = _fetch_metocean(lat, lon, hours=max(hours, interval_h), interval_h=interval_h)
    slices = _normalise(raw)

    if not slices:
        raise ForecastError("Forecast provider returned no data")

    current = slices[0].to_dict()
    forecast = [s.to_dict() for s in slices[1:]] if hours > 0 else []

    payload = {
        "location": {"lat": _round_coord(lat), "lon": _round_coord(lon)},
        "current": current,
        "forecast": forecast,
    }
    _cache_set(cache_key, payload, settings.FORECAST_CACHE_TTL_SECONDS)
    return payload


def get_current_only(lat: float, lon: float) -> Dict[str, Any]:
    """Convenience wrapper — current weather only, no forecast list."""
    payload = get_conditions(lat, lon, hours=0, interval_h=1)
    return {"location": payload["location"], "current": payload["current"]}
