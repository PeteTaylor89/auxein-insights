"""Backfill unsubscribe_token for existing public_users who don't have one.
Run after the add_unsubscribe_token migration.

Usage: cd backend && python scripts/backfill_unsubscribe_tokens.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from db.session import SessionLocal
from db.models.public_user import PublicUser
from core.public_security import generate_verification_token

db = SessionLocal()
try:
    users = db.query(PublicUser).filter(PublicUser.unsubscribe_token == None).all()
    count = 0
    for user in users:
        user.unsubscribe_token = generate_verification_token()
        count += 1
    db.commit()
    print(f"Backfilled unsubscribe_token for {count} user(s).")
finally:
    db.close()
