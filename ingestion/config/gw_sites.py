"""
GW (Greater Wellington) weather site configuration
API: https://hilltop.gw.govt.nz/Data.hts (Hilltop Server)

Note: GW requires Collection parameter (Climate or Rainfall) to access measurements

"""

# Climate sites - have temperature, humidity, wind data
GW_CLIMATE_SITES = {
    'GW_WAIRARAPA_COLLEGE': {
        'site_name': 'Wairarapa College AQ',  # Exact name for API
        'name': 'Wairarapa College',
        'measurements': ['Air Temperature', 'Relative Humidity', ],
        'region': 'Wairarapa',
        'zone_id': 8,  # Gladstone
        'lat': -40.9520,  
        'lon': 175.6465,  
        'elevation': 116.3,
        'data_from': '2025-10-01',
    },
    'GW_WAIRARAPA_COLLEGE_RAINFALL': {
        'site_name': 'Ruamahanga River at Wairarapa College',  
        'name': 'Wairarapa College rainfall',
        'measurements': ['Rainfall'],
        'region': 'Wairarapa',
        'zone_id': 8,  
        'lat': -40.9520,  
        'lon': 175.6465,  
        'elevation': 116.3,
        'data_from': '2025-10-01',
    },
    'GE_PARKVALE_STREAM': {
        'site_name': 'Parkvale Stream at Renalls Weir',  
        'name': 'Parkvale Stream at Renalls Weir',
        'measurements': ['Rainfall'],
        'region': 'Wairarapa',
        'zone_id': 8,  
        'lat': -41.0777,  
        'lon': 175.5413,  
        'elevation': 57.8,
        'data_from': '2025-10-01',
    },
    'GW_MANGATARERE_RIVER': {
        'site_name': 'Mangatarere River at State Highway 2',  
        'name': 'Mangatarere River at State Highway 2',
        'measurements': ['Rainfall'],
        'region': 'Wairarapa',
        'zone_id': 8,  
        'lat': -41.0549,  
        'lon': 175.4962,  
        'elevation': 53.2,
        'data_from': '2025-10-01',
    },
}

# Combined dictionary for all sites
GW_SITES = {**GW_CLIMATE_SITES}

# API configuration
GW_API_BASE = "https://hilltop.gw.govt.nz/Data.hts"

# Period options for incremental vs backfill
GW_PERIODS = {
    'backfill': 'all',
    'incremental': '2_days',
}