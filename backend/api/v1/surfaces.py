"""Climate surface API — STUB implementation of SURFACE_CONTRACT_V2 §5.

This exists so WS3 can build the whole maps-first frontend before the surface
pipeline is finished. It satisfies §5 exactly: the response shapes here are the
shapes production will return, and swapping the backing store from a local
directory to `s3://auxein-climate-surfaces` + the `surface_run` table must not
change a single field name.

**What is real and what is not.**

Real, wherever a COG exists under `SURFACE_STUB_ROOT`: the values, the
`cv_rmse`, the model version, the resolution. Those files come from the actual
production interpolation path — `backend/scripts/interpolation/` fitted with the
`ridge` engine and written by `make_demo_cogs.py` — so a value sampled here is a
value production would serve.

Synthetic, for any date with no COG: a plausible New Zealand daily field from
latitude, elevation and day-of-year. Marked `"synthetic": true` on every point it
produces. This exists only so the frontend has a dense series to draw; **no
synthetic number should ever reach a user**, which is why the flag is on the
point and not buried in `meta`.

**The stub is deliberately awkward**, per contract §6. It forces the frontend to
handle, from day one, the four things that will otherwise be discovered in
production:

  * `available.gaps` is real and large — the fixture is one date per year, so
    the scrubber must grey out missing dates rather than request them.
  * `SURFACE_STUB_NULL_WINDOW` punches a hole that returns `value: null`, not 0.
    A NULL-rainfall-written-as-zero bug (B4.1) has already bitten this platform.
  * Series span resolutions: 500 m where a COG exists, 5000 m for synthetic
    fill. Charts must not silently blend eras.
  * Confidence is distance-banded (§3.4), so `expected_error` varies point to
    point and is not the surface-wide `cv_rmse`.

Enable with `SURFACE_STUB_ENABLED=1`. It refuses to serve when disabled, so
there is no path to shipping it by accident.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.session import get_db
from services import surface_store as store

# Entitlements. `/tiles`, `/available` and `/region` stay open — the picture and
# the regional numbers are the free product. `/point` is the Pro action: it
# answers "what is it at MY site", which is what the paid tier is sold on.
# See docs/plans/INSIGHTS_SITE_MAP_2026-08-13.md §5a.
from core.entitlements import require_pro

logger = logging.getLogger(__name__)
router = APIRouter()

CONTRACT_VERSION = "v2"

# --- configuration ---------------------------------------------------------
STUB_ENABLED = os.getenv("SURFACE_STUB_ENABLED", "").lower() in ("1", "true", "yes")
STUB_ROOT = Path(os.getenv(
    "SURFACE_STUB_ROOT",
    Path(__file__).resolve().parents[2].parent / "scratchpad" / "demo_surfaces"))
# A deliberate hole, as an inclusive ISO date range. Points inside it return
# value=null with a reason, so the frontend must render a gap.
NULL_WINDOW = os.getenv("SURFACE_STUB_NULL_WINDOW", "1993-01-01/1993-12-31")

UNITS = {"temp_mean": "C", "temp_min": "C", "temp_max": "C",
         "rainfall": "mm", "rh": "%", "pet": "mm"}

# Pooled LOOCV error against distance-to-nearest-station, measured over the
# rainfall network (cv_experiment.py; contract §3.4). Confidence is banded
# because a single national number is a lie at both ends: 1.10 degC where the
# network is dense, 2.04 with a -0.63 cold bias beyond 80 km.
DISTANCE_BANDS = [(5, 1.10), (10, 1.02), (20, 1.20), (40, 1.41), (80, 1.76),
                  (float("inf"), 2.04)]


def _require_enabled() -> None:
    """Guard for the STUB code paths only.

    Since the archive was published and indexed (2026-08-15) the default backing
    store is the real one: `surface_run` in Postgres plus COGs on S3. The stub
    survives for two jobs it is still better at — offline frontend development
    with no AWS credentials, and `backend/scripts/check_surface_stub.py`, whose
    20 assertions are written against its deliberately awkward behaviour. It is
    reachable only by setting SURFACE_STUB_ENABLED=1, and this function is what
    stops a stub response escaping when that is not set.
    """
    if not STUB_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Surface stub is disabled. Set SURFACE_STUB_ENABLED=1 to use "
                   "it in development. It must never be enabled in production.")


def _use_stub() -> bool:
    """True when requests should be answered from the local fixture."""
    return STUB_ENABLED


# Surfaces served from the index are immutable: the 1986-2023 archive is a fixed
# historical product, and a re-run publishes a new model_version rather than
# mutating a key. So tiles can be cached hard. This is doing the work a CDN
# would otherwise do — api.auxein.co.nz is not behind CloudFront today, so every
# uncached tile is an EB request.
TILE_CACHE_CONTROL = "public, max-age=31536000, immutable"


# --- response models (these carry forward to the real implementation) -------
class Confidence(BaseModel):
    cv_rmse: Optional[float] = Field(None, description="Surface-wide, shuffled 10-fold")
    expected_error: Optional[float] = Field(None, description="Banded by isolation (§3.4)")
    distance_to_nearest_station_km: Optional[float] = None
    t_rmse: Optional[float] = None
    n_test: Optional[int] = None


class SeriesPoint(BaseModel):
    valid_at: datetime
    value: Optional[float] = Field(None, description="null (never 0) where no surface exists")
    sd: Optional[float] = None
    resolution_m: Optional[int] = None
    confidence: Optional[Confidence] = None
    synthetic: bool = False
    reason: Optional[str] = Field(None, description="Why value is null, when it is")


class Series(BaseModel):
    variable: str
    unit: str
    points: list[SeriesPoint]


class Location(BaseModel):
    lon: float
    lat: float
    elevation_m: Optional[float] = None


class PointResponse(BaseModel):
    location: Location
    granularity: str
    series: list[Series]
    meta: dict


class RegionPoint(BaseModel):
    valid_at: datetime
    mean: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    area_km2: Optional[float] = None
    resolution_m: Optional[int] = None
    synthetic: bool = False


class RegionSeries(BaseModel):
    variable: str
    unit: str
    points: list[RegionPoint]


class RegionResponse(BaseModel):
    zone: dict
    granularity: str
    series: list[RegionSeries]
    meta: dict


class AvailableResponse(BaseModel):
    variable: str
    granularity: str
    first: Optional[str] = None
    last: Optional[str] = None
    resolutions: list[int] = []
    gaps: list[str] = []
    meta: dict = {}


# --- backing store ---------------------------------------------------------
@lru_cache(maxsize=1)
def _manifest() -> dict:
    p = STUB_ROOT / "manifest.json"
    if not p.exists():
        logger.warning("surface stub: no manifest at %s; serving synthetic only", p)
        return {}
    return json.loads(p.read_text())


@lru_cache(maxsize=1)
def _by_date() -> dict[str, dict]:
    m = _manifest()
    return {s["valid_at"]: s for s in m.get("surfaces", [])}


@lru_cache(maxsize=1)
def _stations() -> np.ndarray:
    """Station coordinates, for the distance-banded confidence.

    Uses the CLIFLO fixture rather than the live `devices` table so the stub
    stays runnable without a database. The real implementation reads the
    stations that actually entered each fit.
    """
    import pandas as pd
    p = (Path(__file__).resolve().parents[2] / "models" / "example data"
         / "CLIFLO_RAW_Temp_Daily.csv")
    if not p.exists():
        return np.zeros((0, 2))
    df = pd.read_csv(p).replace({"-": np.nan, "-9999": np.nan})
    df = df.dropna(subset=["Latitude", "Longitude"])
    return df[["Latitude", "Longitude"]].to_numpy(float)


def _nearest_station_km(lat: float, lon: float) -> Optional[float]:
    s = _stations()
    if not len(s):
        return None
    dlat = np.radians(s[:, 0] - lat)
    dlon = np.radians(s[:, 1] - lon)
    a = (np.sin(dlat / 2) ** 2
         + np.cos(np.radians(lat)) * np.cos(np.radians(s[:, 0])) * np.sin(dlon / 2) ** 2)
    return float(np.min(6371.0 * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))))


def _expected_error(distance_km: Optional[float]) -> Optional[float]:
    if distance_km is None:
        return None
    for edge, err in DISTANCE_BANDS:
        if distance_km <= edge:
            return err
    return DISTANCE_BANDS[-1][1]


def _open(path: Path):
    from scripts.interpolation.raster import _configure_proj
    _configure_proj()
    import rasterio
    return rasterio.open(path)


# --- synthetic field -------------------------------------------------------
def _synthetic(variable: str, lat: float, lon: float, elev: float, d: date) -> float:
    """A plausible NZ daily value. Deterministic, so repeated calls agree.

    Latitude gradient + summer peak in January + a dry lapse rate, with
    reproducible pseudo-noise keyed on (variable, date, rounded position).
    Nothing here is a model of anything; it exists to make charts look like
    charts.
    """
    doy = d.timetuple().tm_yday
    seasonal = math.cos(2 * math.pi * (doy - 20) / 365.25)
    seed = int(hashlib.blake2s(
        f"{variable}|{d}|{lat:.2f}|{lon:.2f}".encode(), digest_size=4).hexdigest(), 16)
    jitter = (seed % 1000) / 1000.0 - 0.5

    if variable in ("temp_mean", "temp_min", "temp_max"):
        base = 19.0 + (lat + 34.0) * 0.62        # ~19 degC at -34, ~11 at -47
        v = base + 5.0 * seasonal - elev / 100.0 * 0.6 + jitter * 3.0
        if variable == "temp_min":
            v -= 4.5
        elif variable == "temp_max":
            v += 5.5
        return round(v, 2)
    if variable == "rainfall":
        wet = (seed >> 12) % 100 < 35            # ~35% of days wet
        if not wet:
            return 0.0
        return round(abs(jitter) * 18.0 + elev / 200.0, 2)
    if variable == "rh":
        return round(min(100.0, 72.0 - 6.0 * seasonal + jitter * 12.0), 1)
    if variable == "pet":
        return round(max(0.0, 2.6 + 1.6 * seasonal + jitter * 0.8), 2)
    return round(jitter, 3)


def _parse_dates(start: str, end: str, granularity: str) -> list[date]:
    try:
        s, e = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError as exc:
        raise HTTPException(422, f"start/end must be ISO dates: {exc}") from exc
    if e < s:
        raise HTTPException(422, "end must not precede start")
    if granularity != "daily":
        raise HTTPException(422, "the stub only serves granularity=daily")
    if (e - s).days > 3660:
        raise HTTPException(422, "range too long; the stub caps at 10 years")
    return [s + timedelta(days=i) for i in range((e - s).days + 1)]


def _null_window() -> tuple[Optional[date], Optional[date]]:
    if not NULL_WINDOW:
        return None, None
    try:
        a, b = NULL_WINDOW.split("/")
        return date.fromisoformat(a), date.fromisoformat(b)
    except ValueError:
        logger.warning("bad SURFACE_STUB_NULL_WINDOW %r; ignoring", NULL_WINDOW)
        return None, None


def _at_utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


# --- endpoints -------------------------------------------------------------
@router.get("/point", response_model=PointResponse)
def point_sample(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    variables: str = Query("temp_mean", description="comma-separated"),
    start: str = Query(...),
    end: str = Query(...),
    granularity: str = Query("daily"),
    statistic: Optional[str] = Query(
        None, description="Required for monthly/records; ignored for daily"),
    db: Session = Depends(get_db),
    # PRO ONLY. 401 anonymous, 402 signed-in-but-not-Pro (contract §5.5).
    # Declared as an explicit parameter rather than a router-level dependency so
    # that direct callers — notably backend/scripts/check_surface_stub.py, which
    # imports this module and calls the handlers without an HTTP layer — must
    # pass a user deliberately and cannot bypass the gate by accident.
    _user=Depends(require_pro),
):
    """Sample the surfaces at a point. Contract §5.1. Pro only."""
    if not _use_stub():
        return _real_point(db, lon, lat, variables, start, end,
                           granularity, statistic)
    _require_enabled()
    wanted = [v.strip() for v in variables.split(",") if v.strip()]
    if not wanted:
        raise HTTPException(422, "variables must not be empty")
    unknown = [v for v in wanted if v not in UNITS]
    if unknown:
        raise HTTPException(422, f"unknown variables: {unknown}")

    days = _parse_dates(start, end, granularity)
    nw_start, nw_end = _null_window()
    dist = _nearest_station_km(lat, lon)
    band_err = _expected_error(dist)
    have = _by_date()

    elevation = None
    series = []
    n_real = n_synth = n_null = 0

    for variable in wanted:
        points = []
        for d in days:
            iso = d.isoformat()
            if nw_start and nw_start <= d <= nw_end:
                points.append(SeriesPoint(
                    valid_at=_at_utc(d), value=None,
                    reason="no surface for this date (stub null window)"))
                n_null += 1
                continue

            rec = have.get(iso) if variable == _manifest().get("variable") else None
            if rec is not None:
                path = STUB_ROOT / rec["path"]
                try:
                    with _open(path) as ds:
                        v = next(ds.sample([(lon, lat)], 1))[0]
                        nodata = ds.nodata
                    val = None if (nodata is not None and float(v) == nodata) else round(float(v), 3)
                except Exception as exc:                       # noqa: BLE001
                    logger.warning("stub: cannot read %s: %s", path, exc)
                    raise HTTPException(503, f"surface exists but is unreadable: {iso}") from exc
                if val is None:
                    points.append(SeriesPoint(valid_at=_at_utc(d), value=None,
                                              resolution_m=rec["resolution_m"],
                                              reason="outside the land mask"))
                    n_null += 1
                    continue
                points.append(SeriesPoint(
                    valid_at=_at_utc(d), value=val, resolution_m=rec["resolution_m"],
                    confidence=Confidence(
                        cv_rmse=rec.get("cv_rmse"), expected_error=band_err,
                        distance_to_nearest_station_km=None if dist is None else round(dist, 2),
                        t_rmse=None, n_test=0)))
                n_real += 1
            else:
                elev = elevation if elevation is not None else 150.0
                points.append(SeriesPoint(
                    valid_at=_at_utc(d),
                    value=_synthetic(variable, lat, lon, elev, d),
                    resolution_m=5000, synthetic=True,
                    confidence=Confidence(
                        cv_rmse=None, expected_error=band_err,
                        distance_to_nearest_station_km=None if dist is None else round(dist, 2))))
                n_synth += 1
        series.append(Series(variable=variable, unit=UNITS[variable], points=points))

    return PointResponse(
        location=Location(lon=lon, lat=lat, elevation_m=elevation),
        granularity=granularity, series=series,
        meta={"contract_version": CONTRACT_VERSION,
              "model_version": _manifest().get("model_version", "stub"),
              "cells_missing": 0, "stub": True,
              "counts": {"real": n_real, "synthetic": n_synth, "null": n_null},
              "warning": "STUB — synthetic points are flagged per-point and must "
                         "never be shown to a user as measured data."})


@router.get("/region", response_model=RegionResponse)
def region_stats(
    variables: str = Query("temp_mean"),
    start: str = Query(...),
    end: str = Query(...),
    zone_id: Optional[int] = Query(None),
    bbox: Optional[str] = Query(None, description="w,s,e,n in degrees"),
    granularity: str = Query("daily"),
):
    """Area-weighted statistics over a region. Contract §5.2.

    Takes a `bbox` so the stub stays runnable without a database. The real
    implementation clips the raster to the `climate_zones` MULTIPOLYGON, which
    is why a region value and a point inside it are consistent by construction —
    they come from the same raster.
    """
    if not _use_stub():
        # Deliberately NOT implemented against the real archive yet. Contract
        # §8.2 justified keeping the contract at v2 through the weighting change
        # (`weighting=blocks|area`) purely on the grounds that `/region` has
        # never served a value to a consumer — and it says in terms that the
        # reasoning expires the moment it does. Serving an area-weighted number
        # here now would silently spend that, and would also contradict the
        # block-intersected definition the zone statistic actually uses.
        raise HTTPException(
            501, "region statistics are not implemented against the published "
                 "archive yet; the weighting decision (blocks vs area) is open. "
                 "See SURFACE_CONTRACT_V2 §5.2 and §8.2.")
    _require_enabled()
    if bbox is None:
        raise HTTPException(
            422, "the stub needs an explicit bbox=w,s,e,n; zone_id resolution "
                 "against climate_zones lands with the real implementation")
    try:
        w, s, e, n = (float(x) for x in bbox.split(","))
    except ValueError as exc:
        raise HTTPException(422, f"bbox must be w,s,e,n: {exc}") from exc
    if w >= e or s >= n:
        raise HTTPException(422, "bbox must have w<e and s<n")

    wanted = [v.strip() for v in variables.split(",") if v.strip()]
    unknown = [v for v in wanted if v not in UNITS]
    if unknown:
        raise HTTPException(422, f"unknown variables: {unknown}")
    days = _parse_dates(start, end, granularity)
    nw_start, nw_end = _null_window()
    have = _by_date()

    # Rough area, adequate for a stub: degrees scaled by latitude.
    mid = math.radians((s + n) / 2)
    area = abs((e - w) * 111.32 * math.cos(mid)) * abs((n - s) * 110.57)

    series = []
    for variable in wanted:
        points = []
        for d in days:
            iso = d.isoformat()
            if nw_start and nw_start <= d <= nw_end:
                points.append(RegionPoint(valid_at=_at_utc(d), area_km2=round(area, 1)))
                continue
            rec = have.get(iso) if variable == _manifest().get("variable") else None
            if rec is not None:
                from rasterio.windows import from_bounds
                with _open(STUB_ROOT / rec["path"]) as ds:
                    win = from_bounds(w, s, e, n, ds.transform)
                    arr = ds.read(1, window=win, boundless=True, fill_value=ds.nodata)
                    nodata = ds.nodata
                vals = arr[arr != nodata] if nodata is not None else arr.ravel()
                if not vals.size:
                    points.append(RegionPoint(valid_at=_at_utc(d), area_km2=round(area, 1),
                                              resolution_m=rec["resolution_m"]))
                    continue
                points.append(RegionPoint(
                    valid_at=_at_utc(d), mean=round(float(vals.mean()), 3),
                    min=round(float(vals.min()), 3), max=round(float(vals.max()), 3),
                    area_km2=round(area, 1), resolution_m=rec["resolution_m"]))
            else:
                v = _synthetic(variable, (s + n) / 2, (w + e) / 2, 150.0, d)
                points.append(RegionPoint(
                    valid_at=_at_utc(d), mean=v, min=round(v - 3.0, 3),
                    max=round(v + 3.0, 3), area_km2=round(area, 1),
                    resolution_m=5000, synthetic=True))
        series.append(RegionSeries(variable=variable, unit=UNITS[variable], points=points))

    return RegionResponse(
        zone={"zone_id": zone_id, "bbox": [w, s, e, n]},
        granularity=granularity, series=series,
        meta={"contract_version": CONTRACT_VERSION, "stub": True,
              "area_method": "bbox approximation; the real implementation clips "
                             "to the zone MULTIPOLYGON"})


@router.get("/available", response_model=AvailableResponse)
def available(variable: str = Query("temp_mean"), granularity: str = Query("daily"),
              statistic: Optional[str] = Query(None),
              db: Session = Depends(get_db)):
    """What exists, and where the holes are. Contract §5.3.

    `gaps` is authoritative: the time-scrubber must grey these out rather than
    request them and render holes.
    """
    if not _use_stub():
        return _real_available(db, variable, granularity, statistic)
    _require_enabled()
    if variable not in UNITS:
        raise HTTPException(422, f"unknown variable {variable!r}")
    m = _manifest()
    if not m or m.get("variable") != variable:
        return AvailableResponse(
            variable=variable, granularity=granularity, resolutions=[5000],
            meta={"contract_version": CONTRACT_VERSION, "stub": True,
                  "note": "no COGs for this variable; every date is synthetic"})
    surfaces = m.get("surfaces", [])
    return AvailableResponse(
        variable=variable, granularity=granularity,
        first=m.get("first"), last=m.get("last"),
        resolutions=sorted({s["resolution_m"] for s in surfaces} | {5000}),
        gaps=m.get("gaps", []),
        meta={"contract_version": CONTRACT_VERSION, "stub": True,
              "model_version": m.get("model_version"),
              "n_surfaces": len(surfaces),
              "null_window": NULL_WINDOW,
              "note": "The fixture is one date per year, so gaps dominate. That "
                      "is deliberate — see contract §6."})


RAMPS = {
    "viridis": [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
    "magma": [[0, 0, 4], [81, 18, 124], [183, 55, 121], [252, 137, 97], [252, 253, 191]],
    "blues": [[247, 251, 255], [198, 219, 239], [107, 174, 214], [33, 113, 181], [8, 48, 107]],
}


@router.get("/tiles/{variable}/{granularity}/{valid_at}/{z}/{x}/{y}.png")
def tile(variable: str, granularity: str, valid_at: str, z: int, x: int, y: int,
         ramp: Optional[str] = Query(None),
         vmin: Optional[float] = Query(None, alias="min"),
         vmax: Optional[float] = Query(None, alias="max"),
         statistic: Optional[str] = Query(None),
         db: Session = Depends(get_db)):
    """Web-mercator PNG tile rendered from the COG. Contract §5.4.

    404 when no surface exists for that date — which is the correct answer and
    the one the scrubber must already be handling from `available.gaps`.

    `min`/`max` are aliased to `vmin`/`vmax` internally so the handler does not
    shadow the builtins it needs; the query-string contract is unchanged.
    """
    if not _use_stub():
        return _real_tile(db, variable, granularity, valid_at, z, x, y,
                          ramp, vmin, vmax, statistic)
    _require_enabled()
    ramp = ramp or "viridis"
    if ramp not in RAMPS:
        raise HTTPException(422, f"unknown ramp {ramp!r}; have {sorted(RAMPS)}")
    rec = _by_date().get(valid_at)
    if rec is None or variable != _manifest().get("variable"):
        raise HTTPException(404, f"no {variable} surface for {valid_at}")
    if not 0 <= z <= 12:
        raise HTTPException(422, "zoom out of range for the stub (0-12)")

    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds

    n_tiles = 2 ** z
    if not (0 <= x < n_tiles and 0 <= y < n_tiles):
        raise HTTPException(422, "tile index out of range for this zoom")

    def _merc_to_lonlat(xi, yi):
        lon = xi / n_tiles * 360.0 - 180.0
        k = math.pi - 2.0 * math.pi * yi / n_tiles
        lat = math.degrees(math.atan(math.sinh(k)))
        return lon, lat

    w, north = _merc_to_lonlat(x, y)
    e, south = _merc_to_lonlat(x + 1, y + 1)

    with _open(STUB_ROOT / rec["path"]) as ds:
        try:
            win = from_bounds(w, south, e, north, ds.transform)
            arr = ds.read(1, window=win, out_shape=(256, 256),
                          boundless=True, fill_value=ds.nodata)
        except Exception as exc:                                # noqa: BLE001
            raise HTTPException(503, f"raster unreadable: {exc}") from exc
        nodata = ds.nodata
    _ = transform_bounds  # imported for parity with the real tiler

    mask = arr != nodata if nodata is not None else np.ones_like(arr, bool)
    if mask.any():
        lo = float(vmin) if vmin is not None else float(np.percentile(arr[mask], 2))
        hi = float(vmax) if vmax is not None else float(np.percentile(arr[mask], 98))
    else:
        lo, hi = 0.0, 1.0
    scaled = np.clip((arr - lo) / (hi - lo if hi > lo else 1.0), 0, 1)

    # NOTE: with vmin/vmax unset this stretches per tile, so adjacent tiles will
    # not share a scale. Fine for a stub; the real tiler must take the range
    # from the variable's fixed ramp so a map reads as one surface.
    stops = np.array(RAMPS[ramp], float)
    idx = scaled * (len(stops) - 1)
    i0 = np.clip(np.floor(idx).astype(int), 0, len(stops) - 2)
    f = (idx - i0)[..., None]
    rgb = (stops[i0] * (1 - f) + stops[i0 + 1] * f).astype(np.uint8)
    alpha = np.where(mask, 255, 0).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])

    return Response(content=_encode_png(rgba), media_type="image/png",
                    headers={"Cache-Control": "public, max-age=3600",
                             "X-Surface-Stub": "1"})


def _encode_png(rgba: np.ndarray) -> bytes:
    """Minimal RGBA PNG encoder — avoids adding Pillow for one call."""
    import struct
    import zlib
    h, w = rgba.shape[:2]
    raw = b"".join(b"\x00" + rgba[i].tobytes() for i in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6))
            + chunk(b"IEND", b""))


# =============================================================================
# Real implementation — `surface_run` in Postgres, COGs on S3.
#
# The published archive (1986-01..2023-12, 500 m, 19,624 objects) is MONTHLY
# plus a per-variable `records` set. There are no daily surfaces: the backfill
# streams month-by-month into accumulators and never materialises a daily
# raster, which is the difference between 2.1 h and 11 h + 142 GB. So a caller
# asking for daily gets a clear 422, not an invented field.
#
# These handlers are plain `def`, so FastAPI runs them in the threadpool. They
# do blocking GDAL range reads against S3 and use a sync Session; an `async def`
# would park the event loop and has already taken both workers down here once.
# =============================================================================

def _months_between(start: str, end: str, limit: int = 1200) -> list[str]:
    """Inclusive list of YYYY-MM between two ISO dates."""
    def _parse(value: str) -> tuple[int, int]:
        parts = value.split("-")
        if len(parts) < 2:
            raise HTTPException(422, f"expected YYYY-MM or YYYY-MM-DD, got {value!r}")
        try:
            return int(parts[0]), int(parts[1])
        except ValueError as exc:
            raise HTTPException(422, f"unparseable date {value!r}") from exc

    y0, m0 = _parse(start)
    y1, m1 = _parse(end)
    first, last = y0 * 12 + (m0 - 1), y1 * 12 + (m1 - 1)
    if last < first:
        raise HTTPException(422, "end is before start")
    if last - first + 1 > limit:
        raise HTTPException(422, f"range too long: {last - first + 1} months "
                                 f"(limit {limit})")
    return [f"{i // 12:04d}-{i % 12 + 1:02d}" for i in range(first, last + 1)]


def _default_statistic(granularity: str, statistic: Optional[str]) -> Optional[str]:
    """Monthly and records surfaces are keyed by statistic; daily are not.

    Defaulting monthly to `mean` is a convenience, and it is the only statistic
    every variable publishes. Rainfall's headline is `sum`, but defaulting
    per-variable would make one URL shape mean different things for different
    variables, so callers ask for what they want.
    """
    if granularity in ("monthly", "records"):
        return statistic or "mean"
    return None


def _real_available(db: Session, variable: str, granularity: str,
                    statistic: Optional[str]) -> AvailableResponse:
    if variable not in UNITS:
        raise HTTPException(422, f"unknown variable {variable!r}")
    stat = _default_statistic(granularity, statistic)
    info = store.availability(db, variable, granularity, stat)
    # The display domain is published here so a legend can be drawn truthfully.
    # Without it the client has to invent a scale, and any scale it invents will
    # disagree with the one the tiles were actually rendered against.
    lo, hi, ramp = store.domain_for(variable, stat)
    return AvailableResponse(
        variable=variable, granularity=granularity,
        first=info["first"], last=info["last"],
        resolutions=info["resolutions"], gaps=info["gaps"],
        meta={"contract_version": CONTRACT_VERSION,
              "statistic": stat,
              "count": info["count"],
              "unit": info.get("unit"),
              "statistics": store.statistics_for(db, variable, granularity),
              "steps": info["steps"],
              "domain": {"min": lo, "max": hi, "ramp": ramp,
                         "stops": store.RAMPS[ramp],
                         # The tails saturate on purpose — see
                         # surface_store.DOMAINS. A legend that claims the ramp
                         # spans the data would be overstating what it shows.
                         "saturates": True},
              "stub": False})


def _real_tile(db: Session, variable: str, granularity: str, valid_at: str,
               z: int, x: int, y: int, ramp: Optional[str],
               vmin: Optional[float], vmax: Optional[float],
               statistic: Optional[str]) -> Response:
    if variable not in UNITS:
        raise HTTPException(422, f"unknown variable {variable!r}")
    if not 0 <= z <= 14:
        raise HTTPException(422, "zoom out of range (0-14)")
    n_tiles = 2 ** z
    if not (0 <= x < n_tiles and 0 <= y < n_tiles):
        raise HTTPException(422, "tile index out of range for this zoom")

    stat = _default_statistic(granularity, statistic)
    try:
        row = store.resolve(db, variable, granularity, stat, valid_at)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except store.SurfaceNotFound as exc:
        raise HTTPException(404, str(exc)) from exc

    # The domain is a property of the variable and statistic, never of the data
    # in this tile — otherwise neighbouring tiles disagree on what a colour
    # means and the map reads as patchwork. Explicit min/max override it.
    lo_default, hi_default, ramp_default = store.domain_for(variable, stat)
    lo = float(vmin) if vmin is not None else lo_default
    hi = float(vmax) if vmax is not None else hi_default
    chosen = ramp or ramp_default
    if chosen not in store.RAMPS:
        raise HTTPException(422, f"unknown ramp {chosen!r}; "
                                 f"have {sorted(store.RAMPS)}")

    try:
        png = store.render_tile(row["s3_key"], z, x, y, chosen, lo, hi)
    except Exception as exc:                                       # noqa: BLE001
        logger.exception("tile render failed for %s", row["s3_key"])
        raise HTTPException(503, f"surface is indexed but unreadable: {exc}") from exc

    return Response(
        content=png, media_type="image/png",
        headers={
            "Cache-Control": TILE_CACHE_CONTROL,
            # Enough for a client to label a legend without a second call, and
            # enough for a bug report to identify exactly what was rendered.
            "X-Surface-Key": row["s3_key"],
            "X-Surface-Domain": f"{lo},{hi}",
            "X-Surface-Model": row["model_version"],
            "X-Surface-Resolution-M": str(row["resolution_m"]),
        })


def _real_point(db: Session, lon: float, lat: float, variables: str,
                start: str, end: str, granularity: str,
                statistic: Optional[str]) -> PointResponse:
    wanted = [v.strip() for v in variables.split(",") if v.strip()]
    if not wanted:
        raise HTTPException(422, "variables must not be empty")
    unknown = [v for v in wanted if v not in UNITS]
    if unknown:
        raise HTTPException(422, f"unknown variables: {unknown}")

    stat = _default_statistic(granularity, statistic)
    if granularity == "monthly":
        stamps = _months_between(start, end)
    elif granularity == "records":
        stamps = [None]
    else:
        # No daily surfaces exist in the published archive. Say so once, rather
        # than returning several hundred nulls that look like an outage.
        raise HTTPException(
            422, "the published archive is monthly; request granularity="
                 "monthly (or records). See /available for what exists.")

    # Distance band, from the CLIFLO network that actually produced this
    # archive. Contract §3.4 — a single national cv_rmse is wrong at both ends,
    # so `expected_error` widens with isolation.
    dist = _nearest_station_km(lat, lon)
    band_err = _expected_error(dist)

    series: list[Series] = []
    n_real = n_null = 0
    model_versions: set[str] = set()

    for variable in wanted:
        points: list[SeriesPoint] = []
        for stamp in stamps:
            try:
                row = store.resolve(db, variable, granularity, stat, stamp)
            except (store.SurfaceNotFound, ValueError):
                when = (_at_utc(date(int(stamp[:4]), int(stamp[5:7]), 1))
                        if stamp else datetime.now(timezone.utc))
                points.append(SeriesPoint(valid_at=when, value=None,
                                          reason="no surface for this date"))
                n_null += 1
                continue

            model_versions.add(row["model_version"])
            try:
                sampled = store.sample(row["s3_key"], [(lon, lat)])[0]
            except Exception as exc:                               # noqa: BLE001
                logger.exception("point sample failed for %s", row["s3_key"])
                raise HTTPException(
                    503, f"surface is indexed but unreadable: {exc}") from exc

            if sampled is None:
                # Off the land mask — sea, or outside New Zealand. NULL, never 0.
                points.append(SeriesPoint(
                    valid_at=row["valid_at"], value=None,
                    resolution_m=row["resolution_m"],
                    reason="outside the land mask"))
                n_null += 1
                continue

            # cv_rmse is in `cv_units`, which is NOT the variable's unit for
            # rainfall: that surface is fitted in ratio space, so its cv_rmse is
            # dimensionless (~0.0025) and rendering it as mm is wrong by orders
            # of magnitude. Suppress rather than mislabel.
            publishable_cv = (row["cv_rmse"]
                              if row.get("cv_units") == UNITS[variable] else None)
            points.append(SeriesPoint(
                valid_at=row["valid_at"], value=round(float(sampled), 3),
                resolution_m=row["resolution_m"],
                confidence=Confidence(
                    cv_rmse=publishable_cv,
                    expected_error=band_err,
                    distance_to_nearest_station_km=(
                        None if dist is None else round(dist, 2)),
                    t_rmse=None, n_test=row.get("n_stations_test"))))
            n_real += 1

        series.append(Series(variable=variable, unit=UNITS[variable],
                             points=points))

    return PointResponse(
        location=Location(lon=lon, lat=lat, elevation_m=None),
        granularity=granularity, series=series,
        meta={"contract_version": CONTRACT_VERSION,
              "model_version": sorted(model_versions)[0] if model_versions else None,
              "statistic": stat,
              "stub": False,
              "counts": {"real": n_real, "synthetic": 0, "null": n_null},
              "confidence_note": (
                  "cv_rmse is the shuffled 10-fold out-of-sample error for the "
                  "whole surface; expected_error is banded by distance to the "
                  "nearest contributing station. Rainfall cv_rmse is omitted "
                  "because it is dimensionless in this archive.")})
