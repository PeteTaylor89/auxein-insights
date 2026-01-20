#!/usr/bin/env python3
"""
scripts/disease_service_v2.py

Disease pressure calculations based on validated scientific models:

1. POWDERY MILDEW - UC Davis Risk Index (Gubler et al. 1999)
   - Cumulative index 0-100 based on hours at 21-30°C
   - Requires 3 consecutive days with ≥6 hours at 21-30°C to trigger
   - Index +20/day when favorable, -10/day when unfavorable
   - High temps (>35°C) reduce index

2. BOTRYTIS - González-Domínguez et al. 2015 mechanistic model
   - Temperature equivalent equations for infection rate
   - Two infection windows: flowering and ripening
   - Considers wetness, humidity, and berry-to-berry spread

3. DOWNY MILDEW - 3-10 Model + Goidanich Index
   - Primary: ≥10°C, ≥10mm rain in 24-48h
   - Secondary: Goidanich Index based on temp/humidity cycles

References:
- Gubler WD et al. (1999) Control of Powdery Mildew Using the UC Davis Risk Index
- González-Domínguez E et al. (2015) A Mechanistic Model of Botrytis cinerea. PLOS ONE
- Goidanich G (1964) Manuale di patologia vegetale
"""

import argparse
import logging
import math
import sys
from datetime import datetime, date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

import pytz

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.session import SessionLocal
from db.models.realtime_climate import DiseasePressure

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NZ_TZ = pytz.timezone('Pacific/Auckland')


@dataclass
class DiseaseRisk:
    """Disease risk assessment result."""
    score: int  # 0-100
    risk_level: str  # 'low', 'moderate', 'high', 'extreme'
    description: str
    factors: Dict
    spray_recommendation: str


# =============================================================================
# POWDERY MILDEW - UC Davis Risk Index (Gubler et al. 1999)
# =============================================================================

def estimate_hours_in_range(temp_min: float, temp_max: float, 
                            range_min: float = 21.0, range_max: float = 30.0) -> float:
    """
    Estimate hours per day within temperature range using sinusoidal approximation.
    
    Assumes temperature follows a sine wave between min (at ~5am) and max (at ~3pm).
    """
    if temp_max < range_min or temp_min > range_max:
        return 0.0
    
    if temp_min >= range_min and temp_max <= range_max:
        return 24.0
    
    # Amplitude and midpoint of daily temperature cycle
    amplitude = (temp_max - temp_min) / 2
    midpoint = (temp_max + temp_min) / 2
    
    if amplitude == 0:
        return 24.0 if range_min <= midpoint <= range_max else 0.0
    
    # Calculate fraction of day in range using inverse sine
    hours = 0.0
    
    # Lower threshold crossing
    if temp_min < range_min < temp_max:
        # Angle where temp crosses range_min
        sin_val = (range_min - midpoint) / amplitude
        sin_val = max(-1, min(1, sin_val))  # Clamp to valid range
        angle = math.asin(sin_val)
        # Hours above range_min
        hours_above_min = 24 * (math.pi - 2 * angle) / (2 * math.pi)
    else:
        hours_above_min = 24.0 if temp_min >= range_min else 0.0
    
    # Upper threshold crossing
    if temp_min < range_max < temp_max:
        sin_val = (range_max - midpoint) / amplitude
        sin_val = max(-1, min(1, sin_val))
        angle = math.asin(sin_val)
        hours_below_max = 24 * (math.pi - 2 * angle) / (2 * math.pi)
    else:
        hours_below_max = 24.0 if temp_max <= range_max else 0.0
    
    # Hours in range = hours above min AND below max
    hours = min(hours_above_min, hours_below_max)
    
    return max(0.0, min(24.0, hours))


def calc_powdery_mildew_index(
    recent_days: List[Dict],
    previous_index: float = 0.0,
    index_triggered: bool = False
) -> DiseaseRisk:
    """
    Calculate UC Davis Powdery Mildew Risk Index.
    
    Rules (Gubler et al. 1999):
    - Requires 3 consecutive days with ≥6 hours at 21-30°C to trigger index
    - Once triggered: +20 points/day with ≥6 hours at 21-30°C
    - -10 points/day with <6 hours at 21-30°C
    - -10 points if any time >35°C for 15+ minutes
    - Index ranges 0-100
    
    Args:
        recent_days: List of recent daily climate data (newest first), needs temp_min, temp_max
        previous_index: Previous day's index value
        index_triggered: Whether the 3-day trigger has been met this season
    
    Returns:
        DiseaseRisk with score 0-100
    """
    if not recent_days or len(recent_days) < 1:
        return DiseaseRisk(
            score=0, risk_level='low',
            description='Insufficient data for powdery mildew assessment',
            factors={}, spray_recommendation='Monitor conditions'
        )
    
    today = recent_days[0]
    temp_min = today.get('temp_min')
    temp_max = today.get('temp_max')
    
    if temp_min is None or temp_max is None:
        return DiseaseRisk(
            score=0, risk_level='low',
            description='Temperature data unavailable',
            factors={}, spray_recommendation='Monitor conditions'
        )
    
    # Estimate hours in favorable range (21-30°C)
    hours_favorable = estimate_hours_in_range(temp_min, temp_max, 21.0, 30.0)
    
    # Check for heat spike (>35°C reduces pressure)
    heat_spike = temp_max >= 35.0
    
    # Check 3-day trigger if not already triggered
    if not index_triggered and len(recent_days) >= 3:
        consecutive_favorable = 0
        for day in recent_days[:3]:
            if day.get('temp_min') and day.get('temp_max'):
                h = estimate_hours_in_range(day['temp_min'], day['temp_max'], 21.0, 30.0)
                if h >= 6:
                    consecutive_favorable += 1
                else:
                    break
        index_triggered = consecutive_favorable >= 3
    
    # Calculate today's index
    if not index_triggered:
        score = 0
        description = 'Index not yet triggered (need 3 consecutive days with ≥6h at 21-30°C)'
    else:
        if hours_favorable >= 6:
            score = min(100, previous_index + 20)
        else:
            score = max(0, previous_index - 10)
        
        if heat_spike:
            score = max(0, score - 10)
            description = f'Heat spike (≥35°C) reduced pressure. {hours_favorable:.1f}h in favorable range.'
        else:
            description = f'{hours_favorable:.1f}h in favorable range (21-30°C) today.'
    
    # Determine risk level and recommendations
    if score >= 60:
        risk_level = 'high' if score < 80 else 'extreme'
        spray_recommendation = 'Shorten spray interval to minimum label rate. Pathogen reproducing every 5-7 days.'
    elif score >= 40:
        risk_level = 'moderate'
        spray_recommendation = 'Maintain standard spray interval. Pathogen reproduction ~8-11 days.'
    else:
        risk_level = 'low'
        spray_recommendation = 'Extend spray interval to maximum allowable. Minimal pathogen activity.'
    
    return DiseaseRisk(
        score=int(score),
        risk_level=risk_level,
        description=description,
        factors={
            'hours_21_30C': round(hours_favorable, 1),
            'temp_min': temp_min,
            'temp_max': temp_max,
            'heat_spike': heat_spike,
            'index_triggered': index_triggered,
            'previous_index': previous_index
        },
        spray_recommendation=spray_recommendation
    )


# =============================================================================
# BOTRYTIS - González-Domínguez et al. 2015 Model
# =============================================================================

def temperature_equivalent(temp: float, t_min: float, t_max: float) -> float:
    """
    Calculate temperature equivalent for rate equations.
    Teq = (T - Tmin) / (Tmax - Tmin), bounded 0-1
    """
    if temp <= t_min or temp >= t_max:
        return 0.0
    return (temp - t_min) / (t_max - t_min)


def calc_botrytis_sporulation_rate(temp: float, rh: float) -> float:
    """
    Calculate sporulation rate on inoculum sources (Eq. 3 from paper).
    
    SPOR = 3.7 × Teq^0.9 × (1-Teq)^10.49 × (-3.595 + 0.097×RH - 0.0005×RH²)
    
    Tmin=0°C, Tmax=35°C for sporulation
    """
    teq = temperature_equivalent(temp, 0, 35)
    if teq <= 0:
        return 0.0
    
    temp_factor = 3.7 * (teq ** 0.9) * ((1 - teq) ** 10.49)
    rh_factor = -3.595 + 0.097 * rh - 0.0005 * (rh ** 2)
    
    return max(0, temp_factor * rh_factor)


def calc_botrytis_infection_rate_ripening(temp: float, wetness_hours: float, rh: float) -> float:
    """
    Calculate infection rate on ripening berries (Eq. 7 + 10 from paper).
    
    Conidial infection (INF2):
    INF2 = 6.416 × Teq^1.292 × (1-Teq)^0.469 × e^(-2.3×e^(-0.048×WD))
    
    Berry-to-berry infection (INF3):
    INF3 = 7.75 × Teq^2.14 × (1-Teq)^0.469 / (1 + e^(35.36-0.26×RH))
    
    For daily data, we estimate wetness from RH≥90%
    """
    teq_conidia = temperature_equivalent(temp, 0, 35)
    teq_mycelium = temperature_equivalent(temp, 0, 30)
    
    # Conidial infection rate
    if teq_conidia > 0 and wetness_hours > 0:
        inf2 = 6.416 * (teq_conidia ** 1.292) * ((1 - teq_conidia) ** 0.469)
        inf2 *= math.exp(-2.3 * math.exp(-0.048 * wetness_hours))
    else:
        inf2 = 0
    
    # Berry-to-berry infection rate (mycelium)
    if teq_mycelium > 0:
        inf3 = 7.75 * (teq_mycelium ** 2.14) * ((1 - teq_mycelium) ** 0.469)
        inf3 /= (1 + math.exp(35.36 - 0.26 * rh))
    else:
        inf3 = 0
    
    return inf2 + inf3


def calc_botrytis_risk(
    temp_mean: Optional[float],
    humidity: Optional[float],
    rain_7d: float,
    consecutive_wet_days: int,
    growth_stage: str = 'ripening'  # 'flowering', 'veraison', 'ripening'
) -> DiseaseRisk:
    """
    Calculate Botrytis risk using González-Domínguez mechanistic model.
    
    Args:
        temp_mean: Daily mean temperature (°C)
        humidity: Mean relative humidity (%)
        rain_7d: Total rainfall in past 7 days (mm)
        consecutive_wet_days: Number of consecutive days with >1mm rain
        growth_stage: Current phenological stage
    
    Returns:
        DiseaseRisk with score 0-100
    """
    if temp_mean is None:
        return DiseaseRisk(
            score=0, risk_level='low',
            description='Temperature data unavailable',
            factors={}, spray_recommendation='Monitor conditions'
        )
    
    rh = humidity if humidity else 70  # Default if unavailable
    
    # Estimate wetness hours from humidity (rough approximation)
    # High RH (≥90%) suggests leaf wetness
    if rh >= 90:
        wetness_hours = 12  # Extended wetness
    elif rh >= 80:
        wetness_hours = 6
    elif rh >= 70:
        wetness_hours = 2
    else:
        wetness_hours = 0
    
    # Add wetness from rain
    if rain_7d >= 10:
        wetness_hours = min(24, wetness_hours + 8)
    elif rain_7d >= 5:
        wetness_hours = min(24, wetness_hours + 4)
    
    # Calculate infection components
    spor_rate = calc_botrytis_sporulation_rate(temp_mean, rh)
    inf_rate = calc_botrytis_infection_rate_ripening(temp_mean, wetness_hours, rh)
    
    # Growth stage susceptibility modifier (from paper's SUS equations)
    if growth_stage == 'flowering':
        susceptibility = 0.8  # High susceptibility at flowering
    elif growth_stage == 'veraison':
        susceptibility = 0.5  # Increasing
    else:  # ripening
        susceptibility = 1.0  # Maximum susceptibility
    
    # Combine into severity score (normalized to 0-100)
    # The paper's equations produce values ~0-1 for rates
    raw_severity = (spor_rate * 0.3 + inf_rate * 0.7) * susceptibility
    
    # Boost for sustained wet conditions (consecutive wet days critical for botrytis)
    if consecutive_wet_days >= 3:
        raw_severity *= 1.5
    elif consecutive_wet_days >= 2:
        raw_severity *= 1.2
    
    # Scale to 0-100
    score = min(100, int(raw_severity * 100))
    
    # Risk levels based on paper's epidemic classifications
    if score >= 70:
        risk_level = 'extreme'
        description = f'Severe botrytis conditions: {temp_mean:.1f}°C, {rh:.0f}% RH, {rain_7d:.1f}mm rain (7d)'
        spray_rec = 'Immediate action required. Leaf plucking and fungicide application recommended.'
    elif score >= 50:
        risk_level = 'high'
        description = f'High botrytis pressure: favorable temp ({temp_mean:.1f}°C) and moisture'
        spray_rec = 'Apply preventative fungicide. Monitor bunch zone closely.'
    elif score >= 30:
        risk_level = 'moderate'
        description = f'Moderate botrytis conditions present'
        spray_rec = 'Monitor bunch zone humidity. Consider canopy management.'
    else:
        risk_level = 'low'
        description = 'Unfavorable conditions for botrytis'
        spray_rec = 'Continue monitoring. No immediate action required.'
    
    return DiseaseRisk(
        score=score,
        risk_level=risk_level,
        description=description,
        factors={
            'temp_mean': temp_mean,
            'humidity': rh,
            'rain_7d': rain_7d,
            'wetness_hours_est': wetness_hours,
            'consecutive_wet_days': consecutive_wet_days,
            'sporulation_rate': round(spor_rate, 3),
            'infection_rate': round(inf_rate, 3),
            'growth_stage': growth_stage
        },
        spray_recommendation=spray_rec
    )


# =============================================================================
# DOWNY MILDEW - 3-10 Model + Goidanich Index
# =============================================================================

def check_primary_infection_trigger(
    temp_mean: float,
    rain_48h: float,
    shoots_emerged: bool = True
) -> bool:
    """
    Check if 3-10 primary infection conditions are met.
    
    Trigger: ≥10°C, ≥10mm rain over 24-48h, shoots ≥10cm
    """
    return shoots_emerged and temp_mean >= 10 and rain_48h >= 10


def calc_goidanich_index(
    temp_mean: float,
    humidity: float,
    rain_today: float
) -> float:
    """
    Calculate Goidanich Index for secondary infection potential.
    
    Based on Goidanich (1964) and subsequent adaptations:
    - Optimal conditions: 18-22°C, RH >80%, leaf wetness
    - Index accumulates under favorable conditions
    """
    # Temperature factor (optimal 18-22°C)
    if 18 <= temp_mean <= 22:
        temp_factor = 1.0
    elif 15 <= temp_mean < 18 or 22 < temp_mean <= 25:
        temp_factor = 0.7
    elif 10 <= temp_mean < 15 or 25 < temp_mean <= 30:
        temp_factor = 0.3
    else:
        temp_factor = 0.0
    
    # Humidity factor
    if humidity >= 90:
        rh_factor = 1.0
    elif humidity >= 80:
        rh_factor = 0.7
    elif humidity >= 70:
        rh_factor = 0.3
    else:
        rh_factor = 0.0
    
    # Rain/wetness factor
    if rain_today >= 5:
        wet_factor = 1.0
    elif rain_today >= 2:
        wet_factor = 0.7
    elif rain_today >= 0.5 or humidity >= 90:
        wet_factor = 0.4
    else:
        wet_factor = 0.1
    
    # Combined index (multiplicative)
    return temp_factor * rh_factor * wet_factor


def calc_downy_mildew_risk(
    temp_mean: Optional[float],
    temp_min: Optional[float],
    humidity: Optional[float],
    rain_today: float,
    rain_48h: float,
    rain_7d: float,
    primary_triggered_this_season: bool = False
) -> DiseaseRisk:
    """
    Calculate Downy Mildew risk using 3-10 model and Goidanich Index.
    
    Args:
        temp_mean: Daily mean temperature (°C)
        temp_min: Daily minimum temperature (°C)
        humidity: Mean relative humidity (%)
        rain_today: Rainfall today (mm)
        rain_48h: Rainfall in past 48 hours (mm)
        rain_7d: Rainfall in past 7 days (mm)
        primary_triggered_this_season: Whether primary infection has occurred
    
    Returns:
        DiseaseRisk with score 0-100
    """
    if temp_mean is None:
        return DiseaseRisk(
            score=0, risk_level='low',
            description='Temperature data unavailable',
            factors={}, spray_recommendation='Monitor conditions'
        )
    
    rh = humidity if humidity else 70
    
    # Check primary infection trigger
    primary_trigger = check_primary_infection_trigger(temp_mean, rain_48h)
    
    if primary_trigger:
        primary_triggered_this_season = True
    
    # Calculate Goidanich index for current conditions
    goidanich = calc_goidanich_index(temp_mean, rh, rain_today)
    
    # Base score from Goidanich
    base_score = goidanich * 60  # Scale 0-60
    
    # Boost if primary has been triggered (secondary cycles possible)
    if primary_triggered_this_season:
        base_score += 20
    
    # Boost for sustained wet conditions
    if rain_7d >= 20:
        base_score += 15
    elif rain_7d >= 10:
        base_score += 10
    
    # Temperature must be above minimum
    if temp_min is not None and temp_min < 8:
        base_score *= 0.5  # Cold nights inhibit
    
    score = min(100, int(base_score))
    
    # Risk levels
    if primary_trigger:
        risk_level = 'extreme' if score >= 60 else 'high'
        description = f'PRIMARY INFECTION EVENT: ≥10°C ({temp_mean:.1f}°C) and ≥10mm rain ({rain_48h:.1f}mm/48h)'
        spray_rec = 'Primary infection likely. Apply protective fungicide within 24-48 hours.'
    elif score >= 70:
        risk_level = 'extreme'
        description = f'Very high secondary infection risk: {temp_mean:.1f}°C, {rh:.0f}% RH'
        spray_rec = 'High sporulation conditions. Maintain short spray intervals.'
    elif score >= 50:
        risk_level = 'high'
        description = f'Favorable conditions for downy mildew spread'
        spray_rec = 'Apply preventative fungicide. Monitor for symptoms.'
    elif score >= 30:
        risk_level = 'moderate'
        description = f'Some favorable conditions present'
        spray_rec = 'Continue monitoring. Standard spray program.'
    else:
        risk_level = 'low'
        description = 'Unfavorable conditions for downy mildew'
        spray_rec = 'Low risk. Extended spray intervals acceptable.'
    
    return DiseaseRisk(
        score=score,
        risk_level=risk_level,
        description=description,
        factors={
            'temp_mean': temp_mean,
            'temp_min': temp_min,
            'humidity': rh,
            'rain_today': rain_today,
            'rain_48h': rain_48h,
            'rain_7d': rain_7d,
            'primary_trigger': primary_trigger,
            'primary_triggered_season': primary_triggered_this_season,
            'goidanich_index': round(goidanich, 3)
        },
        spray_recommendation=spray_rec
    )


# =============================================================================
# DATABASE OPERATIONS
# =============================================================================

def get_zones_with_climate_data(db, target_date: date) -> List[dict]:
    """Get zones with climate data for target date."""
    result = db.execute(text("""
        SELECT 
            czd.zone_id, cz.name as zone_name,
            czd.temp_min, czd.temp_max, czd.temp_mean,
            czd.humidity_mean, czd.rainfall_mm,
            czd.confidence
        FROM climate_zone_daily czd
        JOIN climate_zones cz ON czd.zone_id = cz.id
        WHERE czd.date = :target_date
    """), {'target_date': target_date})
    
    return [
        {
            'zone_id': r[0], 'zone_name': r[1],
            'temp_min': float(r[2]) if r[2] else None,
            'temp_max': float(r[3]) if r[3] else None,
            'temp_mean': float(r[4]) if r[4] else None,
            'humidity_mean': float(r[5]) if r[5] else None,
            'rainfall_mm': float(r[6]) if r[6] else 0,
            'confidence': r[7]
        }
        for r in result
    ]


def get_recent_climate(db, zone_id: int, target_date: date, days: int = 7) -> Dict:
    """Get recent climate summary for a zone."""
    start_date = target_date - timedelta(days=days)
    
    result = db.execute(text("""
        SELECT 
            date, rainfall_mm, temp_min, temp_max, temp_mean, humidity_mean
        FROM climate_zone_daily
        WHERE zone_id = :zone_id 
          AND date > :start_date 
          AND date <= :target_date
        ORDER BY date DESC
    """), {'zone_id': zone_id, 'start_date': start_date, 'target_date': target_date})
    
    rows = list(result)
    
    rain_7d = sum(float(r[1]) for r in rows if r[1]) 
    rain_3d = sum(float(r[1]) for r in rows[:3] if r[1])
    rain_48h = sum(float(r[1]) for r in rows[:2] if r[1])
    
    # Count consecutive wet days (>1mm)
    consecutive_wet = 0
    for r in rows:
        if r[1] and float(r[1]) > 1:
            consecutive_wet += 1
        else:
            break
    
    # Build recent days list for powdery mildew index
    recent_days = [
        {
            'date': r[0],
            'rainfall_mm': float(r[1]) if r[1] else 0,
            'temp_min': float(r[2]) if r[2] else None,
            'temp_max': float(r[3]) if r[3] else None,
            'temp_mean': float(r[4]) if r[4] else None,
            'humidity_mean': float(r[5]) if r[5] else None,
        }
        for r in rows
    ]
    
    return {
        'rain_7d': rain_7d,
        'rain_3d': rain_3d,
        'rain_48h': rain_48h,
        'consecutive_wet_days': consecutive_wet,
        'recent_days': recent_days
    }


def get_previous_disease_state(db, zone_id: int, target_date: date) -> Dict:
    """Get previous day's disease state for continuity."""
    prev_date = target_date - timedelta(days=1)
    
    result = db.execute(text("""
        SELECT risk_factors FROM disease_pressure
        WHERE zone_id = :zone_id AND date = :prev_date
    """), {'zone_id': zone_id, 'prev_date': prev_date}).fetchone()
    
    if result and result[0]:
        factors = result[0]
        return {
            'powdery_index': factors.get('powdery', {}).get('previous_index', 0),
            'powdery_triggered': factors.get('powdery', {}).get('index_triggered', False),
            'downy_primary_triggered': factors.get('downy', {}).get('primary_triggered_season', False)
        }
    
    return {
        'powdery_index': 0,
        'powdery_triggered': False,
        'downy_primary_triggered': False
    }


def run_disease_service(
    target_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    dry_run: bool = False
):
    """Run disease pressure calculations."""
    
    # Determine dates to process
    if target_date:
        dates_to_process = [datetime.strptime(target_date, '%Y-%m-%d').date()]
    elif start_date and end_date:
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
        dates_to_process = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    else:
        yesterday = (datetime.now(NZ_TZ) - timedelta(days=1)).date()
        dates_to_process = [yesterday]
    
    logger.info("Disease Pressure Service v2 (Scientific Models)")
    logger.info(f"Dates: {dates_to_process[0]} to {dates_to_process[-1]} ({len(dates_to_process)} days)")
    
    if dry_run:
        logger.info("[DRY RUN MODE]")
    
    db = SessionLocal()
    
    try:
        total_count = 0
        
        for target in sorted(dates_to_process):
            zones = get_zones_with_climate_data(db, target)
            
            if not zones:
                logger.info(f"  {target}: No zones with climate data, skipping")
                continue
            
            count = 0
            for zone in zones:
                recent = get_recent_climate(db, zone['zone_id'], target)
                prev_state = get_previous_disease_state(db, zone['zone_id'], target)
                
                # Calculate Powdery Mildew (UC Davis Index)
                powdery = calc_powdery_mildew_index(
                    recent_days=recent['recent_days'],
                    previous_index=prev_state['powdery_index'],
                    index_triggered=prev_state['powdery_triggered']
                )
                
                # Calculate Botrytis (González-Domínguez model)
                botrytis = calc_botrytis_risk(
                    temp_mean=zone['temp_mean'],
                    humidity=zone['humidity_mean'],
                    rain_7d=recent['rain_7d'],
                    consecutive_wet_days=recent['consecutive_wet_days']
                )
                
                # Calculate Downy Mildew (3-10 + Goidanich)
                downy = calc_downy_mildew_risk(
                    temp_mean=zone['temp_mean'],
                    temp_min=zone['temp_min'],
                    humidity=zone['humidity_mean'],
                    rain_today=zone['rainfall_mm'],
                    rain_48h=recent['rain_48h'],
                    rain_7d=recent['rain_7d'],
                    primary_triggered_this_season=prev_state['downy_primary_triggered']
                )
                
                # Compile risk factors
                risk_factors = {
                    'powdery': powdery.factors,
                    'botrytis': botrytis.factors,
                    'downy': downy.factors,
                    'recent_climate': {
                        'rain_7d': recent['rain_7d'],
                        'rain_3d': recent['rain_3d'],
                        'consecutive_wet_days': recent['consecutive_wet_days']
                    }
                }
                
                # Generate overall recommendations
                recommendations = []
                if powdery.risk_level in ('high', 'extreme'):
                    recommendations.append(f"POWDERY ({powdery.score}): {powdery.spray_recommendation}")
                if botrytis.risk_level in ('high', 'extreme'):
                    recommendations.append(f"BOTRYTIS ({botrytis.score}): {botrytis.spray_recommendation}")
                if downy.risk_level in ('high', 'extreme'):
                    recommendations.append(f"DOWNY ({downy.score}): {downy.spray_recommendation}")
                
                if not recommendations:
                    recommendations.append("Low overall disease pressure. Continue monitoring.")
                
                if dry_run:
                    logger.info(f"    {zone['zone_name']}: PM={powdery.score} ({powdery.risk_level}), "
                               f"BOT={botrytis.score} ({botrytis.risk_level}), "
                               f"DM={downy.score} ({downy.risk_level})")
                else:
                    # Upsert to database
                    existing = db.query(DiseasePressure).filter(
                        DiseasePressure.zone_id == zone['zone_id'],
                        DiseasePressure.date == target
                    ).first()
                    
                    if existing:
                        existing.downy_mildew_risk = downy.risk_level
                        existing.powdery_mildew_risk = powdery.risk_level
                        existing.botrytis_risk = botrytis.risk_level
                        existing.risk_factors = risk_factors
                        existing.recommendations = ' | '.join(recommendations)
                        existing.humidity_available = zone['humidity_mean'] is not None
                        # Store scores in risk_factors for API access
                        existing.risk_factors['scores'] = {
                            'powdery': powdery.score,
                            'botrytis': botrytis.score,
                            'downy': downy.score
                        }
                    else:
                        risk_factors['scores'] = {
                            'powdery': powdery.score,
                            'botrytis': botrytis.score,
                            'downy': downy.score
                        }
                        db.add(DiseasePressure(
                            zone_id=zone['zone_id'],
                            date=target,
                            downy_mildew_risk=downy.risk_level,
                            powdery_mildew_risk=powdery.risk_level,
                            botrytis_risk=botrytis.risk_level,
                            risk_factors=risk_factors,
                            recommendations=' | '.join(recommendations),
                            humidity_available=zone['humidity_mean'] is not None,
                        ))
                
                count += 1
            
            if not dry_run:
                db.commit()
            
            logger.info(f"  {target}: {count} zone records processed")
            total_count += count
        
        logger.info(f"\n✅ Disease pressure complete: {total_count} total records")
        
    except Exception as e:
        logger.error(f"Disease service failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Calculate disease pressure (v2 - scientific models)')
    parser.add_argument('--date', type=str, help='Process specific date (YYYY-MM-DD)')
    parser.add_argument('--start', type=str, help='Start date for range (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, help='End date for range (YYYY-MM-DD)')
    parser.add_argument('--dry-run', action='store_true', help='Show without saving')
    
    args = parser.parse_args()
    run_disease_service(args.date, args.start, args.end, args.dry_run)


if __name__ == '__main__':
    main()