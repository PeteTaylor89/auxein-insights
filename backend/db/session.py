# -*- coding: utf-8 -*-
"""
Created on Wed Apr 16 21:25:20 2025

@author: Peter Taylor
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from core.config import settings

# Create SQLAlchemy engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={
        "sslmode": "disable",
        "connect_timeout": 30,
        "application_name": "vineyard-app"
    },
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False  # Set to True for debugging SQL queries
)

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