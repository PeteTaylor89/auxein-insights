"""Synthesise an hourly climate series at a POINT from the station network.

The spatial half of the disease path. `hourly_aggregation` answers "average the
stations assigned to this zone"; this answers "interpolate the stations near this
point". Everything downstream — wetness, hours since rain, the three disease
models — is shared and imported, never restated.

## Why a point path exists, and it is not accuracy

The argument is REACH. 130 hygrometers are assigned to no zone and are therefore
invisible to the zone rollup; six zones rest on a single hygrometer, so one
sensor fault swings a whole region; Waiheke has no station and no zone disease at
all. Interpolation reaches several times the humidity network that zone
assignment does, today, without anyone maintaining a worksheet.

## What is interpolated matters more than the weighting

**Temperature is lapse-reduced, interpolated, then restored at the site's own
elevation.** Interpolating raw temperature makes the estimate a function of how
high the neighbours happen to sit. `DEFAULT_LAPSE_RATE` is imported from the
interpolation engine (0.6 degC/100 m) so a point and a surface cannot disagree
about what elevation does.

**Humidity travels as DEWPOINT, never as relative humidity.** Dewpoint is
approximately conserved as an air mass moves up or down; relative humidity is
not, because it is a ratio against a saturation pressure that itself depends on
temperature. Interpolating RH between a valley station and a hillside site
imports the valley's temperature through the back door. So each station's
(T, RH) becomes a dewpoint, dewpoints are interpolated, and RH is reconstructed
at the site from the site's own temperature.

**Everything derived is computed at the point, AFTER interpolation.** A weighted
average of two stations' wet-hour flags is not a wetness estimate, and neither
is an average of their hours-since-rain.

## The refusal distances are measured, not assumed

The plan left one decision open: how far away a humidity estimate stops being
worth returning. Measured over 2026-08-16..08-30 on 161 hygrometers and 239
thermometers, hourly, as the median pairwise correlation and RMS difference by
separation:

    band        RH r     RH RMS      temp r   temp RMS
    0-10 km     0.931     6.8 %       0.975    1.14 degC
    10-20 km    0.774     9.8 %       0.923    1.97 degC
    20-30 km    0.750    11.2 %       0.898    2.40 degC
    30-50 km    0.669    13.3 %       0.855    2.70 degC
    50-80 km    0.543    15.9 %       0.821    2.96 degC
    120-200 km  0.421    17.0 %       0.758    3.50 degC

**Humidity decorrelates roughly twice as fast as temperature**, and the number
that matters is the RMS rather than the correlation, because the wetness
estimator reads RH through a LADDER with rungs at 80, 87, 90 and 95 %. An error
of 11 % spans the whole ladder: a neighbour reading 85 is consistent with a site
anywhere from dry to saturated, so the wet-hour call is no longer an estimate.
That puts the honest limit at **30 km**, where RMS is still inside a single rung
pair. Beyond it the service returns None rather than a low-confidence number —
interpolation does not create a hygrometer.

Temperature holds up far better and is allowed to 80 km. Rainfall is capped
hardest of the three at 25 km despite not being measured here, because convective
rain is genuinely cellular — a gauge can record 40 mm while one 12 km away
records nothing — so distance-weighting it is averaging away the signal rather
than estimating it.

These are the defaults, not a law. Every one is a constructor argument.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from scripts.hourly_aggregation import calculate_dew_point
from scripts.interpolation.tps import DEFAULT_LAPSE_RATE

EARTH_RADIUS_KM = 6371.0

# See the module docstring — every one of these is measured or argued, not round.
MAX_TEMP_KM = 80.0
MAX_HUMIDITY_KM = 30.0
MAX_RAIN_KM = 25.0
MAX_WIND_KM = 50.0

# Inverse distance weighting exponent. 2 is the usual choice and the zone path's
# own IDW uses it; nothing here justifies a different one.
IDW_POWER = 2.0

# How many neighbours to consider before the distance caps are applied. Generous,
# because the caps do the real work and a station that reports only rainfall must
# not crowd out a thermometer.
MAX_NEIGHBOURS = 12

# Below this separation two stations are the same place as far as weighting is
# concerned, and 1/d**2 would otherwise explode.
MIN_SEPARATION_KM = 0.25


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def rh_from_dewpoint(temp_c: float, dewpoint_c: float) -> Optional[float]:
    """Relative humidity from temperature and dewpoint, Magnus form.

    The exact inverse of `hourly_aggregation.calculate_dew_point`, and it has to
    stay that way. **The a/b constants MUST match that function**, not merely be
    a valid Magnus pair — 17.27/237.7 and 17.67/243.5 are both in common use and
    both defensible, but mixing them makes the round trip lossy by a few tenths
    of a percent of RH for no reason, in a value the wetness ladder then reads
    against rungs one rung apart.

    Clamped to 0-100 because a dewpoint interpolated from neighbours can land a
    little above the site temperature, which is physically impossible but
    numerically ordinary.
    """
    if temp_c is None or dewpoint_c is None:
        return None
    a, b = 17.67, 243.5          # identical to calculate_dew_point, deliberately
    gamma = (a * dewpoint_c) / (b + dewpoint_c)
    alpha = (a * temp_c) / (b + temp_c)
    rh = 100.0 * math.exp(gamma - alpha)
    return max(0.0, min(100.0, rh))


@dataclass
class Neighbour:
    station_id: int
    distance_km: float
    elevation_m: Optional[float]
    latitude: float = 0.0
    longitude: float = 0.0


# How far a humidity station may reach for someone else's thermometer.
#
# A HYGROMETER WITHOUT A THERMOMETER IS COMMON AND IS NOT A BROKEN STATION.
# Councils register each sensor as its own station: at the first Pro site,
# stations 25 (temp), 26 (rainfall), 27 (rh) and 28 (solar) are all 1.08 km away
# at 75 m — one physical mast, four station ids. Requiring a station to carry
# its own temperature before its humidity counts discarded every one of them and
# produced a site with zero humidity hours despite a hygrometer a kilometre away.
#
# 3 km is tight on purpose. The donor's temperature is used to convert THIS
# station's RH into a dewpoint, so an error in it becomes an error in the
# dewpoint; at 3 km the measured hourly temperature RMS is well under 1 degC.
PAIR_TEMP_KM = 3.0


def nearest_stations(db: Session, lat: float, lon: float,
                     limit: int = MAX_NEIGHBOURS,
                     max_km: float = None) -> list[Neighbour]:
    """The closest active stations to a point, nearest first.

    Bounded by a bounding box first so the database can use an index rather than
    computing a great-circle distance for every station in the country; the exact
    distance is then applied to the shortlist. The box is deliberately generous.
    """
    cap = max_km or max(MAX_TEMP_KM, MAX_HUMIDITY_KM, MAX_RAIN_KM, MAX_WIND_KM)
    # One degree of latitude is ~111 km; longitude shrinks with latitude.
    dlat = cap / 111.0
    dlon = cap / (111.0 * max(0.2, math.cos(math.radians(lat))))
    rows = db.execute(text("""
        SELECT station_id, latitude, longitude, elevation
          FROM weather_stations
         WHERE is_active
           AND latitude IS NOT NULL AND longitude IS NOT NULL
           AND latitude BETWEEN :lat0 AND :lat1
           AND longitude BETWEEN :lon0 AND :lon1
    """), {"lat0": lat - dlat, "lat1": lat + dlat,
           "lon0": lon - dlon, "lon1": lon + dlon}).fetchall()

    out = []
    for sid, slat, slon, elev in rows:
        d = haversine_km(lat, lon, float(slat), float(slon))
        if d <= cap:
            out.append(Neighbour(sid, d,
                                 float(elev) if elev is not None else None,
                                 float(slat), float(slon)))
    out.sort(key=lambda n: n.distance_km)
    return out[:limit]


def _idw(pairs: list[tuple[float, float]]) -> Optional[float]:
    """Inverse-distance weighted mean of (value, distance_km) pairs."""
    if not pairs:
        return None
    num = den = 0.0
    for value, dist in pairs:
        w = 1.0 / (max(dist, MIN_SEPARATION_KM) ** IDW_POWER)
        num += value * w
        den += w
    return num / den if den else None


class PointInterpolator:
    """Interpolates one site's hourly series from a fixed set of neighbours.

    The neighbour set and their distances are resolved ONCE at construction and
    reused for every hour. They are a property of the site, not of the hour, and
    recomputing them per hour would be the dominant cost of a backfill.
    """

    def __init__(self, lat: float, lon: float, elevation_m: Optional[float],
                 neighbours: list[Neighbour],
                 lapse_rate: float = DEFAULT_LAPSE_RATE,
                 max_temp_km: float = MAX_TEMP_KM,
                 max_humidity_km: float = MAX_HUMIDITY_KM,
                 max_rain_km: float = MAX_RAIN_KM,
                 max_wind_km: float = MAX_WIND_KM):
        self.lat, self.lon = lat, lon
        # A site with no elevation cannot be lapse-corrected, so the correction
        # is skipped rather than assumed to be zero — assuming sea level would
        # silently warm every hill site.
        self.elevation_m = elevation_m
        self.lapse_rate = lapse_rate
        self.max_temp_km = max_temp_km
        self.max_humidity_km = max_humidity_km
        self.max_rain_km = max_rain_km
        self.max_wind_km = max_wind_km
        self.by_id = {n.station_id: n for n in neighbours}

        # For every neighbour, who else is close enough to lend a thermometer,
        # nearest first. Precomputed because it is a property of the network
        # rather than of the hour, and a backfill walks thousands of hours.
        self.temp_donors: dict[int, list[tuple[int, float]]] = {}
        for a in neighbours:
            near = []
            for b in neighbours:
                if b.station_id == a.station_id:
                    continue
                d = haversine_km(a.latitude, a.longitude,
                                 b.latitude, b.longitude)
                if d <= PAIR_TEMP_KM:
                    near.append((b.station_id, d))
            near.sort(key=lambda x: x[1])
            self.temp_donors[a.station_id] = near

    @property
    def station_ids(self) -> list[int]:
        return list(self.by_id)

    def _reduce(self, temp_c: float, elev_m: Optional[float]) -> Optional[float]:
        """Station temperature reduced to the site's elevation datum."""
        if temp_c is None:
            return None
        if elev_m is None or self.elevation_m is None:
            # No datum to reduce to; the raw value is the best available and
            # saying so is better than inventing an elevation.
            return temp_c
        return temp_c + (elev_m - self.elevation_m) / 100.0 * self.lapse_rate

    def interpolate_hour(self, readings: list[dict]) -> dict:
        """One hour of station readings -> the estimate at this point.

        `readings` is exactly what `hourly_aggregation.get_hourly_station_data`
        yields for an hour, so the two paths read the same table through the same
        query and the same quality rule.
        """
        temp_pairs, dew_pairs, rain_pairs, wind_pairs = [], [], [], []
        temp_near = rh_near = rain_near = None
        temps_this_hour = {r["station_id"]: r.get("temp_mean") for r in readings
                           if r.get("temp_mean") is not None}

        def temperature_at(station_id: int) -> Optional[float]:
            """This station's air temperature, borrowing a co-located one if it
            has no thermometer of its own.

            The donor's value is lapse-adjusted from the donor's elevation to
            this station's, so borrowing across a small height difference does
            not import the donor's altitude along with its temperature.
            """
            own = temps_this_hour.get(station_id)
            if own is not None:
                return own
            here = self.by_id.get(station_id)
            for donor_id, _ in self.temp_donors.get(station_id, ()):
                t = temps_this_hour.get(donor_id)
                if t is None:
                    continue
                donor = self.by_id[donor_id]
                if (here is not None and here.elevation_m is not None
                        and donor.elevation_m is not None):
                    t += ((donor.elevation_m - here.elevation_m) / 100.0
                          * self.lapse_rate)
                return t
            return None

        for r in readings:
            n = self.by_id.get(r["station_id"])
            if n is None:
                continue
            d = n.distance_km

            t = r.get("temp_mean")
            if t is not None and d <= self.max_temp_km:
                reduced = self._reduce(t, n.elevation_m)
                if reduced is not None:
                    temp_pairs.append((reduced, d))
                    temp_near = d if temp_near is None else min(temp_near, d)

            # Humidity travels as dewpoint, converted at the STATION using the
            # temperature AT THAT STATION — its own where it has one, otherwise
            # a co-located mast's within PAIR_TEMP_KM. Never the interpolated
            # point temperature: that would convert a neighbour's ratio using
            # the site's own conditions and then interpolate the result back to
            # the site, which is circular.
            rh = r.get("humidity_mean")
            if rh is not None and d <= self.max_humidity_km:
                t_here = temperature_at(r["station_id"])
                td = (calculate_dew_point(t_here, rh)
                      if t_here is not None else None)
                if td is not None:
                    dew_pairs.append((td, d))
                    rh_near = d if rh_near is None else min(rh_near, d)

            rain = r.get("rainfall_mm")
            if rain is not None and d <= self.max_rain_km:
                rain_pairs.append((float(rain), d))
                rain_near = d if rain_near is None else min(rain_near, d)

            wind = r.get("wind_mean")
            if wind is not None and d <= self.max_wind_km:
                wind_pairs.append((wind, d))

        temp = _idw(temp_pairs)
        dewpoint = _idw(dew_pairs)
        # RH is RECONSTRUCTED at the site, from the site's own temperature and
        # the interpolated dewpoint. Without a site temperature there is nothing
        # to reconstruct against and RH stays None rather than falling back to a
        # neighbour's ratio.
        rh = rh_from_dewpoint(temp, dewpoint) if temp is not None else None

        return {
            "temp_mean": temp,
            "dewpoint": dewpoint,
            "rh_mean": rh,
            # No gauge within range is NOT zero rain. A missing rainfall reading
            # and a dry hour drive the wetness estimator to opposite ends, and
            # `hours_since_rain` would restart on a fiction.
            "precipitation": _idw(rain_pairs) if rain_pairs else None,
            # Likewise never 0.0: calm MAXIMISES dew, so a defaulted null would
            # over-predict wetness exactly where there is least evidence.
            "wind_mean": _idw(wind_pairs) if wind_pairs else None,
            "temp_station_count": len(temp_pairs),
            "temp_nearest_km": temp_near,
            "rh_station_count": len(dew_pairs),
            "rh_nearest_km": rh_near,
            "rain_station_count": len(rain_pairs),
            "rain_nearest_km": rain_near,
            "wind_station_count": len(wind_pairs),
        }


def confidence_for(estimate: dict) -> str:
    """Three levels, driven by the humidity leg because that is what limits.

    Temperature is available almost everywhere and says little about whether the
    hour can be scored. The disease models are all driven through wetness, and
    wetness is driven by humidity, so the humidity leg is the binding constraint
    and pretending otherwise would report `high` on a row the models cannot use.
    """
    if not estimate.get("rh_station_count"):
        return "low"
    near = estimate.get("rh_nearest_km")
    if near is not None and near <= 10.0 and estimate["rh_station_count"] >= 2:
        return "high"
    if near is not None and near <= 20.0:
        return "medium"
    return "low"


def build_interpolator(db: Session, site) -> PointInterpolator:
    """The interpolator for one `InsightsSite`."""
    neighbours = nearest_stations(db, float(site.latitude), float(site.longitude))
    return PointInterpolator(
        float(site.latitude), float(site.longitude),
        float(site.elevation_m) if site.elevation_m is not None else None,
        neighbours)
