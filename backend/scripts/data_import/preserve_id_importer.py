# app/scripts/data_import/preserve_id_importer.py
import psycopg2
from psycopg2.extras import execute_values
import shapefile
import json
from pathlib import Path
import logging
from datetime import datetime
from urllib.parse import urlparse
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PreserveIDShapefileImporter:
    def __init__(self, shapefile_path: str, db_url: str):
        self.shapefile_path = Path(shapefile_path)
        self.db_params = self._parse_db_url(db_url)
        
        # Fields that need data cleaning (take first value before comma)
        self.fields_to_clean = ['Variety', 'Clone', 'Winery', 'Region', 'GI']
        
        # Field that contains the original ID to preserve
        self.id_field = 'OBJECTID'  # Change this to match your ID field name
        
        # Mapping between shapefile fields and database columns
        self.field_mapping = {
            'OBJECTID': 'id',  # Map the original ID field to the database id column
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
    
    def import_data(self, table_name="vineyard_blocks", clear_existing=False, reset_sequence=True):
        """Import shapefile data to PostgreSQL/PostGIS preserving original IDs"""
        try:
            # Open shapefile
            logger.info(f"Reading shapefile: {self.shapefile_path}")
            sf = shapefile.Reader(str(self.shapefile_path))
            
            # Get field names
            field_names = [field[0] for field in sf.fields[1:]]  # Skip deletion flag
            id_field_index = field_names.index(self.id_field) if self.id_field in field_names else None
            
            if id_field_index is None:
                logger.warning(f"ID field '{self.id_field}' not found in shapefile. Using auto-generated IDs.")
            
            # Prepare data
            data_to_insert = []
            original_ids = []
            skipped_records = 0
            
            for i, shape_record in enumerate(sf.iterShapeRecords()):
                try:
                    shape = shape_record.shape
                    record = shape_record.record
                    
                    # Skip invalid shapes
                    if not shape.points:
                        skipped_records += 1
                        continue
                    
                    # Get original ID
                    original_id = None
                    if id_field_index is not None:
                        original_id = record[id_field_index]
                        if original_id:
                            original_ids.append(original_id)
                    
                    # Create record dictionary
                    record_dict = dict(zip(field_names, record))
                    
                    # Clean and map data
                    row_data = {}
                    
                    # Explicitly set the ID to the original ID if available
                    if 'id' in self.field_mapping.values() and original_id is not None:
                        row_data['id'] = original_id
                    
                    # Process other fields
                    for sf_field, db_field in self.field_mapping.items():
                        if sf_field == self.id_field:
                            continue  # Already handled above
                            
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
                    # Reset the sequence if clearing existing data
                    if clear_existing:
                        cur.execute(f"DELETE FROM {table_name}")
                        logger.info(f"Cleared existing data from {table_name}")
                        
                        # Reset sequence to max ID + 1
                        if reset_sequence and original_ids:
                            max_id = max(original_ids)
                            cur.execute(f"ALTER SEQUENCE {table_name}_id_seq RESTART WITH {max_id + 1}")
                            logger.info(f"Reset sequence to {max_id + 1}")
                    
                    # Import data in batches
                    batch_size = 100
                    for i in range(0, len(data_to_insert), batch_size):
                        batch = data_to_insert[i:i+batch_size]
                        
                        if batch:
                            # Get column names from first record (excluding 'id' if using SERIAL)
                            include_id = 'id' in batch[0]
                            columns = list(batch[0].keys())
                            
                            # Skip the auto-increment sequence by explicitly listing all columns
                            cols_str = ','.join(columns)
                            
                            # Prepare placeholder string (%s for each column)
                            placeholder_str = ','.join(['%s' if col != 'geometry' else 'ST_GeomFromText(%s, 4326)' for col in columns])
                            
                            # Insert each record
                            for row in batch:
                                values = [row[col] for col in columns]
                                
                                # INSERT with explicit ID value
                                query = f"""
                                    INSERT INTO {table_name} ({cols_str})
                                    VALUES ({placeholder_str})
                                    ON CONFLICT (id) DO UPDATE
                                    SET {', '.join([f"{col} = EXCLUDED.{col}" for col in columns if col != 'id'])}
                                """
                                
                                cur.execute(query, values)
                            
                        conn.commit()
                        logger.info(f"Imported batch {i//batch_size + 1}/{(len(data_to_insert) + batch_size - 1)//batch_size}")
                    
                    logger.info(f"Successfully imported {len(data_to_insert)} records")
            
            # Validate import
            count = self._count_records(table_name)
            
            return {
                "status": "success",
                "records_imported": count,
                "records_processed": len(data_to_insert),
                "records_skipped": skipped_records,
                "original_id_count": len(original_ids),
                "min_original_id": min(original_ids) if original_ids else None,
                "max_original_id": max(original_ids) if original_ids else None
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
            # For any polygon-like shape
            if shape.shapeType in [5, 15, 25]:  # POLYGON=5, POLYGONZ=15, POLYGONM=25
                parts = shape.parts
                points = shape.points
                
                # Handle parts (rings)
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
                        return f"POLYGON(({','.join(coords)}))"
                else:
                    # For now, just use the first ring (exterior ring)
                    start_idx = parts[0]
                    end_idx = parts[1] if len(parts) > 1 else len(points)
                    ring_points = points[start_idx:end_idx]
                    
                    coords = []
                    for point in ring_points:
                        coords.append(f"{point[0]} {point[1]}")
                    
                    # Ensure the ring is closed
                    if coords and coords[0] != coords[-1]:
                        coords.append(coords[0])
                    
                    if len(coords) >= 4:  # Minimum 4 points for a valid polygon
                        return f"POLYGON(({','.join(coords)}))"
                
                return None
            else:
                logger.warning(f"Unsupported shape type: {shape.shapeType}")
                return None
            
        except Exception as e:
            logger.error(f"Error creating polygon WKT: {str(e)}")
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
    from dotenv import load_dotenv
    
    load_dotenv()
    
    parser = argparse.ArgumentParser(description='Import vineyard shapefile to PostgreSQL/PostGIS preserving original IDs')
    parser.add_argument('shapefile', help='Path to shapefile')
    parser.add_argument('--db-url', help='Database URL (default from .env)')
    parser.add_argument('--clear', action='store_true', help='Clear existing data before import')
    parser.add_argument('--table', default='vineyard_blocks', help='Table name')
    parser.add_argument('--id-field', help='Field name containing original IDs (default: OBJECTID)')
    
    args = parser.parse_args()
    
    db_url = args.db_url or os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("Database URL not provided")
    
    importer = PreserveIDShapefileImporter(
        shapefile_path=args.shapefile,
        db_url=db_url
    )
    
    if args.id_field:
        importer.id_field = args.id_field
    
    result = importer.import_data(
        table_name=args.table,
        clear_existing=args.clear
    )
    
    print(json.dumps(result, indent=4))