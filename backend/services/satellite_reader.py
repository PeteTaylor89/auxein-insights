"""Sentinel-2 L2A per-area index statistics, read from Planetary Computer.

The pure half of the satellite ingest (Phase 2 of the satellite indices plan):
STAC search, read planning, windowed COG reads, masking and per-area statistics.
No database code lives here - `scripts/satellite_ingest.py` owns the writes -
so everything below can be tested without a connection.

Settings come from the Phase 0 spike (`scratchpad/satellite_spike/results.md`):

* **Clear = scene classification 4, 5, 6, 7.** Cloud (8, 9), cirrus (10),
  cloud shadow (3), dark/topographic shadow (2), snow (11), saturated (1) and
  nodata (0) are masked.
* **Pixel-centre inside a buffered outline.** Outlines shrink inward before
  rasterising (5 m for vineyards, 10 m otherwise) so edge pixels do not pick up
  roads, shelter belts or the neighbouring block. Measured masks matched the
  geodesic block area less the buffer to within 1-2 %.
* **Offset by processing baseline, never by date.** Baseline 04.00+ products
  carry BOA_ADD_OFFSET = -1000. Planetary Computer has reprocessed pre-2022
  scenes to 05.x, so a date rule would be wrong for exactly those scenes.
* **NDVI at 10 m; NDMI and NDRE at 20 m**, each on its native grid with its own
  mask - SCL is 20 m and is repeated 2x2 onto the 10 m grid.

No third-party HTTP or STAC client: stdlib `urllib` plus rasterio, which is
what the job image already carries (`deploy/surfaces/requirements.txt`).
"""
from __future__ import annotations

import json
import math
import os
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np

STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SAS_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a"
COLLECTION = "sentinel-2-l2a"
NZ = ZoneInfo("Pacific/Auckland")

CLEAR_SCL = (4, 5, 6, 7)
SCL_COUNTS = {"n_cloud": (8, 9), "n_shadow": (3,), "n_cirrus": (10,), "n_snow": (11,)}
INNER_BUFFER_M = {"vineyard": 5.0}
DEFAULT_INNER_BUFFER_M = 10.0
MAX_SCENE_CLOUD = 80        # scene-level prefilter only; the per-area mask decides
CELL_DEG = 0.1              # read-cell size; bounds memory per window (~1 Mpx at 10 m)
WINDOW_PAD_M = 40.0

INDICES_10 = ("ndvi",)
INDICES_20 = ("ndmi", "ndre")
STATS = ("mean", "p10", "p50", "p90", "sd")
BANDS = ("B04", "B08", "B05", "B8A", "B11")

# GDAL /vsicurl/ behaviour for Azure blob COGs. Set before rasterio opens anything.
#
# The timeouts are not optional. GDAL's default is to wait forever, and on
# 2026-09-24 five of eight backfill shards hung inside ~6 minutes of each other
# on connections that went silent without closing, with the database and
# Planetary Computer both healthy. A hung read never raises, so its window never
# finishes and the task never exits. With these, a stalled read fails, the scene
# is left unstamped and the next run retries it. Each request is one COG range
# read of a few hundred KB, so 60 s total and 30 s under 1 KB/s are generous.
for _k, _v in {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "GDAL_HTTP_MULTIPLEX": "YES",
               "GDAL_HTTP_MAX_RETRY": "5", "GDAL_HTTP_RETRY_DELAY": "2",
               "GDAL_HTTP_CONNECTTIMEOUT": "30", "GDAL_HTTP_TIMEOUT": "60",
               "GDAL_HTTP_LOW_SPEED_TIME": "30", "GDAL_HTTP_LOW_SPEED_LIMIT": "1024",
               "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif"}.items():
    os.environ.setdefault(_k, _v)


# --------------------------------------------------------------------------- http
def http_json(url: str, body: dict | None = None, tries: int = 6) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data, {"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001 - STAC and SAS are retried on anything transient
            if i == tries - 1:
                raise
            time.sleep(2 ** i)
    raise RuntimeError("unreachable")


class SasToken:
    """Planetary Computer SAS token for the Sentinel-2 container, refreshed early."""

    def __init__(self, max_age_s: int = 30 * 60):
        self._lock = threading.Lock()
        self._token: str | None = None
        self._at = 0.0
        self._max_age = max_age_s

    def get(self) -> str:
        with self._lock:
            if self._token is None or time.time() - self._at > self._max_age:
                self._token = http_json(SAS_TOKEN)["token"]
                self._at = time.time()
            return self._token


def stac_search(bbox: list[float], start: str, end: str,
                max_cloud: float = MAX_SCENE_CLOUD) -> list[dict]:
    """All Sentinel-2 L2A items over bbox in [start, end], following paging."""
    body = {"collections": [COLLECTION], "bbox": bbox, "datetime": f"{start}/{end}",
            "limit": 500, "query": {"eo:cloud_cover": {"lt": max_cloud}},
            "sortby": [{"field": "datetime", "direction": "asc"}]}
    items, url = [], STAC_SEARCH
    while True:
        fc = http_json(url, body)
        items += fc["features"]
        nxt = next((ln for ln in fc.get("links", []) if ln.get("rel") == "next"), None)
        if not nxt:
            return items
        url, body = nxt["href"], nxt.get("body", body)


# --------------------------------------------------------------------------- scenes
def boa_offset(baseline: str | None) -> int:
    """-1000 for processing baseline 04.00 and later, else 0."""
    try:
        return -1000 if float(baseline) >= 4.0 else 0
    except (TypeError, ValueError):
        return 0


def relative_orbit(item: dict) -> int | None:
    ro = item["properties"].get("sat:relative_orbit")
    if ro is not None:
        return int(ro)
    part = next((p for p in item["id"].split("_") if p.startswith("R") and p[1:].isdigit()), None)
    return int(part[1:]) if part else None


def scene_row(item: dict) -> dict:
    """The `sat_scene` row for an item (processed_at is the writer's business)."""
    p = item["properties"]
    return {"item_id": item["id"], "collection": COLLECTION,
            "acquired_at": p["datetime"], "mgrs_tile": p.get("s2:mgrs_tile"),
            "relative_orbit": relative_orbit(item), "platform": p.get("platform"),
            "processing_baseline": p.get("s2:processing_baseline"),
            "boa_offset": boa_offset(p.get("s2:processing_baseline")),
            "epsg": p.get("proj:epsg"), "cloud_cover": p.get("eo:cloud_cover")}


def nz_date(item: dict):
    dt = datetime.fromisoformat(item["properties"]["datetime"].replace("Z", "+00:00"))
    return dt.astimezone(NZ).date()


# --------------------------------------------------------------------------- areas + cells
@dataclass
class Area:
    id: int
    geom: object            # shapely geometry, EPSG:4326
    geom_hash: str
    land_use: str = "vineyard"

    @property
    def inner_buffer_m(self) -> float:
        return INNER_BUFFER_M.get(self.land_use, DEFAULT_INNER_BUFFER_M)


@dataclass
class Cell:
    """Areas read together through one window. Keyed on the area centroid's
    0.1-degree grid square, so the key is stable across runs."""
    key: str
    areas: list[Area] = field(default_factory=list)

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        b = np.array([a.geom.bounds for a in self.areas])
        return b[:, 0].min(), b[:, 1].min(), b[:, 2].max(), b[:, 3].max()


def build_cells(areas: list[Area], cell_deg: float = CELL_DEG) -> list[Cell]:
    cells: dict[str, Cell] = {}
    for a in areas:
        c = a.geom.centroid
        key = f"{math.floor(c.x / cell_deg)}_{math.floor(c.y / cell_deg)}"
        cells.setdefault(key, Cell(key)).areas.append(a)
    return sorted(cells.values(), key=lambda c: c.key)


def plan_reads(items: list[dict], cells: list[Cell]) -> dict[str, list[Cell]]:
    """Which cells to read from which item.

    One acquisition appears once per MGRS tile it touches, and adjacent tiles
    overlap by ~10 km, so a naive plan reads an area in the overlap twice. For
    each cell and acquisition (platform + datatake), if one item's footprint
    contains the whole cell, only that item reads it (smallest id wins, so the
    plan is deterministic across runs and shards). If none contains it, the
    cell straddles a tile edge and every intersecting item reads it; the
    duplicate rows are de-duplicated by date downstream.
    """
    from shapely.geometry import box, shape

    groups: dict[tuple, list[tuple[dict, object]]] = {}
    for it in items:
        p = it["properties"]
        gkey = (p.get("platform"), p.get("s2:datatake_id") or p["datetime"])
        groups.setdefault(gkey, []).append((it, shape(it["geometry"])))

    plan: dict[str, list[Cell]] = {}
    for members in groups.values():
        members.sort(key=lambda m: m[0]["id"])
        for cell in cells:
            cb = box(*cell.bounds)
            hits = [(it, fp) for it, fp in members if fp.intersects(cb)]
            if not hits:
                continue
            full = [it for it, fp in hits if fp.contains(cb)]
            for it in (full[:1] if full else [it for it, _ in hits]):
                plan.setdefault(it["id"], []).append(cell)
    return plan


# --------------------------------------------------------------------------- reads
def _read(href: str, bounds):
    import rasterio
    from rasterio.windows import from_bounds
    with rasterio.open(href) as src:
        win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        arr = src.read(1, window=win, boundless=True, fill_value=0)
        return arr, src.window_transform(win)


def summarise(values: np.ndarray) -> dict[str, float | None]:
    if values.size == 0:
        return {s: None for s in STATS}
    p10, p50, p90 = np.percentile(values, [10, 50, 90])
    return {"mean": float(values.mean()), "p10": float(p10), "p50": float(p50),
            "p90": float(p90), "sd": float(values.std())}


def area_mask(geom_utm, transform, shape) -> tuple[tuple[slice, slice], np.ndarray] | None:
    """Pixel-centre mask for one outline, computed over the outline's own
    sub-window only - rasterising hundreds of areas over the full cell window
    would cost a full-window boolean array each."""
    from rasterio.features import geometry_mask
    from rasterio.transform import rowcol
    from rasterio.windows import Window, transform as win_transform

    if geom_utm.is_empty:
        return None
    minx, miny, maxx, maxy = geom_utm.bounds
    r0, c0 = rowcol(transform, minx, maxy, op=math.floor)
    r1, c1 = rowcol(transform, maxx, miny, op=math.floor)
    r0, c0 = max(r0, 0), max(c0, 0)
    r1, c1 = min(r1 + 1, shape[0]), min(c1 + 1, shape[1])
    if r1 <= r0 or c1 <= c0:
        return None
    sub = win_transform(Window(c0, r0, c1 - c0, r1 - r0), transform)
    inside = ~geometry_mask([geom_utm.__geo_interface__], out_shape=(r1 - r0, c1 - c0),
                            transform=sub, all_touched=False)
    return (slice(r0, r1), slice(c0, c1)), inside


def compute_indices(bands: dict[str, np.ndarray], offset: int):
    """Reflectance = (DN + offset) / 10000, DN 0 is nodata."""
    def refl(a):
        return np.where(a == 0, np.nan, (a.astype("float32") + offset) / 10000.0)

    red, nir = refl(bands["B04"]), refl(bands["B08"])
    re1, nir20, swir = refl(bands["B05"]), refl(bands["B8A"]), refl(bands["B11"])
    with np.errstate(divide="ignore", invalid="ignore"):
        idx10 = {"ndvi": (nir - red) / (nir + red)}
        idx20 = {"ndmi": (nir20 - swir) / (nir20 + swir),
                 "ndre": (nir20 - re1) / (nir20 + re1)}
    return idx10, idx20


def area_stats(area_geom_utm, t10, idx10, clear10, t20, idx20, clear20, scl20) -> dict | None:
    """Per-area row values, or None when nothing inside the area was clear."""
    row: dict = {}
    for res, trans, idx, clear in ((10, t10, idx10, clear10), (20, t20, idx20, clear20)):
        shape = next(iter(idx.values())).shape
        m = area_mask(area_geom_utm, trans, shape)
        if m is None:
            row[f"n_total_{res}"] = row[f"n_valid_{res}"] = 0
            for name in idx:
                row.update({f"{name}_{s}": None for s in STATS})
            continue
        sl, inside = m
        ok = inside & clear[sl]
        row[f"n_total_{res}"] = int(inside.sum())
        row[f"n_valid_{res}"] = int(ok.sum())
        for name, arr in idx.items():
            sub = arr[sl]
            good = ok & np.isfinite(sub)
            row.update({f"{name}_{s}": v for s, v in summarise(sub[good]).items()})
        if res == 20:
            vals = scl20[sl][inside]
            for col, classes in SCL_COUNTS.items():
                row[col] = int(np.isin(vals, classes).sum())
    if row["n_valid_10"] == 0 and row["n_valid_20"] == 0:
        return None
    return row


def read_cell(item: dict, cell: Cell, token: SasToken) -> list[dict]:
    """Observation rows for every area in `cell` from one item."""
    from pyproj import Transformer
    from shapely.ops import transform as shp_transform

    p = item["properties"]
    epsg = p["proj:epsg"]
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True).transform
    geoms = {a.id: shp_transform(to_utm, a.geom).buffer(-a.inner_buffer_m) for a in cell.areas}
    utm_bounds = np.array([shp_transform(to_utm, a.geom).bounds for a in cell.areas])
    bounds = (utm_bounds[:, 0].min() - WINDOW_PAD_M, utm_bounds[:, 1].min() - WINDOW_PAD_M,
              utm_bounds[:, 2].max() + WINDOW_PAD_M, utm_bounds[:, 3].max() + WINDOW_PAD_M)

    tok = token.get()

    def href(band):
        return f"{item['assets'][band]['href']}?{tok}"

    scl20, t20 = _read(href("SCL"), bounds)
    if scl20.size == 0 or not np.isin(scl20, CLEAR_SCL).any():
        return []   # nothing clear anywhere in the window: skip the band reads

    bands = {}
    for b in BANDS:
        bands[b], tb = _read(href(b), bounds)
        if b == "B04":
            t10 = tb
    idx10, idx20 = compute_indices(bands, boa_offset(p.get("s2:processing_baseline")))

    shape10 = idx10["ndvi"].shape
    scl10 = np.repeat(np.repeat(scl20, 2, axis=0), 2, axis=1)[: shape10[0], : shape10[1]]
    if scl10.shape != shape10:
        scl10 = np.pad(scl10, [(0, shape10[0] - scl10.shape[0]), (0, shape10[1] - scl10.shape[1])])
    clear10, clear20 = np.isin(scl10, CLEAR_SCL), np.isin(scl20, CLEAR_SCL)

    obs_date = nz_date(item)
    rows = []
    for a in cell.areas:
        vals = area_stats(geoms[a.id], t10, idx10, clear10, t20, idx20, clear20, scl20)
        if vals is not None:
            rows.append({"area_id": a.id, "item_id": item["id"], "obs_date": obs_date,
                         "geom_hash": a.geom_hash, **vals})
    return rows
