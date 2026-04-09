"""
TDC (Tasman District Council) weather site configuration
API: http://envdata.tasman.govt.nz/data.hts (Hilltop Server)

Access agreement with Matt @ TDC:
  - Climate stations: Richmond Office (TDC Roof), Motueka Office
  - Rainfall: All council sites in Motueka Plains / Moutere / Mapua / Waimea / Wai-iti
  - Richmond Racecourse: RESTRICTED (not yet available)
  - Backfill: site-by-site to avoid load

Discovery commands:
  Rainfall site list:
    curl "http://envdata.tasman.govt.nz/data.hts?Service=Hilltop&Request=SiteList&Location=Yes&Collection=TDCRainOnly"
  Measurement list for a site:
    curl "http://envdata.tasman.govt.nz/data.hts?Service=Hilltop&Request=MeasurementList&Site=HY%20Richmond%20Weather%20at%20TDC%20Roof"

Climate Zones (from climate_zones table):
  10 = Nelson
"""

# Climate stations - temperature, humidity, rainfall, solar radiation
TDC_CLIMATE_SITES = {
    'TDC_RICHMOND_ROOF': {
        'site_name': 'HY Richmond Weather at TDC Roof',
        'name': 'Richmond at TDC Roof',
        'measurements': ['Air Temperature (continuous)', 'Relative humidity', 'Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.3418,
        'lon': 173.1865,
        'elevation': 12.0,
        'data_from': '2025-10-01',
    },
    'TDC_MOTUEKA_SPORTSPARK': {
        'site_name': 'HY Motueka at Sportspark',
        'name': 'Motueka at Sportspark',
        'measurements': ['Air Temperature (continuous)', 'Relative humidity', 'Solar Radiation'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.1108,
        'lon': 172.9710,
        'elevation': 5.0,
        'data_from': '2017-08-23',
    },
}

# Rainfall sites - wine-relevant areas (Waimea Plains, Moutere Hills, Motueka)
TDC_RAINFALL_SITES = {
    'TDC_MAPUA': {
        'site_name': 'GW 24035 - Mapua',
        'name': 'Mapua',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.2506,
        'lon': 173.0954,
        'elevation': 20.0,
        'data_from': '2025-10-01',
    },
    'TDC_WEKA_RD': {
        'site_name': 'GW 8110 - Weka Rd',
        'name': 'Weka Rd (Upper Moutere)',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.1863,
        'lon': 173.0259,
        'elevation': 100.0,
        'data_from': '2025-10-01',
    },
    'TDC_MOUTERE_KELLINGS': {
        'site_name': 'HY Moutere at Kellings Rd',
        'name': 'Moutere at Kellings Rd',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.2575,
        'lon': 173.0061,
        'elevation': 60.0,
        'data_from': '2025-10-01',
    },
    'TDC_WAIMEA_NURSERY': {
        'site_name': 'HY Waimea at TDC Nursery',
        'name': 'Waimea at TDC Nursery',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.3137,
        'lon': 173.1262,
        'elevation': 30.0,
        'data_from': '2025-10-01',
    },
    'TDC_WAI_ITI_BIRDS': {
        'site_name': 'HY Wai-iti at Birds',
        'name': 'Wai-iti at Birds',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.4231,
        'lon': 173.0699,
        'elevation': 80.0,
        'data_from': '2025-10-01',
    },
    'TDC_WAI_ITI_BELGROVE': {
        'site_name': 'HY Wai-iti at Belgrove',
        'name': 'Wai-iti at Belgrove',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.4554,
        'lon': 172.9580,
        'elevation': 130.0,
        'data_from': '2025-10-01',
    },
    'TDC_WAIROA_HAYCOCK': {
        'site_name': 'HY Wairoa at Haycock Rd',
        'name': 'Wairoa at Haycock Rd',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.3919,
        'lon': 173.1328,
        'elevation': 60.0,
        'data_from': '2025-10-01',
    },
    'TDC_MOTUEKA_PARKER': {
        'site_name': 'HY Motueka at Parker St',
        'name': 'Motueka at Parker St',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.1057,
        'lon': 172.9996,
        'elevation': 5.0,
        'data_from': '2025-10-01',
    },
    'TDC_RICHARDSON': {
        'site_name': 'GW 23518 - Richardson',
        'name': 'Richardson (Brightwater)',
        'measurements': ['Rainfall'],
        'region': 'Nelson',
        'zone_id': 10,
        'lat': -41.3799,
        'lon': 173.0766,
        'elevation': 40.0,
        'data_from': '2025-10-01',
    },
}

# Combined dictionary for all sites
TDC_SITES = {**TDC_CLIMATE_SITES, **TDC_RAINFALL_SITES}

# API configuration
TDC_API_BASE = "http://envdata.tasman.govt.nz/data.hts"

# Period options for incremental vs backfill
TDC_PERIODS = {
    'backfill': 'all',
    'incremental': '2_days',
}
