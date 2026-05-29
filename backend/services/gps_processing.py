# services/gps_processing.py — Process GPS breadcrumbs into summary geometry + stats
import logging
from collections import defaultdict
from decimal import Decimal
from datetime import datetime

from pyproj import Geod
from shapely.geometry import LineString, MultiLineString, MultiPoint, mapping
from shapely.ops import transform
from geoalchemy2.shape import from_shape, to_shape
from sqlalchemy.orm import Session

from db.models.task import Task
from db.models.task_gps_track import TaskGPSTrack
from db.models.task_gps_summary import TaskGPSSummary
from db.models.block import VineyardBlock

logger = logging.getLogger(__name__)

GEOD = Geod(ellps="WGS84")
STATIONARY_THRESHOLD_KMH = 0.5  # Below this = stationary


def process_gps_track(task_id: int, db: Session) -> TaskGPSSummary | None:
    """
    Process all GPS breadcrumbs for a task into a summary row.
    Called on GPS stop and task completion.
    Returns the created/updated summary, or None if no points exist.
    """
    # Load all breadcrumbs ordered by timestamp
    points = (
        db.query(TaskGPSTrack)
        .filter(TaskGPSTrack.task_id == task_id)
        .order_by(TaskGPSTrack.timestamp)
        .all()
    )

    if not points:
        logger.info(f"No GPS points for task {task_id}, skipping summary")
        return None

    # Load the task for context
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        logger.warning(f"Task {task_id} not found")
        return None

    logger.info(f"Processing {len(points)} GPS points for task {task_id}")

    # --- Group by segment ---
    segments = defaultdict(list)
    for p in points:
        segments[p.segment_id].append(p)

    # --- Build LineStrings per segment ---
    linestrings = []
    for seg_id in sorted(segments.keys()):
        seg_points = segments[seg_id]
        if len(seg_points) < 2:
            continue
        coords = [(float(p.longitude), float(p.latitude)) for p in seg_points]
        linestrings.append(LineString(coords))

    # --- Track geometry ---
    track_geom = None
    if linestrings:
        track_geom = MultiLineString(linestrings) if len(linestrings) > 1 else MultiLineString([linestrings[0]])

    # --- Distance (geodesic) ---
    total_distance_m = Decimal("0")
    for ls in linestrings:
        length = GEOD.geometry_length(ls)
        total_distance_m += Decimal(str(round(length, 2)))
    total_distance_km = total_distance_m / Decimal("1000")

    # --- Duration ---
    first_ts = points[0].timestamp
    last_ts = points[-1].timestamp
    total_duration_sec = (last_ts - first_ts).total_seconds()
    total_duration_min = int(total_duration_sec / 60)

    # Active duration = sum of per-segment durations (excludes pauses between segments)
    active_duration_sec = 0
    for seg_points in segments.values():
        if len(seg_points) >= 2:
            seg_start = seg_points[0].timestamp
            seg_end = seg_points[-1].timestamp
            active_duration_sec += (seg_end - seg_start).total_seconds()
    active_duration_min = int(active_duration_sec / 60)

    # --- Speed stats ---
    speeds = [float(p.speed) for p in points if p.speed is not None]
    moving_speeds = [s for s in speeds if s >= STATIONARY_THRESHOLD_KMH]

    avg_speed = Decimal(str(round(sum(moving_speeds) / len(moving_speeds), 2))) if moving_speeds else None
    max_speed = Decimal(str(round(max(speeds), 2))) if speeds else None

    # Estimate stationary vs moving time from point intervals
    stationary_sec = 0
    moving_sec = 0
    for seg_points in segments.values():
        for i in range(1, len(seg_points)):
            interval = (seg_points[i].timestamp - seg_points[i - 1].timestamp).total_seconds()
            speed = float(seg_points[i].speed) if seg_points[i].speed is not None else 0
            if speed < STATIONARY_THRESHOLD_KMH:
                stationary_sec += interval
            else:
                moving_sec += interval
    time_stationary_min = int(stationary_sec / 60)
    time_moving_min = int(moving_sec / 60)

    # --- Coverage geometry ---
    all_coords = [(float(p.longitude), float(p.latitude)) for p in points]
    coverage_geom = None
    coverage_ha = None
    block_ha = None
    coverage_pct = None

    if len(all_coords) >= 3:
        hull = MultiPoint(all_coords).convex_hull
        if hull.geom_type == 'Polygon':
            # Clip to block polygon if available
            if task.block_id:
                block = db.query(VineyardBlock).filter(VineyardBlock.id == task.block_id).first()
                if block and block.geometry:
                    try:
                        block_shape = to_shape(block.geometry)
                        clipped = hull.intersection(block_shape)
                        if not clipped.is_empty and clipped.geom_type == 'Polygon':
                            coverage_geom = clipped
                        else:
                            coverage_geom = hull
                        block_area_m2, _ = GEOD.geometry_area_perimeter(block_shape)
                        block_ha = Decimal(str(round(abs(block_area_m2) / 10000, 4)))
                    except Exception as e:
                        logger.warning(f"Block geometry intersection failed: {e}")
                        coverage_geom = hull
                else:
                    coverage_geom = hull
            else:
                coverage_geom = hull

            if coverage_geom:
                area_m2, _ = GEOD.geometry_area_perimeter(coverage_geom)
                coverage_ha = Decimal(str(round(abs(area_m2) / 10000, 4)))

            if coverage_ha and block_ha and block_ha > 0:
                pct = round(float(coverage_ha / block_ha) * 100, 2)
                # Schema caps coverage_percentage at numeric(5,2) → max 999.99.
                # Tracks that drift well outside their assigned block (or are
                # mis-assigned) can produce raw values in the thousands of %.
                # Cap so the row inserts; >100% itself is meaningful signal
                # to surface in the UI ("track exceeded block bounds").
                if pct > 999.99:
                    pct = 999.99
                coverage_pct = Decimal(str(pct))

    # --- Accuracy stats ---
    accuracies = [float(p.accuracy) for p in points if p.accuracy is not None]
    avg_accuracy = Decimal(str(round(sum(accuracies) / len(accuracies), 2))) if accuracies else None
    poor_accuracy_count = len([a for a in accuracies if a > 20])

    # --- Upsert summary ---
    summary = db.query(TaskGPSSummary).filter(TaskGPSSummary.task_id == task_id).first()
    if not summary:
        summary = TaskGPSSummary(
            task_id=task_id,
            company_id=task.company_id,
            user_id=points[0].user_id,
            block_id=task.block_id,
        )
        db.add(summary)

    summary.track_geometry = from_shape(track_geom, srid=4326) if track_geom else None
    summary.coverage_geometry = from_shape(coverage_geom, srid=4326) if coverage_geom else None
    summary.total_distance_meters = total_distance_m
    summary.total_distance_km = total_distance_km
    summary.active_duration_minutes = active_duration_min
    summary.total_duration_minutes = total_duration_min
    summary.total_points = len(points)
    summary.total_segments = len(segments)
    summary.avg_speed_kmh = avg_speed
    summary.max_speed_kmh = max_speed
    summary.time_stationary_minutes = time_stationary_min
    summary.time_moving_minutes = time_moving_min
    summary.coverage_area_hectares = coverage_ha
    summary.block_area_hectares = block_ha
    summary.coverage_percentage = coverage_pct
    summary.avg_accuracy_meters = avg_accuracy
    summary.poor_accuracy_points = poor_accuracy_count
    summary.created_at = datetime.utcnow()

    # Update Task model fields
    task.total_distance_meters = total_distance_m
    task.area_covered_hectares = coverage_ha

    db.commit()
    db.refresh(summary)

    logger.info(
        f"GPS summary for task {task_id}: "
        f"{total_distance_km}km, {active_duration_min}min active, "
        f"{len(points)} points, {len(segments)} segments"
    )

    return summary
