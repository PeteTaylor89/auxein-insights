
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from core.config import settings

# Create SQLAlchemy engine using the dynamically determined DATABASE_URL
def get_engine():
    """Create engine lazily so it picks up current settings"""
    from core.config import settings  # Import here, not at module level
    
    return create_engine(
        settings.DATABASE_URL,
        connect_args={
            "sslmode": "disable" if "localhost" in settings.DATABASE_URL else "require",
            "connect_timeout": 30,
            "application_name": "vineyard-app"
        },
        pool_pre_ping=True,
        pool_recycle=300,
        echo=False
    )

# Create engine
engine = get_engine()

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()