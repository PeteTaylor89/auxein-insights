"""
Hemisphere-aware vintage year helpers.

Reads vintage convention from the `countries` table (hemisphere,
vintage_start_month) so code can compute vintage year and day-of-vintage
for any country, not just NZ.

Conventions
-----------
Southern Hemisphere (NZ, AU, ZA, CL, AR):
  - Growing season crosses two calendar years.
  - Vintage year = harvest year (the later year).
  - e.g., NZ vintage 2025 = season starting 1 Jul 2024, harvest Feb–Apr 2025.

Northern Hemisphere (UK, CA, CH, US, FR, IT, ES, DE, AT, ...):
  - Growing season contained within one calendar year.
  - Vintage year = calendar year = harvest year.
  - Typical `vintage_start_month` = 1 (Jan) so day-of-vintage equals day-of-year.

Phase 0b status
---------------
This module is the forward-looking replacement for the three SH-hardcoded
helpers currently in the codebase:
  - `ClimateZoneDaily.get_vintage_year()`  (realtime_climate.py)
  - `ClimateZoneDailyBaseline.date_to_doy_vintage()`  (realtime_climate.py)
  - `get_vintage_year()`  (scripts/zone_aggregation.py)

Those helpers remain in place and keep working for NZ. When Phase A rewires
zone aggregation (recursive CTE over sub-zones), the hardcoded sites migrate
to the functions here. The plain-value (`hemisphere`, `vintage_start_month`)
API is intentionally dependency-light so the climate pipeline scripts can
call it without the FastAPI DI container.
"""
from datetime import date
from typing import Optional


# Default convention — NZ / Southern Hemisphere, harvest mid-year.
# Existing call sites that don't yet pass country context get NZ behaviour,
# matching the legacy helpers exactly.
DEFAULT_HEMISPHERE: str = 'S'
DEFAULT_VINTAGE_START_MONTH: int = 7


def vintage_year_for(
    d: date,
    hemisphere: str = DEFAULT_HEMISPHERE,
    vintage_start_month: int = DEFAULT_VINTAGE_START_MONTH,
) -> int:
    """
    Return the vintage year for a given date and hemisphere convention.

    SH: d.year + 1 if d.month >= vintage_start_month else d.year
    NH: d.year  (calendar-year vintage)

    >>> vintage_year_for(date(2025, 2, 15), 'S', 7)
    2025
    >>> vintage_year_for(date(2024, 10, 1), 'S', 7)
    2025
    >>> vintage_year_for(date(2024, 6, 30), 'S', 7)
    2024
    >>> vintage_year_for(date(2025, 9, 15), 'N', 1)
    2025
    """
    if hemisphere == 'S':
        return d.year + 1 if d.month >= vintage_start_month else d.year
    return d.year


def day_of_vintage(
    d: date,
    hemisphere: str = DEFAULT_HEMISPHERE,
    vintage_start_month: int = DEFAULT_VINTAGE_START_MONTH,
) -> int:
    """
    Return 1-based day-of-vintage for a given date and hemisphere convention.

    SH: day 1 = vintage_start_month / 1 of the previous calendar year when
        d.month < vintage_start_month, else of the current year.
    NH: day 1 = vintage_start_month / 1 of the current calendar year.

    >>> day_of_vintage(date(2024, 7, 1), 'S', 7)
    1
    >>> day_of_vintage(date(2025, 6, 30), 'S', 7)
    365
    >>> day_of_vintage(date(2025, 1, 1), 'N', 1)
    1
    """
    if hemisphere == 'S':
        if d.month >= vintage_start_month:
            start = date(d.year, vintage_start_month, 1)
        else:
            start = date(d.year - 1, vintage_start_month, 1)
    else:
        start = date(d.year, vintage_start_month, 1)
    return (d - start).days + 1


# --------------------------------------------------------------------------
# Session-aware convenience wrappers (use when a SQLAlchemy session is handy).
# The scripts/ climate pipeline doesn't carry a session around, so the
# plain-value functions above are what those callers use.
# --------------------------------------------------------------------------

def vintage_year_for_country(db_session, d: date, country_id: Optional[int]) -> int:
    """Look up hemisphere + start month from `countries`, then compute vintage year."""
    if country_id is None:
        return vintage_year_for(d)
    from db.models.data_platform import Country
    country = db_session.query(Country).filter(Country.id == country_id).first()
    if country is None:
        return vintage_year_for(d)
    return vintage_year_for(d, country.hemisphere, country.vintage_start_month)


def day_of_vintage_for_country(db_session, d: date, country_id: Optional[int]) -> int:
    """Look up hemisphere + start month from `countries`, then compute day-of-vintage."""
    if country_id is None:
        return day_of_vintage(d)
    from db.models.data_platform import Country
    country = db_session.query(Country).filter(Country.id == country_id).first()
    if country is None:
        return day_of_vintage(d)
    return day_of_vintage(d, country.hemisphere, country.vintage_start_month)
