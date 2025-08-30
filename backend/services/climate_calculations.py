# services/climate_calculations.py
from datetime import date, datetime, timedelta
from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from db.models.climate_historical import ClimateHistoricalData
from db.models.block import VineyardBlock
import math

class ClimateCalculations:
    """Southern Hemisphere growing season climate calculations"""
    
    @staticmethod
    def get_growing_season_dates(season_year: int) -> Tuple[date, date]:
        """
        Get growing season dates for Southern Hemisphere
        Season 2022/23 = Oct 1, 2022 to Apr 30, 2023
        """
        start_date = date(season_year, 10, 1)
        end_date = date(season_year + 1, 4, 30)
        return start_date, end_date
    
    @staticmethod
    def get_available_seasons(block_id: int, db: Session) -> List[str]:
        """Get list of available seasons with data"""
        # Get date range of available data
        date_range = db.query(
            func.min(ClimateHistoricalData.date).label('min_date'),
            func.max(ClimateHistoricalData.date).label('max_date')
        ).filter(ClimateHistoricalData.vineyard_block_id == block_id).first()
        
        print(f"DEBUG: Block {block_id} date range: {date_range.min_date} to {date_range.max_date}")
        
        if not date_range.min_date:
            print(f"DEBUG: No climate data found for block {block_id}")
            return []
        
        seasons = []
        # Start from 1986/87, end at most recent complete season
        start_year = 1986
        end_year = 2022  # Most recent complete season is 2022/23
        
        for year in range(start_year, end_year + 1):
            season_start, season_end = ClimateCalculations.get_growing_season_dates(year)
            
            print(f"DEBUG: Checking season {year}/{str(year + 1)[2:]} ({season_start} to {season_end})")
            
            # Check if we have data for this season - be more lenient
            if (date_range.min_date <= season_end and 
                date_range.max_date >= season_start):
                
                # Check if we have sufficient data points for this season
                data_count = db.query(func.count(ClimateHistoricalData.id)).filter(
                    ClimateHistoricalData.vineyard_block_id == block_id,
                    ClimateHistoricalData.date >= season_start,
                    ClimateHistoricalData.date <= season_end
                ).scalar()
                
                print(f"DEBUG: Season {year}/{str(year + 1)[2:]} has {data_count} data points")
                
                # Include season if it has at least 30 data points (about 1 month worth)
                if data_count >= 30:
                    seasons.append(f"{year}/{str(year + 1)[2:]}")
                    print(f"DEBUG: Added season {year}/{str(year + 1)[2:]}")
        
        print(f"DEBUG: Final seasons list: {seasons}")
        return seasons
    
    @staticmethod
    def get_most_recent_season() -> str:
        """Get most recent complete season"""
        return "2022/23"
    
    @staticmethod
    def parse_season_string(season_str: str) -> int:
        """Convert '2022/23' to 2022"""
        return int(season_str.split('/')[0])
    
    @staticmethod
    def calculate_gdd(temp_min: float, temp_max: float, base_temp: float = 10.0) -> float:
        """
        Calculate Growing Degree Days using min/max method
        GDD = ((Tmax + Tmin) / 2) - Tbase
        Minimum GDD per day = 0
        """
        if temp_min is None or temp_max is None:
            return 0.0
        
        avg_temp = (temp_max + temp_min) / 2
        gdd = max(0, avg_temp - base_temp)
        return round(gdd, 2)
    
    @staticmethod
    def calculate_huglin_index(temp_mean: float, temp_max: float, latitude: float, day_of_year: int) -> float:
        """
        Calculate Huglin Index for a single day
        HI = Σ((Tmean - 10) + (Tmax - 10)) / 2 * K
        Where K is latitude coefficient and only for days with Tmean > 10°C
        """
        if temp_mean is None or temp_max is None or temp_mean <= 10:
            return 0.0
        
        # Latitude coefficient (K) for Southern Hemisphere
        if latitude < -40:
            k = 1.05
        elif latitude < -35:
            k = 1.04
        elif latitude < -30:
            k = 1.03
        else:
            k = 1.02
        
        hi_daily = ((temp_mean - 10) + (temp_max - 10)) / 2 * k
        return max(0, round(hi_daily, 2))
    
    @staticmethod
    def get_season_climate_data(block_id: int, season_year: int, db: Session) -> List[ClimateHistoricalData]:
        """Get all climate data for a growing season"""
        start_date, end_date = ClimateCalculations.get_growing_season_dates(season_year)
        
        return db.query(ClimateHistoricalData).filter(
            ClimateHistoricalData.vineyard_block_id == block_id,
            ClimateHistoricalData.date >= start_date,
            ClimateHistoricalData.date <= end_date
        ).order_by(ClimateHistoricalData.date).all()
    
    @staticmethod
    def calculate_season_summary(block_id: int, season_year: int, db: Session) -> Dict:
        """Calculate comprehensive season summary"""
        # Get block for latitude
        block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
        if not block or not block.centroid_latitude:
            return {}
        
        latitude = block.centroid_latitude
        climate_data = ClimateCalculations.get_season_climate_data(block_id, season_year, db)
        
        if not climate_data:
            return {}
        
        # Initialize accumulators
        total_gdd = 0
        total_huglin = 0
        total_rainfall = 0
        temp_sum = 0
        temp_count = 0
        frost_days = 0
        hot_days = 0  # Days > 30°C
        
        monthly_data = {}
        
        for record in climate_data:
            # GDD calculation
            if record.temperature_min and record.temperature_max:
                daily_gdd = ClimateCalculations.calculate_gdd(
                    record.temperature_min, record.temperature_max
                )
                total_gdd += daily_gdd
            
            # Huglin Index
            if record.temperature_mean and record.temperature_max:
                daily_huglin = ClimateCalculations.calculate_huglin_index(
                    record.temperature_mean, record.temperature_max, 
                    latitude, record.date.timetuple().tm_yday
                )
                total_huglin += daily_huglin
            
            # Rainfall
            if record.rainfall_amount:
                total_rainfall += record.rainfall_amount
            
            # Temperature stats
            if record.temperature_mean:
                temp_sum += record.temperature_mean
                temp_count += 1
            
            # Frost and hot days
            if record.temperature_min and record.temperature_min <= 0:
                frost_days += 1
            if record.temperature_max and record.temperature_max >= 30:
                hot_days += 1
            
            # Monthly breakdown
            month_key = record.date.strftime('%Y-%m')
            if month_key not in monthly_data:
                monthly_data[month_key] = {
                    'month': record.date.strftime('%b %Y'),
                    'gdd': 0,
                    'rainfall': 0,
                    'temp_sum': 0,
                    'temp_count': 0,
                    'days': 0
                }
            
            if record.temperature_min and record.temperature_max:
                monthly_data[month_key]['gdd'] += ClimateCalculations.calculate_gdd(
                    record.temperature_min, record.temperature_max
                )
            if record.rainfall_amount:
                monthly_data[month_key]['rainfall'] += record.rainfall_amount
            if record.temperature_mean:
                monthly_data[month_key]['temp_sum'] += record.temperature_mean
                monthly_data[month_key]['temp_count'] += 1
            monthly_data[month_key]['days'] += 1
        
        # Calculate averages
        avg_temp = temp_sum / temp_count if temp_count > 0 else 0
        
        # Format monthly data
        monthly_summary = []
        for month_data in monthly_data.values():
            if month_data['temp_count'] > 0:
                month_avg_temp = month_data['temp_sum'] / month_data['temp_count']
            else:
                month_avg_temp = 0
            
            monthly_summary.append({
                'month': month_data['month'],
                'gdd': round(month_data['gdd'], 1),
                'rainfall': round(month_data['rainfall'], 1),
                'avg_temperature': round(month_avg_temp, 1),
                'days_with_data': month_data['days']
            })
        
        return {
            'season': f"{season_year}/{str(season_year + 1)[2:]}",
            'total_gdd': round(total_gdd, 1),
            'huglin_index': round(total_huglin, 1),
            'total_rainfall': round(total_rainfall, 1),
            'average_temperature': round(avg_temp, 1),
            'frost_days': frost_days,
            'hot_days': hot_days,
            'data_points': len(climate_data),
            'monthly_breakdown': monthly_summary
        }
    
    @staticmethod
    def calculate_long_term_average(block_id: int, db: Session) -> Dict:
        """Calculate long-term average (1986-2005)"""
        all_season_data = []
        
        for year in range(1986, 2006):  # 1986/87 through 2005/06
            season_summary = ClimateCalculations.calculate_season_summary(
                block_id, year, db
            )
            if season_summary and season_summary.get('data_points', 0) > 100:  # Only include seasons with substantial data
                all_season_data.append(season_summary)
        
        if not all_season_data:
            return {}
        
        # Calculate averages across all seasons
        total_seasons = len(all_season_data)
        avg_gdd = sum(s['total_gdd'] for s in all_season_data) / total_seasons
        avg_huglin = sum(s['huglin_index'] for s in all_season_data) / total_seasons
        avg_rainfall = sum(s['total_rainfall'] for s in all_season_data) / total_seasons
        avg_temp = sum(s['average_temperature'] for s in all_season_data) / total_seasons
        avg_frost_days = sum(s['frost_days'] for s in all_season_data) / total_seasons
        avg_hot_days = sum(s['hot_days'] for s in all_season_data) / total_seasons
        
        return {
            'season': 'LTA (1986-2005)',
            'total_gdd': round(avg_gdd, 1),
            'huglin_index': round(avg_huglin, 1),
            'total_rainfall': round(avg_rainfall, 1),
            'average_temperature': round(avg_temp, 1),
            'frost_days': round(avg_frost_days, 1),
            'hot_days': round(avg_hot_days, 1),
            'seasons_included': total_seasons
        }
    
    @staticmethod
    def get_season_comparison_data(block_id: int, seasons: List[str], include_lta: bool, db: Session) -> Dict:
        """Get data for comparing multiple seasons"""
        results = {}
        
        # Add requested seasons
        for season_str in seasons:
            season_year = ClimateCalculations.parse_season_string(season_str)
            season_data = ClimateCalculations.calculate_season_summary(block_id, season_year, db)
            if season_data:
                results[season_str] = season_data
        
        # Add LTA if requested
        if include_lta:
            lta_data = ClimateCalculations.calculate_long_term_average(block_id, db)
            if lta_data:
                results['LTA'] = lta_data
        
        return results