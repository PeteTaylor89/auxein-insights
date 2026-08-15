"""Exercise the surface stub against the contract's §6 acceptance list.

Calls the router functions directly rather than over HTTP — the venv has no
httpx, and the logic under test is the same either way.
"""
import os, sys
from pathlib import Path

os.environ["SURFACE_STUB_ENABLED"] = "1"
REPO = Path("A:/auxein-insights-V0.1")
sys.path.insert(0, str(REPO / "backend"))

from types import SimpleNamespace

from fastapi import HTTPException

# Load surfaces.py directly: `api.v1.__init__` imports every router in the app,
# which needs the backend venv (jinja2, boto3), while the stub needs rasterio,
# which lives in the root venv. See the note on environments in the write-up.
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "surfaces_stub", REPO / "backend" / "api" / "v1" / "surfaces.py")
S = importlib.util.module_from_spec(_spec)
sys.modules["surfaces_stub"] = S      # pydantic resolves forward refs via sys.modules
_spec.loader.exec_module(S)

BL = dict(lon=173.95, lat=-41.51)     # Blenheim, Marlborough

# /point is Pro-gated (core/entitlements.require_pro). Calling the handler
# directly bypasses FastAPI's dependency resolution, so the user is passed
# explicitly — which is the point: the gate cannot be skipped by omission.
PRO = SimpleNamespace(id=0, subscription_tier="pro", pro_expires_at=None)
ok = True


def check(label, cond, extra=""):
    global ok
    ok = ok and bool(cond)
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}{(' — ' + extra) if extra else ''}")


def status_of(fn, **kw):
    try:
        fn(**kw)
        return 200
    except HTTPException as e:
        return e.status_code


print("=" * 74); print("1. /available — gaps must be authoritative"); print("=" * 74)
a = S.available(variable="temp_mean", granularity="daily")
print(f"  {a.first} .. {a.last}  resolutions={a.resolutions}  "
      f"{len(a.gaps)} gaps  n={a.meta.get('n_surfaces')}")
check("gaps present", len(a.gaps) > 0, a.gaps[0] if a.gaps else "")
check("mixed resolutions offered", len(a.resolutions) > 1, str(a.resolutions))
check("contract_version v2", a.meta["contract_version"] == "v2")

print()
print("=" * 74); print("2. /point — real COG dates, synthetic fill"); print("=" * 74)
p = S.point_sample(_user=PRO, **BL, variables="temp_mean", start="1986-01-01", end="1986-01-05",
                   granularity="daily")
pts = p.series[0].points
print(f"  counts: {p.meta['counts']}")
real = [x for x in pts if not x.synthetic and x.value is not None]
check("first date sampled a real COG", len(real) >= 1,
      f"{real[0].valid_at.date()} = {real[0].value} degC @ {real[0].resolution_m}m")
check("real point carries cv_rmse", real[0].confidence.cv_rmse is not None,
      f"cv_rmse={real[0].confidence.cv_rmse}")
check("real value physically plausible", 5 < real[0].value < 30)
synth = [x for x in pts if x.synthetic]
check("synthetic points flagged per-point", len(synth) >= 1,
      f"{len(synth)} synthetic @ {synth[0].resolution_m}m")
res = sorted({x.resolution_m for x in pts if x.resolution_m})
check("mixed resolution in ONE series", len(res) > 1, str(res))

print()
print("=" * 74); print("3. null window — value null, never 0 (B4.1)"); print("=" * 74)
p = S.point_sample(_user=PRO, **BL, variables="temp_mean,rainfall", start="1993-01-01",
                   end="1993-01-03", granularity="daily")
nulls = [x for s in p.series for x in s.points]
check("all values null in the window", all(x.value is None for x in nulls),
      f"{len(nulls)} points across 2 variables")
check("none are zero", not any(x.value == 0 for x in nulls))
check("reason given", all(x.reason for x in nulls), nulls[0].reason)

print()
print("=" * 74); print("4. distance-banded confidence (§3.4)"); print("=" * 74)
for label, lon, lat in [("Blenheim (dense)", 173.95, -41.51),
                        ("Fiordland", 167.20, -45.40),
                        ("Chatham Is (off-grid)", -176.55, -43.95)]:
    pt = S.point_sample(_user=PRO, lon=lon, lat=lat, variables="temp_mean",
                        start="1986-01-01", end="1986-01-01",
                        granularity="daily").series[0].points[0]
    if pt.confidence is None:
        print(f"  {label:22s} value={pt.value}  ({pt.reason})")
    else:
        print(f"  {label:22s} nearest {pt.confidence.distance_to_nearest_station_km:7.1f} km  "
              f"expected_error {pt.confidence.expected_error}")
check("off-grid point returns null, not a number",
      S.point_sample(_user=PRO, lon=-176.55, lat=-43.95, variables="temp_mean",
                     start="1986-01-01", end="1986-01-01",
                     granularity="daily").series[0].points[0].value is None)

# The §3.4 table itself, independent of where stations happen to be.
banded = [(2.0, 1.10), (7.0, 1.02), (15.0, 1.20), (30.0, 1.41), (60.0, 1.76),
          (400.0, 2.04)]
print("  distance -> expected_error:", "  ".join(
    f"{d:g}km={S._expected_error(d)}" for d, _ in banded))
check("banding matches the measured §3.4 table",
      all(S._expected_error(d) == e for d, e in banded))
check("expected_error varies across bands",
      len({S._expected_error(d) for d, _ in banded}) == 6)

print()
print("=" * 74); print("5. /region"); print("=" * 74)
rg = S.region_stats(variables="temp_mean", start="1986-01-01", end="1986-01-02",
                    bbox="173.5,-41.8,174.3,-41.2", granularity="daily")
pt = rg.series[0].points[0]
print(f"  Marlborough bbox: mean {pt.mean} min {pt.min} max {pt.max} "
      f"area {pt.area_km2} km2 @ {pt.resolution_m}m")
check("zonal mean plausible", pt.mean and 5 < pt.mean < 30)
check("region consistent with the point inside it",
      abs(pt.mean - real[0].value) < 6, f"region {pt.mean} vs point {real[0].value}")

print()
print("=" * 74); print("6. /tiles"); print("=" * 74)
r = S.tile(variable="temp_mean", granularity="daily", valid_at="1986-01-01",
           z=6, x=62, y=39, ramp="viridis", vmin=None, vmax=None)
check("tile rendered", r.status_code == 200, f"{len(r.body)} bytes")
check("is a PNG", r.body[:8] == b"\x89PNG\r\n\x1a\n")
check("404 for a date with no surface",
      status_of(S.tile, variable="temp_mean", granularity="daily",
                valid_at="1993-06-01", z=6, x=62, y=39, ramp="viridis",
                vmin=None, vmax=None) == 404)

print()
print("=" * 74); print("7. errors + the disabled guard"); print("=" * 74)
check("422 unknown variable",
      status_of(S.point_sample, _user=PRO, **BL, variables="nope", start="1986-01-01",
                end="1986-01-02", granularity="daily") == 422)
check("422 end before start",
      status_of(S.point_sample, _user=PRO, **BL, variables="temp_mean", start="1986-01-05",
                end="1986-01-01", granularity="daily") == 422)
check("422 hourly not served",
      status_of(S.point_sample, _user=PRO, **BL, variables="temp_mean", start="1986-01-01",
                end="1986-01-02", granularity="hourly") == 422)
check("422 region without bbox",
      status_of(S.region_stats, variables="temp_mean", start="1986-01-01",
                end="1986-01-02", zone_id=5, bbox=None, granularity="daily") == 422)
# Turning the stub off no longer means "surfaces are 503". Since the archive was
# published and indexed (2026-08-15) it means "serve the real thing" — the
# published COGs on S3 via `surface_run`. So what has to hold here is narrower
# and more useful: the dispatch flips, and the stub's own guard still refuses to
# emit fixture data when it is off. The real path has its own suite,
# `check_surfaces_live.py`.
S.STUB_ENABLED = False
check("dispatch leaves the stub when disabled", S._use_stub() is False)
check("503 if a stub path is reached while disabled",
      status_of(S._require_enabled) == 503)
S.STUB_ENABLED = True
check("dispatch returns to the stub when enabled", S._use_stub() is True)

print()
print("ALL PASS" if ok else "FAILURES ABOVE")
sys.exit(0 if ok else 1)
