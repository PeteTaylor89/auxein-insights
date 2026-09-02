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
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.session import get_db
from services import surface_store as store
from services import projection_store as projections

# Entitlements. `/tiles` and `/region` stay open; `/available` is open at the
# free CADENCES and withheld at the daily one — see `_gate_steps`. `/point` is
# the Pro action:
# it answers "what is it at MY site", which is what the paid tier is sold on.
# See docs/plans/INSIGHTS_SITE_MAP_2026-08-13.md §5a.
from core.entitlements import require_pro, is_registered, is_pro
from core.public_security import get_optional_public_user
from db.models.public_user import PublicUser

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
         "rainfall": "mm", "rh": "%", "pet": "mm",
         # Derived seasonal accumulations, granularity 'season' only. Keep in
         # step with services.surface_store.UNITS.
         "gdd10": "GDD", "gdd0": "GDD"}

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


class ProbeResponse(BaseModel):
    """One cell, one step, one number — what the map is showing right here.

    DELIBERATELY NOT `PointResponse`, and the difference is the product line.
    `/point` answers "what is it at MY site" over a span of time, with the
    confidence band, the distance to the nearest contributing station and as
    many variables as you ask for; that is the Pro action and it stays Pro.
    This answers "what is that colour", for the single step already rendered on
    the caller's screen, and so carries NO `Confidence` block at all.

    `value` is null — never 0 — off the land mask, with `reason` saying so. A
    null-rainfall-written-as-zero bug (B4.1) has already bitten this platform.
    """
    lon: float
    lat: float
    variable: str
    granularity: str
    statistic: Optional[str] = None
    valid_at: Optional[datetime] = None
    value: Optional[float] = None
    unit: str
    resolution_m: Optional[int] = None
    reason: Optional[str] = Field(None, description="Why value is null, when it is")
    meta: dict = Field(default_factory=dict)


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


class ZoneSeasonPoint(BaseModel):
    vintage_year: int
    mean: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    p10: Optional[float] = None
    p90: Optional[float] = None
    # Share of the zone's planted cells the metric applies to. A last-frost date
    # covering 30% of a zone is a different claim from one covering all of it.
    coverage: Optional[float] = None


class ZoneSeasonSeries(BaseModel):
    metric: str
    unit: str
    baseline: Optional[str] = None
    points: list[ZoneSeasonPoint]


class ZoneSeasonResponse(BaseModel):
    zone: dict
    series: list[ZoneSeasonSeries]
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
    weighting: str = Query(
        "blocks", description="blocks = vineyard-weighted (default); "
                              "area = whole polygon, NOT implemented"),
    db: Session = Depends(get_db),
):
    """Statistics over a climate zone. Contract §5.2 as amended.

    **Vineyard-weighted, not polygon-area-weighted.** The value is the surface
    aggregated over the cells the zone's vineyards actually occupy, weighted by
    planted hectares — `climate_zone_cell_mask`, built once from the national
    vineyard register. Measured difference on Marlborough: 15.10 degC
    block-weighted against 11.33 degC over the whole polygon, because the zone
    spans the Sounds and the inland ranges. Publishing the polygon number would
    be visibly wrong to anyone who grows there.

    `weighting=area` is accepted as a parameter but deliberately unimplemented,
    so a caller that wants the old definition gets a 422 rather than silently
    receiving the new one under the old name.
    """
    if not _use_stub():
        return _real_region(db, variables, start, end, zone_id, granularity,
                            weighting)
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


@router.get("/zones")
def zone_layer(
    level: Optional[str] = Query(
        None, description="region | sub_zone; omit for both"),
    # ~110 m. Measured against the LINZ coastline: at 0.004 (~440 m) the
    # simplifier cuts across bays and puts 97 km2 of the sea back inside the
    # outlines the clip had just removed — half the work undone at render time,
    # invisibly. 0.001 costs 262 KB of GeoJSON for all 23 zones (a level at a
    # time is half that, and it gzips hard) and leaves 23 km2.
    simplify: float = Query(0.001, ge=0, le=0.1),
    min_part_km2: float = Query(
        0.05, ge=0, le=10,
        description="drop land parts smaller than this from the drawn outline"),
    metric: str = Query("gdd10", description="headline metric for the overlay"),
    db: Session = Depends(get_db),
):
    """Zone polygons for the Atlas overlay, with one headline number each.

    Open, like `/tiles` and `/available` — the picture and the regional numbers
    are the free product, and a crawler arriving on a region page has to find
    content rather than a login wall.

    Zones NEST: Marlborough contains Lower Wairau, Awatere and Upper Wairau. The
    `level` filter exists because drawing all 23 at once stacks a parent on top
    of its children; a caller should pick one level per zoom band rather than
    render the whole set.
    """
    if _use_stub():
        raise HTTPException(501, "the zone layer has no stub; it needs the mask")
    if level is not None and level not in ("region", "sub_zone"):
        raise HTTPException(422, "level must be 'region' or 'sub_zone'")
    # `check_surfaces_live.py` calls these router functions DIRECTLY — the venv
    # has no httpx — so a FastAPI `Query(...)` default arrives as a Query object
    # rather than a number and lands in the SQL parameters as one. Resolving it
    # here costs a line and stops every direct caller having to know.
    if not isinstance(min_part_km2, (int, float)):
        min_part_km2 = 0.05

    latest = db.execute(text("""
        SELECT max(vintage_year) FROM climate_zone_surface_season
    """)).scalar()

    # `geometry_clipped` is the LINZ-coastline-trimmed outline; `geometry` is the
    # administrative polygon it came from. COALESCE rather than a join so a zone
    # that has never been through `fetch_nz_coastline.py` still draws, and
    # `clipped` travels with the feature so the difference is visible rather
    # than being guessed from the shape.
    rows = db.execute(text("""
        WITH raw AS (
            SELECT z.id, z.name, z.slug, z.zone_level, z.parent_zone_id,
                   z.display_order,
                   z.geometry_clipped IS NOT NULL AS clipped,
                   z.label_point,
                   COALESCE(z.geometry_clipped, z.geometry) AS geom
              FROM climate_zones z
             WHERE z.geometry IS NOT NULL AND z.is_active = true
               AND (:level IS NULL OR z.zone_level = :level)
        ),
        -- Clipping Marlborough to the coast turns it into 238 parts, most of
        -- them rocks in the Sounds. They carry a fifth of the payload and are
        -- sub-pixel at every zoom this layer is drawn at; dropping them takes
        -- the region layer from 220 KB to 176 KB. COALESCE back to the whole
        -- geometry so a zone whose every part is under the threshold still
        -- draws rather than vanishing.
        zone AS (
            SELECT raw.*,
                   COALESCE((SELECT ST_Multi(ST_Collect(d.geom))
                               FROM ST_Dump(raw.geom) d
                              WHERE ST_Area(d.geom::geography)
                                    >= :min_part * 1e6),
                            raw.geom) AS drawn
              FROM raw
        )
        SELECT zone.id, zone.name, zone.slug, zone.zone_level, zone.parent_zone_id,
               zone.clipped,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(zone.drawn, :tol))
                   AS geom,
               ST_X(COALESCE(zone.label_point, lbl.pt)) AS label_lon,
               ST_Y(COALESCE(zone.label_point, lbl.pt)) AS label_lat,
               m.cells, m.ha,
               s.mean AS headline, s.unit AS headline_unit,
               b.mean AS headline_baseline
          FROM zone
          JOIN (SELECT zone_id, count(*) AS cells, sum(planted_ha) AS ha
                  FROM climate_zone_cell_mask GROUP BY zone_id) m
            ON m.zone_id = zone.id
          -- `label_point` is precomputed on the part carrying the most
          -- registered vine area (fetch_nz_coastline.py) — ranking by area
          -- alone puts "Auckland" on the wrong island by a 6% margin. This
          -- lateral is only the fallback for a zone that has never been through
          -- that script: a point on the largest part, which still beats a
          -- centroid (the centroid of a crescent like Hawke's Bay is at sea).
          -- LEFT JOIN so an empty geometry loses its label, not the whole zone.
          LEFT JOIN LATERAL (
              SELECT ST_PointOnSurface(d.geom) AS pt
                FROM ST_Dump(zone.drawn) d
               ORDER BY ST_Area(d.geom) DESC
               LIMIT 1
          ) lbl ON true
          LEFT JOIN climate_zone_surface_season s
            ON s.zone_id = zone.id AND s.metric = :metric
           AND s.vintage_year = :latest
          LEFT JOIN (SELECT zone_id, avg(mean) AS mean
                       FROM climate_zone_surface_season
                      WHERE metric = :metric
                        AND vintage_year BETWEEN 1987 AND 2016
                      GROUP BY zone_id) b
            ON b.zone_id = zone.id
         ORDER BY zone.display_order
    """), {"tol": simplify, "metric": metric, "latest": latest,
           "level": level, "min_part": min_part_km2}).fetchall()

    features = []
    for r in rows:
        if not r.geom:
            continue
        features.append({
            "type": "Feature",
            "geometry": json.loads(r.geom),
            "properties": {
                "id": r.id, "name": r.name, "slug": r.slug,
                "level": r.zone_level, "parent_zone_id": r.parent_zone_id,
                # Where to put the zone's name. A label placed by the renderer
                # from the polygon itself drifts offshore on a coastal region.
                "label_lon": float(r.label_lon) if r.label_lon is not None else None,
                "label_lat": float(r.label_lat) if r.label_lat is not None else None,
                # False means this outline is still the administrative polygon
                # and may run out over water.
                "clipped": bool(r.clipped),
                "n_cells": r.cells,
                "planted_ha": float(r.ha) if r.ha else 0.0,
                "headline_metric": metric,
                "headline": r.headline,
                "headline_unit": r.headline_unit,
                # The long-term mean travels with the latest value so the map
                # can say "warmer than usual" without a second request, and so
                # a single anomalous season is never shown as the zone's normal.
                "headline_baseline": (float(r.headline_baseline)
                                      if r.headline_baseline is not None
                                      else None),
                "url": f"/regions/{r.slug}",
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {"contract_version": CONTRACT_VERSION,
                 "weighting": "blocks",
                 "latest_vintage": latest,
                 "baseline": "1987-2016 mean",
                 "overlaps": "zones nest; do not sum across features",
                 # The outline is trimmed to the coast for drawing only. Every
                 # number on this response still comes from the vineyard cell
                 # mask, which never read the polygon.
                 "coastline": "LINZ NZ Coastlines and Islands Polygons "
                              "(Topo 1:50k), CC BY 4.0",
                 "clipped": sum(1 for f in features if f["properties"]["clipped"]),
                 "count": len(features)},
    }


@router.get("/zones/{slug}/season", response_model=ZoneSeasonResponse)
def zone_season(
    slug: str,
    metrics: Optional[str] = Query(
        None, description="comma-separated; omit for every metric"),
    db: Session = Depends(get_db),
):
    """Growing-season history for one zone. Sep-Apr, by vintage year."""
    if _use_stub():
        raise HTTPException(501, "zone seasons have no stub; they need the mask")
    return _real_zone_season(db, slug, metrics)


@router.get("/available", response_model=AvailableResponse)
def available(variable: str = Query("temp_mean"), granularity: str = Query("daily"),
              statistic: Optional[str] = Query(None),
              db: Session = Depends(get_db),
              user: Optional[PublicUser] = Depends(get_optional_public_user)):
    """What exists, and where the holes are. Contract §5.3.

    `gaps` is authoritative: the time-scrubber must grey these out rather than
    request them and render holes.

    Open to everyone at the MONTHLY, SEASONAL and RECORDS cadences — the whole
    1986-onward archive, no account needed. The DAILY cadence is Pro.
    `_gate_steps` explains why the gate lives here and not in the client, and
    why `/tiles` is not gated alongside it.
    """
    if not _use_stub():
        return _real_available(db, variable, granularity, statistic,
                               registered=is_registered(user),
                               pro=is_pro(user))
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


@router.get("/probe", response_model=ProbeResponse)
def probe(
    response: Response,
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    variable: str = Query("temp_mean"),
    granularity: str = Query("monthly"),
    valid_at: Optional[str] = Query(
        None, description="YYYY-MM for monthly and season, YYYY-MM-DD for "
                          "daily, omitted for records. Defaults to the newest "
                          "step this caller may see."),
    statistic: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[PublicUser] = Depends(get_optional_public_user),
):
    """The value of ONE cell of the surface already on screen.

    FREE AT THE CADENCE YOU CAN ALREADY SEE (Pete's call, 2026-08-27). The gate
    is `_gate_steps` — the same one `/available` runs — so a probe can never
    answer for a step the caller's own scrubber is not allowed to offer:
    anonymous gets the newest step, a free account gets the 1986 archive, and
    the daily cadence stays Pro.

    The reasoning for making it free rather than Pro: the tile is already
    rendered, `/tiles` is not gated, and the number is legible off the legend to
    within a ramp step by eye. What a probe adds over squinting is PRECISION, not
    access. What stays behind Pro is `/point` — the series, the confidence band
    and the distance to the nearest contributing station — which is the part
    that is actually the product.

    401 when signing in would open it, 402 when only Pro would. 404 means the
    date genuinely has no surface, and the two are told apart against the
    UNGATED step list so a withheld month is never reported as a missing one.
    """
    if _use_stub():
        # No stub path on purpose. Every other stub handler exists because WS3
        # had to build against something before the pipeline was finished; this
        # endpoint was written against the real index and a synthetic probe
        # would be a plausible number with nothing marking it as invented, one
        # click from a user's mouth. See the module docstring.
        raise HTTPException(501, "probe is not implemented by the surface stub")
    out = _real_probe(db, lon, lat, variable, granularity, valid_at, statistic,
                      registered=is_registered(user), pro=is_pro(user))
    # `private`, because the answer depends on the caller's tier — a shared
    # cache would hand one visitor's entitlement to the next. Daily surfaces are
    # revised for ~3 days (D+2 plus the weekly refit) so they get a short life;
    # the archive is immutable and a repeat click on the same cell should cost
    # nothing.
    response.headers["Cache-Control"] = (
        "private, max-age=300" if granularity in PRO_GRANULARITIES
        else "private, max-age=86400")
    return out


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
    # `season` is statistic-keyed too (store.STATISTIC_KEYED) but defaults
    # differently, so it stays a separate branch rather than folding in.
    if granularity == "season":
        # `cumulative` is the default because it is the whole series; `sum` is
        # one point of it (the April accumulation) addressed by another name.
        # Defaulting to `sum` would hand a scrubber a single step and look like
        # the archive holds one surface per season.
        return statistic or "cumulative"
    return None


def _real_region(db: Session, variables: str, start: str, end: str,
                 zone_id: Optional[int], granularity: str,
                 weighting: str) -> RegionResponse:
    """Monthly zone series, vineyard-weighted, out of the precomputed table.

    Nothing is sampled here: `climate_zone_surface_monthly` already holds the
    mask-weighted aggregate for every (zone, band, month), because the archive is
    fixed and re-deriving a constant behind a map click would cost seconds of S3
    range reads.
    """
    if weighting != "blocks":
        raise HTTPException(
            422, f"weighting={weighting!r} is not implemented. Zone statistics "
                 "are vineyard-weighted (`blocks`); the polygon-area weighting "
                 "in the original §5.2 is not served, because for a region like "
                 "Marlborough it averages in mountains nobody plants.")
    if granularity != "monthly":
        raise HTTPException(
            422, f"granularity={granularity!r} is not served for regions; the "
                 "published zone archive is monthly. Use granularity=monthly.")
    if zone_id is None:
        raise HTTPException(422, "zone_id is required")

    zone = db.execute(text("""
        SELECT id, name, slug, zone_level, parent_zone_id
          FROM climate_zones WHERE id = :z
    """), {"z": zone_id}).fetchone()
    if zone is None:
        raise HTTPException(404, f"no climate zone {zone_id}")

    wanted = [v.strip() for v in variables.split(",") if v.strip()]
    unknown = [v for v in wanted if v not in UNITS]
    if unknown:
        raise HTTPException(422, f"unknown variables: {unknown}")
    months = _months_between(start, end)
    first, last = months[0], months[-1]

    series: list[RegionSeries] = []
    for variable in wanted:
        stat = "sum" if variable == "rainfall" else "mean"
        rows = db.execute(text("""
            SELECT year, month, mean, min, max, n_cells, planted_ha
              FROM climate_zone_surface_monthly
             WHERE zone_id = :z AND variable = :v AND statistic = :s
               AND (year * 100 + month) BETWEEN :lo AND :hi
             ORDER BY year, month
        """), {"z": zone_id, "v": variable, "s": stat,
               "lo": int(first[:4]) * 100 + int(first[5:]),
               "hi": int(last[:4]) * 100 + int(last[5:])}).fetchall()

        points = [RegionPoint(
            valid_at=datetime(r.year, r.month, 1, tzinfo=timezone.utc),
            mean=r.mean, min=r.min, max=r.max,
            # Planted area, NOT polygon area — the two differ by orders of
            # magnitude for a mountainous zone and the field name would
            # otherwise invite the wrong reading.
            area_km2=float(r.planted_ha) / 100.0 if r.planted_ha else None,
            resolution_m=500,
        ) for r in rows]
        series.append(RegionSeries(variable=variable, unit=UNITS[variable],
                                   points=points))

    mask = db.execute(text("""
        SELECT count(*) AS cells, sum(planted_ha) AS ha
          FROM climate_zone_cell_mask WHERE zone_id = :z
    """), {"z": zone_id}).fetchone()

    return RegionResponse(
        zone={"id": zone.id, "name": zone.name, "slug": zone.slug,
              "level": zone.zone_level, "parent_zone_id": zone.parent_zone_id},
        granularity="monthly",
        series=series,
        meta={"contract_version": CONTRACT_VERSION,
              "weighting": "blocks",
              # Stated in the payload, not just the docs: min/max are across
              # planted CELLS, so "min" is the coolest planted part of the zone.
              "extent": "planted cells only",
              "spread_basis": "cells",
              "n_cells": mask.cells if mask else 0,
              "planted_ha": float(mask.ha) if mask and mask.ha else 0.0,
              "stub": False})


def _real_zone_season(db: Session, slug: str,
                      metrics: Optional[str]) -> ZoneSeasonResponse:
    """Every growing season for one zone, from `climate_zone_surface_season`."""
    zone = db.execute(text("""
        SELECT id, name, slug, description, zone_level, parent_zone_id
          FROM climate_zones WHERE slug = :s
    """), {"s": slug}).fetchone()
    if zone is None:
        raise HTTPException(404, f"no climate zone {slug!r}")

    params: dict = {"z": zone.id}
    clause = ""
    if metrics:
        wanted = [m.strip() for m in metrics.split(",") if m.strip()]
        if wanted:
            clause = " AND metric = ANY(:metrics)"
            params["metrics"] = wanted

    rows = db.execute(text(f"""
        SELECT metric, unit, baseline, vintage_year, mean, min, max,
               p10, p90, coverage
          FROM climate_zone_surface_season
         WHERE zone_id = :z{clause}
         ORDER BY metric, vintage_year
    """), params).fetchall()

    grouped: dict[str, list] = {}
    units: dict[str, str] = {}
    baselines: dict[str, Optional[str]] = {}
    for r in rows:
        grouped.setdefault(r.metric, []).append(r)
        units[r.metric] = r.unit
        baselines[r.metric] = r.baseline

    series = [ZoneSeasonSeries(
        metric=metric, unit=units[metric], baseline=baselines[metric],
        points=[ZoneSeasonPoint(
            vintage_year=r.vintage_year, mean=r.mean, min=r.min, max=r.max,
            p10=r.p10, p90=r.p90, coverage=r.coverage) for r in recs],
    ) for metric, recs in sorted(grouped.items())]

    mask = db.execute(text("""
        SELECT count(*) AS cells, sum(planted_ha) AS ha
          FROM climate_zone_cell_mask WHERE zone_id = :z
    """), {"z": zone.id}).fetchone()

    return ZoneSeasonResponse(
        zone={"id": zone.id, "name": zone.name, "slug": zone.slug,
              "description": zone.description, "level": zone.zone_level,
              "parent_zone_id": zone.parent_zone_id},
        series=series,
        meta={"contract_version": CONTRACT_VERSION,
              "weighting": "blocks",
              "season": "Sep-Apr, labelled by the ending (vintage) year",
              "n_cells": mask.cells if mask else 0,
              "planted_ha": float(mask.ha) if mask and mask.ha else 0.0,
              # Zones nest — Marlborough contains Lower Wairau, Awatere and
              # Upper Wairau — so a consumer must never sum across zones.
              "overlaps": "zones nest; rows are not a partition",
              "stub": False})


# THREE TIERS. A CADENCE RULE AND A DATE RULE, AND BOTH ARE LOAD-BEARING.
#
# Anonymous   the NEWEST step of every monthly, seasonal and records layer.
# Registered  the whole 1986-onward archive at those cadences. Free account.
# Pro         the DAILY surface — what happened at your place this week.
#
# The cadence half landed first on 2026-08-25 and removed the anonymous trim
# with it. Seeing it run, Pete put the trim back the same day: a signed-out
# visitor could scrub forty years of every layer, which is the entire regional
# product given away before anyone has told us who they are. Registration is
# free, and the moment someone reaches for the archive is exactly when asking is
# natural.
#
# The two rules compose and are checked in order — cadence first, because a
# daily layer must be refused to a signed-out visitor as PRO, not offered to
# them as one free step.
#
# Why the swap. The date rule withheld HISTORY: an anonymous visitor got the
# newest month and the archive needed an account. History is the wrong thing to
# withhold. It is the site's organic-search asset, it is what makes a region
# page worth linking to, and it costs nothing to serve because it never changes.
# Recency is the opposite on every count: it is the thing an operator makes
# decisions against, it is expensive to produce (a daily fit, every day), and it
# is worthless a month later. Withholding recency prices the work that is
# actually being done.
#
# It is also enforceable in ONE predicate. `granularity` is already a column on
# `surface_run`, already on every request, and already in every tile URL, so the
# rule is a set membership rather than a date comparison threaded through the
# step list — which is what let the old rule leak into `first`/`last`/`gaps` and
# need three separate corrections in this function.
FREE_GRANULARITIES = frozenset({"monthly", "season", "records"})
PRO_GRANULARITIES = frozenset({"daily", "hourly"})


def _gate_steps(info: dict, granularity: str, registered: bool,
                pro: bool) -> dict:
    """Withhold the DAILY cadence from anyone who is not Pro, and the ARCHIVE
    from anyone who is not signed in.

    Enforced here rather than in the client because the scrubber renders
    whatever steps it is given — leave the full list in the payload and the gate
    is a suggestion.

    **`/tiles` is deliberately NOT gated.** A tile request is issued by a Mapbox
    raster source, which sends no Authorization header, so a per-user check
    there is not reachable without signed URLs or cookies (Pete's call,
    2026-08-18: not worth the cache fragmentation for a 500 m PNG). Anyone who
    constructs a tile URL by hand can still fetch it.

    **That trade is worth re-examining now the cadence rule is in.** Under the
    date rule an ungated tile leaked archive months, which are free anyway under
    this rule. Under the cadence rule it leaks the DAILY surface, which is the
    paid product. The catalogue gate still stops a client from knowing which
    dates exist, so it is a nudge and not a wall — same as before — but the
    thing behind the wall is now the thing being sold. Flagged, not decided.

    The withheld span stays in `meta.access` in both cases, on purpose: naming
    what the next tier adds is the reason to take it, and hiding the span hides
    the offer.
    """
    # 1. CADENCE. Checked first so a daily layer is refused as Pro rather than
    #    handed to a signed-out visitor as one free step.
    if granularity in PRO_GRANULARITIES and not pro:
        return _withhold_cadence(info, granularity, registered)

    if granularity in PRO_GRANULARITIES:
        return {**info, "access": {"tier": "pro", "scope": "full",
                                   "cadence": granularity}}

    # 2. DATE. A free cadence, but the archive behind the newest step needs an
    #    account.
    if not registered:
        return _withhold_archive(info, granularity)

    return {**info, "access": {
        "tier": "pro" if pro else "registered",
        "scope": "full",
        "cadence": granularity,
    }}


def _withhold_archive(info: dict, granularity: str) -> dict:
    """The newest step only, for a signed-out visitor.

    THE PICTURE IS THE PITCH. Every layer and every statistic stays reachable —
    what an account adds is the RECORD behind them, so the map still renders at
    full resolution and only the scrubber is short. A gate that hid the layers
    would hide the reason to sign up.
    """
    steps = info.get("steps") or []
    newest = steps[-1:] if steps else []
    return {
        **info,
        # Collapse the window onto the newest step. `first`/`last` are ISO DATES
        # here while a monthly step's `valid_at` is 'YYYY-MM' — mixing the two
        # formats in one response is how a date parser starts returning Invalid
        # Date, so `first` is set from `last`, not from the step.
        "first": info.get("last") if newest else info.get("first"),
        "last": info.get("last"),
        # A one-step list has no interior, so there is nothing for the scrubber
        # to grey out. Sending the archive's real gaps here would describe holes
        # in a record the caller cannot see.
        "gaps": [],
        "steps": newest,
        "count": len(newest),
        "access": {
            "tier": "anonymous",
            "scope": "latest_step",
            "cadence": granularity,
            "requires": "registration",
            "archive_first": info.get("first"),
            "archive_last": info.get("last"),
            "archive_count": info.get("count"),
            "unlock": "Sign in free to open the full record back to 1986.",
        },
    }


def _withhold_cadence(info: dict, granularity: str, registered: bool) -> dict:
    """The daily cadence, for anyone who is not Pro."""

    return {
        **info,
        # NO steps, and the window collapses with them. `first`/`last` describe
        # the range the caller may address, so leaving them populated beside an
        # empty step list is how a date picker starts offering days it will then
        # be refused. The real span moves into `access`, where it reads as an
        # offer rather than as data.
        "first": None,
        "last": None,
        # An empty step list has no interior, so there is nothing to grey out.
        # Sending the real gaps would describe holes in a record the caller
        # cannot see at all.
        "gaps": [],
        "steps": [],
        "count": 0,
        "access": {
            "tier": "registered" if registered else "anonymous",
            "scope": "none",
            "cadence": granularity,
            "requires": "pro",
            "daily_first": info.get("first"),
            "daily_last": info.get("last"),
            "daily_count": info.get("count"),
            # Tier-aware. "The full monthly record is free" is true for a
            # signed-in visitor and a half-truth for a signed-out one, who has
            # the newest month and an account standing between them and the
            # rest of it. Two gates means two sentences.
            "unlock": ("Daily surfaces are part of Insights Pro. "
                       "The full monthly record is free with an account."
                       if not registered else
                       "Daily surfaces are part of Insights Pro. "
                       "The full monthly record is already open to you."),
        },
    }


def _real_available(db: Session, variable: str, granularity: str,
                    statistic: Optional[str],
                    registered: bool = True,
                    pro: bool = True) -> AvailableResponse:
    if variable not in UNITS:
        raise HTTPException(422, f"unknown variable {variable!r}")
    stat = _default_statistic(granularity, statistic)
    info = _gate_steps(store.availability(db, variable, granularity, stat),
                       granularity, registered, pro)
    # The display domain is published here so a legend can be drawn truthfully.
    # Without it the client has to invent a scale, and any scale it invents will
    # disagree with the one the tiles were actually rendered against.
    lo, hi, ramp = store.domain_for(variable, stat, granularity)
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
              # What this caller is entitled to see, and what exists behind
              # sign-in. The client draws its gate from this, never from a
              # local guess about who is signed in.
              "access": info["access"],
              "domain": {"min": lo, "max": hi, "ramp": ramp,
                         "stops": store.RAMPS[ramp],
                         # Where each stop sits in 0..1. Even unless the ramp is
                         # front-loaded for a skewed variable (rainfall depths).
                         # A legend that ignores this draws a different scale
                         # from the one the tiles were rendered against.
                         "positions": store.ramp_positions(ramp),
                         # The tails saturate on purpose — see
                         # surface_store.DOMAINS. A legend that claims the ramp
                         # spans the data would be overstating what it shows.
                         "saturates": True},
              "stub": False})


def _normalise_stamp(granularity: str, valid_at: str) -> str:
    """The caller's `valid_at` in the form `availability` publishes steps in.

    Monthly and season steps are addressed as YYYY-MM (a season surface is
    stamped at month END in the index, which is not the caller's problem);
    daily and hourly as an ISO date. A client holding a full date for a monthly
    layer — which the Atlas does, because it scrubs a date — must land on the
    month that contains it rather than on a 404.
    """
    try:
        if granularity in ("monthly", "season"):
            parts = valid_at.split("-")
            if len(parts) < 2:
                raise ValueError("expected YYYY-MM")
            return f"{int(parts[0]):04d}-{int(parts[1]):02d}"
        return date.fromisoformat(valid_at).isoformat()
    except ValueError as exc:
        raise HTTPException(
            422, f"unparseable valid_at {valid_at!r} for granularity "
                 f"{granularity!r}") from exc


def _entitlement_error(gated: dict, registered: bool) -> HTTPException:
    """The refusal that names what would lift it.

    Mirrors `require_pro`: 401 when the caller is signed out, because signing in
    is the next step; 402 when they are signed in and the tier is the wall.
    Contract §5.5 reserves 402 for "entitlement required" so the frontend can
    show an upgrade path rather than an error. The sentence comes from the SAME
    `access.unlock` the catalogue already sends, so the probe and the scrubber
    cannot end up making two different offers for one gate.
    """
    access = gated.get("access") or {}
    detail = access.get("unlock") or "This step needs a higher tier."
    return HTTPException(401 if not registered else 402, detail)


def _real_probe(db: Session, lon: float, lat: float, variable: str,
                granularity: str, valid_at: Optional[str],
                statistic: Optional[str],
                registered: bool, pro: bool) -> ProbeResponse:
    if variable not in UNITS:
        raise HTTPException(422, f"unknown variable {variable!r}")
    stat = _default_statistic(granularity, statistic)

    # THE CATALOGUE'S GATE, not a second copy of it. `_gate_steps` returns a new
    # dict, so `info` keeps the ungated truth — which is what tells a withheld
    # step apart from an absent one below. Re-deriving the tier rules here is
    # how the two would drift the first time either moved.
    info = store.availability(db, variable, granularity, stat)
    gated = _gate_steps(info, granularity, registered, pro)
    steps = gated.get("steps") or []

    if granularity == "records":
        # Exactly one records surface per (variable, statistic), addressed
        # without a date. Nothing to match — the cadence gate is the whole gate.
        if not steps:
            raise _entitlement_error(gated, registered)
        stamp = None
    elif not valid_at:
        # No date is not an error: it means "whatever the map opens on", which
        # is the newest step this caller may see.
        if not steps:
            raise _entitlement_error(gated, registered)
        stamp = steps[-1]["valid_at"]
    else:
        stamp = _normalise_stamp(granularity, valid_at)
        if not any(s["valid_at"] == stamp for s in steps):
            # Two very different answers wear the same shape here: a step that
            # exists but is behind a tier, and one that does not exist at all.
            # Reporting a withheld month as missing would tell a visitor the
            # archive has a hole in it.
            if any(s["valid_at"] == stamp for s in (info.get("steps") or [])):
                raise _entitlement_error(gated, registered)
            raise HTTPException(404, f"no {variable} surface for {valid_at}")

    try:
        row = store.resolve(db, variable, granularity, stat, stamp)
    except (store.SurfaceNotFound, ValueError) as exc:
        raise HTTPException(
            404, f"no {variable} surface for {valid_at or 'the newest step'}"
        ) from exc

    try:
        sampled = store.sample(row["s3_key"], [(lon, lat)])[0]
    except Exception as exc:                                       # noqa: BLE001
        logger.exception("probe sample failed for %s", row["s3_key"])
        raise HTTPException(
            503, f"surface is indexed but unreadable: {exc}") from exc

    return ProbeResponse(
        lon=lon, lat=lat, variable=variable, granularity=granularity,
        statistic=stat, valid_at=row["valid_at"],
        # `store.sample` already maps nodata and NaN to None. Off the land mask
        # is NULL, never 0.
        value=None if sampled is None else round(float(sampled), 3),
        # THE BAND'S UNIT. `temp_min/frost_days` is a count of days, not degrees,
        # and `rainfall/wet_days` is a count of days, not millimetres — reading
        # the unit off the variable is what put 'C' beside a frost count.
        unit=store.unit_for(variable, stat),
        resolution_m=row["resolution_m"],
        reason=None if sampled is not None else "outside the land mask",
        meta={"contract_version": CONTRACT_VERSION,
              "model_version": row["model_version"],
              "tier": (gated.get("access") or {}).get("tier"),
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
    lo_default, hi_default, ramp_default = store.domain_for(variable, stat,
                                                            granularity)
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
    if granularity in ("monthly", "season"):
        # Season surfaces are addressed as YYYY-MM like monthly ones — the
        # end-of-month stamp is an index detail — so the same month walk serves
        # both. Months outside Sep-Apr simply resolve to nothing and come back
        # as nulls, which is the truthful answer for a growing-season series.
        stamps = _months_between(start, end)
    elif granularity == "records":
        stamps = [None]
    elif granularity == "daily":
        # Daily surfaces DO exist now — the live engine publishes them at D+2
        # with a weekly refit — so this walks days the same way the branch above
        # walks months. It used to 422 saying the archive was monthly and
        # seasonal, which was true when it was written and stale from the day
        # `run_live.py` first published. A date with no surface still comes back
        # as a null point with a reason, not as an error.
        stamps = [d.isoformat() for d in _parse_dates(start, end, "daily")]
    else:
        raise HTTPException(
            422, f"unsupported granularity {granularity!r}; request daily, "
                 "monthly, season or records. See /available for what exists.")

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

        series.append(Series(variable=variable,
                             unit=store.unit_for(variable, stat),
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


# =============================================================================
# PROJECTIONS — the MfE 2024 downscaled scenarios, composed onto our own normals
# =============================================================================
#
# A separate address space from the observational surfaces on purpose, mirroring
# the separate table. `/surfaces/tiles/...` is a measurement; `/surfaces/
# projections/tiles/...` is a scenario, and no URL should be one path parameter
# away from turning one into the other.
#
# ENTITLEMENT, AND THIS IS PETE'S CALL TO CHANGE
# ----------------------------------------------
# Served to any REGISTERED account, matching the archive gate rather than the
# Pro gate, and `PROJECTIONS_REQUIRE` is the single switch. The reasoning is
# that the Atlas projection is a regional, national-scale artefact — the thing
# that makes the site worth linking to — while what Pro sells is the SITE-level
# number, which is a different endpoint (`/point`) and already gated. If the
# regional free/paid split in project_insights_free_tier is meant to cover this
# too, change the constant here and nothing else.
#
# Like `/tiles`, `/projections/tiles` is NOT gated: a Mapbox raster source sends
# no Authorization header, so the gate lives on the catalogue that tells a
# client what to ask for. Same trade, same reasoning as `_gate_steps`.
PROJECTIONS_REQUIRE = "registration"


class ProjectionLayer(BaseModel):
    variable: str
    statistic: str
    label: str
    unit: str
    rule: str
    count: int


class ProjectionCatalogueResponse(BaseModel):
    layers: list[ProjectionLayer] = Field(default_factory=list)
    # Present only when a specific layer was asked for.
    variable: Optional[str] = None
    statistic: Optional[str] = None
    scenarios: list[dict] = Field(default_factory=list)
    periods: list[dict] = Field(default_factory=list)
    seasons: list[dict] = Field(default_factory=list)
    steps: list[dict] = Field(default_factory=list)
    # The 1986-2005 normal, per season. Its own block rather than a step of the
    # matrix, because it is the one thing every step is measured against.
    baselines: dict = Field(default_factory=dict)
    meta: dict = Field(default_factory=dict)


def _axis(values: set, labels: dict, order_key: str = "order") -> list[dict]:
    """One axis of the scenario matrix, in a declared order and labelled.

    Built from what is actually PUBLISHED, never from the constant lists in the
    migration. The matrix is not full — 16 of the 18 (scenario, period) pairs
    exist, because a low-emissions scenario never reaches the highest warming
    level — and a client that renders the declared list would offer two chips
    that 404. This is the same stale-constant trap that broke four check suites
    on 2026-08-24: never assert a shape the archive can move.
    """
    out = []
    for value in values:
        info = dict(labels.get(value) or {})
        info.setdefault("label", value)
        info.setdefault(order_key, 99)
        info["value"] = value
        out.append(info)
    out.sort(key=lambda d: (d.get(order_key, 99), d["value"]))
    return out


@router.get("/projections/available", response_model=ProjectionCatalogueResponse)
def projections_available(
    variable: Optional[str] = Query(None),
    statistic: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[PublicUser] = Depends(get_optional_public_user),
):
    """The projection catalogue: which layers exist, and for one layer, every
    published (scenario, period, season) with its national medians.

    Called with no `variable` it returns the layer list only, which is what the
    mode switch needs to know whether to appear at all.
    """
    registered = is_registered(user)
    available_layers = projections.layers(db)
    info = projections.meta(db)

    if not registered:
        # The offer, not a blank. The layer list and the attribution stay —
        # they are the reason to sign in — and the matrix does not.
        return ProjectionCatalogueResponse(
            layers=[ProjectionLayer(**layer) for layer in available_layers],
            meta={**info, "contract_version": CONTRACT_VERSION,
                  "access": {
                      "tier": "anonymous",
                      "scope": "none",
                      "requires": PROJECTIONS_REQUIRE,
                      "unlock": "Sign in free to open the climate projections.",
                  }})

    access = {"tier": "registered", "scope": "full"}
    if not variable:
        return ProjectionCatalogueResponse(
            layers=[ProjectionLayer(**layer) for layer in available_layers],
            meta={**info, "contract_version": CONTRACT_VERSION, "access": access})

    match = next((layer for layer in available_layers
                  if layer["variable"] == variable
                  and (statistic is None or layer["statistic"] == statistic)), None)
    if match is None:
        raise HTTPException(
            404, f"no projection layer {variable!r}"
            f"{'/' + statistic if statistic else ''}")

    rows = projections.steps(db, match["variable"], match["statistic"])
    baselines = projections.baselines(db, match["variable"], match["statistic"])
    seasons = {r["season"] for r in rows}

    # The domain is season-dependent for every layer that does not share the
    # measured Atlas scale — a DJF rainfall total and an ANN one are three
    # months and twelve — so one is published PER SEASON rather than per layer.
    domains = {}
    for season in seasons:
        try:
            domains[season] = projections.describe(
                match["variable"], match["statistic"], season)
        except projections.ProjectionNotFound as exc:
            # Published but unrenderable: no measured domain. Say so rather than
            # inventing a scale — the client greys the season out.
            logger.warning("projection domain missing: %s", exc)
            domains[season] = None

    return ProjectionCatalogueResponse(
        layers=[ProjectionLayer(**layer) for layer in available_layers],
        variable=match["variable"], statistic=match["statistic"],
        scenarios=_axis({r["scenario"] for r in rows}, projections.SCENARIO_LABELS),
        periods=_axis({r["period"] for r in rows}, projections.PERIOD_LABELS),
        seasons=_axis(seasons, projections.SEASON_LABELS),
        steps=rows,
        # Keyed by season, so the client can tell whether the flip is available
        # for the season on screen rather than discovering it with a 404.
        baselines=baselines,
        meta={**info, "contract_version": CONTRACT_VERSION,
              "unit": match["unit"], "rule": match["rule"],
              "access": access,
              "domains": domains,
              # The baseline is OUR surface and carries OUR attribution. It is
              # published separately from `meta.source` (which credits MfE for
              # the change field) so a client showing the baseline alone never
              # renders someone else's licence notice over our own work.
              "baseline_source": next(
                  (b["source"] for b in baselines.values() if b.get("source")),
                  None),
              # The sentinels a client puts in the tile URL to ask for the
              # baseline. Served rather than hardcoded, so the two cannot drift.
              "baseline_key": {"scenario": projections.BASELINE_SENTINEL,
                               "period": projections.BASELINE_SENTINEL}},
    )


@router.get("/projections/probe", response_model=ProbeResponse)
def projection_probe(
    response: Response,
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    variable: str = Query(...),
    statistic: str = Query(...),
    scenario: str = Query(..., description="or the 'baseline' sentinel"),
    period: str = Query(..., description="or the 'baseline' sentinel"),
    season: str = Query(...),
    db: Session = Depends(get_db),
    user: Optional[PublicUser] = Depends(get_optional_public_user),
):
    """One cell of a projection or baseline surface. The Projected mode's probe.

    A SEPARATE ROUTE from `/probe`, for the same reason the tiles are two
    routes: a measurement is addressed by a date and a scenario is addressed by
    (scenario, period, season), and no URL should be one query parameter away
    from turning one into the other.

    THE UNIT COMES OFF THE ROW, not from `UNITS`. A projected rainfall change
    field is a PERCENTAGE while the measured layer is millimetres, and reading
    the variable's own unit here would label a 12% change as 12 mm.

    Withholding is `projection_store.resolve`'s job — it raises
    ProjectionNotFound for a WITHHELD layer with the same message as an absent
    one, so this route inherits the frost exclusion without restating it.
    """
    if PROJECTIONS_REQUIRE == "pro" and not is_pro(user):
        raise HTTPException(
            401 if not is_registered(user) else 402,
            "Climate projections are part of Insights Pro.")
    if PROJECTIONS_REQUIRE == "registration" and not is_registered(user):
        raise HTTPException(401, "Sign in free to open the climate projections.")

    try:
        row = projections.resolve(db, variable, statistic, scenario, period, season)
    except projections.ProjectionNotFound as exc:
        raise HTTPException(404, str(exc)) from exc

    try:
        sampled = store.sample(row["s3_key"], [(lon, lat)])[0]
    except Exception as exc:                                       # noqa: BLE001
        logger.exception("projection probe failed for %s", row["s3_key"])
        raise HTTPException(
            503, f"projection is indexed but unreadable: {exc}") from exc

    # A projection never changes once published — unlike a daily surface there is
    # no D+2 revision — so it caches for as long as the entitlement check allows,
    # which is `private` and a day.
    response.headers["Cache-Control"] = "private, max-age=86400"
    return ProbeResponse(
        lon=lon, lat=lat, variable=variable, granularity="projection",
        statistic=statistic, valid_at=None,
        value=None if sampled is None else round(float(sampled), 3),
        unit=row["unit"],
        resolution_m=row["resolution_m"],
        reason=None if sampled is not None else "outside the land mask",
        meta={"contract_version": CONTRACT_VERSION,
              "model_version": row["model_version"],
              # 'projection' or 'baseline' — the TABLE's vocabulary, not the
              # UI's, which calls the mode Projected. The popup has to say which
              # side of the flip it quoted or the two numbers are unattributable.
              "kind": row["kind"],
              "scenario": scenario, "period": period, "season": season,
              "rule": row.get("rule"),
              "stub": False})


@router.get("/projections/tiles/{variable}/{statistic}/{scenario}/{period}"
            "/{season}/{z}/{x}/{y}.png")
def projection_tile(variable: str, statistic: str, scenario: str, period: str,
                    season: str, z: int, x: int, y: int,
                    vmin: Optional[float] = Query(None, alias="min"),
                    vmax: Optional[float] = Query(None, alias="max"),
                    db: Session = Depends(get_db)):
    """Web-mercator PNG tile rendered from a projection COG.

    Shares `surface_store.render_tile` with the observational tiler — the
    reprojection, the nodata handling and the ramp interpolation are not worth
    having two of — and differs only in which table resolved the key and which
    table set the domain.
    """
    if not 0 <= z <= 14:
        raise HTTPException(422, "zoom out of range (0-14)")
    n_tiles = 2 ** z
    if not (0 <= x < n_tiles and 0 <= y < n_tiles):
        raise HTTPException(422, "tile index out of range for this zoom")

    try:
        row = projections.resolve(db, variable, statistic, scenario, period, season)
        lo, hi, ramp = projections.domain_for(variable, statistic, season)
    except projections.ProjectionNotFound as exc:
        raise HTTPException(404, str(exc)) from exc

    if vmin is not None:
        lo = float(vmin)
    if vmax is not None:
        hi = float(vmax)

    try:
        png = store.render_tile(row["s3_key"], z, x, y, ramp, lo, hi)
    except Exception as exc:                                       # noqa: BLE001
        logger.exception("projection tile render failed for %s", row["s3_key"])
        raise HTTPException(503, f"raster unreadable: {exc}") from exc

    return Response(
        content=png, media_type="image/png",
        headers={
            # A projection never changes once published — unlike a daily
            # surface, there is no D+2 revision — so it caches hard.
            "Cache-Control": "public, max-age=604800, immutable",
            "X-Surface-Kind": "projection",
            "X-Surface-Model-Version": row["model_version"],
        })
