"""
GDC (Gisborne District Council) weather site configuration
API: http://hilltop.gdc.govt.nz/data.hts (Hilltop Server)

Discovery notes (2026-04-09):
  - URL encoding must use %20 (not +) for spaces
  - Site names from spec were incorrect — corrected via SiteList probe
  - Waipaoa River at Matawhero Bridge has no rainfall/weather — dropped
  - Airport Met Station and Airport are the same site: 'Gisborne Airport Met Station'
  - Soil data exists at bore sites but deferred (no pipeline support yet)
  - No Solar Radiation available at any GDC site

Climate Zones (from climate_zones table):
  4 = Gisborne
"""

# Climate station - temperature, humidity, rainfall
GDC_CLIMATE_SITES = {
    'GDC_AIRPORT_MET': {
        'site_name': 'Gisborne Airport Met Station',
        'name': 'Gisborne Airport Met Station',
        'measurements': ['Air Temperature', 'Relative Humidity', 'Rainfall'],
        'region': 'Gisborne',
        'zone_id': 4,
        'lat': -38.6593,
        'lon': 177.9831,
        'elevation': 5.0,
        'data_from': '2017-07-12',
    },
}

# Rainfall sites - Gisborne Plains bore network + urban gauge
GDC_RAINFALL_SITES = {
    'GDC_CAESAR_RD': {
        'site_name': 'Caesar Rd No1 Bore GPG058',
        'name': 'Caesar Rd No1 Bore',
        'measurements': ['Rainfall'],
        'region': 'Gisborne',
        'zone_id': 4,
        'lat': -38.5661,
        'lon': 177.9189,
        'elevation': 20.0,
        'data_from': '2013-09-03',
    },
    'GDC_HIKA': {
        'site_name': 'Hika No1 Bore Ferry Road GPE032',
        'name': 'Hika No1 Bore (Ferry Rd)',
        'measurements': ['Rainfall'],
        'region': 'Gisborne',
        'zone_id': 4,
        'lat': -38.6011,
        'lon': 177.9159,
        'elevation': 15.0,
        'data_from': '2014-08-20',
    },
    'GDC_CAMERON_RD': {
        'site_name': 'Cameron Rd No1 Bore GPB099',
        'name': 'Cameron Rd No1 Bore',
        'measurements': ['Rainfall'],
        'region': 'Gisborne',
        'zone_id': 4,
        'lat': -38.6429,
        'lon': 177.9821,
        'elevation': 10.0,
        'data_from': '2014-08-27',
    },
    'GDC_STOUT_ST': {
        'site_name': 'Stout St RG',
        'name': 'Stout St Rain Gauge',
        'measurements': ['Rainfall'],
        'region': 'Gisborne',
        'zone_id': 4,
        'lat': -38.6465,
        'lon': 178.0060,
        'elevation': 5.0,
        'data_from': '2013-03-15',
    },
}

# Combined dictionary for all sites
GDC_SITES = {**GDC_CLIMATE_SITES, **GDC_RAINFALL_SITES}

# API configuration
GDC_API_BASE = "http://hilltop.gdc.govt.nz/data.hts"

# Period options for incremental vs backfill
GDC_PERIODS = {
    'backfill': 'all',
    'incremental': '2_days',
}
