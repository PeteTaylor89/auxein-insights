# backend_taste/db/base.py — own engine/session/Base (Taste models only).
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={
        "sslmode": "disable" if "localhost" in settings.DATABASE_URL else "require",
        "connect_timeout": 30,
        "application_name": "auxein-taste-api",
    },
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
