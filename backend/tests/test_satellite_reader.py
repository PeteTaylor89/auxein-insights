"""Offline tests for `services/satellite_reader.py` - no network, no database.

The parts worth pinning are the ones that fail silently: the reflectance offset
(a wrong rule steps every index at 2022 and still looks plausible), the
tile-overlap plan (a wrong rule reads areas twice, or not at all) and the
masking arithmetic (a wrong mask produces confident numbers from the wrong
pixels).

Run: `pytest backend/tests/test_satellite_reader.py`
 or: `python backend/tests/test_satellite_reader.py` (no pytest needed)
"""
import sys
from pathlib import Path

import numpy as np
from rasterio.transform import from_origin
from shapely.geometry import box, mapping

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import satellite_reader as sr  # noqa: E402


# ------------------------------------------------------------------ scene metadata
def test_offset_follows_baseline_not_date():
    assert sr.boa_offset("02.12") == 0
    assert sr.boa_offset("03.00") == 0
    assert sr.boa_offset("04.00") == -1000
    # Planetary Computer's reprocessed pre-2022 scenes carry 05.x and need it too.
    assert sr.boa_offset("05.10") == -1000
    assert sr.boa_offset(None) == 0
    assert sr.boa_offset("n/a") == 0


def test_relative_orbit_from_property_or_id():
    it = {"id": "S2A_MSIL2A_20230130T221601_R129_T60GTV_20240727T130504", "properties": {}}
    assert sr.relative_orbit(it) == 129
    it["properties"]["sat:relative_orbit"] = 72
    assert sr.relative_orbit(it) == 72


def test_offset_applied_to_reflectance():
    dn = np.full((2, 2), 3000, dtype="uint16")
    bands = {b: dn for b in sr.BANDS}
    bands["B08"] = np.full((2, 2), 5000, dtype="uint16")
    idx10, _ = sr.compute_indices(bands, -1000)
    # (0.4 - 0.2) / (0.4 + 0.2); without the offset it would be 0.25
    assert np.allclose(idx10["ndvi"], 1 / 3)
    bands["B04"] = np.zeros((2, 2), dtype="uint16")     # DN 0 is nodata, never reflectance
    idx10, _ = sr.compute_indices(bands, -1000)
    assert np.isnan(idx10["ndvi"]).all()


# ------------------------------------------------------------------ cells and plans
def _area(i, minx, miny, size=0.005):
    return sr.Area(i, box(minx, miny, minx + size, miny + size), f"h{i}")


def test_cells_keyed_on_centroid_grid():
    cells = sr.build_cells([_area(1, 173.91, -41.49), _area(2, 173.95, -41.45),
                            _area(3, 176.81, -39.61)])
    assert [len(c.areas) for c in cells] == [2, 1]
    assert cells[0].key == sr.build_cells([_area(9, 173.92, -41.48)])[0].key


def _item(iid, footprint, datatake="DT1", platform="Sentinel-2A"):
    return {"id": iid, "geometry": mapping(footprint),
            "properties": {"platform": platform, "s2:datatake_id": datatake,
                           "datetime": "2024-01-30T22:16:01Z"}}


def test_overlap_read_once_by_the_tile_that_contains_the_cell():
    cells = sr.build_cells([_area(1, 173.91, -41.49)])
    wide = _item("T60GTV", box(173.0, -42.0, 175.0, -41.0))
    edge = _item("T59GQP", box(173.912, -42.0, 174.0, -41.0))  # clips the cell (173.91-173.915)
    plan = sr.plan_reads([edge, wide], cells)
    assert list(plan) == ["T60GTV"]


def test_cell_straddling_tile_edge_read_by_both():
    cells = sr.build_cells([_area(1, 173.91, -41.49, size=0.02)])
    west = _item("A", box(173.0, -42.0, 173.92, -41.0))
    east = _item("B", box(173.915, -42.0, 175.0, -41.0))
    assert sorted(sr.plan_reads([west, east], cells)) == ["A", "B"]


def test_different_acquisitions_both_read():
    cells = sr.build_cells([_area(1, 173.91, -41.49)])
    fp = box(173.0, -42.0, 175.0, -41.0)
    plan = sr.plan_reads([_item("X", fp, "DT1"), _item("Y", fp, "DT2")], cells)
    assert sorted(plan) == ["X", "Y"]


def test_item_missing_every_cell_is_not_planned():
    cells = sr.build_cells([_area(1, 173.91, -41.49)])
    assert sr.plan_reads([_item("far", box(166.0, -47.0, 167.0, -46.0))], cells) == {}


# ------------------------------------------------------------------ masking and stats
def _grids(size=40):
    """A 400 m x 400 m window at 10 m, and the same at 20 m, in a UTM-like CRS."""
    t10 = from_origin(500000, 5400400, 10, 10)
    t20 = from_origin(500000, 5400400, 20, 20)
    return t10, t20, (size, size), (size // 2, size // 2)


def test_pixel_centre_mask_counts():
    t10, _, s10, _ = _grids()
    geom = box(500100, 5400100, 500200, 5400200)          # 100 m square
    sl, inside = sr.area_mask(geom, t10, s10)
    assert inside.sum() == 100
    sl, inside = sr.area_mask(geom.buffer(-6), t10, s10)  # 88 m square: 8x8 centres
    assert inside.sum() == 64


def test_area_outside_window_is_skipped():
    t10, _, s10, _ = _grids()
    assert sr.area_mask(box(600000, 5400000, 600100, 5400100), t10, s10) is None


def _stats(clear_fraction=1.0, geom=None):
    t10, t20, s10, s20 = _grids()
    geom = geom or box(500100, 5400100, 500300, 5400300).buffer(-6)
    idx10 = {"ndvi": np.full(s10, 0.6)}
    idx20 = {"ndmi": np.full(s20, 0.2), "ndre": np.full(s20, 0.45)}
    scl20 = np.full(s20, 4, dtype="uint8")
    if clear_fraction < 1:
        scl20[: int(s20[0] * (1 - clear_fraction)), :] = 9    # cloud across the top
    clear20 = np.isin(scl20, sr.CLEAR_SCL)
    clear10 = np.repeat(np.repeat(clear20, 2, 0), 2, 1)
    return sr.area_stats(geom, t10, idx10, clear10, t20, idx20, clear20, scl20)


def test_stats_on_clear_area():
    row = _stats()
    assert row["n_valid_10"] == row["n_total_10"] == 18 * 18
    assert abs(row["ndvi_mean"] - 0.6) < 1e-6 and abs(row["ndmi_p50"] - 0.2) < 1e-6
    assert row["n_cloud"] == 0


def test_cloud_reduces_valid_and_is_counted():
    row = _stats(clear_fraction=0.5)
    assert 0 < row["n_valid_10"] < row["n_total_10"]
    assert row["n_cloud"] > 0
    assert abs(row["ndvi_mean"] - 0.6) < 1e-6


def test_fully_cloudy_area_gives_no_row_not_zeros():
    assert _stats(clear_fraction=0.0) is None


def test_summarise_empty_is_none():
    assert sr.summarise(np.array([])) == {s: None for s in sr.STATS}


if __name__ == "__main__":
    tests = [(n, f) for n, f in globals().items() if n.startswith("test_") and callable(f)]
    for name, fn in tests:
        fn()
        print(f"ok  {name}")
    print(f"{len(tests)} passed")
