# api/v1/climate.py
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, extract, desc
from datetime import date, datetime, timedelta
import pandas as pd
import io
import logging

from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.block import VineyardBlock
from db.models.climate_historical import ClimateHistoricalData, DataQuality
from schemas.climate import (
    ClimateHistorical, ClimateHistoricalCreate, ClimateHistoricalBulkCreate,
    ClimateHistoricalUpdate, ClimateHistoricalSummary, ClimateQuery,
    ClimateStats, CSVImportResult
)
from services.climate_calculations import ClimateCalculations

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/historical/{block_id}", response_model=List[ClimateHistorical])
def get_historical_climate_data(
    block_id: int,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(1000, le=10000, description="Maximum records to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get historical climate data for a vineyard block
    """
    # Verify block exists and user has access
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    # Check company access
    if current_user.company_id != block.company_id:
        raise HTTPException(status_code=403, detail="Access denied to this vineyard block")
    
    # Build query
    query = db.query(ClimateHistoricalData).filter(
        ClimateHistoricalData.vineyard_block_id == block_id
    )
    
    # Apply date filters
    if start_date:
        query = query.filter(ClimateHistoricalData.date >= start_date)
    if end_date:
        query = query.filter(ClimateHistoricalData.date <= end_date)
    
    # Order by date and apply limit
    climate_data = query.order_by(ClimateHistoricalData.date).limit(limit).all()
    
    return climate_data

@router.get("/historical/{block_id}/summary", response_model=List[ClimateHistoricalSummary])
def get_climate_summary(
    block_id: int,
    aggregation: str = Query("monthly", regex="^(weekly|monthly|yearly)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get aggregated climate data summary for charts and analysis
    """
    # Verify access
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    if current_user.company_id != block.company_id:
        raise HTTPException(status_code=403, detail="Access denied to this vineyard block")
    
    # Build base query
    query = db.query(ClimateHistoricalData).filter(
        ClimateHistoricalData.vineyard_block_id == block_id
    )
    
    if start_date:
        query = query.filter(ClimateHistoricalData.date >= start_date)
    if end_date:
        query = query.filter(ClimateHistoricalData.date <= end_date)
    
    # Group by aggregation period
    if aggregation == "weekly":
        # Group by week
        group_expr = func.date_trunc('week', ClimateHistoricalData.date)
    elif aggregation == "monthly":
        # Group by month
        group_expr = func.date_trunc('month', ClimateHistoricalData.date)
    elif aggregation == "yearly":
        # Group by year
        group_expr = func.date_trunc('year', ClimateHistoricalData.date)
    
    # Aggregate query
    summary_query = db.query(
        group_expr.label('period_start'),
        func.min(ClimateHistoricalData.date).label('date_start'),
        func.max(ClimateHistoricalData.date).label('date_end'),
        func.avg(ClimateHistoricalData.temperature_mean).label('temperature_mean_avg'),
        func.avg(ClimateHistoricalData.temperature_min).label('temperature_min_avg'),
        func.avg(ClimateHistoricalData.temperature_max).label('temperature_max_avg'),
        func.min(ClimateHistoricalData.temperature_mean).label('temperature_mean_min'),
        func.max(ClimateHistoricalData.temperature_mean).label('temperature_mean_max'),
        func.sum(ClimateHistoricalData.rainfall_amount).label('rainfall_total'),
        func.avg(ClimateHistoricalData.rainfall_amount).label('rainfall_avg'),
        func.sum(ClimateHistoricalData.solar_radiation).label('solar_radiation_total'),
        func.avg(ClimateHistoricalData.solar_radiation).label('solar_radiation_avg'),
        func.count(ClimateHistoricalData.id).label('record_count')
    ).filter(
        ClimateHistoricalData.vineyard_block_id == block_id
    )
    
    if start_date:
        summary_query = summary_query.filter(ClimateHistoricalData.date >= start_date)
    if end_date:
        summary_query = summary_query.filter(ClimateHistoricalData.date <= end_date)
    
    summary_data = summary_query.group_by(group_expr).order_by(group_expr).all()
    
    # Convert to response format
    summaries = []
    for row in summary_data:
        summaries.append(ClimateHistoricalSummary(
            period=aggregation,
            date_start=row.date_start,
            date_end=row.date_end,
            temperature_mean_avg=round(row.temperature_mean_avg, 2) if row.temperature_mean_avg else None,
            temperature_min_avg=round(row.temperature_min_avg, 2) if row.temperature_min_avg else None,
            temperature_max_avg=round(row.temperature_max_avg, 2) if row.temperature_max_avg else None,
            temperature_mean_min=round(row.temperature_mean_min, 2) if row.temperature_mean_min else None,
            temperature_mean_max=round(row.temperature_mean_max, 2) if row.temperature_mean_max else None,
            rainfall_total=round(row.rainfall_total, 2) if row.rainfall_total else None,
            rainfall_avg=round(row.rainfall_avg, 2) if row.rainfall_avg else None,
            solar_radiation_total=round(row.solar_radiation_total, 2) if row.solar_radiation_total else None,
            solar_radiation_avg=round(row.solar_radiation_avg, 2) if row.solar_radiation_avg else None,
            record_count=row.record_count
        ))
    
    return summaries

@router.get("/historical/{block_id}/stats", response_model=ClimateStats)
def get_climate_stats(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get comprehensive climate statistics for a vineyard block
    """
    # Verify access
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    if current_user.company_id != block.company_id:
        raise HTTPException(status_code=403, detail="Access denied to this vineyard block")
    
    # Get overall stats
    stats_query = db.query(
        func.count(ClimateHistoricalData.id).label('total_records'),
        func.min(ClimateHistoricalData.date).label('date_start'),
        func.max(ClimateHistoricalData.date).label('date_end'),
        # Temperature stats
        func.min(ClimateHistoricalData.temperature_mean).label('temp_mean_min'),
        func.max(ClimateHistoricalData.temperature_mean).label('temp_mean_max'),
        func.avg(ClimateHistoricalData.temperature_mean).label('temp_mean_avg'),
        func.min(ClimateHistoricalData.temperature_min).label('temp_min_min'),
        func.max(ClimateHistoricalData.temperature_max).label('temp_max_max'),
        # Rainfall stats
        func.sum(ClimateHistoricalData.rainfall_amount).label('rainfall_total'),
        func.avg(ClimateHistoricalData.rainfall_amount).label('rainfall_avg'),
        func.max(ClimateHistoricalData.rainfall_amount).label('rainfall_max'),
        # Solar radiation stats
        func.sum(ClimateHistoricalData.solar_radiation).label('solar_total'),
        func.avg(ClimateHistoricalData.solar_radiation).label('solar_avg'),
        func.max(ClimateHistoricalData.solar_radiation).label('solar_max')
    ).filter(ClimateHistoricalData.vineyard_block_id == block_id).first()
    
    # Get data quality breakdown
    quality_stats = db.query(
        ClimateHistoricalData.data_quality,
        func.count(ClimateHistoricalData.id).label('count')
    ).filter(
        ClimateHistoricalData.vineyard_block_id == block_id
    ).group_by(ClimateHistoricalData.data_quality).all()
    
    # Calculate years of data
    years_of_data = 0
    if stats_query.date_start and stats_query.date_end:
        years_of_data = (stats_query.date_end - stats_query.date_start).days / 365.25
    
    return ClimateStats(
        vineyard_block_id=block_id,
        total_records=stats_query.total_records or 0,
        date_range_start=stats_query.date_start,
        date_range_end=stats_query.date_end,
        years_of_data=round(years_of_data, 1),
        temperature_stats={
            "mean_min": round(stats_query.temp_mean_min, 2) if stats_query.temp_mean_min else 0,
            "mean_max": round(stats_query.temp_mean_max, 2) if stats_query.temp_mean_max else 0,
            "mean_avg": round(stats_query.temp_mean_avg, 2) if stats_query.temp_mean_avg else 0,
            "absolute_min": round(stats_query.temp_min_min, 2) if stats_query.temp_min_min else 0,
            "absolute_max": round(stats_query.temp_max_max, 2) if stats_query.temp_max_max else 0
        },
        rainfall_stats={
            "total": round(stats_query.rainfall_total, 2) if stats_query.rainfall_total else 0,
            "daily_avg": round(stats_query.rainfall_avg, 2) if stats_query.rainfall_avg else 0,
            "daily_max": round(stats_query.rainfall_max, 2) if stats_query.rainfall_max else 0
        },
        solar_radiation_stats={
            "total": round(stats_query.solar_total, 2) if stats_query.solar_total else 0,
            "daily_avg": round(stats_query.solar_avg, 2) if stats_query.solar_avg else 0,
            "daily_max": round(stats_query.solar_max, 2) if stats_query.solar_max else 0
        },
        data_quality_breakdown={
            quality.data_quality.value: quality.count for quality in quality_stats
        }
    )

@router.post("/historical/bulk", response_model=Dict[str, Any])
def bulk_import_climate_data(
    bulk_data: ClimateHistoricalBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Bulk import climate historical data (admin only)
    """
    # Check admin permissions
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    imported_count = 0
    skipped_count = 0
    errors = []
    
    try:
        for record_data in bulk_data.records:
            # Check if record already exists
            existing = db.query(ClimateHistoricalData).filter(
                ClimateHistoricalData.vineyard_block_id == record_data.vineyard_block_id,
                ClimateHistoricalData.date == record_data.date
            ).first()
            
            if existing:
                skipped_count += 1
                continue
            
            # Create new record
            climate_record = ClimateHistoricalData(**record_data.dict())
            db.add(climate_record)
            imported_count += 1
        
        db.commit()
        
        return {
            "success": True,
            "records_processed": len(bulk_data.records),
            "records_imported": imported_count,
            "records_skipped": skipped_count,
            "errors": errors
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk import failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Bulk import failed: {str(e)}")

@router.post("/historical/import-csv/{block_id}")
async def import_csv_climate_data(
    block_id: int,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Import climate data from CSV file
    Expected CSV format: Date,ID,Tmean(C),Tmin(C),Tmax(C),Amount(mm),Amount(MJm2)
    """
    # Check admin permissions
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify block exists
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        # Read CSV content
        content = await file.read()
        df = pd.read_csv(io.StringIO(content.decode('utf-8')))
        
        # Expected columns: Date,ID,Tmean(C),Tmin(C),Tmax(C),Amount(mm),Amount(MJm2)
        required_columns = ['Date', 'Tmean(C)', 'Tmin(C)', 'Tmax(C)', 'Amount(mm)', 'Amount(MJm2)']
        
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(
                status_code=400, 
                detail=f"CSV must contain columns: {required_columns}"
            )
        
        # Process in background
        background_tasks.add_task(
            process_climate_csv, 
            df, 
            block_id, 
            db
        )
        
        return {
            "message": f"CSV upload successful. Processing {len(df)} records in background.",
            "records_to_process": len(df),
            "vineyard_block_id": block_id
        }
        
    except Exception as e:
        logger.error(f"CSV import failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"CSV import failed: {str(e)}")

def process_climate_csv(df: pd.DataFrame, block_id: int, db: Session):
    """Background task to process CSV data"""
    imported_count = 0
    skipped_count = 0
    errors = []
    
    try:
        for _, row in df.iterrows():
            try:
                # Parse date
                record_date = pd.to_datetime(row['Date']).date()
                
                # Check if record exists
                existing = db.query(ClimateHistoricalData).filter(
                    ClimateHistoricalData.vineyard_block_id == block_id,
                    ClimateHistoricalData.date == record_date
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                # Create climate record
                climate_data = ClimateHistoricalData(
                    vineyard_block_id=block_id,
                    date=record_date,
                    temperature_mean=float(row['Tmean(C)']) if pd.notna(row['Tmean(C)']) else None,
                    temperature_min=float(row['Tmin(C)']) if pd.notna(row['Tmin(C)']) else None,
                    temperature_max=float(row['Tmax(C)']) if pd.notna(row['Tmax(C)']) else None,
                    rainfall_amount=float(row['Amount(mm)']) if pd.notna(row['Amount(mm)']) else None,
                    solar_radiation=float(row['Amount(MJm2)']) if pd.notna(row['Amount(MJm2)']) else None,
                    data_quality=DataQuality.interpolated
                )
                
                db.add(climate_data)
                imported_count += 1
                
                # Commit in batches
                if imported_count % 1000 == 0:
                    db.commit()
                    
            except Exception as e:
                errors.append(f"Row error: {str(e)}")
                continue
        
        # Final commit
        db.commit()
        logger.info(f"CSV processing complete: {imported_count} imported, {skipped_count} skipped")
        
    except Exception as e:
        db.rollback()
        logger.error(f"CSV processing failed: {str(e)}")

@router.delete("/historical/{record_id}")
def delete_climate_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a climate historical record (admin only)
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    record = db.query(ClimateHistoricalData).filter(ClimateHistoricalData.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Climate record not found")
    
    db.delete(record)
    db.commit()
    
    return {"message": "Climate record deleted successfully"}

@router.get("/seasons/{block_id}/comparison", response_model=Dict[str, Any])
def get_season_comparison(
    block_id: int,
    seasons: List[str] = Query(..., description="List of seasons to compare"),
    include_lta: bool = Query(False, description="Include long-term average"),
    chart_type: str = Query("gdd", regex="^(gdd|huglin|temperature|rainfall)$"),
    aggregation: str = Query("monthly", regex="^(daily|monthly)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get data for comparing seasons with chart data"""
    # Verify access
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    if current_user.company_id != block.company_id:
        raise HTTPException(status_code=403, detail="Access denied to this vineyard block")
    
    if len(seasons) > 2:
        raise HTTPException(status_code=400, detail="Maximum 2 seasons can be compared")
    
    # Get comparison summaries
    comparison_data = ClimateCalculations.get_season_comparison_data(
        block_id, seasons, include_lta, db
    )
    
    # Get detailed chart data based on chart_type and aggregation
    chart_data = get_comparison_chart_data(
        block_id, seasons, include_lta, chart_type, aggregation, db
    )
    
    return {
        "summaries": comparison_data,
        "chart_data": chart_data,
        "chart_type": chart_type,
        "aggregation": aggregation
    }

@router.get("/seasons/{block_id}/lta", response_model=Dict[str, Any])
def get_long_term_average(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get long-term average (1986-2022) for a block"""
    # Verify access
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    if current_user.company_id != block.company_id:
        raise HTTPException(status_code=403, detail="Access denied to this vineyard block")
    
    lta_data = ClimateCalculations.calculate_long_term_average(block_id, db)
    
    if not lta_data:
        raise HTTPException(status_code=404, detail="Insufficient data for long-term average")
    
    return lta_data

def get_comparison_chart_data(
    block_id: int, 
    seasons: List[str], 
    include_lta: bool, 
    chart_type: str, 
    aggregation: str, 
    db: Session
) -> Dict[str, Any]:
    """Generate chart data for season comparisons"""
    chart_data = {
        "labels": [],
        "datasets": []
    }
    
    if aggregation == "monthly":
        # October through April
        chart_data["labels"] = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"]
    
    # Get data for each season
    colors = ["#3B82F6", "#EF4444", "#10B981"]  # Blue, Red, Green
    color_index = 0
    
    for season_str in seasons:
        season_year = ClimateCalculations.parse_season_string(season_str)
        season_data = get_monthly_chart_data(block_id, season_year, chart_type, db)
        
        if season_data:
            chart_data["datasets"].append({
                "label": season_str,
                "data": season_data,
                "borderColor": colors[color_index % len(colors)],
                "backgroundColor": colors[color_index % len(colors)] + "20",
                "fill": chart_type in ["gdd", "huglin"]
            })
            color_index += 1
    
    # Add LTA if requested
    if include_lta:
        lta_data = get_monthly_lta_chart_data(block_id, chart_type, db)
        if lta_data:
            chart_data["datasets"].append({
                "label": "LTA (1986-2005)",
                "data": lta_data,
                "borderColor": "#6B7280",
                "backgroundColor": "#6B728020",
                "borderDash": [5, 5],
                "fill": False
            })
    
    return chart_data

def get_monthly_chart_data(block_id: int, season_year: int, chart_type: str, db: Session) -> List[float]:
    """Get monthly data for chart based on chart type"""
    start_date, end_date = ClimateCalculations.get_growing_season_dates(season_year)
    
    # Get block for latitude
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    latitude = block.centroid_latitude if block else -41.0
    
    monthly_data = [0] * 7  # Oct-Apr
    month_mapping = {10: 0, 11: 1, 12: 2, 1: 3, 2: 4, 3: 5, 4: 6}
    
    # Get all data for the season
    climate_data = db.query(ClimateHistoricalData).filter(
        ClimateHistoricalData.vineyard_block_id == block_id,
        ClimateHistoricalData.date >= start_date,
        ClimateHistoricalData.date <= end_date
    ).all()
    
    if chart_type == "gdd":
        # Cumulative GDD
        cumulative_gdd = 0
        for record in climate_data:
            if record.temperature_min and record.temperature_max:
                daily_gdd = ClimateCalculations.calculate_gdd(
                    record.temperature_min, record.temperature_max
                )
                cumulative_gdd += daily_gdd
                
                month_idx = month_mapping.get(record.date.month)
                if month_idx is not None:
                    monthly_data[month_idx] = cumulative_gdd
    
    elif chart_type == "huglin":
        # Cumulative Huglin Index
        cumulative_huglin = 0
        for record in climate_data:
            if record.temperature_mean and record.temperature_max:
                daily_huglin = ClimateCalculations.calculate_huglin_index(
                    record.temperature_mean, record.temperature_max,
                    latitude, record.date.timetuple().tm_yday
                )
                cumulative_huglin += daily_huglin
                
                month_idx = month_mapping.get(record.date.month)
                if month_idx is not None:
                    monthly_data[month_idx] = cumulative_huglin
    
    elif chart_type == "rainfall":
        # Monthly rainfall totals
        monthly_rainfall = [0] * 7
        for record in climate_data:
            if record.rainfall_amount:
                month_idx = month_mapping.get(record.date.month)
                if month_idx is not None:
                    monthly_rainfall[month_idx] += record.rainfall_amount
        monthly_data = monthly_rainfall
    
    elif chart_type == "temperature":
        # Monthly average temperature
        monthly_temps = [[] for _ in range(7)]
        for record in climate_data:
            if record.temperature_mean:
                month_idx = month_mapping.get(record.date.month)
                if month_idx is not None:
                    monthly_temps[month_idx].append(record.temperature_mean)
        
        monthly_data = [
            sum(temps) / len(temps) if temps else 0
            for temps in monthly_temps
        ]
    
    return [round(val, 1) for val in monthly_data]

def get_monthly_lta_chart_data(block_id: int, chart_type: str, db: Session) -> List[float]:
    """Get long-term average monthly data for chart"""
    all_seasons_data = []
    
    for year in range(1986, 2006):
        season_data = get_monthly_chart_data(block_id, year, chart_type, db)
        if any(val > 0 for val in season_data):  # Only include seasons with data
            all_seasons_data.append(season_data)
    
    if not all_seasons_data:
        return [0] * 7
    
    # Calculate average for each month
    lta_data = []
    for month_idx in range(7):
        month_values = [season[month_idx] for season in all_seasons_data if season[month_idx] > 0]
        if month_values:
            lta_data.append(sum(month_values) / len(month_values))
        else:
            lta_data.append(0)
    
    return [round(val, 1) for val in lta_data]

@router.get("/seasons/{block_id}/available", response_model=List[str])
def get_available_seasons(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of available growing seasons for a block"""
    # Verify block exists and user has access
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    if current_user.company_id != block.company_id:
        raise HTTPException(status_code=403, detail="Access denied to this vineyard block")
    
    seasons = ClimateCalculations.get_available_seasons(block_id, db)
    return seasons

@router.get("/seasons/{block_id}/recent", response_model=str)
def get_most_recent_season(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the most recent complete season"""
    # Verify access
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    if current_user.company_id != block.company_id:
        raise HTTPException(status_code=403, detail="Access denied to this vineyard block")
    
    return ClimateCalculations.get_most_recent_season()

@router.get("/seasons/{block_id}/summary", response_model=Dict[str, Any])
def get_season_summary(
    block_id: int,
    season: str = Query(..., description="Season in format '2022/23'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive summary for a single season"""
    # Verify access
    block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    
    if current_user.company_id != block.company_id:
        raise HTTPException(status_code=403, detail="Access denied to this vineyard block")
    
    try:
        season_year = ClimateCalculations.parse_season_string(season)
        summary = ClimateCalculations.calculate_season_summary(block_id, season_year, db)
        
        if not summary:
            raise HTTPException(status_code=404, detail="No data available for this season")
        
        return summary
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid season format. Use 'YYYY/YY' format")

@router.get("/debug/{block_id}")
def debug_climate_data(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Debug endpoint to check what climate data exists for a block"""
    
    # Get basic data info
    total_records = db.query(func.count(ClimateHistoricalData.id)).filter(
        ClimateHistoricalData.vineyard_block_id == block_id
    ).scalar()
    
    date_range = db.query(
        func.min(ClimateHistoricalData.date).label('min_date'),
        func.max(ClimateHistoricalData.date).label('max_date')
    ).filter(ClimateHistoricalData.vineyard_block_id == block_id).first()
    
    # Get sample records
    sample_records = db.query(ClimateHistoricalData).filter(
        ClimateHistoricalData.vineyard_block_id == block_id
    ).order_by(ClimateHistoricalData.date).limit(10).all()
    
    # Count records by year
    yearly_counts = db.query(
        func.extract('year', ClimateHistoricalData.date).label('year'),
        func.count(ClimateHistoricalData.id).label('count')
    ).filter(
        ClimateHistoricalData.vineyard_block_id == block_id
    ).group_by(
        func.extract('year', ClimateHistoricalData.date)
    ).order_by('year').all()
    
    return {
        "block_id": block_id,
        "total_records": total_records,
        "date_range": {
            "min_date": date_range.min_date.isoformat() if date_range.min_date else None,
            "max_date": date_range.max_date.isoformat() if date_range.max_date else None
        },
        "sample_records": [
            {
                "date": record.date.isoformat(),
                "temp_mean": record.temperature_mean,
                "temp_min": record.temperature_min,
                "temp_max": record.temperature_max,
                "rainfall": record.rainfall_amount
            } for record in sample_records
        ],
        "yearly_counts": [
            {"year": int(row.year), "count": row.count} 
            for row in yearly_counts
        ]
    }
