# services/spray_coverage.py — Compute spray application-rate coverage from GPS + calibration
#
# Method (footprint accumulation, NOT field interpolation):
#   1. Resolve the spray asset + swath width (m) + calibrated flow rate (L/s).
#   2. Project the track + block to a local azimuthal-equidistant metric CRS
#      (centred on the block — generalises beyond NZ).
#   3. For each consecutive GPS pair within a segment (gap <= max_gap, speed in
#      band), buffer by swath/2 -> a band of width = swath, attributed with the
#      application rate  rate(L/ha) = flow_l_s * 36000 / (swath_m * speed_kmh).
#   4. Accumulate band rates onto a square grid, summing where passes overlap.
#   5. Keep only cells whose centroid falls inside the block. Skipped rows stay
#      as gaps (never interpolated across).
import logging
from collections import defaultdict
from decimal import Decimal
from datetime import datetime

from pyproj import Transformer
from shapely.geometry import LineString, Point, box, mapping
from shapely.ops import transform as shapely_transform, unary_union
from shapely.prepared import prep
from geoalchemy2.shape import from_shape, to_shape
from sqlalchemy.orm import Session

from db.models.task import Task
from db.models.task_gps_track import TaskGPSTrack
from db.models.block import VineyardBlock
from db.models.asset import Asset, TaskAsset, AssetCalibration, AssetCalibrationSpec
from db.models.spray_coverage import SprayCoverage

logger = logging.getLogger(__name__)

DEFAULT_CELL_SIZE_M = 2.0
DEFAULT_SPEED_BAND_KMH = (2.0, 20.0)   # exclude near-stationary creep + transit
MAX_CELLS = 200_000                     # guard against runaway grids

# Only these calibration types represent total boom/implement output (L/s) — the
# quantity the coverage model needs (paired with swath + speed). A generic
# `flow_rate` is per-nozzle (typically L/min) and would be silently misread as
# whole-sprayer output, so it is intentionally excluded.
SPRAY_FLOW_TYPES = ("spray_output_rate", "fert_output_rate")


def _flow_to_l_per_s(value, unit):
    """Normalise a calibrated output rate to litres/second. Returns None for
    units we cannot convert without a speed (e.g. an L/ha application rate)."""
    if value is None or unit is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    u = str(unit).strip().lower().replace(" ", "")
    if u in ("l/s", "ls", "lps", "l/sec", "litres/second", "liters/second"):
        return v
    if u in ("l/min", "lpm", "l/m", "litres/minute", "liters/minute"):
        return v / 60.0
    if u in ("l/hr", "l/h", "lph", "litres/hour", "liters/hour"):
        return v / 3600.0
    if u in ("ml/s", "ml/sec"):
        return v / 1000.0
    if u in ("ml/min",):
        return v / 60000.0
    return None


def _resolve_asset_flow(asset, db, ref_date=None, task_calibration_id=None):
    """Resolve an asset's flow rate to L/s. Priority (most to least authoritative):
      1. an explicitly task-linked calibration EVENT
      2. the most recent calibration EVENT on/before ref_date
      3. an active calibration SPEC whose target converts to a volumetric L/s
         (the new multi-spec config — arms coverage without a completed event)
      4. the asset's legacy inline calibration columns
    Returns (flow_l_s, rate_seen), where rate_seen is True if *a* rate value was
    found but couldn't be converted (e.g. an L/ha application rate) — to
    distinguish 'wrong unit' from 'no calibration at all'."""
    flow_l_s = None
    rate_seen = False
    cal = None
    if task_calibration_id:
        # An explicit task link wins, but only if it's an output-rate calibration.
        cal = (
            db.query(AssetCalibration)
            .filter(
                AssetCalibration.id == task_calibration_id,
                AssetCalibration.calibration_type.in_(SPRAY_FLOW_TYPES),
            )
            .first()
        )
    if cal is None:
        if ref_date is None:
            ref_date = datetime.utcnow().date()
        cal = (
            db.query(AssetCalibration)
            .filter(
                AssetCalibration.asset_id == asset.id,
                AssetCalibration.calibration_type.in_(SPRAY_FLOW_TYPES),
                AssetCalibration.calibration_date <= ref_date,
            )
            .order_by(AssetCalibration.calibration_date.desc())
            .first()
        )
    if cal is not None:
        raw_val = cal.measured_value if cal.measured_value is not None else cal.target_value
        if raw_val is not None:
            rate_seen = True
        flow_l_s = _flow_to_l_per_s(raw_val, cal.unit_of_measure)

    # No usable calibration event -> fall back to an active calibration SPEC's
    # target. A spec whose target converts to a volumetric L/s enables coverage
    # without first completing a measured calibration. Restricted to output-rate
    # spec types (a per-nozzle flow_rate is the wrong quantity).
    if flow_l_s is None:
        specs = (
            db.query(AssetCalibrationSpec)
            .filter(
                AssetCalibrationSpec.asset_id == asset.id,
                AssetCalibrationSpec.is_active == True,  # noqa: E712
                AssetCalibrationSpec.calibration_type.in_(SPRAY_FLOW_TYPES),
            )
            .all()
        )
        for spec in specs:
            if spec.target_value is not None:
                rate_seen = True
            converted = _flow_to_l_per_s(spec.target_value, spec.unit_of_measure)
            if converted is not None:
                flow_l_s = converted
                break

    # Final fallback: the legacy inline calibration columns — only when the
    # asset's inline calibration type is an output rate.
    if flow_l_s is None and asset.calibration_type in SPRAY_FLOW_TYPES:
        if asset.calibration_target_value is not None:
            rate_seen = True
        flow_l_s = _flow_to_l_per_s(asset.calibration_target_value, asset.calibration_unit_of_measure)
    return flow_l_s, rate_seen


def _evaluate_spray_inputs(task, db):
    """Shared resolver for both the compute path and the readiness diagnostic.

    Returns (inputs, missing, info):
      - inputs: (asset, swath_m, flow_l_s, target_lha, tol_min, tol_max) when the
        task has a swath-width asset + a flow rate resolvable to L/s, else None.
      - missing: list of machine codes explaining why inputs is None
        ('asset_swath' | 'flow_calibration' | 'flow_unit').
      - info: diagnostic fields (asset summary, flow_l_s, target_lha) — populated
        as far as resolution got, for surfacing in the UI.
    """
    missing = []
    info = {"asset": None, "flow_l_s": None, "target_lha": None}

    task_assets = db.query(TaskAsset).filter(TaskAsset.task_id == task.id).all()
    chosen = None
    for ta in task_assets:
        a = ta.asset
        if a and a.swath_width_m is not None and float(a.swath_width_m) > 0:
            if ta.role == "primary":
                chosen = ta
                break
            if chosen is None:
                chosen = ta
    if chosen is None:
        missing.append("asset_swath")
        return None, missing, info

    asset = chosen.asset
    swath_m = float(asset.swath_width_m)
    info["asset"] = {"id": asset.id, "name": asset.name, "swath_width_m": swath_m}

    # Flow rate -> L/s (shared resolver; task usage's linked calibration wins,
    # then latest calibration on/before the task date, then the asset inline spec).
    ref_dt = task.actual_end_time or task.actual_start_time or datetime.utcnow()
    ref_date = ref_dt.date() if hasattr(ref_dt, "date") else ref_dt
    flow_l_s, rate_seen = _resolve_asset_flow(
        asset, db, ref_date=ref_date, task_calibration_id=chosen.calibration_id
    )
    if flow_l_s is None or flow_l_s <= 0:
        # A rate exists but isn't a volumetric flow (e.g. L/ha) -> 'flow_unit';
        # nothing recorded at all -> 'flow_calibration'.
        missing.append("flow_unit" if rate_seen else "flow_calibration")
        return None, missing, info

    info["flow_l_s"] = flow_l_s

    # Target application rate (L/ha) for tolerance shading — best-effort from the
    # planned rate on the task asset; ±10% band.
    target_lha = float(chosen.planned_rate) if chosen.planned_rate is not None else None
    tol_min = target_lha * 0.9 if target_lha else None
    tol_max = target_lha * 1.1 if target_lha else None
    info["target_lha"] = target_lha
    return (asset, swath_m, flow_l_s, target_lha, tol_min, tol_max), missing, info


def _resolve_spray_inputs(task, db):
    """Return (asset, swath_m, flow_l_s, target_lha, tol_min, tol_max) or None
    if the task isn't spray-capable (no asset with swath + resolvable flow)."""
    inputs, _missing, _info = _evaluate_spray_inputs(task, db)
    return inputs


def assess_spray_readiness(task, db):
    """Non-mutating diagnostic: would completing this task produce a spray
    coverage raster, and if not, what's missing? Mirrors the preconditions in
    compute_spray_coverage so the web UI can flag gaps before a tester walks away.

    `missing` codes: 'asset_swath', 'flow_calibration', 'flow_unit', 'block',
    'block_geometry', 'gps_track'.

    `config_ready` = asset + flow + block + geometry are configured, independent
    of the GPS track (which only exists after the task runs). `capable` =
    config_ready AND a usable track (>=2 points) is already present.
    """
    inputs, missing, info = _evaluate_spray_inputs(task, db)
    missing = list(missing)

    if not task.block_id:
        missing.append("block")
    else:
        block = db.query(VineyardBlock).filter(VineyardBlock.id == task.block_id).first()
        if not block or block.geometry is None:
            missing.append("block_geometry")

    # config-level readiness is judged before the runtime GPS check
    config_ready = len(missing) == 0

    gps_points = db.query(TaskGPSTrack).filter(TaskGPSTrack.task_id == task.id).count()
    has_gps = gps_points >= 2
    if not has_gps:
        missing.append("gps_track")

    return {
        "config_ready": config_ready,
        "capable": config_ready and has_gps,
        "missing": missing,
        "has_gps": has_gps,
        "gps_points": gps_points,
        "asset": info["asset"],
        "flow_l_s": info["flow_l_s"],
        "target_lha": info["target_lha"],
    }


def assess_asset_spray_capability(asset, db):
    """Asset-level pre-check for the task wizard, where no task (and no GPS track)
    exists yet. Does this asset have a swath width + a flow rate resolvable to L/s?
    Mirrors the asset portion of compute_spray_coverage's preconditions — the block
    and GPS-track checks are known client-side at task-creation time.

    `missing` codes: 'asset_swath', 'flow_calibration', 'flow_unit'.
    """
    swath = asset.swath_width_m
    has_swath = swath is not None and float(swath) > 0
    flow_l_s, rate_seen = _resolve_asset_flow(asset, db)
    has_flow = flow_l_s is not None and flow_l_s > 0

    missing = []
    if not has_swath:
        missing.append("asset_swath")
    if not has_flow:
        missing.append("flow_unit" if rate_seen else "flow_calibration")

    return {
        "asset_id": asset.id,
        "spray_capable": has_swath and has_flow,
        "has_swath": has_swath,
        "swath_width_m": float(swath) if has_swath else None,
        "has_flow": has_flow,
        "flow_l_s": flow_l_s,
        "missing": missing,
    }


def _dec(x, places):
    if x is None:
        return None
    return Decimal(str(round(float(x), places)))


def _build_swaths(points, swath_m, flow_l_s, speed_band, max_gap_m, to_m):
    """Buffer each in-band GPS segment by swath/2 in the given metric projection.
    Returns (swaths, rates) — rates is application rate (L/ha) per band."""
    half = swath_m / 2.0
    smin, smax = speed_band
    segments = defaultdict(list)
    for p in points:
        segments[p.segment_id].append(p)

    swaths, rates = [], []
    for seg_id in sorted(segments.keys()):
        sp = segments[seg_id]
        coords_m = [to_m(float(p.longitude), float(p.latitude)) for p in sp]
        for i in range(1, len(sp)):
            x0, y0 = coords_m[i - 1]
            x1, y1 = coords_m[i]
            seg_len = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
            if seg_len == 0 or seg_len > max_gap_m:
                continue
            s_prev = float(sp[i - 1].speed) if sp[i - 1].speed is not None else 0.0
            s_cur = float(sp[i].speed) if sp[i].speed is not None else 0.0
            speed_kmh = (s_prev + s_cur) / 2.0
            if speed_kmh < smin or speed_kmh > smax:
                continue
            rate = flow_l_s * 36000.0 / (swath_m * speed_kmh)
            band = LineString([(x0, y0), (x1, y1)]).buffer(half, cap_style=2, join_style=1)
            if not band.is_empty:
                swaths.append(band)
                rates.append(rate)
    return swaths, rates


def compute_spray_coverage(task_id, db: Session, block_id=None, persist=True,
                           cell_size_m=DEFAULT_CELL_SIZE_M,
                           speed_band=DEFAULT_SPEED_BAND_KMH,
                           max_gap_m=None, points_task_id=None, source_task_id=None):
    """Compute (and by default persist) spray coverage for a task within one
    block. Returns the SprayCoverage row, or None if the task isn't spray-capable
    / has no usable track / block. Safe to call unconditionally on completion.

    points_task_id: read GPS points from this task instead of task_id — used for
      multi-block clones, whose coverage row attaches to the clone (task_id) but
      whose track lives on the origin run (points_task_id).
    source_task_id: stamp the coverage's origin run (clone lineage)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return None

    target_block_id = block_id or task.block_id
    if not target_block_id:
        logger.info(f"Spray coverage: task {task_id} has no block; skipping")
        return None

    inputs = _resolve_spray_inputs(task, db)
    if not inputs:
        logger.info(f"Spray coverage: task {task_id} not spray-capable (no swath/flow); skipping")
        return None
    asset, swath_m, flow_l_s, target_lha, tol_min, tol_max = inputs

    block = db.query(VineyardBlock).filter(VineyardBlock.id == target_block_id).first()
    if not block or block.geometry is None:
        logger.info(f"Spray coverage: block {target_block_id} has no geometry; skipping")
        return None
    block_shape = to_shape(block.geometry)
    if block_shape.is_empty:
        return None

    gps_task_id = points_task_id or task_id
    points = (
        db.query(TaskGPSTrack)
        .filter(TaskGPSTrack.task_id == gps_task_id)
        .order_by(TaskGPSTrack.timestamp)
        .all()
    )
    if len(points) < 2:
        logger.info(f"Spray coverage: task {gps_task_id} has <2 GPS points; skipping")
        return None

    # Local metric projection centred on the block centroid.
    c = block_shape.centroid
    proj = f"+proj=aeqd +lat_0={c.y} +lon_0={c.x} +datum=WGS84 +units=m +no_defs"
    to_m = Transformer.from_crs("EPSG:4326", proj, always_xy=True).transform
    to_wgs = Transformer.from_crs(proj, "EPSG:4326", always_xy=True).transform

    block_m = shapely_transform(to_m, block_shape)
    block_area_ha = block_m.area / 10000.0

    if max_gap_m is None:
        max_gap_m = max(swath_m * 2.0, 6.0)

    swaths, rates = _build_swaths(points, swath_m, flow_l_s, speed_band, max_gap_m, to_m)
    if not swaths:
        logger.info(f"Spray coverage: task {task_id} produced no in-band swaths; skipping")
        return None

    # --- Accumulate onto a square grid over the block bbox ---
    minx, miny, maxx, maxy = block_m.bounds
    cs = float(cell_size_m)
    nx = int((maxx - minx) / cs) + 1
    ny = int((maxy - miny) / cs) + 1
    while nx * ny > MAX_CELLS:
        cs *= 1.5
        nx = int((maxx - minx) / cs) + 1
        ny = int((maxy - miny) / cs) + 1
    cell_area_ha = (cs * cs) / 10000.0

    grid = {}  # (ix, iy) -> [rate_sum, passes]
    for band, rate in zip(swaths, rates):
        bminx, bminy, bmaxx, bmaxy = band.bounds
        ix0 = max(0, int((bminx - minx) / cs))
        ix1 = min(nx - 1, int((bmaxx - minx) / cs))
        iy0 = max(0, int((bminy - miny) / cs))
        iy1 = min(ny - 1, int((bmaxy - miny) / cs))
        pband = prep(band)
        for ix in range(ix0, ix1 + 1):
            ccx = minx + ix * cs + cs / 2.0
            for iy in range(iy0, iy1 + 1):
                ccy = miny + iy * cs + cs / 2.0
                if pband.contains(Point(ccx, ccy)):
                    key = (ix, iy)
                    cell = grid.get(key)
                    if cell is None:
                        grid[key] = [rate, 1]
                    else:
                        cell[0] += rate
                        cell[1] += 1

    # --- Clip to block + build features + stats ---
    prep_block = prep(block_m)
    features = []
    covered_cells = overlap_cells = in_tol_cells = 0
    total_rate = volume_l = 0.0
    min_rate = max_rate = None

    for (ix, iy), (rate_sum, passes) in grid.items():
        cx0 = minx + ix * cs
        cy0 = miny + iy * cs
        if not prep_block.contains(Point(cx0 + cs / 2.0, cy0 + cs / 2.0)):
            continue
        covered_cells += 1
        if passes >= 2:
            overlap_cells += 1
        total_rate += rate_sum
        volume_l += rate_sum * cell_area_ha
        min_rate = rate_sum if min_rate is None else min(min_rate, rate_sum)
        max_rate = rate_sum if max_rate is None else max(max_rate, rate_sum)
        if tol_min is not None and tol_max is not None and tol_min <= rate_sum <= tol_max:
            in_tol_cells += 1
        cell_wgs = shapely_transform(to_wgs, box(cx0, cy0, cx0 + cs, cy0 + cs))
        features.append({
            "type": "Feature",
            "geometry": mapping(cell_wgs),
            "properties": {"rate_lha": round(rate_sum, 1), "passes": passes},
        })

    if covered_cells == 0:
        logger.info(f"Spray coverage: task {task_id} had no cells inside block {target_block_id}; skipping")
        return None

    sprayed_area_ha = covered_cells * cell_area_ha
    overlap_area_ha = overlap_cells * cell_area_ha
    gap_area_ha = max(block_area_ha - sprayed_area_ha, 0.0)
    avg_rate = total_rate / covered_cells
    pct_in_tol = (in_tol_cells / covered_cells * 100.0) if (tol_min is not None) else None

    # Dissolved footprint (metric -> wgs), clipped to block — for map extent.
    footprint_wgs = None
    try:
        footprint_m = unary_union(swaths).intersection(block_m)
        if not footprint_m.is_empty:
            footprint_wgs = shapely_transform(to_wgs, footprint_m)
    except Exception as e:
        logger.warning(f"Spray coverage footprint union failed for task {task_id}: {e}")

    # --- Upsert ---
    cov = (
        db.query(SprayCoverage)
        .filter(SprayCoverage.task_id == task_id, SprayCoverage.block_id == target_block_id)
        .first()
    )
    if not cov:
        cov = SprayCoverage(task_id=task_id, block_id=target_block_id, company_id=task.company_id)
        db.add(cov)

    cov.company_id = task.company_id
    cov.asset_id = asset.id
    cov.source_task_id = (
        source_task_id if source_task_id is not None
        else (task.id if (block_id and block_id != task.block_id) else None)
    )

    cov.swath_m = _dec(swath_m, 2)
    cov.flow_l_s = _dec(flow_l_s, 4)
    cov.target_lha = _dec(target_lha, 4)
    cov.tolerance_min_lha = _dec(tol_min, 4)
    cov.tolerance_max_lha = _dec(tol_max, 4)
    cov.cell_size_m = _dec(cs, 1)
    cov.speed_band_min_kmh = _dec(speed_band[0], 2)
    cov.speed_band_max_kmh = _dec(speed_band[1], 2)
    cov.max_gap_m = _dec(max_gap_m, 1)

    cov.sprayed_area_hectares = _dec(sprayed_area_ha, 4)
    cov.block_area_hectares = _dec(block_area_ha, 4)
    cov.gap_area_hectares = _dec(gap_area_ha, 4)
    cov.overlap_area_hectares = _dec(overlap_area_ha, 4)
    cov.computed_volume_l = _dec(volume_l, 2)
    cov.min_lha = _dec(min_rate, 2)
    cov.avg_lha = _dec(avg_rate, 2)
    cov.max_lha = _dec(max_rate, 2)
    cov.pct_within_tolerance = _dec(pct_in_tol, 2)

    cov.grid_geojson = {"type": "FeatureCollection", "features": features}
    cov.footprint_geometry = from_shape(footprint_wgs, srid=4326) if footprint_wgs else None
    cov.computed_at = datetime.utcnow()

    if persist:
        db.commit()
        db.refresh(cov)

    logger.info(
        f"Spray coverage task {task_id} block {target_block_id}: "
        f"{covered_cells} cells, {round(sprayed_area_ha,3)}ha sprayed, "
        f"avg {round(avg_rate,1)} L/ha, {overlap_cells} overlap cells"
    )
    return cov


def detect_spray_blocks(task_id, db: Session, min_area_m2=300.0, min_pct=3.0,
                        speed_band=DEFAULT_SPEED_BAND_KMH, max_gap_m=None):
    """Detect company blocks OTHER than the task's assigned block that this
    task's GPS track sprayed, by intersecting the swath footprint with each
    block. Returns candidate dicts for the confirm step (no persistence). A
    clone task has no GPS of its own, so calling this on a clone returns []."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return []
    inputs = _resolve_spray_inputs(task, db)
    if not inputs:
        return []
    asset, swath_m, flow_l_s = inputs[0], inputs[1], inputs[2]

    points = (
        db.query(TaskGPSTrack)
        .filter(TaskGPSTrack.task_id == task_id)
        .order_by(TaskGPSTrack.timestamp)
        .all()
    )
    if len(points) < 2:
        return []

    # Track-centred metric projection (not tied to one block).
    cx = sum(float(p.longitude) for p in points) / len(points)
    cy = sum(float(p.latitude) for p in points) / len(points)
    proj = f"+proj=aeqd +lat_0={cy} +lon_0={cx} +datum=WGS84 +units=m +no_defs"
    to_m = Transformer.from_crs("EPSG:4326", proj, always_xy=True).transform

    if max_gap_m is None:
        max_gap_m = max(swath_m * 2.0, 6.0)
    swaths, _ = _build_swaths(points, swath_m, flow_l_s, speed_band, max_gap_m, to_m)
    if not swaths:
        return []
    footprint = unary_union(swaths)
    if footprint.is_empty:
        return []
    prep_fp = prep(footprint)

    # Blocks already cloned for this origin task (so the UI can mark them done).
    cloned_block_ids = {
        bid for (bid,) in db.query(Task.block_id).filter(Task.source_task_id == task_id).all()
    }

    blocks = (
        db.query(VineyardBlock)
        .filter(
            VineyardBlock.company_id == task.company_id,
            VineyardBlock.id != task.block_id,
            VineyardBlock.geometry.isnot(None),
        )
        .all()
    )

    candidates = []
    for b in blocks:
        try:
            b_shape = to_shape(b.geometry)
            if b_shape.is_empty:
                continue
            b_m = shapely_transform(to_m, b_shape)
            if not prep_fp.intersects(b_m):
                continue
            inter = footprint.intersection(b_m)
            if inter.is_empty:
                continue
            covered_m2 = inter.area
            block_m2 = b_m.area
            pct = (covered_m2 / block_m2 * 100.0) if block_m2 else 0.0
            if covered_m2 < min_area_m2 or pct < min_pct:
                continue
            candidates.append({
                "block_id": b.id,
                "block_name": b.block_name,
                "property_id": b.property_id,
                "covered_area_hectares": round(covered_m2 / 10000.0, 4),
                "block_area_hectares": round(block_m2 / 10000.0, 4),
                "pct": round(pct, 1),
                "already_confirmed": b.id in cloned_block_ids,
            })
        except Exception as e:
            logger.warning(f"detect_spray_blocks: block {b.id} intersect failed: {e}")

    candidates.sort(key=lambda c: c["covered_area_hectares"], reverse=True)
    return candidates
