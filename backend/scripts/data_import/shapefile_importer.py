# app/scripts/data_import/basic_shapefile_importer.py
import psycopg2
from psycopg2.extras import execute_values
import shapefile
import json
from pathlib import Path
import logging
from datetime import datetime
from urllib.parse import urlparse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BasicShapefileImporter:
    def __init__(self, shapefile_path: str, db_url: str):
        self.shapefile_path = Path(shapefile_path)
        self.db_params = self._parse_db_url(db_url)
        
        # Fields that need data cleaning (take first value before comma)
        self.fields_to_clean = ['Variety', 'Clone', 'Winery', 'Region', 'GI']
        
        # Mapping between shapefile fields and database columns
        self.field_mapping = {
            'Block_Name': 'block_name',
            'Planted_Date': 'planted_date',
            'Removed_Date': 'removed_date',
            'Variety': 'variety',
            'Clone': 'clone',
            'Row_Spacing': 'row_spacing',
            'Vine_Spacing': 'vine_spacing',
            'Area': 'area',
            'Region': 'region',
            'SWNZ': 'swnz',
            'Organic': 'organic',
            'Winery': 'winery',
            'Longitude': 'centroid_longitude',
            'Latitude': 'centroid_latitude',
            'GI': 'gi',
            'Elevation': 'elevation'
        }
    
    def _parse_db_url(self, db_url):
        """Parse database URL into connection parameters"""
        parsed = urlparse(db_url)
        return {
            'dbname': parsed.path[1:],
            'user': parsed.username,
            'password': parsed.password,
            'host': parsed.hostname,
            'port': parsed.port or 5432
        }
    
    def import_data(self, table_name="vineyard_blocks", clear_existing=False):
        """Import shapefile data to PostgreSQL/PostGIS"""
        try:
            # Open shapefile
            logger.info(f"Reading shapefile: {self.shapefile_path}")
            sf = shapefile.Reader(str(self.shapefile_path))
            
            # Get field names
            field_names = [field[0] for field in sf.fields[1:]]  # Skip deletion flag
            
            # Prepare data
            data_to_insert = []
            skipped_records = 0
            
            for i, shape_record in enumerate(sf.iterShapeRecords()):
                try:
                    shape = shape_record.shape
                    record = shape_record.record
                    
                    # Skip invalid shapes
                    if not shape.points:
                        skipped_records += 1
                        logger.debug(f"Skipping record {i}: no points")
                        continue
                    
                    # Create record dictionary
                    record_dict = dict(zip(field_names, record))
                    
                    # Clean and map data
                    row_data = {}
                    
                    # Process fields
                    for sf_field, db_field in self.field_mapping.items():
                        if sf_field in record_dict:
                            value = record_dict[sf_field]
                            
                            # Clean comma-separated values
                            if sf_field in self.fields_to_clean and value and isinstance(value, str) and ',' in value:
                                value = value.split(',')[0].strip()
                            
                            # Handle dates
                            if 'date' in db_field.lower() and value:
                                try:
                                    value = self._parse_date(value)
                                except:
                                    value = None
                            
                            # Handle booleans
                            if db_field in ['swnz', 'organic']:
                                value = bool(value) if value is not None else False
                            
                            row_data[db_field] = value
                    
                    # Create WKT geometry (force to 2D and ensure closed rings)
                    wkt = self._create_valid_polygon_wkt(shape)
                    if not wkt:
                        skipped_records += 1
                        logger.debug(f"Skipping record {i}: invalid geometry")
                        continue
                    
                    row_data['geometry'] = wkt
                    data_to_insert.append(row_data)
                    
                except Exception as e:
                    logger.warning(f"Skipping record {i} due to error: {str(e)}")
                    skipped_records += 1
                    continue
            
            logger.info(f"Prepared {len(data_to_insert)} records for import ({skipped_records} skipped)")
            
            # Import to database
            with psycopg2.connect(**self.db_params) as conn:
                with conn.cursor() as cur:
                    # Clear existing data if requested
                    if clear_existing:
                        cur.execute(f"DELETE FROM {table_name}")
                        logger.info(f"Cleared existing data from {table_name}")
                    
                    # Import data in batches
                    batch_size = 100
                    for i in range(0, len(data_to_insert), batch_size):
                        batch = data_to_insert[i:i+batch_size]
                        
                        if batch:
                            # Get column names from first record
                            columns = list(batch[0].keys())
                            cols_str = ','.join(columns)
                            
                            # Prepare values
                            batch_values = []
                            for row in batch:
                                batch_values.append([row[col] for col in columns])
                            
                            # Custom template for geometry
                            template = "(" + ",".join(
                                f"ST_MakeValid(ST_GeomFromText(%s, 4326))" if col == 'geometry' else "%s"
                                for col in columns
                            ) + ")"
                            
                            execute_values(cur, f"INSERT INTO {table_name} ({cols_str}) VALUES %s",
                                         batch_values, template=template)
                    
                    conn.commit()
                    logger.info(f"Successfully imported {len(data_to_insert)} records")
            
            # Validate import
            count = self._count_records(table_name)
            
            return {
                "status": "success",
                "records_imported": count,
                "records_processed": len(data_to_insert),
                "records_skipped": skipped_records
            }
            
        except Exception as e:
            logger.error(f"Import failed: {str(e)}")
            return {
                "status": "failed",
                "error": str(e)
            }
    
    def _create_valid_polygon_wkt(self, shape):
        """Create a valid polygon WKT from shape points"""
        try:
            # Log shape type
            logger.debug(f"Shape type: {shape.shapeType}")
            
            # For any polygon-like shape
            if shape.shapeType in [5, 15, 25]:  # POLYGON=5, POLYGONZ=15, POLYGONM=25
                parts = shape.parts
                points = shape.points
                
                # Handle parts (rings)
                rings = []
                
                if len(parts) == 0:
                    # No parts, use all points as one ring
                    ring_points = points
                    coords = []
                    for point in ring_points:
                        coords.append(f"{point[0]} {point[1]}")
                    
                    # Ensure the ring is closed
                    if coords and coords[0] != coords[-1]:
                        coords.append(coords[0])
                    
                    if len(coords) >= 4:  # Minimum 4 points for a valid polygon
                        rings.append(f"({','.join(coords)})")
                else:
                    # Process each part as a ring
                    for i in range(len(parts)):
                        start_idx = parts[i]
                        end_idx = parts[i + 1] if i + 1 < len(parts) else len(points)
                        ring_points = points[start_idx:end_idx]
                        
                        coords = []
                        for point in ring_points:
                            coords.append(f"{point[0]} {point[1]}")
                        
                        # Ensure the ring is closed
                        if coords and coords[0] != coords[-1]:
                            coords.append(coords[0])
                        
                        if len(coords) >= 4:  # Minimum 4 points for a valid polygon
                            rings.append(f"({','.join(coords)})")
                
                # Create WKT
                if rings:
                    # For now, just use the first ring (exterior ring)
                    return f"POLYGON({rings[0]})"
                else:
                    return None
            else:
                logger.warning(f"Unsupported shape type: {shape.shapeType}")
                return None
            
        except Exception as e:
            logger.error(f"Error creating polygon WKT: {str(e)}")
            logger.debug(f"Shape details - Type: {shape.shapeType}, Points: {len(shape.points) if shape.points else 0}, Parts: {len(shape.parts) if shape.parts else 0}")
            return None
    
    def _parse_date(self, value):
        """Parse date from various formats"""
        if not value:
            return None
        
        # Try various date formats
        formats = [
            '%Y-%m-%d',
            '%Y/%m/%d',
            '%d/%m/%Y',
            '%m/%d/%Y',
            '%Y%m%d'
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(str(value), fmt).date()
            except:
                continue
        
        return None
    
    def _count_records(self, table_name):
        """Count records in table"""
        with psycopg2.connect(**self.db_params) as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {table_name}")
                return cur.fetchone()[0]

# Example usage
if __name__ == "__main__":
    import argparse
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    parser = argparse.ArgumentParser(description='Import vineyard shapefile to PostgreSQL/PostGIS')
    parser.add_argument('shapefile', help='Path to shapefile')
    parser.add_argument('--db-url', help='Database URL (default from .env)')
    parser.add_argument('--clear', action='store_true', help='Clear existing data before import')
    parser.add_argument('--table', default='vineyard_blocks', help='Table name')
    
    args = parser.parse_args()
    
    db_url = args.db_url or os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("Database URL not provided")
    
    importer = BasicShapefileImporter(
        shapefile_path=args.shapefile,
        db_url=db_url
    )
    
    result = importer.import_data(
        table_name=args.table,
        clear_existing=args.clear
    )
    
    print(json.dumps(result, indent=4))