# backend/services/insights_profile.py
"""
Grow -> Insights provisioning (Phase 2).

Resolves a Grow `users` identity to its single Insights `public_users` row,
creating a password-less PROJECTION row on first crossing. This is what lets all
downstream Insights code (mailing lists, admin stats, last_active heartbeat) stay
single-table while authenticating from the Grow token.

Provisioning rule (handles users who already exist in both products):
  1. link  — an existing row already points at this grow_user_id  -> return it
  2. adopt — an existing row matches by email (a prior self-signup)  -> link it
             (set grow_user_id; keep their password + origin='signup' so they can
             still password-login as a real subscriber); verify it (Grow identity
             is trusted for the same email)
  3. create — no row yet -> a fresh projection (origin='grow', hashed_password
             NULL, is_verified True, opt-ins FALSE pending explicit consent)

The caller owns the transaction; this flushes (to assign an id for downstream
FKs like likes/comments) but does NOT commit.
"""
from datetime import datetime, timezone

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from db.models.public_user import PublicUser
from db.models.user import User
from core.public_security import generate_verification_token


def preview_insights_action(db: Session, grow_user: User):
    """Read-only classification of what ensure_insights_profile WOULD do.

    Returns (action, existing_profile_or_None) where action is one of:
      'linked' — already has a projection row (no-op)
      'adopt'  — a self-signup row matches by email (links it; password kept)
      'create' — no row yet (a fresh password-less projection)
    """
    profile = (
        db.query(PublicUser)
        .filter(PublicUser.grow_user_id == grow_user.id)
        .first()
    )
    if profile is not None:
        return "linked", profile

    email = (grow_user.email or "").lower()
    profile = (
        db.query(PublicUser)
        .filter(sa_func.lower(PublicUser.email) == email)
        .first()
    )
    if profile is not None:
        return "adopt", profile

    return "create", None


def _grant_admin_from_grow_role(grow_user: User, profile: PublicUser) -> None:
    """Mirror the Grow `auxein_admin` role onto the Insights `is_admin` flag.

    GRANT ONLY, never revoke. An Auxein admin needs BOTH `users.user_type ==
    'auxein_admin'` (Grow routes) and `public_users.is_admin` (Insights routes)
    to work on admin.auxein.co.nz, and until 2026-09-15 nothing set the second
    one. The only admin that existed was fine purely by accident: their row came
    from the ADOPT branch, a pre-existing self-signup that already carried
    is_admin. A NEW admin goes down the CREATE branch, takes the column default
    of False, and then logs in successfully with every Grow tab working and
    every Insights tab bouncing them — with nothing naming the cause.

    Grant-only rather than `profile.is_admin = grow_user.is_auxein_admin`
    because the two flags are not the same question. This function runs for
    every Grow user on every token exchange, so mirroring both ways would let a
    plain Grow account silently strip is_admin from an Insights-native admin who
    happens to have one. Revocation stays a deliberate act, not a side effect of
    logging in.
    """
    if grow_user.is_auxein_admin and not profile.is_admin:
        profile.is_admin = True


def ensure_insights_profile(db: Session, grow_user: User) -> PublicUser:
    """Return the Insights profile for a Grow user, provisioning if needed."""
    # 1) Already linked.
    profile = (
        db.query(PublicUser)
        .filter(PublicUser.grow_user_id == grow_user.id)
        .first()
    )
    if profile is not None:
        # Self-heals rows linked before the flag was mirrored.
        _grant_admin_from_grow_role(grow_user, profile)
        db.flush()
        return profile

    email = (grow_user.email or "").lower()

    # 2) Adopt a pre-existing self-signup row with the same email.
    profile = (
        db.query(PublicUser)
        .filter(sa_func.lower(PublicUser.email) == email)
        .first()
    )
    if profile is not None:
        profile.grow_user_id = grow_user.id
        profile.is_active = True
        if not profile.is_verified:
            profile.is_verified = True
            profile.verified_at = datetime.now(timezone.utc)
        _grant_admin_from_grow_role(grow_user, profile)
        db.flush()
        return profile

    # 3) Create a fresh projection row.
    profile = PublicUser(
        email=email,
        hashed_password=None,            # projection rows can never password-login
        first_name=grow_user.first_name,
        last_name=grow_user.last_name,
        is_active=True,
        is_verified=True,                # Grow auth is trusted -> can_login
        verified_at=datetime.now(timezone.utc),
        origin="grow",
        grow_user_id=grow_user.id,
        # Mirrors the Grow role — see _grant_admin_from_grow_role. Without this
        # the column default (False) makes every NEW Auxein admin half-work on
        # admin.auxein.co.nz: Grow tabs fine, Insights tabs bouncing.
        is_admin=grow_user.is_auxein_admin,
        # Distinct segment for campaign targeting AND a Pro entitlement:
        # core/entitlements.py treats 'grow' as Pro, because Grow customers
        # already pay for the platform. Never test `tier == "pro"` anywhere.
        subscription_tier="grow",
        unsubscribe_token=generate_verification_token(),
        # Opt-ins stay FALSE — usage stats need no consent, marketing email does.
        newsletter_opt_in=False,
        marketing_opt_in=False,
        research_opt_in=False,
    )
    db.add(profile)
    db.flush()
    return profile
