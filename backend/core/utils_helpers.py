# core/utils.py - Datetime utilities
from datetime import datetime, timezone

def utc_now():
    """Get current UTC time as timezone-aware datetime"""
    return datetime.now(timezone.utc)

def make_aware(dt, tz=timezone.utc):
    """Convert naive datetime to timezone-aware datetime"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt

def compare_datetimes(dt1, dt2):
    """Safely compare two datetimes, handling timezone awareness"""
    # Make both timezone-aware if they aren't already
    if dt1.tzinfo is None:
        dt1 = make_aware(dt1)
    if dt2.tzinfo is None:
        dt2 = make_aware(dt2)
    
    return dt1, dt2