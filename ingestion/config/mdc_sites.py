"""
MDC (Marlborough District Council) weather site configuration
API: https://hydro.marlborough.govt.nz/data.hts (Hilltop Server)

Note: MDC requires Collection parameter (Climate or Rainfall) to access measurements

Climate Zones (from climate_zones table):
  11 = Lower Wairau (Wairau Valley, Blenheim area)
  12 = Awatere (Awatere Valley)
  13 = Upper Wairau and Southern Valleys
"""

# Climate sites - have temperature, humidity, wind data
MDC_CLIMATE_SITES = {
    'MDC_BLENHEIM_BOWLING': {
        'site_name': 'Blenheim Bowling Club',  # Exact name for API
        'name': 'Blenheim Bowling Club',
        'collection': 'Air Quality',
        'measurements': ['Air Temperature', 'Humidity'],
        'region': 'Marlborough',
        'zone_id': 11,  # Lower Wairau - TODO: confirm
        'lat': -41.5267,  # TODO: Fill in
        'lon': 173.9562,  # TODO: Fill in
        'elevation': 9.8,
        'data_from': '2025-10-01',
    },
    'MDC_BLENHEIM_OFFICE': {
        'site_name': 'Blenheim at MDC Office',  
        'name': 'Blenheim at MDC Office',
        'collection': 'Climate',
        'measurements': ['Air Temperature', 'Rainfall'],
        'region': 'Marlborough',
        'zone_id': 11,  
        'lat': -41.5116,  
        'lon': 173.9546,  
        'elevation': 8.2,
        'data_from': '2025-10-01',
    },
    'MDC_TAYLOR_PASS_LANDFILL': {
        'site_name': 'Taylor at Taylor Pass Landfill',  
        'name': 'Taylor at Taylor Pass Landfill',
        'collection': 'Rainfall',
        'measurements': ['Air Temperature', 'Rainfall', 'Humidity'],
        'region': 'Marlborough',
        'zone_id': 11,  
        'lat': -41.5639,  
        'lon': 173.9330,  
        'elevation': 79.1,
        'data_from': '2025-10-01',
    },
    'MDC_O_DWYERS_ROAD': {
        'site_name': 'O Dwyers Road NRFA',  
        'name': 'O Dwyers Road NRFA',
        'collection': 'Rainfall',
        'measurements': ['Air Temperature', 'Rainfall', 'Humidity'],
        'region': 'Marlborough',
        'zone_id': 11,  
        'lat': -41.4665,  
        'lon': 173.9229,  
        'elevation': 9.72,
        'data_from': '2025-10-01',
    },
    'MDC_AWATERE_GLENBRAE': {
        'site_name': 'Awatere Glenbrae NRFA',
        'name': 'Awatere Glenbrae NRFA',
        'collection': 'Rainfall',
        'measurements': ['Air Temperature', 'Rainfall', 'Humidity'],  
        'region': 'Marlborough',
        'zone_id': 12,  
        'lat': -41.6515,
        'lon': 174.0481,
        'elevation': 99.45,
        'data_from': '2025-10-01',
    },
    'MDC_LAKE_ELTERWATER': {
        'site_name': 'Lake Elterwater Climate',
        'name': 'Lake Elterwater Climate',
        'collection': 'Climate',
        'measurements': ['Air Temperature', 'Rainfall', 'Humidity'],  
        'region': 'Marlborough',
        'zone_id': 12,  
        'lat': -41.8019,
        'lon': 174.1527,
        'elevation': 39.9,
        'data_from': '2025-10-01',
    },
    'MDC_WARD_CHANCET': {
        'site_name': 'Ward at Chancet',
        'name': 'Ward at Chancet',
        'collection': 'Climate',
        'measurements': ['Rainfall'],  # TODO: Query API to confirm
        'region': 'Marlborough',
        'zone_id': 12,  # Awatere - TODO: confirm (Ward is south of Awatere)
        'lat': -41.8312,
        'lon': 174.1704,
        'elevation': 18.5,
        'data_from': '2025-10-01',
    },
    'MDC_WAIHOPAI_CRAIGLOCHART': {
        'site_name': 'Waihopai at Craiglochart',
        'name': 'Waihopai at Craiglochart',
        'collection': 'Rainfall',
        'measurements': ['Rainfall'],  # TODO: Query API to confirm
        'region': 'Marlborough',
        'zone_id': 13,  
        'lat': -41.6212,
        'lon': 173.6890,
        'elevation': 170.10,
        'data_from': '2025-10-01',
    },
    'MDC_WAIRAU_NARROWS': {
        'site_name': 'Wairau at Narrows',
        'name': 'Wairau at Narrows',
        'collection': 'Rainfall',
        'measurements': ['Rainfall'],  
        'region': 'Marlborough',
        'zone_id': 13,  
        'lat': -41.5153,
        'lon': 173.6962,
        'elevation': 78.06,
        'data_from': '2025-10-01',
    },
    'MDC_WAIRAU_SOUTHWOLD': {
        'site_name': 'Wairau Valley at Southwold',
        'name': 'Wairau Valley at Southwold',
        'collection': 'Rainfall',
        'measurements': ['Rainfall'],  
        'region': 'Marlborough',
        'zone_id': 13,  
        'lat': -41.5450,
        'lon': 173.5755,
        'elevation': 130.63,
        'data_from': '2025-10-01',
    },
    'MDC_WAIRAU_MILL_ROAD': {
        'site_name': 'Mill Road Rainfall',
        'name': 'Mill Road Rainfall',
        'collection': 'Rainfall',
        'measurements': ['Rainfall'],  
        'region': 'Marlborough',
        'zone_id': 13,  
        'lat': -41.5724,
        'lon': 173.4989,
        'elevation': 174.58,
        'data_from': '2025-10-01',
    },
}

# Combined dictionary for all sites
MDC_SITES = {**MDC_CLIMATE_SITES}

# API configuration
MDC_API_BASE = "https://hydro.marlborough.govt.nz/data.hts"

# Period options for incremental vs backfill
MDC_PERIODS = {
    'backfill': 'all',
    'incremental': '2_days',
}