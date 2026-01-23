"""
MDC (Marlborough District Council) weather site configuration
API: https://hydro.marlborough.govt.nz/data.hts (Hilltop Server)

Note: MDC requires Collection parameter (Climate or Rainfall) to access measurements
"""

# Climate sites - have temperature, humidity, wind data
MDC_CLIMATE_SITES = {
    'MDC_BLENHEIM_BOWLING': {
        'site_name': 'Blenheim Bowling Club',  # Exact name for API
        'name': 'Blenheim Bowling Club',
        'collection': 'Climate',
        'measurements': ['Air Temperature', 'Humidity', 'Wind Direction', 'Wind Speed'],
        'region': 'Marlborough',
        'subregion': '',  # TODO: Fill in (e.g., Wairau Valley, Southern Valleys)
        'lat': None,  # TODO: Fill in
        'lon': None,  # TODO: Fill in
        'elevation': None,
        'data_from': '2009-04-02',
    },
    'MDC_AWATERE_DASHWOOD': {
        'site_name': 'Awatere at Dashwood',
        'name': 'Awatere at Dashwood',
        'collection': 'Climate',
        'measurements': [],  # TODO: Query API to confirm
        'region': 'Marlborough',
        'subregion': '',  # TODO: Awatere Valley
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_LAKE_ELTERWATER': {
        'site_name': 'Lake Elterwater Climate',
        'name': 'Lake Elterwater Climate',
        'collection': 'Climate',
        'measurements': [],  # TODO: Query API to confirm
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_WARD_CHANCET': {
        'site_name': 'Ward at Chancet',
        'name': 'Ward at Chancet',
        'collection': 'Climate',
        'measurements': [],  # TODO: Query API to confirm
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
}

# Rainfall sites
MDC_RAINFALL_SITES = {
    'MDC_LANSDOWNE': {
        'site_name': 'Lansdowne NRFA',
        'name': 'Lansdowne NRFA',
        'collection': 'Rainfall',
        'measurements': ['Rainfall 1 Hour'],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': '2013-11-12',
    },
    'MDC_MILL_ROAD': {
        'site_name': 'Mill Road Rainfall',
        'name': 'Mill Road Rainfall',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_WAIRAU_SOUTHWOLD': {
        'site_name': 'Wairau Valley at Southwold',
        'name': 'Wairau Valley at Southwold',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_WAIRAU_NARROWS': {
        'site_name': 'Wairau at Narrows',
        'name': 'Wairau at Narrows',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_WAIKAKAHO': {
        'site_name': 'Waikakaho',
        'name': 'Waikakaho',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_ODWYERS_ROAD': {
        'site_name': 'O Dwyers Road NRFA',
        'name': 'O Dwyers Road NRFA',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_BLENHEIM_OFFICE': {
        'site_name': 'Blenheim at MDC Office',
        'name': 'Blenheim at MDC Office',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_TAYLOR_PASS': {
        'site_name': 'Taylor at Taylor Pass Landfill',
        'name': 'Taylor at Taylor Pass Landfill',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_WITHER_HILLS': {
        'site_name': 'Wither Hills NRFA',
        'name': 'Wither Hills NRFA',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_AWATERE_GLENBRAE': {
        'site_name': 'Awatere Glenbrae NRFA',
        'name': 'Awatere Glenbrae NRFA',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
    'MDC_FLAXBOURNE': {
        'site_name': 'Flaxbourne at Corrie Downs',
        'name': 'Flaxbourne at Corrie Downs',
        'collection': 'Rainfall',
        'measurements': [],
        'region': 'Marlborough',
        'subregion': '',
        'lat': None,
        'lon': None,
        'elevation': None,
        'data_from': None,
    },
}

# Combined dictionary for all sites
MDC_SITES = {**MDC_CLIMATE_SITES, **MDC_RAINFALL_SITES}

# API configuration
MDC_API_BASE = "https://hydro.marlborough.govt.nz/data.hts"

# Period options for incremental vs backfill
MDC_PERIODS = {
    'backfill': 'all',
    'incremental': '7_days',
}