"""
ECAN (Environment Canterbury) weather site configuration
API Documentation: http://data.ecan.govt.nz/
"""

# Viticulture-focused sites in Canterbury
ECAN_SITES = {
    'ECAN_WHITE_GORGE': {
        'site_no': '321610',
        'name': 'White Gorge',
        'region': 'Canterbury',
        'variables': ['rainfall'], 
        'lat': -43.0640,  
        'lon': 172.6142,
        'elevation': 166.94,
    },
    'ECAN_PANNETS_ROAD': {
        'site_no': '229910',
        'name': 'Pannets Road',
        'region': 'Canterbury',
        'variables': ['rainfall'],
        'lat': -42.9381,
        'lon': 172.9254,
        'elevation': 140.05,
    },
    'ECAN_HURUNUI_SH1': {
        'site_no': '239101',
        'name': 'Hurunui SH1',
        'region': 'Canterbury',
        'variables': ['rainfall'],
        'lat': -42.8940,
        'lon': 173.0944,
        'elevation': 85.51,
    },
    'ECAN_LOWRY_HILLS': {
        'site_no': '237101',
        'name': 'Lowry Hills',
        'region': 'Canterbury',
        'variables': ['rainfall'],
        'lat': -42.7930,  
        'lon': 173.1053,
        'elevation': 242.85,
    },
}

# API endpoint templates
ECAN_API_BASE = "http://data.ecan.govt.nz/data/78"

# Variable-specific endpoints (ECAN has different endpoints per variable)
ECAN_ENDPOINTS = {
    'rainfall': '/Rainfall/Rainfall%20for%20individual%20site',
    # Add as discovered:
    # 'temperature': '/Temperature/Temperature%20for%20individual%20site',
    # 'solar_radiation': '/Solar/Solar%20for%20individual%20site',
}

# Period options for API
ECAN_PERIODS = {
    'backfill': 'All',      # For initial historical load
    'incremental': '2_Days',  # For daily updates
}