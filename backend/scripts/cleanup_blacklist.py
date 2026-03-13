#!/usr/bin/env python3
"""
scripts/cleanup_blacklist.py

Remove expired entries from the token blacklist table.
Run daily via the daily processing pipeline.
"""

import logging
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from db.session import SessionLocal
from core.security.auth import cleanup_expired_blacklist

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    db = SessionLocal()
    try:
        deleted = cleanup_expired_blacklist(db)
        logger.info(f"Cleaned up {deleted} expired blacklist entries")
    except Exception as e:
        logger.error(f"Blacklist cleanup failed: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
