"""
HBRC (Hawke's Bay Regional Council) weather site configuration
API: https://data.hbrc.govt.nz/Envirodata/EMAR.hts (Hilltop Server)

Discovery commands to verify sites and measurements:
  Site list:
    curl "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=Hilltop&Request=SiteList&Location=LatLong" | grep -i climate
  Measurements for a site:
    curl "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=Hilltop&Request=MeasurementList&Site=Bridge%20Pa%20Climate"
  WFS site list with coordinates:
    curl "https://data.hbrc.govt.nz/Envirodata/EMAR.hts?Service=WFS&Request=GetFeature&TypeName=SiteList"
"""

# Wine-relevant climate sites in Hawke's Bay
# TODO: Run discovery queries above to confirm exact site_name values and measurements
HBRC_CLIMATE_SITES = {
    'HBRC_BRIDGE_PA_Climate': {
        'site_name': 'Bridge Pa Climate',       
        'name': 'Bridge Pa Climate',
        'measurements': [
            'Average Air Temperature',           
            'Rainfall',
            'Average Humidity',
            'Solar Radiation',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,                         
        'lat': -39.6459,                         
        'lon': 176.7634,
        'elevation': 22.5,                         
        'data_from': '2025-10-01',
    },
    'HBRC_CROWNTHORPE_Climate': {
        'site_name': 'Crownthorpe Climate',      
        'name': 'Crownthorpe Climate',
        'measurements': [
            'Average Air Temperature',
            'Rainfall',
            'Average Humidity',
            'Solar Radiation',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,
        'lat': -39.5568,                         
        'lon': 176.5622,
        'elevation': 203.6,                        
        'data_from': '2025-10-01',
    },
    'HBRC_MARAEKAKAHO_RAINFALL': {
        'site_name': 'Maraekakaho Stream D/S Tait Rd',           
        'name': 'Maraekakaho Stream D/S Tait Rd',
        'measurements': [
            'Rainfall',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,
        'lat': -39.6481,                         
        'lon': 176.5790,
        'elevation': 101,
        'data_from': '2025-10-01',
    },
    'HBRC_NGARURORO_RAINFALL': {
        'site_name': 'Ngaruroro River at Ohiti',           
        'name': 'Ngaruroro River at Ohiti',
        'measurements': [
            'Rainfall',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,
        'lat': -39.6143,                         
        'lon': 176.6939,
        'elevation': 59.6,
        'data_from': '2025-10-01',
    },
    'HBRC_KAIAPO_RAINFALL': {
        'site_name': 'Kaiapo Road',           
        'name': 'Kaiapo Road',
        'measurements': [
            'Rainfall',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,
        'lat': -39.6279,                         
        'lon': 176.8102,
        'elevation': 18,
        'data_from': '2025-10-01',
    },
    'HBRC_TUTAEKURI_RAINFALL': {
        'site_name': 'Tutaekuri Waimate Stm at Chesterhope',           
        'name': 'Tutaekuri Waimate Stm at Chesterhope',
        'measurements': [
            'Rainfall',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,
        'lat': -39.5966,                         
        'lon': 176.8629,
        'elevation': 6.2,
        'data_from': '2025-10-01',
    },
    'HBRC_FARNDON_RAINFALL': {
        'site_name': 'Farndon Rd Pump Station RF',           
        'name': 'Farndon Rd Pump Station RF',
        'measurements': [
            'Rainfall',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,
        'lat': -39.5877,                         
        'lon': 176.9008,
        'elevation': 3.0,
        'data_from': '2025-10-01',
    },
    'HBRC_MOTEO_RAINFALL': {
        'site_name': 'Moteo',           
        'name': 'Moteo',
        'measurements': [
            'Rainfall',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,
        'lat': -39.5304,                         
        'lon': 176.7407,
        'elevation': 38.3,
        'data_from': '2025-10-01',
    },
    'HBRC_KOPANGA_RAINFALL': {
        'site_name': 'Kopanga',           
        'name': 'Kopanga',
        'measurements': [
            'Rainfall',
        ],
        'region': 'Hawke\'s Bay',
        'zone_id': 5,
        'lat': -39.7168,                         
        'lon': 176.8682,
        'elevation': 163.0,
        'data_from': '2025-10-01',
    },
}

# Combined dictionary for all sites
HBRC_SITES = {**HBRC_CLIMATE_SITES}

# API configuration
HBRC_API_BASE = "https://data.hbrc.govt.nz/Envirodata/EMAR.hts"

# Period options for incremental vs backfill
HBRC_PERIODS = {
    'backfill': 'all',
    'incremental': '2_days',
}