"""Reference ET, crop ET and the running water balance at a site.

Every number here is MODELLED. The platform holds no usable measured ET: HBRC's
18 Hawke's Bay stations are the only source and their 2025 annual totals come to
2.8-6.9 mm against a true ~900-1,100 mm, because the series is a spot value
sampled near NZ midnight rather than a daily total. See
`alembic/versions/site_water_balance.py` for the measurement and the cause.

## TWO METHODS, chosen per site-day by what the network can actually supply

FAO-56 Penman-Monteith is the reference method and is used wherever the nearest
stations can supply solar radiation, wind and humidity inside the refusal
distances `services/point_climate` already applies to the point disease path.
Measured 2026-08-31 across the 67 client sites, that is a real constraint and
solar radiation is the binding one:

    rh               66 of 67 within 20 km
    wind_speed       52 of 67 within 20 km,  67 within 50 km
    solar_radiation  36 of 67 within 20 km,  46 within 50 km

Hargreaves-Samani is the fallback everywhere else. `eto_method` records which
ran, per row, so a chart never mixes them silently and a site that moves between
methods mid-season is visible rather than a step in the series.

## Hargreaves-Samani, FAO-56 equation 52

    ETo = 0.0023 (Tmean + 17.8) sqrt(Tmax - Tmin) Ra

with Ra converted to mm/day equivalent. The inputs are daily minimum and
maximum temperature, latitude and day of year — all of which exist at all 68
sites from the daily surfaces, which is the whole reason this method and not a
better one. Penman-Monteith needs net radiation, wind and humidity; radiation
reaches 37 stations, humidity refuses beyond 30 km at a point, and neither
covers the network. FAO-56 names Hargreaves as the substitute for exactly this
case.

THE TEMPERATURE RANGE IS THE RADIATION PROXY. `sqrt(Tmax - Tmin)` is standing in
for how much sun the day got — a clear day swings, an overcast one does not — so
the estimate is at its weakest where that relationship breaks: coastal sites
with sea-breeze-damped ranges, and any day whose min and max come from
interpolation rather than a nearby thermometer. It is an estimate everywhere and
is labelled as one in `eto_method`.

## Extraterrestrial radiation, FAO-56 equation 21

Computed from latitude and day of year, so it is exact rather than estimated —
it is astronomy, not weather. Southern-hemisphere latitudes are negative and the
formula handles that without a special case.
"""
from __future__ import annotations

import math
from datetime import date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# FAO-56. Solar constant, MJ m-2 min-1.
GSC = 0.0820
# MJ m-2 day-1 -> mm/day of equivalent evaporation (FAO-56 table 1).
MJ_TO_MM = 0.408

# The season everything at a site is accumulated over. Same 1 September the GDD
# accumulators use, so a water balance and a GDD total cannot disagree about
# which days counted.
SEASON_START = (9, 1)
SEASON_END = (4, 30)

METHOD_HARGREAVES = "hargreaves-samani-fao56"
METHOD_PENMAN = "penman-monteith-fao56"

# Solar radiation is the input Penman-Monteith cannot do without and the one the
# network is thinnest in — 37 stations nationally. 50 km rather than the 30 km
# humidity uses: incoming shortwave varies over a synoptic scale rather than a
# local one, so it travels further than a dewpoint does. Beyond this the row
# falls back to Hargreaves rather than being left empty.
MAX_SOLAR_KM = 50.0

# The tick that asks for this. A client's list says which sites want ET and
# which want a water balance, and on the BSI sheet they are DIFFERENT seven-site
# sets — Nelson AWS wants the balance but not ET, because Appleby supplies its
# ET, and Appleby wants ET and nothing else. Neither set is `site_type =
# 'regional'`, which is all eight.
#
# `requested_metrics` NULL means nobody said, which is a Pro subscriber's own
# point: they get ET, because they asked for a site rather than a column.
METRIC_ET = "et"
METRIC_WATER_BALANCE = "water_balance"


def wants(site, metric: str) -> bool:
    """Did anyone ask for this metric at this site?

    NULL is not the same as empty. A site with no list at all is a Pro
    subscriber's own point and gets everything; a site whose list is empty was
    given one and ticked nothing, and gets nothing.
    """
    requested = getattr(site, "requested_metrics", None)
    if requested is None:
        return True
    return metric in requested

# Vineyard crop coefficient through the season, as (day of season, Kc) knots
# with linear interpolation between them. Day 1 is 1 September.
#
# Shape and endpoints follow FAO-56 Table 12 for wine grapes — Kc_ini 0.30,
# Kc_mid 0.70, Kc_end 0.45 — with the stage lengths set to a New Zealand
# Sep-Apr season rather than FAO's northern calendar:
#
#   Sep            0.30   budburst, bare ground, almost all of the water leaving
#                         is soil evaporation
#   Oct-Nov  0.30->0.70   canopy development
#   Dec-Feb        0.70   full canopy, mid-season
#   Mar-Apr  0.70->0.45   senescence and post-harvest
#
# THIS IS AN ASSUMPTION AND A SINGLE CURVE FOR EVERY SITE. Row spacing, trellis,
# cover crop and irrigation all move it, and a vertically shoot-positioned
# Marlborough block does not use water like a sprawling Gisborne one. It is
# published on the page for that reason rather than buried here.
KC_KNOTS = ((1, 0.30), (30, 0.30), (91, 0.70), (182, 0.70), (242, 0.45))


def season_bounds(vintage: int) -> tuple[date, date]:
    """Sep-Apr, labelled by the year it ends in."""
    return (date(vintage - 1, *SEASON_START), date(vintage, *SEASON_END))


def day_of_season(d: date, vintage: int) -> Optional[int]:
    start, end = season_bounds(vintage)
    if d < start or d > end:
        return None
    return (d - start).days + 1


def kc_for(day: int) -> float:
    """Vineyard Kc on one day of the season, linearly interpolated."""
    if day <= KC_KNOTS[0][0]:
        return KC_KNOTS[0][1]
    if day >= KC_KNOTS[-1][0]:
        return KC_KNOTS[-1][1]
    for (d0, k0), (d1, k1) in zip(KC_KNOTS, KC_KNOTS[1:]):
        if d0 <= day <= d1:
            if d1 == d0:
                return k1
            return k0 + (k1 - k0) * (day - d0) / (d1 - d0)
    return KC_KNOTS[-1][1]


def extraterrestrial_radiation(latitude: float, d: date) -> float:
    """Ra in MJ m-2 day-1. FAO-56 eq. 21. Astronomy, not weather — exact."""
    phi = math.radians(latitude)
    j = d.timetuple().tm_yday
    dr = 1 + 0.033 * math.cos(2 * math.pi * j / 365.0)
    decl = 0.409 * math.sin(2 * math.pi * j / 365.0 - 1.39)

    # Sunset hour angle. Inside the polar circles the argument leaves [-1, 1]
    # and means 24-hour day or night; NZ never reaches that, but clamping costs
    # nothing and stops a domain error being the way anyone finds out.
    x = -math.tan(phi) * math.tan(decl)
    omega = math.acos(max(-1.0, min(1.0, x)))

    return ((24 * 60 / math.pi) * GSC * dr
            * (omega * math.sin(phi) * math.sin(decl)
               + math.cos(phi) * math.cos(decl) * math.sin(omega)))


def eto_hargreaves(tmin: float, tmax: float, tmean: Optional[float],
                   latitude: float, d: date) -> Optional[float]:
    """Reference ET in mm/day, or None where the inputs cannot support one."""
    if tmin is None or tmax is None:
        return None
    span = tmax - tmin
    # A non-positive range means the surface put max at or below min for this
    # cell. It is not a still day, it is a broken day, and the square root of a
    # negative number is how it would otherwise announce itself.
    if span <= 0:
        return None
    if tmean is None:
        tmean = (tmax + tmin) / 2.0
    ra_mm = extraterrestrial_radiation(latitude, d) * MJ_TO_MM
    eto = 0.0023 * (tmean + 17.8) * math.sqrt(span) * ra_mm
    # Clamped at zero rather than allowed negative: below about -17.8 degC the
    # formula turns negative, which is arithmetic rather than condensation.
    return max(0.0, eto)


def saturation_vapour_pressure(t: float) -> float:
    """es at temperature t, kPa. FAO-56 eq. 11."""
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def slope_svp(tmean: float) -> float:
    """Delta, the slope of the es curve at tmean, kPa/degC. FAO-56 eq. 13."""
    return (4098 * saturation_vapour_pressure(tmean)) / ((tmean + 237.3) ** 2)


def psychrometric_constant(elevation_m: float) -> float:
    """gamma, kPa/degC, via the standard-atmosphere pressure. FAO-56 eq. 7, 8.

    Elevation is not a refinement here. Between sea level and a 700 m Central
    Otago terrace the pressure term moves gamma about 8%, and that is a direct
    8% on the aerodynamic half of the equation.
    """
    p = 101.3 * (((293.0 - 0.0065 * elevation_m) / 293.0) ** 5.26)
    return 0.000665 * p


def eto_penman_monteith(tmin: float, tmax: float, tmean: Optional[float],
                        rh_mean: float, wind_2m: float, solar_mj: float,
                        latitude: float, elevation_m: float,
                        d: date) -> Optional[float]:
    """FAO-56 eq. 6, the reference method. mm/day, or None if unsupportable.

    `solar_mj` is incoming shortwave in MJ m-2 day-1, `wind_2m` in m/s at two
    metres, `rh_mean` in percent.

    Net radiation is built rather than measured: shortwave is what the stations
    report, and the longwave term is derived from the temperature extremes, the
    actual vapour pressure and the clear-sky ratio, exactly as FAO-56 sets out.
    That is the standard treatment and it is why a solar reading is worth going
    50 km for while a humidity reading is not.
    """
    if None in (tmin, tmax, rh_mean, wind_2m, solar_mj):
        return None
    if tmean is None:
        tmean = (tmax + tmin) / 2.0
    if solar_mj < 0 or rh_mean <= 0:
        return None

    ra = extraterrestrial_radiation(latitude, d)
    if ra <= 0:
        return None

    delta = slope_svp(tmean)
    gamma = psychrometric_constant(elevation_m)

    # Saturation vapour pressure from the EXTREMES, not from the mean. FAO-56
    # is explicit: es computed at tmean underestimates the true daily mean by a
    # few percent because the curve is convex, and the error runs one way.
    es = (saturation_vapour_pressure(tmax)
          + saturation_vapour_pressure(tmin)) / 2.0
    ea = es * (rh_mean / 100.0)
    vpd = max(0.0, es - ea)

    # Net shortwave, albedo 0.23 for the reference grass crop (FAO-56 eq. 38).
    rns = (1 - 0.23) * solar_mj

    # Net longwave (FAO-56 eq. 39). The clear-sky ratio is capped at 1: a
    # station reading slightly above the clear-sky maximum — which happens with
    # cloud-edge reflection — would otherwise drive the term negative and
    # inflate ETo on exactly the days it should not.
    rso = (0.75 + 2e-5 * elevation_m) * ra
    ratio = min(1.0, solar_mj / rso) if rso > 0 else 1.0
    tmax_k4 = (tmax + 273.16) ** 4
    tmin_k4 = (tmin + 273.16) ** 4
    rnl = (4.903e-9 * ((tmax_k4 + tmin_k4) / 2.0)
           * (0.34 - 0.14 * math.sqrt(max(0.0, ea)))
           * (1.35 * ratio - 0.35))
    rn = rns - rnl

    # G, the soil heat flux, is taken as zero over a day. FAO-56 says so
    # explicitly: the daily total is small against Rn and changes sign through
    # the season.
    num = (0.408 * delta * rn
           + gamma * (900.0 / (tmean + 273.0)) * wind_2m * vpd)
    den = delta + gamma * (1 + 0.34 * wind_2m)
    if den <= 0:
        return None
    return max(0.0, num / den)


def wind_to_2m(speed: float, measured_at_m: float = 10.0) -> float:
    """Scale a wind speed to the 2 m reference height. FAO-56 eq. 47.

    Council masts report at 10 m as a rule and the reference crop is defined at
    2 m; using a 10 m speed unscaled overstates ETo by roughly a quarter through
    the aerodynamic term. The height is an ASSUMPTION — the station metadata
    does not carry it — so it is applied uniformly and named here rather than
    silently folded into the number.
    """
    if speed is None:
        return None
    return speed * (4.87 / math.log(67.8 * measured_at_m - 5.42))


def station_inputs(db: Session, lat: float, lon: float,
                   start: date, end: date) -> dict:
    """Daily solar, wind and humidity at a point, by inverse-distance weighting.

    Uses `point_climate`'s own neighbour search and refusal distances rather
    than a second copy of them — the point disease path already decided how far
    each variable may travel, and two answers to that question would be two
    different definitions of the same site.

    Solar is a daily TOTAL (a flux integrated over the day); wind and humidity
    are daily MEANS. Aggregating any of them the other way is the same class of
    error as the HBRC spot value this module exists because of.
    """
    from services import point_climate as pc

    out: dict[date, dict] = {}
    specs = (
        ("solar_radiation", MAX_SOLAR_KM, "sum"),
        ("wind_speed", pc.MAX_WIND_KM, "avg"),
        ("rh", pc.MAX_HUMIDITY_KM, "avg"),
    )
    for variable, max_km, how in specs:
        # `nearest_stations` returns Neighbour dataclasses, not mappings.
        near = [n for n in pc.nearest_stations(db, lat, lon, max_km=max_km)
                if n.distance_km <= max_km]
        if not near:
            continue
        ids = [n.station_id for n in near]
        dist = {n.station_id: n.distance_km for n in near}

        # Solar arrives as W/m2 at an interval; a daily TOTAL in MJ needs the
        # mean flux times the length of the day, which is what avg * 0.0864
        # gives. Summing raw W/m2 readings would scale with how often the
        # station happens to log.
        agg = "avg(value)"
        rows = db.execute(text(f"""
            SELECT station_id,
                   (timestamp AT TIME ZONE 'Pacific/Auckland')::date AS day,
                   {agg} AS v, count(*) AS n
              FROM timeseries_observations
             WHERE station_id = ANY(:ids) AND variable = :var
               AND timestamp >= :lo AND timestamp < :hi
             GROUP BY 1, 2
        """), {"ids": ids, "var": variable,
               "lo": start, "hi": end}).mappings().all()

        by_day: dict[date, list] = {}
        for r in rows:
            if r["v"] is None:
                continue
            v = float(r["v"])
            if variable == "solar_radiation":
                # Mean W/m2 over the day -> MJ m-2 day-1.
                v = v * 0.0864
            by_day.setdefault(r["day"], []).append((v, dist[r["station_id"]]))

        for day, pairs in by_day.items():
            value = pc._idw(pairs)
            if value is None:
                continue
            slot = out.setdefault(day, {})
            slot[variable] = value
            slot[f"{variable}_km"] = min(p[1] for p in pairs)
    return out


def compute(db: Session, site_id: int, latitude: float, longitude: float,
            elevation_m: Optional[float], seasons: set[int]) -> dict:
    """Fill eto/etc/water_balance for whole seasons at one site.

    DERIVED END TO END, never reading its own previous output — the same rule
    `accumulate_daily` follows and for the same reason: the engine re-fits
    D-9..D-3 every week, so an accumulator that added to what it found would
    compound each revision instead of replacing it.

    The balance runs over the SEASON, so a partial window would produce a
    cumulative starting from wherever the window happened to open. Callers pass
    whole seasons.
    """
    if not seasons:
        return {"rows": 0, "penman": 0, "hargreaves": 0}

    lo, hi = season_bounds(min(seasons))[0], season_bounds(max(seasons))[1]
    rows = db.execute(text("""
        SELECT date, temp_min, temp_max, temp_mean, rainfall_mm
          FROM insights_site_daily
         WHERE site_id = :sid AND date >= :lo AND date <= :hi
         ORDER BY date
    """), {"sid": site_id, "lo": lo, "hi": hi}).mappings().all()
    if not rows:
        return {"rows": 0, "penman": 0, "hargreaves": 0}

    station = station_inputs(db, latitude, longitude, lo, hi)
    # Sea level when the site has no elevation. Stated rather than silent: it
    # biases gamma low, which inflates ETo slightly at a high site, and it is
    # why `populate_site_water.py` fills elevation before it runs this.
    elev = 0.0 if elevation_m is None else float(elevation_m)

    updates, counts = [], {"penman": 0, "hargreaves": 0}
    running: dict[int, float] = {}
    for r in rows:
        d = r["date"]
        vintage = d.year + 1 if d.month >= 7 else d.year
        dos = day_of_season(d, vintage)
        if dos is None or vintage not in seasons:
            continue

        tmin = None if r["temp_min"] is None else float(r["temp_min"])
        tmax = None if r["temp_max"] is None else float(r["temp_max"])
        tmean = None if r["temp_mean"] is None else float(r["temp_mean"])

        eto = method = None
        s = station.get(d) or {}
        wind = wind_to_2m(s.get("wind_speed"))
        if None not in (s.get("solar_radiation"), wind, s.get("rh")):
            eto = eto_penman_monteith(tmin, tmax, tmean, s["rh"], wind,
                                      s["solar_radiation"], latitude, elev, d)
            if eto is not None:
                method = METHOD_PENMAN
                counts["penman"] += 1
        if eto is None:
            eto = eto_hargreaves(tmin, tmax, tmean, latitude, d)
            if eto is not None:
                method = METHOD_HARGREAVES
                counts["hargreaves"] += 1

        etc = None if eto is None else eto * kc_for(dos)

        # A day with no rain reading contributes nothing rather than counting as
        # a dry day. Absent and zero are different facts, and this is a
        # cumulative — the error would persist to the end of the season rather
        # than affecting one row.
        rain = r["rainfall_mm"]
        if etc is not None and rain is not None:
            running[vintage] = running.get(vintage, 0.0) + float(rain) - etc
        balance = running.get(vintage)

        updates.append({"sid": site_id, "d": d,
                        "eto": None if eto is None else round(eto, 3),
                        "etc": None if etc is None else round(etc, 3),
                        "bal": None if balance is None else round(balance, 2),
                        "method": method})

    if not updates:
        return {"rows": 0, **counts}
    db.execute(text("""
        UPDATE insights_site_daily
           SET eto_mm = :eto, etc_mm = :etc,
               water_balance_mm = :bal, eto_method = :method
         WHERE site_id = :sid AND date = :d
    """), updates)
    return {"rows": len(updates), **counts}
