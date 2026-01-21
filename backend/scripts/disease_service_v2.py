#!/usr/bin/env python3
"""
scripts/disease_service_v2.py

Enhanced disease pressure calculation using peer-reviewed models.
Uses hourly climate data from climate_zone_hourly table.

Models:
1. Powdery Mildew: UC Davis Risk Index (Gubler et al., 1999)
2. Botrytis: González-Domínguez Model (2015)  
3. Downy Mildew: 3-10 Rule + Goidanich Index

NOTE: This service requires:
- climate_zone_hourly table (from add_hourly_climate migration)
- Updated disease_pressure columns (pm_*, botrytis_*, dm_*)

Usage:
    python scripts/disease_service_v2.py                              # Process yesterday
    python scripts/disease_service_v2.py --date 2025-01-20            # Specific date
    python scripts/disease_service_v2.py --start 2025-10-01           # Oct 1 to yesterday
    python scripts/disease_service_v2.py --start 2025-10-01 --end 2025-12-31  # Date range
    python scripts/disease_service_v2.py --backfill 30                # Last 30 days
    python scripts/disease_service_v2.py --dry-run                    # Test without saving
"""

import argparse
import logging
import math
import sys
from datetime import datetime, date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass

import pytz

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.orm import Session
from db.session import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NZ_TZ = pytz.timezone('Pacific/Auckland')


# =============================================================================
# WETNESS ESTIMATION
# =============================================================================

def calculate_dewpoint(temp_c: float, rh_pct: float) -> Optional[float]:
    """Calculate dewpoint using Magnus-Tetens formula."""
    if temp_c is None or rh_pct is None or rh_pct <= 0:
        return None
    
    a = 17.27
    b = 237.7
    
    rh_decimal = rh_pct / 100.0
    alpha = ((a * temp_c) / (b + temp_c)) + math.log(rh_decimal)
    dewpoint = (b * alpha) / (a - alpha)
    
    return round(dewpoint, 2)


def estimate_wetness(
    temp_c: float,
    rh_pct: float,
    precip_mm: float,
    hours_since_rain: int = None,
) -> tuple[bool, float, str]:
    """
    Estimate leaf wetness from meteorological variables.
    
    Returns: (is_wet, probability, source)
    """
    p_precip = 1.0 if precip_mm and precip_mm > 0 else 0.0
    
    p_post_rain = 0.0
    if hours_since_rain is not None and hours_since_rain <= 6:
        p_post_rain = max(0, 1.0 - (hours_since_rain * 0.3))
    
    p_rh = 0.0
    if rh_pct:
        if rh_pct >= 95:
            p_rh = 0.95
        elif rh_pct >= 90:
            p_rh = 0.8
        elif rh_pct >= 87:
            p_rh = 0.5
    
    p_dew = 0.0
    if temp_c is not None and rh_pct is not None:
        dewpoint = calculate_dewpoint(temp_c, rh_pct)
        if dewpoint is not None:
            depression = temp_c - dewpoint
            if depression <= 1.0:
                p_dew = 0.9
            elif depression <= 2.0:
                p_dew = 0.7
    
    max_p = max(p_precip, p_post_rain, p_rh, p_dew)
    
    if p_precip > 0:
        source = 'rain'
    elif p_post_rain >= max_p and p_post_rain > 0:
        source = 'post_rain'
    elif p_rh >= max_p and p_rh > 0:
        source = 'humidity'
    elif p_dew >= max_p and p_dew > 0:
        source = 'dewpoint'
    else:
        source = None
    
    is_wet = max_p >= 0.5
    
    return is_wet, round(max_p, 2), source


# =============================================================================
# POWDERY MILDEW - UC DAVIS RISK INDEX
# =============================================================================

@dataclass
class PMResult:
    daily_index: float
    cumulative_index: float
    risk_level: str
    favorable_hours: int
    lethal_hours: int


class UCDavisPMIndex:
    """UC Davis Powdery Mildew Risk Index (Gubler et al., 1999)"""
    
    T_MIN_FAVORABLE = 21.0
    T_MAX_FAVORABLE = 30.0
    T_OPTIMAL_MIN = 24.0
    T_OPTIMAL_MAX = 27.0
    T_LETHAL = 35.0
    
    POINTS_PER_FAVORABLE_HOUR = 20 / 6  # ~3.3
    POINTS_PER_OPTIMAL_HOUR = 20 / 4    # ~5
    PENALTY_PER_LETHAL_HOUR = 10
    DECAY_RATE = 0.9
    
    @classmethod
    def calculate(cls, hourly_temps: List[float], previous_cumulative: float = 0.0) -> PMResult:
        if not hourly_temps:
            return PMResult(0, previous_cumulative, 'unknown', 0, 0)
        
        valid_temps = [t for t in hourly_temps if t is not None]
        if len(valid_temps) < 12:
            return PMResult(0, previous_cumulative * cls.DECAY_RATE, 'unknown', 0, 0)
        
        favorable_hours = optimal_hours = lethal_hours = 0
        
        for temp in valid_temps:
            if temp >= cls.T_LETHAL:
                lethal_hours += 1
            elif cls.T_MIN_FAVORABLE <= temp <= cls.T_MAX_FAVORABLE:
                favorable_hours += 1
                if cls.T_OPTIMAL_MIN <= temp <= cls.T_OPTIMAL_MAX:
                    optimal_hours += 1
        
        daily_index = (
            optimal_hours * cls.POINTS_PER_OPTIMAL_HOUR +
            (favorable_hours - optimal_hours) * cls.POINTS_PER_FAVORABLE_HOUR -
            lethal_hours * cls.PENALTY_PER_LETHAL_HOUR
        )
        daily_index = max(0, daily_index)
        
        if lethal_hours >= 6:
            cumulative = daily_index
        elif favorable_hours == 0:
            cumulative = previous_cumulative * cls.DECAY_RATE + daily_index
        else:
            cumulative = previous_cumulative + daily_index
        
        cumulative = min(100, cumulative)
        
        if cumulative < 30:
            risk = 'low'
        elif cumulative < 50:
            risk = 'moderate'
        elif cumulative < 60:
            risk = 'high'
        else:
            risk = 'extreme'
        
        return PMResult(
            round(daily_index, 1), round(cumulative, 1), risk,
            favorable_hours, lethal_hours
        )


# =============================================================================
# BOTRYTIS - GONZÁLEZ-DOMÍNGUEZ MODEL
# =============================================================================

@dataclass  
class BotrytisResult:
    severity: float
    cumulative: float
    risk_level: str
    wet_hours: int
    sporulation_index: float


class BotrytisModel:
    """González-Domínguez Botrytis Model (2015)"""
    
    T_MIN, T_OPT_MIN, T_OPT_MAX, T_MAX = 5.0, 15.0, 25.0, 30.0
    
    @classmethod
    def temp_response(cls, temp: float) -> float:
        if temp is None or temp < cls.T_MIN or temp > cls.T_MAX:
            return 0.0
        if cls.T_OPT_MIN <= temp <= cls.T_OPT_MAX:
            return 1.0
        elif temp < cls.T_OPT_MIN:
            return (temp - cls.T_MIN) / (cls.T_OPT_MIN - cls.T_MIN)
        else:
            return (cls.T_MAX - temp) / (cls.T_MAX - cls.T_OPT_MAX)
    
    @classmethod
    def calculate(
        cls, 
        hourly_data: List[dict],
        previous_cumulative: float = 0.0,
        growth_stage: str = 'ripening'
    ) -> BotrytisResult:
        if not hourly_data:
            return BotrytisResult(0, previous_cumulative * 0.9, 'unknown', 0, 0)
        
        wet_hours = 0
        wet_temps = []
        
        for hour in hourly_data:
            if hour.get('is_wet'):
                wet_hours += 1
                if hour.get('temp') is not None:
                    wet_temps.append(hour['temp'])
        
        mean_temp_wet = sum(wet_temps) / len(wet_temps) if wet_temps else None
        
        # Infection severity
        if wet_hours < 4 or mean_temp_wet is None:
            severity = 0
        else:
            temp_factor = cls.temp_response(mean_temp_wet)
            min_hours = 8 if temp_factor >= 0.8 else 15
            wet_factor = 1 / (1 + math.exp(-0.3 * (wet_hours - min_hours)))
            
            stage_factors = {
                'dormant': 0.0, 'budburst': 0.1, 'pre_flowering': 0.3,
                'flowering': 0.8, 'fruit_set': 0.5, 'veraison': 0.6,
                'ripening': 1.0, 'harvest': 0.9,
            }
            stage_factor = stage_factors.get(growth_stage, 0.5)
            severity = temp_factor * wet_factor * stage_factor * 100
        
        # Sporulation index
        high_rh_hours = sum(1 for h in hourly_data if h.get('rh') and h['rh'] >= 85)
        sporulation_temps = [
            h['temp'] for h in hourly_data 
            if h.get('rh') and h['rh'] >= 85 and h.get('temp')
        ]
        if sporulation_temps:
            mean_spor_temp = sum(sporulation_temps) / len(sporulation_temps)
            spor_index = (high_rh_hours / 24) * cls.temp_response(mean_spor_temp) * 100
        else:
            spor_index = 0
        
        cumulative = min(100, previous_cumulative * 0.85 + severity * 0.3)
        
        if severity < 20:
            risk = 'low'
        elif severity < 50:
            risk = 'moderate'
        elif severity < 75:
            risk = 'high'
        else:
            risk = 'extreme'
        
        return BotrytisResult(
            round(severity, 1), round(cumulative, 1), risk,
            wet_hours, round(spor_index, 1)
        )


# =============================================================================
# DOWNY MILDEW - 3-10 RULE + GOIDANICH INDEX
# =============================================================================

@dataclass
class DownyMildewResult:
    primary_met: bool
    primary_score: float
    goidanich_index: float
    risk_level: str


class DownyMildewModel:
    """3-10 Rule + Goidanich Index"""
    
    T_MIN_PRIMARY = 10.0
    RAIN_MIN_PRIMARY = 10.0
    T_MIN_SEC, T_OPT_MIN, T_OPT_MAX, T_MAX_SEC = 13.0, 18.0, 23.0, 28.0
    RH_MIN = 80.0
    
    @classmethod
    def temp_factor(cls, temp: float) -> float:
        if temp is None or temp < cls.T_MIN_SEC or temp > cls.T_MAX_SEC:
            return 0.0
        if cls.T_OPT_MIN <= temp <= cls.T_OPT_MAX:
            return 1.0
        elif temp < cls.T_OPT_MIN:
            return (temp - cls.T_MIN_SEC) / (cls.T_OPT_MIN - cls.T_MIN_SEC)
        else:
            return (cls.T_MAX_SEC - temp) / (cls.T_MAX_SEC - cls.T_OPT_MAX)
    
    @classmethod
    def calculate(
        cls,
        hourly_data: List[dict],
        min_temp_48h: float,
        total_rain_48h: float,
        wet_hours_48h: int,
        previous_goidanich: float = 0.0
    ) -> DownyMildewResult:
        # Primary infection (3-10 rule)
        temp_ok = min_temp_48h is not None and min_temp_48h >= cls.T_MIN_PRIMARY
        rain_ok = total_rain_48h >= cls.RAIN_MIN_PRIMARY
        wet_ok = wet_hours_48h >= 10
        
        primary_met = temp_ok and rain_ok and wet_ok
        
        if min_temp_48h is not None:
            temp_score = min(1.0, max(0, (min_temp_48h - cls.T_MIN_PRIMARY + 2) / 5)) * 100
        else:
            temp_score = 0
        rain_score = min(1.0, total_rain_48h / cls.RAIN_MIN_PRIMARY) * 100
        wet_score = min(1.0, wet_hours_48h / 12) * 100
        primary_score = temp_score * 0.3 + rain_score * 0.4 + wet_score * 0.3
        
        # Goidanich index increment
        increment = 0.0
        for hour in hourly_data:
            temp = hour.get('temp')
            rh = hour.get('rh')
            is_wet = hour.get('is_wet', False)
            
            if temp is None or rh is None:
                continue
            
            t_factor = cls.temp_factor(temp)
            rh_factor = min(1.0, (rh - cls.RH_MIN) / 15) if rh >= cls.RH_MIN else 0
            wet_bonus = 1.5 if is_wet else 1.0
            increment += t_factor * rh_factor * wet_bonus
        
        if increment < 3:
            new_goidanich = previous_goidanich * 0.85
        else:
            new_goidanich = previous_goidanich + increment
        
        new_goidanich = min(100, new_goidanich)
        
        combined = primary_score * 0.4 + new_goidanich * 0.6
        if combined < 25:
            risk = 'low'
        elif combined < 50:
            risk = 'moderate'
        elif combined < 75:
            risk = 'high'
        else:
            risk = 'extreme'
        
        return DownyMildewResult(
            primary_met, round(primary_score, 1),
            round(new_goidanich, 1), risk
        )


# =============================================================================
# DATA ACCESS
# =============================================================================

def get_hourly_data(db: Session, zone_id: int, target_date: date) -> List[dict]:
    """Fetch hourly data for a zone on a specific date."""
    result = db.execute(text("""
        SELECT 
            timestamp_local,
            temp_mean as temp,
            rh_mean as rh,
            precipitation,
            is_wet_hour as is_wet,
            wetness_probability
        FROM climate_zone_hourly
        WHERE zone_id = :zone_id
          AND DATE(timestamp_local) = :target_date
        ORDER BY timestamp_local
    """), {'zone_id': zone_id, 'target_date': target_date}).fetchall()
    
    return [
        {
            'timestamp': row[0],
            'temp': float(row[1]) if row[1] else None,
            'rh': float(row[2]) if row[2] else None,
            'precipitation': float(row[3]) if row[3] else 0,
            'is_wet': row[4] or False,
        }
        for row in result
    ]


def get_48h_conditions(db: Session, zone_id: int, target_date: date) -> dict:
    """Get 48-hour conditions for downy mildew primary check."""
    start_dt = datetime.combine(target_date - timedelta(days=2), datetime.min.time())
    
    result = db.execute(text("""
        SELECT 
            MIN(temp_min) as min_temp,
            SUM(COALESCE(precipitation, 0)) as total_rain,
            SUM(CASE WHEN is_wet_hour THEN 1 ELSE 0 END) as wet_hours
        FROM climate_zone_hourly
        WHERE zone_id = :zone_id
          AND timestamp_local >= :start_dt
          AND DATE(timestamp_local) <= :target_date
    """), {'zone_id': zone_id, 'start_dt': start_dt, 'target_date': target_date}).fetchone()
    
    return {
        'min_temp_48h': float(result[0]) if result[0] else None,
        'total_rain_48h': float(result[1]) if result[1] else 0,
        'wet_hours_48h': result[2] or 0,
    }


def get_previous_state(db: Session, zone_id: int, vintage_year: int) -> dict:
    """Get previous disease state for cumulative calculations."""
    result = db.execute(text("""
        SELECT 
            pm_cumulative_index,
            botrytis_cumulative,
            dm_goidanich_index
        FROM disease_pressure
        WHERE zone_id = :zone_id
          AND vintage_year = :vintage_year
        ORDER BY date DESC
        LIMIT 1
    """), {'zone_id': zone_id, 'vintage_year': vintage_year}).fetchone()
    
    if result:
        return {
            'pm_cumulative': float(result[0]) if result[0] else 0,
            'botrytis_cumulative': float(result[1]) if result[1] else 0,
            'goidanich': float(result[2]) if result[2] else 0,
        }
    return {'pm_cumulative': 0, 'botrytis_cumulative': 0, 'goidanich': 0}


def get_growth_stage(db: Session, zone_id: int, target_date: date) -> str:
    """Get current phenology stage."""
    result = db.execute(text("""
        SELECT current_stage
        FROM phenology_estimates
        WHERE zone_id = :zone_id
          AND estimate_date <= :target_date
        ORDER BY estimate_date DESC
        LIMIT 1
    """), {'zone_id': zone_id, 'target_date': target_date}).fetchone()
    
    return result[0] if result else 'unknown'


def get_vintage_year(d: date) -> int:
    return d.year + 1 if d.month >= 7 else d.year


# =============================================================================
# MAIN SERVICE
# =============================================================================

def run_disease_service(
    target_date: str = None,
    start_date: str = None,
    end_date: str = None,
    backfill_days: int = None,
    dry_run: bool = False
):
    """Run disease pressure calculations."""
    logger.info("=" * 60)
    logger.info("Disease Pressure Service v2")
    logger.info("UC Davis PM | González-Domínguez Botrytis | Goidanich DM")
    logger.info("=" * 60)
    
    db = SessionLocal()
    
    try:
        if target_date:
            dates = [datetime.strptime(target_date, '%Y-%m-%d').date()]
        elif start_date:
            start = datetime.strptime(start_date, '%Y-%m-%d').date()
            if end_date:
                end = datetime.strptime(end_date, '%Y-%m-%d').date()
            else:
                end = date.today() - timedelta(days=1)
            dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        elif backfill_days:
            end = date.today() - timedelta(days=1)
            dates = [end - timedelta(days=i) for i in range(backfill_days)]
            dates.reverse()
        else:
            dates = [date.today() - timedelta(days=1)]
        
        logger.info(f"Processing: {dates[0]} to {dates[-1]} ({len(dates)} days)")
        if dry_run:
            logger.info("[DRY RUN]")
        
        # Get zones with hourly data
        zones = db.execute(text("""
            SELECT DISTINCT z.id, z.name 
            FROM climate_zones z
            JOIN climate_zone_hourly h ON z.id = h.zone_id
        """)).fetchall()
        
        logger.info(f"Found {len(zones)} zones with hourly data")
        
        total = 0
        
        for zone_id, zone_name in zones:
            logger.info(f"\n{zone_name}")
            
            for target in dates:
                hourly = get_hourly_data(db, zone_id, target)
                
                if len(hourly) < 12:
                    continue
                
                conditions_48h = get_48h_conditions(db, zone_id, target)
                vintage_year = get_vintage_year(target)
                prev = get_previous_state(db, zone_id, vintage_year)
                stage = get_growth_stage(db, zone_id, target)
                
                temps = [h['temp'] for h in hourly]
                
                pm = UCDavisPMIndex.calculate(temps, prev['pm_cumulative'])
                bot = BotrytisModel.calculate(hourly, prev['botrytis_cumulative'], stage)
                dm = DownyMildewModel.calculate(
                    hourly,
                    conditions_48h['min_temp_48h'],
                    conditions_48h['total_rain_48h'],
                    conditions_48h['wet_hours_48h'],
                    prev['goidanich']
                )
                
                logger.info(
                    f"  {target}: PM={pm.risk_level}({pm.cumulative_index:.0f}) "
                    f"Bot={bot.risk_level}({bot.severity:.0f}) "
                    f"DM={dm.risk_level}({dm.goidanich_index:.0f})"
                )
                
                if not dry_run:
                    import json
                    
                    # Build risk_factors JSON for API chart data
                    risk_factors = {
                        'scores': {
                            'downy': int(dm.goidanich_index) if dm.goidanich_index else 0,
                            'powdery': int(pm.cumulative_index) if pm.cumulative_index else 0,
                            'botrytis': int(bot.severity) if bot.severity else 0,
                        },
                        'powdery': {
                            'daily_index': pm.daily_index,
                            'cumulative_index': pm.cumulative_index,
                            'favorable_hours': pm.favorable_hours,
                            'lethal_hours': pm.lethal_hours,
                        },
                        'botrytis': {
                            'severity': bot.severity,
                            'cumulative': bot.cumulative,
                            'wet_hours': bot.wet_hours,
                            'sporulation_index': bot.sporulation_index,
                            'growth_stage': stage,
                        },
                        'downy': {
                            'primary_met': dm.primary_met,
                            'primary_score': dm.primary_score,
                            'goidanich_index': dm.goidanich_index,
                        },
                    }
                    
                    db.execute(text("""
                        INSERT INTO disease_pressure (
                            zone_id, date, vintage_year,
                            powdery_mildew_risk, pm_daily_index, pm_cumulative_index,
                            pm_favorable_hours, pm_lethal_hours,
                            botrytis_risk, botrytis_severity, botrytis_cumulative,
                            botrytis_wet_hours, botrytis_sporulation_index,
                            downy_mildew_risk, dm_primary_met, dm_primary_score,
                            dm_goidanich_index,
                            growth_stage, humidity_available,
                            risk_factors
                        ) VALUES (
                            :zone_id, :date, :vintage_year,
                            :pm_risk, :pm_daily, :pm_cumulative,
                            :pm_fav, :pm_lethal,
                            :bot_risk, :bot_sev, :bot_cum,
                            :bot_wet, :bot_spor,
                            :dm_risk, :dm_primary, :dm_score,
                            :dm_goidanich,
                            :stage, TRUE,
                            :risk_factors
                        )
                        ON CONFLICT (zone_id, date) DO UPDATE SET
                            vintage_year = EXCLUDED.vintage_year,
                            powdery_mildew_risk = EXCLUDED.powdery_mildew_risk,
                            pm_daily_index = EXCLUDED.pm_daily_index,
                            pm_cumulative_index = EXCLUDED.pm_cumulative_index,
                            pm_favorable_hours = EXCLUDED.pm_favorable_hours,
                            pm_lethal_hours = EXCLUDED.pm_lethal_hours,
                            botrytis_risk = EXCLUDED.botrytis_risk,
                            botrytis_severity = EXCLUDED.botrytis_severity,
                            botrytis_cumulative = EXCLUDED.botrytis_cumulative,
                            botrytis_wet_hours = EXCLUDED.botrytis_wet_hours,
                            botrytis_sporulation_index = EXCLUDED.botrytis_sporulation_index,
                            downy_mildew_risk = EXCLUDED.downy_mildew_risk,
                            dm_primary_met = EXCLUDED.dm_primary_met,
                            dm_primary_score = EXCLUDED.dm_primary_score,
                            dm_goidanich_index = EXCLUDED.dm_goidanich_index,
                            growth_stage = EXCLUDED.growth_stage,
                            humidity_available = EXCLUDED.humidity_available,
                            risk_factors = EXCLUDED.risk_factors
                    """), {
                        'zone_id': zone_id,
                        'date': target,
                        'vintage_year': vintage_year,
                        'pm_risk': pm.risk_level,
                        'pm_daily': pm.daily_index,
                        'pm_cumulative': pm.cumulative_index,
                        'pm_fav': pm.favorable_hours,
                        'pm_lethal': pm.lethal_hours,
                        'bot_risk': bot.risk_level,
                        'bot_sev': bot.severity,
                        'bot_cum': bot.cumulative,
                        'bot_wet': bot.wet_hours,
                        'bot_spor': bot.sporulation_index,
                        'dm_risk': dm.risk_level,
                        'dm_primary': dm.primary_met,
                        'dm_score': dm.primary_score,
                        'dm_goidanich': dm.goidanich_index,
                        'stage': stage,
                        'risk_factors': json.dumps(risk_factors),
                    })
                    db.commit()
                
                total += 1
        
        logger.info(f"\n✅ Complete: {total} records")
        
    except Exception as e:
        logger.error(f"Failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Disease pressure v2 (hourly data)')
    parser.add_argument('--date', type=str, help='Process specific date (YYYY-MM-DD)')
    parser.add_argument('--start', type=str, help='Start date for range (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, help='End date for range (YYYY-MM-DD), defaults to yesterday')
    parser.add_argument('--backfill', type=int, help='Number of days to backfill from yesterday')
    parser.add_argument('--dry-run', action='store_true', help='Show without saving')
    
    args = parser.parse_args()
    run_disease_service(args.date, args.start, args.end, args.backfill, args.dry_run)


if __name__ == '__main__':
    main()