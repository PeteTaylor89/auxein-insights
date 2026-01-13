"""
Database connection for ingestion service
Reuses backend session/engine directly
"""
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from db.session import engine, SessionLocal

def get_ingestion_engine():
    """
    Get the existing engine from backend
    """
    return engine

def get_ingestion_session():
    """
    Get sessionmaker - returns the same SessionLocal from backend
    """
    return SessionLocal