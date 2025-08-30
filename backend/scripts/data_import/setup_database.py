

# app/scripts/data_import/setup_database.py
from sqlalchemy import create_engine, text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseSetup:
    def __init__(self, db_url: str):
        self.engine = create_engine(db_url)
    
    def setup_spatial_extensions(self):
        """Enable PostGIS extension if not already enabled"""
        try:
            with self.engine.connect() as conn:
                # Check if PostGIS is already installed
                result = conn.execute(text("""
                    SELECT 1 FROM pg_extension WHERE extname = 'postgis';
                """))
                
                if not result.fetchone():
                    # Install PostGIS extension
                    conn.execute(text("CREATE EXTENSION postgis;"))
                    conn.commit()
                    logger.info("PostGIS extension installed successfully")
                else:
                    logger.info("PostGIS extension already installed")
                
                # Enable spatial_ref_sys table
                conn.execute(text("ALTER TABLE spatial_ref_sys OWNER TO CURRENT_USER;"))
                conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to setup spatial extensions: {e}")
            raise
    
    def create_spatial_index(self, table_name: str = "vineyard_blocks"):
        """Create spatial index on geometry column"""
        try:
            with self.engine.connect() as conn:
                # Check if index already exists
                result = conn.execute(text("""
                    SELECT 1 FROM pg_indexes 
                    WHERE tablename = :table_name 
                    AND indexname = :index_name;
                """), {"table_name": table_name, "index_name": f"idx_{table_name}_geometry"})
                
                if not result.fetchone():
                    # Create spatial index
                    conn.execute(text(f"""
                        CREATE INDEX idx_{table_name}_geometry 
                        ON {table_name} USING GIST(geometry);
                    """))
                    conn.commit()
                    logger.info(f"Spatial index created on {table_name}.geometry")
                else:
                    logger.info(f"Spatial index already exists on {table_name}.geometry")
                
        except Exception as e:
            logger.error(f"Failed to create spatial index: {e}")
            raise
    
    def verify_table_structure(self, table_name: str = "vineyard_blocks"):
        """Verify that table has all required columns"""
        expected_columns = [
            'id', 'block_name', 'planted_date', 'removed_date', 'variety',
            'clone', 'row_spacing', 'vine_spacing', 'area', 'region',
            'swnz', 'organic', 'winery', 'centroid_longitude', 'centroid_latitude',
            'gi', 'elevation', 'geometry', 'created_at', 'updated_at'
        ]
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = :table_name
                    ORDER BY ordinal_position;
                """), {"table_name": table_name})
                
                existing_columns = [row[0] for row in result]
                logger.info(f"Existing columns: {existing_columns}")
                
                missing_columns = [col for col in expected_columns if col not in existing_columns]
                if missing_columns:
                    logger.warning(f"Missing columns: {missing_columns}")
                else:
                    logger.info("All expected columns present")
                
                return existing_columns, missing_columns
                
        except Exception as e:
            logger.error(f"Failed to verify table structure: {e}")
            raise

if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL not found in environment")
    
    setup = DatabaseSetup(db_url)
    
    # Setup spatial extensions
    setup.setup_spatial_extensions()
    
    # Verify table structure
    existing, missing = setup.verify_table_structure()
    
    if not missing:
        # Create spatial index
        setup.create_spatial_index()
        print("Database setup complete!")
    else:
        print(f"Please run migrations to add missing columns: {missing}")