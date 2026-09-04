"""Insights entitlement checks — the single place that decides who gets what.

Tiers (docs/plans/INSIGHTS_SITE_MAP_2026-08-13.md §5a):

    anonymous   articles, and ONE surface load on the Atlas before a prompt
    registered  regional stats and all five explorers
    pro         saved site vs its regional background, the AI assistant,
                point sampling, industry insights

`PublicUser.subscription_tier` holds three values, not two:

    'free'  self-registered
    'pro'   paying Insights subscriber
    'grow'  password-less projection of a Grow user (one-way SSO)

**'grow' counts as Pro.** Grow customers already pay for the platform, so a
`tier == "pro"` test silently locks them out of everything they are entitled to.
That is the whole reason this module exists rather than the check being inlined:
there must be exactly one definition of "is this user Pro", because the failure
mode of a second one is invisible — a paying customer quietly sees a paywall and
usually just leaves rather than complaining.

Note `insights_profile.py` writes tier='grow' with the comment "distinct
segment; not a feature gate". That comment predates this decision and is no
longer true.

**Membership of an active enterprise account is a THIRD route to Pro**, and
carries no tier of its own. A BSI staff member signs up on the free tier like
anybody else; what entitles them is the account their employer pays for. Without
this, adding a colleague to an account would make them a member who gets a 402
on every route the membership was supposed to open — the same silent lockout
this module was written to prevent, arriving by a different door.

It does NOT grant a point: `site_quota` still reads `pro_site_quota`, which is
0 for a member who has not bought one. The account gives them the client's
sites; a subscription would give them their own.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException

from core.public_security import get_optional_public_user
from db.models.public_user import PublicUser

# Tiers that carry Pro entitlements. Grow is here deliberately — see module docs.
PRO_TIERS = frozenset({"pro", "grow"})

# Grow entitlement follows the Grow relationship, not an Insights billing date,
# so it is never expired by pro_expires_at (which is only ever set for 'pro').
_TIERS_IGNORING_EXPIRY = frozenset({"grow"})


def tier_of(user: Optional[PublicUser]) -> str:
    """Normalised tier for a user, or 'anonymous' when there is none."""
    if user is None:
        return "anonymous"
    return (user.subscription_tier or "free").strip().lower()


def is_registered(user: Optional[PublicUser]) -> bool:
    """Signed in at all. Gates the regional product."""
    return user is not None


def is_pro(user: Optional[PublicUser]) -> bool:
    """Entitled to Pro features.

    An expired 'pro' subscription is not Pro. A 'grow' user has no Insights
    expiry to check.
    """
    if user is None:
        return False

    # Checked BEFORE the tier, because it is the one route to Pro that does not
    # go through `subscription_tier` at all. A free-tier user who is a named
    # member of a paying account is entitled, and has no expiry of their own to
    # test — the account's `status` is the expiry, and `portfolio_accounts`
    # already filters on it.
    if user.portfolio_accounts:
        return True

    tier = tier_of(user)
    if tier not in PRO_TIERS:
        return False
    if tier in _TIERS_IGNORING_EXPIRY:
        return True

    expires = getattr(user, "pro_expires_at", None)
    if expires is None:
        # No end date recorded means an open-ended subscription, not a lapsed one.
        return True
    # pro_expires_at is timestamptz, but tolerate a naive value rather than
    # crashing the gate — a comparison error here would deny a paying customer.
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires > datetime.now(timezone.utc)


async def require_registration(
    user: Optional[PublicUser] = Depends(get_optional_public_user),
) -> PublicUser:
    """Dependency: any signed-in user. 401 otherwise."""
    if not is_registered(user):
        raise HTTPException(
            status_code=401,
            detail="Sign in to view regional climate data. It is free.",
        )
    return user


def site_quota(user: Optional[PublicUser]) -> int:
    """How many saved Pro sites this subscriber may hold.

    NOT derivable from the tier. A point subscription is priced separately and
    stacks — one point each, several allowed — so a Pro user with no point
    subscription has a quota of 0, and a Grow user (Pro by relationship) gets no
    free point either. Anyone not entitled to Pro at all has 0 regardless of
    what the column says, so that a lapsed subscription cannot leave a site
    placeable.
    """
    if not is_pro(user):
        return 0
    return max(0, int(getattr(user, "pro_site_quota", 0) or 0))


def can_place_site(user: Optional[PublicUser], sites_held: int) -> bool:
    return sites_held < site_quota(user)


def has_site_access(user: Optional[PublicUser]) -> bool:
    """Whether "My Site" is a thing this user has, rather than a thing they could buy.

    Pro entitlement and a saved point are SEPARATE purchases, and three of the
    routes to Pro carry no point at all:

        'grow'          Pro by the Grow relationship. 5 such users hold quota 0.
        account member  Pro by their employer's account. Quota 0 by design.
        'pro', quota 0  a subscriber who has not bought a point.

    Gating the nav on `is_pro` put all of them in front of a placement map with
    a permanently disabled button and the line "your subscription covers 0
    sites" — an offer withdrawn in the same breath it was made. The page is a
    dead end for them, so it should not be in their navigation.

    The second test is the one that is easy to leave out: a subscriber whose
    quota is later reduced to 0 still HOLDS the site they placed, and must not
    lose the only link to it. Quota governs placing, not keeping.
    """
    if not is_pro(user):
        return False
    if site_quota(user) > 0:
        return True
    return bool(getattr(user, "own_site_count", 0))


async def require_pro(
    user: Optional[PublicUser] = Depends(get_optional_public_user),
) -> PublicUser:
    """Dependency: Pro (or Grow) only.

    402 rather than 403 — contract §5.5 reserves 402 for "entitlement required",
    which lets the frontend show an upgrade path instead of an error. 401 is
    used for the anonymous case so the client knows to offer sign-in first.
    """
    if not is_registered(user):
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    if not is_pro(user):
        raise HTTPException(
            status_code=402,
            detail="This is a Pro feature. Upgrade to sample specific sites.",
        )
    return user
