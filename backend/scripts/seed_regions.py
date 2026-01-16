#!/usr/bin/env python3
"""
scripts/seed_regions.py

Seed wine regions with:
1. Boundaries from Stats NZ Datafinder
2. Stats from NZWine 2024 data (complete variety breakdown)
3. Descriptions (drafted)

Usage:
    python scripts/seed_regions.py
    python scripts/seed_regions.py --dry-run  # Preview without inserting
    python scripts/seed_regions.py --update   # Update existing regions
"""

import os
import sys
import json
import argparse
import logging
import requests
from pathlib import Path
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.wine_region import WineRegion

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Stats NZ Datafinder API Configuration
# Get your API key from: https://datafinder.stats.govt.nz/ (sign up required)
STATS_NZ_API_KEY = os.getenv("STATS_NZ_API_KEY")
STATS_NZ_BASE_URL = "https://datafinder.stats.govt.nz/services"

# Stats NZ Layer IDs (2025 Clipped boundaries)
# https://datafinder.stats.govt.nz/layer/120945-regional-council-2025-clipped/
# https://datafinder.stats.govt.nz/layer/120962-territorial-authority-2025-clipped/
REGIONAL_COUNCILS_LAYER = 120945  # Regional Council 2025 (Clipped)
TERRITORIAL_AUTHORITIES_LAYER = 120962  # Territorial Authority 2025 (Clipped)


# ============================================================================
# REGION DEFINITIONS
# ============================================================================

WINE_REGIONS = [
    {
        "name": "Northland",
        "slug": "northland",
        "display_order": 1,
        "linz_query": {"layer": REGIONAL_COUNCILS_LAYER, "filter": "REGC2025_V1_00_NAME='Northland Region'"},
        "summary": "New Zealand's warmest wine region, producing bold reds and aromatic whites.",
        "description": "Warm spring temperatures, hot dry summers, and calm, clear autumn days allow fruit to ripen early, creating full-bodied and rich wines. The first vines in New Zealand were planted in the Bay of Islands by the missionary, Reverend Samuel Marsden in 1819. In the late 1800s, the Croatian gumdiggers arrived bringing their European tradition of winemaking. The region's tropical Chardonnays, popular Pinot Gris and vibrant Viogniers are leading the white wine growth. Red wines produced include spicy Syrahs, stylish Merlot and Cabernet blends, peppery Pinotages and complex Chambourcin.",
        "climate_summary": "Almost subtropical with high humidity and rainfall. Warm summers and mild winters.",
    },
    {
        "name": "Auckland",
        "slug": "auckland",
        "display_order": 2,
        "linz_query": {"layer": REGIONAL_COUNCILS_LAYER, "filter": "REGC2025_V1_00_NAME='Auckland'"},
        "summary": "Diverse wine landscape from Kumeu's Chardonnay to Waiheke's premium reds.",
        "description": "Auckland is one of New Zealand's oldest wine regions, established in the early 1900s by passionate Croatian, Lebanese and English winemakers. Spread across a large, geographically diverse area, the Auckland wine region encompasses three distinctive subregions, the island of Waiheke, historic West Auckland and stretches north to the coastal enclave of Matakana. Home to powerful, intense reds – Red blends in the north and on Waiheke Island (which also has thrilling Syrah) – plus world class Chardonnay and fine Aromatics, the modern Auckland wine industry continues to shine.",
        "climate_summary": "Maritime climate with warm, humid summers. Significant variation between sub-regions.",
    },
    {
        "name": "Waikato / Bay of Plenty",
        "slug": "waikato-bay-of-plenty",
        "display_order": 3,
        "linz_query": {"layer": REGIONAL_COUNCILS_LAYER, "filter": "REGC2025_V1_00_NAME IN ('Waikato Region', 'Bay of Plenty Region')", "merge": True},
        "summary": "Emerging region with producers experimenting across climate styles.",
        "description": "A small but growing wine region with emerging producers experimenting with both cool and warm climate varieties. The volcanic soils provide unique terroir characteristics, and the region is gaining recognition for quality wines.",
        "climate_summary": "Varied climate from coastal to inland.",
    },
    {
        "name": "Gisborne",
        "slug": "gisborne",
        "display_order": 4,
        "linz_query": {"layer": REGIONAL_COUNCILS_LAYER, "filter": "REGC2025_V1_00_NAME='Gisborne Region'"},
        "summary": "The 'Chardonnay Capital of New Zealand' with generous aromatic varieties.",
        "description": "Gisborne is home to a mix of large producers, boutique wineries, and entrepreneurial growers, who are continuously exploring new varieties and vineyard sites. A dynamic food and wine scene completes the picture. Rich in history, Gisborne claims Captain Cook's first landfall, as well as being the first place in New Zealand to see the sunrise. Chardonnay is the dominant variety and enjoys great success, though a very wide range of red and white varieties are successfully established and new varieties are always trialled. Hillside land is being explored and matched with new varieties and clones; Gisborne's renaissance is underway.",
        "climate_summary": "Warm, sunny climate with moderate rainfall.",
    },
    {
        "name": "Hawke's Bay",
        "slug": "hawkes-bay",
        "display_order": 5,
        "linz_query": {"layer": REGIONAL_COUNCILS_LAYER, "filter": "REGC2025_V1_00_NAME='Hawke''s Bay Region'"},
        "summary": "New Zealand's premier red wine destination, home to the famous Gimblett Gravels.",
        "description": "Vines were first planted in 1851 by Marist missionaries and Hawke's Bay enjoys a significant international reputation for producing some of the country's best wines, red and white. A relatively large and diverse region capable of producing a wide range of varieties to a very high standard, Hawke's Bay is best known for its Red Blends and Chardonnay but aromatic whites are consistently good and Syrah is incredibly impressive. Hawke's Bay is home to an outstanding wine tourism culture and offers a wide variety of cellar door experiences as well as regular food and wine festivals.",
        "climate_summary": "Warm, dry climate with low rainfall. Diverse soil types from gravels to clay.",
    },
    {
        "name": "Wairarapa",
        "slug": "wairarapa",
        "display_order": 6,
        "linz_query": {"layer": TERRITORIAL_AUTHORITIES_LAYER, "filter": "TA2025_V1_00_NAME IN ('South Wairarapa District', 'Carterton District', 'Masterton District')", "merge": True},
        "summary": "Home to Martinborough, renowned for elegant Pinot Noir rivaling Burgundy.",
        "description": "A range of styles and varieties are on offer with standout Pinot Noir, Sauvignon Blanc and Aromatics as well as stylish Chardonnay, Syrah and dessert wines. The three main subregions share broadly similar climate and soils yet also offer subtle differences in character for the discerning palate to explore. With a fascinating early settler history, vines were first planted in 1883 but fell victim to the temperance movement in 1905. Wairarapa's modern wine history dates from the late 1970s and the region boasts some of New Zealand's most iconic and sought after producers.",
        "climate_summary": "Cool, dry climate with significant diurnal variation.",
    },
    {
        "name": "Nelson",
        "slug": "nelson",
        "display_order": 7,
        "linz_query": {"layer": TERRITORIAL_AUTHORITIES_LAYER, "filter": "TA2025_V1_00_NAME IN ('Nelson City', 'Tasman District')", "merge": True},
        "summary": "Boutique region known for diverse wine styles and artistic community.",
        "description": "Nelson is a boutique wine region producing outstanding Pinot Noir, Chardonnay, Sauvignon Blanc and aromatics, as well as an impressive mix of emerging varieties. Long renowned for it's bountiful crops and orchards, Nelson's wine roots were cultivated in the mid-1800s, when German settlers planted the areas first grape vines to produce wine. Pioneering 1970s producers established the modern wine industry – with iconic names such as Seifried and Neudorf still going strong. Nelson has a vibrant artistic and café culture, with many wineries offering both draw-cards at their cellar doors.",
        "climate_summary": "Sunny with moderate temperatures.",
    },
    {
        "name": "Marlborough",
        "slug": "marlborough",
        "display_order": 8,
        "linz_query": {"layer": TERRITORIAL_AUTHORITIES_LAYER, "filter": "TA2025_V1_00_NAME='Marlborough District'"},
        "summary": "New Zealand's largest region, synonymous with world-famous Sauvignon Blanc.",
        "description": "New Zealand's largest and most famous wine region, producing over 75% of the country's wine. The Wairau and Awatere valleys are synonymous with vibrant, aromatic Sauvignon Blanc that defined NZ wine globally. Increasingly recognized for premium Pinot Noir and Chardonnay.",
        "climate_summary": "Cool, dry climate with high sunshine hours.",
    },
    {
        "name": "North Canterbury",
        "slug": "north-canterbury",
        "display_order": 9,
        "linz_query": {"layer": TERRITORIAL_AUTHORITIES_LAYER, "filter": "TA2025_V1_00_NAME='Hurunui District'"},
        "summary": "Centered on Waipara Valley, producing exceptional cool-climate wines.",
        "description": "Centered on the Waipara Valley, this region produces exceptional cool-climate wines. Pinot Noir, Riesling, and Chardonnay thrive in the limestone-rich soils and continental climate. The region is gaining international recognition for its distinctive terroir-driven wines.",
        "climate_summary": "Continental climate with hot summers and cold winters.",
    },
    {
        "name": "Waitaki Valley",
        "slug": "waitaki-valley",
        "display_order": 10,
        "linz_query": {"layer": TERRITORIAL_AUTHORITIES_LAYER, "filter": "TA2025_V1_00_NAME='Waitaki District'"},
        "summary": "New Zealand's most southerly continental region with distinctive limestone terroir.",
        "description": "New Zealand's most southerly and continental wine region, straddling Canterbury and Otago. The limestone soils and extreme climate produce distinctive Pinot Noir, Pinot Gris, and Riesling. A young region with pioneering producers pushing boundaries.",
        "climate_summary": "Extreme continental climate.",
    },
    {
        "name": "Central Otago",
        "slug": "central-otago",
        "display_order": 11,
        "linz_query": {"layer": TERRITORIAL_AUTHORITIES_LAYER, "filter": "TA2025_V1_00_NAME='Central Otago District'"},
        "summary": "World's southernmost wine region, famous for exceptional Pinot Noir.",
        "description": "The world's southernmost wine region and New Zealand's highest. Famous for exceptional Pinot Noir from dramatic sub-regions including Bannockburn, Gibbston, Cromwell Basin, and Bendigo. The extreme continental climate creates wines of remarkable intensity and purity.",
        "climate_summary": "Extreme continental climate with hot summers, cold winters, and significant altitude.",
    },
]


# ============================================================================
# NZWINE STATS 2024 (Complete variety data from NZ Winegrowers Annual Report)
# ============================================================================

def build_varieties_list(varieties_dict: dict, total_ha: float) -> list:
    """Build varieties list with percentages, sorted by area descending."""
    varieties = []
    for name, area_ha in varieties_dict.items():
        if area_ha > 0:
            varieties.append({
                "name": name,
                "area_ha": area_ha,
                "percentage": round((area_ha / total_ha) * 100, 2) if total_ha > 0 else 0
            })
    # Sort by area descending
    varieties.sort(key=lambda x: x["area_ha"], reverse=True)
    return varieties


# Raw variety data by region (all non-zero values from NZWine 2024)
_NORTHLAND_VARIETIES = {
    "Albariño": 0.92, "Arneis": 1.00, "Cabernet Franc": 2.80, "Cabernet Sauvignon": 0.77,
    "Chambourcin": 2.63, "Chardonnay": 20.13, "Chenin Blanc": 0.06, "Flora": 0.43,
    "Gewürztraminer": 1.20, "Grenache": 0.06, "Malbec": 0.13, "Marsanne": 0.10,
    "Merlot": 4.38, "Montepulciano": 0.16, "Muscat Blanc à Petits Grains": 0.10,
    "Niagara": 2.50, "Petit Manseng": 0.01, "Petit Verdot": 0.12, "Pinot Gris": 9.32,
    "Pinot Noir": 0.25, "Pinotage": 2.96, "Roussanne": 0.10, "Sangiovese": 0.35,
    "Sauvignon Blanc": 1.51, "Sauvignon Gris": 0.15, "Semillon": 0.14, "Syrah": 10.68,
    "Tannat": 1.30, "Tempranillo": 1.14, "Vermentino": 0.10, "Viognier": 3.06,
    "Other Reds": 0.12
}

_AUCKLAND_VARIETIES = {
    "Albany's Surprise": 1.00, "Albariño": 9.93, "Arneis": 0.23, "Barbera": 0.26,
    "Cabernet Franc": 17.81, "Cabernet Sauvignon": 16.35, "Carmenère": 0.85,
    "Chambourcin": 1.05, "Chardonnay": 64.47, "Chenin Blanc": 0.14, "Dolcetto": 1.06,
    "Flora": 1.59, "Gewürztraminer": 0.03, "Grenache": 0.01, "Grüner Veltliner": 1.00,
    "Kolor": 0.02, "Malbec": 12.15, "Marsanne": 0.41, "Merlot": 31.51,
    "Montepulciano": 3.55, "Mourvèdre": 0.04, "Muscat Varieties": 0.50, "Nebbiolo": 0.39,
    "Petit Manseng": 0.20, "Petit Verdot": 5.21, "Pinot Gris": 31.01, "Pinot Noir": 2.71,
    "Pinotage": 0.25, "Sangiovese": 3.13, "Saperavi": 0.22, "Sauvignon Blanc": 7.72,
    "Semillon": 0.77, "St Laurent": 0.08, "Syrah": 45.23, "Tannat": 0.37,
    "Tempranillo": 0.80, "Verdelho": 0.50, "Viognier": 3.16
}

_WAIKATO_BOP_VARIETIES = {
    "Cabernet Franc": 0.93, "Cabernet Sauvignon": 0.16, "Chardonnay": 0.45,
    "Malbec": 0.15, "Merlot": 0.37, "Pinot Gris": 2.10, "Pinot Noir": 1.15,
    "Pinotage": 0.13, "Seibel": 0.50, "Syrah": 0.30
}

_GISBORNE_VARIETIES = {
    "Albariño": 20.33, "Carmenère": 0.94, "Chardonnay": 479.86, "Chenin Blanc": 6.17,
    "Gewürztraminer": 7.32, "Malbec": 5.35, "Marsanne": 0.28, "Merlot": 11.77,
    "Montepulciano": 0.45, "Mtsvane": 0.58, "Muscat Varieties": 2.92, "Pinot Gris": 253.85,
    "Pinot Meunier": 0.20, "Pinot Noir": 27.87, "Pinotage": 3.50, "Prosecco/Glera": 2.83,
    "Riesling": 2.03, "Sauvignon Blanc": 492.44, "Seibel": 0.23, "Syrah": 1.51,
    "Verdelho": 0.31, "Viognier": 6.12, "Zinfandel": 0.30
}

_HAWKES_BAY_VARIETIES = {
    "Albariño": 9.45, "Arneis": 2.46, "Barbera": 1.10, "Cabernet Franc": 57.71,
    "Cabernet Sauvignon": 175.47, "Carmenère": 0.15, "Chambourcin": 0.77,
    "Chardonnay": 1045.19, "Chenin Blanc": 4.81, "Fiano": 0.14, "Flora": 0.34,
    "Gamay Noir": 7.53, "Gewürztraminer": 46.87, "Grenache": 1.22, "Grüner Veltliner": 0.40,
    "Kolor": 0.61, "Lagrein": 19.91, "Malbec": 64.13, "Marsanne": 0.29, "Merlot": 831.91,
    "Montepulciano": 2.05, "Nebbiolo": 0.29, "Petit Verdot": 2.06, "Pinot Gris": 681.43,
    "Pinot Meunier": 3.24, "Pinot Noir": 218.53, "Pinotage": 0.36, "Riesling": 4.10,
    "Sangiovese": 1.10, "Saperavi": 0.16, "Sauvignon Blanc": 1129.87, "Sauvignon Gris": 2.59,
    "Semillon": 14.37, "Syrah": 308.13, "Tannat": 0.84, "Tempranillo": 11.69,
    "Touriga Nacional": 0.58, "Viognier": 30.13, "Zinfandel": 1.80, "Other Reds": 0.68
}

_WAIRARAPA_VARIETIES = {
    "Cabernet Franc": 1.53, "Cabernet Sauvignon": 0.25, "Chardonnay": 59.66,
    "Chenin Blanc": 1.84, "Durif": 0.25, "Gamay Noir": 0.75, "Gewürztraminer": 1.90,
    "Grüner Veltliner": 2.42, "Lagrein": 0.14, "Malbec": 0.13, "Marsanne": 0.13,
    "Merlot": 5.09, "Müller-Thurgau": 0.49, "Pinot Blanc": 0.55, "Pinot Gris": 46.75,
    "Pinot Meunier": 1.20, "Pinot Noir": 488.36, "Riesling": 18.38, "Roussanne": 0.07,
    "Sauvignon Blanc": 509.40, "Seibel": 0.08, "Semillon": 0.55, "Syrah": 10.11,
    "Tempranillo": 0.21, "Viognier": 1.46
}

_NELSON_VARIETIES = {
    "Albariño": 11.17, "Cabernet Franc": 0.99, "Chardonnay": 104.02, "Chenin Blanc": 0.20,
    "Gewürztraminer": 18.85, "Grüner Veltliner": 7.88, "Kolor": 0.16, "Malbec": 4.50,
    "Merlot": 2.10, "Montepulciano": 1.45, "Pinot Blanc": 0.58, "Pinot Gris": 109.09,
    "Pinot Meunier": 3.00, "Pinot Noir": 154.98, "Riesling": 22.09, "Sauvignon Blanc": 625.18,
    "Sauvignon Gris": 5.90, "Syrah": 2.15, "Viognier": 1.00, "Würzer": 0.44, "Zweigelt": 0.85
}

_MARLBOROUGH_VARIETIES = {
    "Albariño": 11.32, "Arneis": 1.32, "Blaufränkisch": 0.16, "Cabernet Franc": 1.95,
    "Cabernet Sauvignon": 0.31, "Carmenère": 0.10, "Chardonnay": 1067.95, "Chenin Blanc": 4.37,
    "Gamay Noir": 0.76, "Gewürztraminer": 63.47, "Grüner Veltliner": 27.46, "Lagrein": 1.36,
    "Malbec": 1.50, "Marsanne": 0.30, "Merlot": 17.30, "Montepulciano": 0.91,
    "Muscat Blanc à Petits Grains": 0.18, "Muscat Varieties": 0.74, "Nebbiolo": 0.35,
    "Petit Manseng": 0.96, "Petit Verdot": 0.05, "Pinot Blanc": 5.52, "Pinot Gris": 1235.48,
    "Pinot Meunier": 7.15, "Pinot Noir": 2427.27, "Pinotage": 5.79, "Prosecco/Glera": 0.06,
    "Riesling": 197.16, "Sangiovese": 0.01, "Saperavi": 0.30, "Sauvignon Blanc": 25891.29,
    "Sauvignon Gris": 77.61, "Semillon": 5.94, "St Laurent": 1.20, "Syrah": 11.52,
    "Tempranillo": 1.42, "Verdelho": 0.01, "Vermentino": 0.10, "Viognier": 6.80,
    "Zweigelt": 0.94, "Other Whites": 0.07
}

_NORTH_CANTERBURY_VARIETIES = {
    "Albariño": 1.97, "Cabernet Franc": 3.81, "Cabernet Sauvignon": 4.82, "Chardonnay": 94.00,
    "Chenin Blanc": 1.20, "Fiano": 0.46, "Gewürztraminer": 15.65, "Grüner Veltliner": 2.74,
    "Malbec": 2.54, "Merlot": 6.93, "Müller-Thurgau": 0.06, "Muscat Varieties": 1.59,
    "Optima": 0.12, "Pinot Gris": 221.77, "Pinot Meunier": 0.05, "Pinot Noir": 401.75,
    "Pinotage": 0.57, "Riesling": 256.42, "Sauvignon Blanc": 465.78, "Scheurebe": 0.75,
    "Semillon": 4.74, "St Laurent": 0.71, "Syrah": 8.30, "Tempranillo": 0.98,
    "Verdelho": 0.45, "Viognier": 1.29
}

_WAITAKI_VALLEY_VARIETIES = {
    "Chenin Blanc": 0.10, "Gewürztraminer": 2.14, "Chardonnay": 6.54, "Muscat Varieties": 0.10,
    "Pinot Gris": 14.39, "Pinot Noir": 22.97, "Riesling": 4.09, "Sauvignon Blanc": 0.10,
    "Syrah": 0.10, "Viognier": 0.17
}

_CENTRAL_OTAGO_VARIETIES = {
    "Albariño": 0.03, "Cabernet Franc": 1.17, "Chardonnay": 102.57, "Chenin Blanc": 3.00,
    "Dolcetto": 0.50, "Gamay Noir": 2.11, "Gewürztraminer": 8.12, "Grüner Veltliner": 0.93,
    "Lagrein": 0.11, "Merlot": 2.00, "Muscat Blanc à Petits Grains": 0.32, "Muscat Varieties": 0.33,
    "Osteiner": 0.67, "Pinot Blanc": 2.89, "Pinot Gris": 167.29, "Pinot Noir": 1741.98,
    "Riesling": 48.88, "Sauvignon Blanc": 51.07, "Sauvignon Gris": 0.30, "St Laurent": 0.50,
    "Syrah": 4.28, "Tempranillo": 0.89, "Viognier": 0.03, "Zinfandel": 0.06
}

# Build complete REGION_STATS with all varieties
REGION_STATS = {
    "northland": {
        "year": 2024,
        "total_planted_ha": 68.82,
        "varieties": build_varieties_list(_NORTHLAND_VARIETIES, 68.82),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "auckland": {
        "year": 2024,
        "total_planted_ha": 265.69,
        "varieties": build_varieties_list(_AUCKLAND_VARIETIES, 265.69),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "waikato-bay-of-plenty": {
        "year": 2024,
        "total_planted_ha": 6.24,
        "varieties": build_varieties_list(_WAIKATO_BOP_VARIETIES, 6.24),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "gisborne": {
        "year": 2024,
        "total_planted_ha": 1327.85,
        "varieties": build_varieties_list(_GISBORNE_VARIETIES, 1327.85),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "hawkes-bay": {
        "year": 2024,
        "total_planted_ha": 4683.64,
        "varieties": build_varieties_list(_HAWKES_BAY_VARIETIES, 4683.64),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "wairarapa": {
        "year": 2024,
        "total_planted_ha": 1150.82,
        "varieties": build_varieties_list(_WAIRARAPA_VARIETIES, 1150.82),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "nelson": {
        "year": 2024,
        "total_planted_ha": 1077.58,
        "varieties": build_varieties_list(_NELSON_VARIETIES, 1077.58),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "marlborough": {
        "year": 2024,
        "total_planted_ha": 31073.41,
        "varieties": build_varieties_list(_MARLBOROUGH_VARIETIES, 31073.41),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "north-canterbury": {
        "year": 2024,
        "total_planted_ha": 1498.29,
        "varieties": build_varieties_list(_NORTH_CANTERBURY_VARIETIES, 1498.29),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "waitaki-valley": {
        "year": 2024,
        "total_planted_ha": 50.70,
        "varieties": build_varieties_list(_WAITAKI_VALLEY_VARIETIES, 50.70),
        "source": "NZ Winegrowers Annual Report 2024"
    },
    "central-otago": {
        "year": 2024,
        "total_planted_ha": 2140.07,
        "varieties": build_varieties_list(_CENTRAL_OTAGO_VARIETIES, 2140.07),
        "source": "NZ Winegrowers Annual Report 2024"
    },
}


# ============================================================================
# STATS NZ DATA FETCHING
# ============================================================================

def fetch_linz_boundary(layer_id: int, cql_filter: str) -> dict:
    """
    Fetch boundary geometry from Stats NZ Datafinder.
    
    Args:
        layer_id: Stats NZ layer ID
        cql_filter: CQL filter string for querying specific boundaries
    
    Returns:
        GeoJSON geometry or None if failed
    """
    if not STATS_NZ_API_KEY:
        logger.error("STATS_NZ_API_KEY environment variable not set!")
        logger.error("Get your API key from: https://datafinder.stats.govt.nz/")
        return None
    
    # Stats NZ datafinder requires API key in URL path (same as LINZ/Koordinates)
    url = f"{STATS_NZ_BASE_URL};key={STATS_NZ_API_KEY}/wfs"
    
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": f"layer-{layer_id}",
        "outputFormat": "application/json",
        "CQL_FILTER": cql_filter,
        "srsName": "EPSG:4326"
    }
    
    try:
        logger.info(f"Fetching from Stats NZ: layer-{layer_id} with filter: {cql_filter}")
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        
        data = response.json()
        
        if "features" in data and len(data["features"]) > 0:
            # If multiple features, merge them
            if len(data["features"]) > 1:
                return merge_geometries(data["features"])
            else:
                return data["features"][0]["geometry"]
        else:
            logger.warning(f"No features found for filter: {cql_filter}")
            return None
            
    except requests.RequestException as e:
        logger.error(f"Error fetching Stats NZ data: {e}")
        return None


def merge_geometries(features: list) -> dict:
    """
    Merge multiple GeoJSON features into a single MultiPolygon.
    """
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    
    geometries = [shape(f["geometry"]) for f in features]
    merged = unary_union(geometries)
    
    # Ensure it's a MultiPolygon
    if merged.geom_type == "Polygon":
        from shapely.geometry import MultiPolygon
        merged = MultiPolygon([merged])
    
    return mapping(merged)


def calculate_bounds(geometry: dict) -> dict:
    """
    Calculate bounding box from GeoJSON geometry.
    """
    from shapely.geometry import shape
    
    geom = shape(geometry)
    bounds = geom.bounds  # (minx, miny, maxx, maxy)
    
    return {
        "min_lng": bounds[0],
        "min_lat": bounds[1],
        "max_lng": bounds[2],
        "max_lat": bounds[3]
    }


# ============================================================================
# SEEDING FUNCTION
# ============================================================================

def seed_regions(dry_run: bool = False, update: bool = False, stats_only: bool = False):
    """
    Seed wine regions into the database.
    
    Args:
        dry_run: Preview changes without committing
        update: Update existing regions instead of skipping
        stats_only: Only update the stats field (skip geometry fetch)
    """
    db = SessionLocal()
    
    try:
        logger.info("Starting wine regions seeding...")
        if update:
            logger.info("UPDATE mode: Will update existing regions")
        if stats_only:
            logger.info("STATS ONLY mode: Will only update stats field")
        
        for region_data in WINE_REGIONS:
            slug = region_data["slug"]
            logger.info(f"Processing region: {region_data['name']}")
            
            # Check if already exists
            existing = db.query(WineRegion).filter(WineRegion.slug == slug).first()
            
            if existing and not update:
                logger.info(f"  Region '{slug}' already exists, skipping (use --update to modify)")
                continue
            
            # Get stats
            stats = REGION_STATS.get(slug, {})
            variety_count = len(stats.get("varieties", []))
            logger.info(f"  Stats: {stats.get('total_planted_ha', 'N/A')} ha, {variety_count} varieties")
            
            if dry_run:
                if existing:
                    logger.info(f"  [DRY RUN] Would update region: {region_data['name']}")
                else:
                    logger.info(f"  [DRY RUN] Would insert region: {region_data['name']}")
                continue
            
            if existing and update:
                # Update existing region
                if stats_only:
                    # Only update stats
                    existing.stats = stats
                    logger.info(f"  ✅ Updated stats for: {region_data['name']}")
                else:
                    # Update all fields
                    existing.name = region_data["name"]
                    existing.summary = region_data["summary"]
                    existing.description = region_data["description"]
                    existing.climate_summary = region_data["climate_summary"]
                    existing.stats = stats
                    existing.display_order = region_data["display_order"]
                    
                    # Optionally re-fetch geometry
                    if not existing.geometry:
                        linz_query = region_data["linz_query"]
                        geometry = fetch_linz_boundary(
                            linz_query["layer"],
                            linz_query["filter"]
                        )
                        if geometry:
                            from shapely.geometry import shape
                            from geoalchemy2.shape import from_shape
                            
                            bounds = calculate_bounds(geometry)
                            existing.bounds = bounds
                            geom_shape = shape(geometry)
                            existing.geometry = from_shape(geom_shape, srid=4326)
                            logger.info(f"  Added geometry with bounds: {bounds}")
                    
                    logger.info(f"  ✅ Updated region: {region_data['name']}")
                
                db.commit()
                continue
            
            # Create new region
            geometry = None
            bounds = None
            
            if not stats_only:
                linz_query = region_data["linz_query"]
                geometry = fetch_linz_boundary(
                    linz_query["layer"],
                    linz_query["filter"]
                )
                
                if geometry:
                    bounds = calculate_bounds(geometry)
                    logger.info(f"  Fetched boundary with bounds: {bounds}")
                else:
                    logger.warning(f"  Could not fetch boundary for {slug}")
            
            region = WineRegion(
                name=region_data["name"],
                slug=slug,
                summary=region_data["summary"],
                description=region_data["description"],
                climate_summary=region_data["climate_summary"],
                stats=stats,
                display_order=region_data["display_order"],
                color="#3b82f6",
                is_active=True,
                bounds=bounds
            )
            
            # Add geometry if we have it
            if geometry:
                from shapely.geometry import shape
                from geoalchemy2.shape import from_shape
                
                geom_shape = shape(geometry)
                region.geometry = from_shape(geom_shape, srid=4326)
            
            db.add(region)
            db.commit()
            logger.info(f"  ✅ Inserted region: {region_data['name']}")
        
        logger.info("✅ Wine regions seeding complete!")
        
    except Exception as e:
        logger.error(f"Error seeding regions: {e}")
        db.rollback()
        raise
    finally:
        db.close()


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Seed wine regions data")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    parser.add_argument("--update", action="store_true", help="Update existing regions")
    parser.add_argument("--stats-only", action="store_true", help="Only update stats (use with --update)")
    args = parser.parse_args()
    
    seed_regions(dry_run=args.dry_run, update=args.update, stats_only=args.stats_only)


if __name__ == "__main__":
    main()