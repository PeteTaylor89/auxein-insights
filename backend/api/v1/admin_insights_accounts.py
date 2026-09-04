"""Admin management of Insights enterprise accounts and their members.

## Why this file exists

`insights_account` and `insights_account_member` were created by
`alembic/versions/insights_accounts.py` and read by `api/v1/insights_sites.py`,
and until now NOTHING wrote to the member table. `scripts/import_account_sites.py`
provisions an account and its sites but never a membership row, so a client's
sites could be imported, extracted nightly, and be invisible to every human
being — the account had no members, so `_is_member` returned None for everyone
and every route 404'd. That is the same failure the `ck_insights_site_one_owner`
constraint guards one level down: a row that is complete, correct, costing money
to maintain, and reachable by nobody.

## Membership is an entitlement, not a label

Adding a member makes that person Pro (`core/entitlements.is_pro` reads
`portfolio_accounts`). It does NOT give them a point of their own —
`pro_site_quota` is untouched and stays 0 unless somebody buys one. So the two
questions "can this person see the client's 67 sites" and "does this person have
their own saved site" stay separate, which is the distinction the account model
was built around.

Removing the last member does not delete anything. The account keeps its sites
and its extracted history exactly as suspension does; it simply has nobody who
can open it.

## Existing users only

Adding a member requires a `public_users` row. There is deliberately no invite
flow: a pending membership would be a second, weaker kind of member that every
query in `insights_sites.py` would have to learn about, and the whole point of
the join table is that membership is one thing. The refusal names the email so
an admin can forward a sign-up link rather than guess what went wrong.
"""
import logging
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.admin_security import require_admin
from db.models.insights_account import InsightsAccount, InsightsAccountMember
from db.models.public_user import PublicUser
from db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/insights/accounts", tags=["Admin - Insights Accounts"])

# 'owner' may manage membership, 'member' may read. Deliberately two values and
# not a permission matrix — see db/models/insights_account.py. Enforced here
# only as a validation set; the READ routes in insights_sites.py do not
# distinguish them, and this file is admin-only, so nothing is gated on it yet.
ROLES = ("owner", "member")

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$")


# =============================================================================
# Schemas
# =============================================================================

class MemberOut(BaseModel):
    public_user_id: int
    email: str
    full_name: Optional[str] = None
    role: str
    # The member's own tier, which is NOT what entitles them here. Surfaced so
    # an admin can see at a glance that a 'free' member still has access, and
    # that removing them from the account removes it.
    subscription_tier: str = "free"
    pro_site_quota: int = 0
    created_at: Optional[str] = None


class AccountOut(BaseModel):
    id: int
    slug: str
    name: str
    status: str
    company_id: Optional[int] = None
    notes: Optional[str] = None
    site_count: int = 0
    member_count: int = 0


class AccountCreate(BaseModel):
    slug: str = Field(..., max_length=120)
    name: str = Field(..., max_length=120)
    company_id: Optional[int] = None
    notes: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    # 'active' | 'suspended'. Suspension is not deletion: the sites and the
    # extracted history stay, and every member goes dark until it is lifted.
    status: Optional[str] = None
    company_id: Optional[int] = None
    notes: Optional[str] = None


class MemberAdd(BaseModel):
    email: EmailStr
    role: str = "member"


class MemberUpdate(BaseModel):
    role: str


class MemberAddResult(BaseModel):
    member: MemberOut
    # True when this membership is the ONLY thing making them Pro. The admin UI
    # says so, because it is the difference between "removing them from the
    # account hides the portfolio" and "removing them from the account revokes
    # Insights Pro entirely", and an admin should not have to infer which.
    entitled_by_account_only: bool


# =============================================================================
# Helpers
# =============================================================================

def _account_or_404(db: Session, slug: str) -> InsightsAccount:
    acc = db.query(InsightsAccount).filter(InsightsAccount.slug == slug).one_or_none()
    if acc is None:
        raise HTTPException(404, f"No account with slug '{slug}'.")
    return acc


def _counts(db: Session, account_id: int) -> tuple[int, int]:
    row = db.execute(text("""
        SELECT (SELECT count(*) FROM insights_site s WHERE s.account_id = :a) AS sites,
               (SELECT count(*) FROM insights_account_member m
                 WHERE m.account_id = :a) AS members
    """), {"a": account_id}).mappings().one()
    return int(row["sites"]), int(row["members"])


def _serialise(db: Session, acc: InsightsAccount) -> AccountOut:
    sites, members = _counts(db, acc.id)
    return AccountOut(
        id=acc.id, slug=acc.slug, name=acc.name, status=acc.status,
        company_id=acc.company_id, notes=acc.notes,
        site_count=sites, member_count=members,
    )


def _members(db: Session, account_id: int) -> List[MemberOut]:
    rows = db.execute(text("""
        SELECT m.public_user_id, m.role, m.created_at,
               u.email, u.first_name, u.last_name,
               u.subscription_tier, u.pro_site_quota
          FROM insights_account_member m
          JOIN public_users u ON u.id = m.public_user_id
         WHERE m.account_id = :a
         ORDER BY m.role, lower(u.email)
    """), {"a": account_id}).mappings().all()
    out = []
    for r in rows:
        name = " ".join(p for p in (r["first_name"], r["last_name"]) if p) or None
        out.append(MemberOut(
            public_user_id=r["public_user_id"], email=r["email"], full_name=name,
            role=r["role"],
            subscription_tier=r["subscription_tier"] or "free",
            pro_site_quota=r["pro_site_quota"] or 0,
            created_at=r["created_at"].isoformat() if r["created_at"] else None,
        ))
    return out


# =============================================================================
# Accounts
# =============================================================================

@router.get("", response_model=List[AccountOut])
def list_accounts(db: Session = Depends(get_db),
                  admin: PublicUser = Depends(require_admin)):
    """Every account, suspended ones included.

    Unlike the subscriber-facing `/insights/accounts`, this does NOT filter on
    status — a suspended account is exactly what an admin has come here to find.
    """
    accounts = db.query(InsightsAccount).order_by(InsightsAccount.name).all()
    return [_serialise(db, a) for a in accounts]


@router.post("", response_model=AccountOut, status_code=201)
def create_account(body: AccountCreate,
                   db: Session = Depends(get_db),
                   admin: PublicUser = Depends(require_admin)):
    slug = body.slug.strip().lower()
    # The slug is the URL a client pastes to a colleague, so it is validated
    # rather than sanitised — silently rewriting someone's slug produces a link
    # that works and is not the one they typed.
    if not SLUG_RE.match(slug):
        raise HTTPException(422, "slug must be lowercase letters, digits and "
                                 "hyphens, and must start and end with a letter "
                                 "or digit.")
    if db.query(InsightsAccount).filter(InsightsAccount.slug == slug).first():
        raise HTTPException(409, f"An account with slug '{slug}' already exists.")

    acc = InsightsAccount(slug=slug, name=body.name.strip(),
                          company_id=body.company_id, notes=body.notes,
                          status="active")
    db.add(acc)
    db.commit()
    db.refresh(acc)
    logger.info("admin %s created insights account %s (%s)",
                admin.email, acc.slug, acc.id)
    return _serialise(db, acc)


@router.get("/{slug}", response_model=AccountOut)
def get_account(slug: str, db: Session = Depends(get_db),
                admin: PublicUser = Depends(require_admin)):
    return _serialise(db, _account_or_404(db, slug))


@router.patch("/{slug}", response_model=AccountOut)
def update_account(slug: str, body: AccountUpdate,
                   db: Session = Depends(get_db),
                   admin: PublicUser = Depends(require_admin)):
    acc = _account_or_404(db, slug)
    if body.status is not None:
        status_value = body.status.strip().lower()
        if status_value not in ("active", "suspended"):
            raise HTTPException(422, "status must be 'active' or 'suspended'.")
        if status_value != acc.status:
            # Worth a log line either way. Suspending an account revokes Pro for
            # every member who has no tier of their own, which is a bigger
            # action than the one-word field makes it look.
            logger.warning("admin %s set insights account %s status %s -> %s",
                           admin.email, acc.slug, acc.status, status_value)
        acc.status = status_value
    if body.name is not None:
        acc.name = body.name.strip()
    if body.company_id is not None:
        acc.company_id = body.company_id
    if body.notes is not None:
        acc.notes = body.notes
    db.commit()
    db.refresh(acc)
    return _serialise(db, acc)


# =============================================================================
# Members
# =============================================================================

@router.get("/{slug}/members", response_model=List[MemberOut])
def list_members(slug: str, db: Session = Depends(get_db),
                 admin: PublicUser = Depends(require_admin)):
    return _members(db, _account_or_404(db, slug).id)


@router.post("/{slug}/members", response_model=MemberAddResult, status_code=201)
def add_member(slug: str, body: MemberAdd,
               db: Session = Depends(get_db),
               admin: PublicUser = Depends(require_admin)):
    """Add an EXISTING Insights user to the account by email.

    This is the write that was missing. It is also an entitlement change: the
    person becomes Pro for as long as the membership and the account both last.
    """
    acc = _account_or_404(db, slug)
    role = (body.role or "member").strip().lower()
    if role not in ROLES:
        raise HTTPException(422, f"role must be one of {', '.join(ROLES)}.")

    email = str(body.email).strip().lower()
    # Case-insensitive: an admin retyping a colleague's address should not be
    # able to miss an existing account on capitalisation and be told to go and
    # create one that is already there.
    user = (db.query(PublicUser)
              .filter(PublicUser.email.ilike(email))
              .one_or_none())
    if user is None:
        raise HTTPException(404, {
            "code": "no_such_user",
            "message": (f"No Insights user with the email {email}. They need to "
                        "sign up at insights.auxein.co.nz first — membership "
                        "attaches to an existing account, it does not create one."),
            "email": email,
        })

    existing = (db.query(InsightsAccountMember)
                  .filter(InsightsAccountMember.account_id == acc.id,
                          InsightsAccountMember.public_user_id == user.id)
                  .one_or_none())
    if existing:
        raise HTTPException(409, f"{user.email} is already a {existing.role} "
                                 f"on {acc.name}.")

    db.add(InsightsAccountMember(account_id=acc.id, public_user_id=user.id,
                                 role=role))
    db.commit()

    # Recomputed AFTER the commit and with the cache cleared, because
    # `portfolio_accounts` memoises per instance and this request has almost
    # certainly already read it — through `is_pro` on the way in, if nowhere
    # else. A stale read here would report the wrong reason for their access.
    user.__dict__.pop("_portfolio_accounts_cache", None)
    tier = (user.subscription_tier or "free").strip().lower()
    entitled_by_account_only = tier not in ("pro", "grow")

    logger.info("admin %s added %s to insights account %s as %s",
                admin.email, user.email, acc.slug, role)

    member = next((m for m in _members(db, acc.id)
                   if m.public_user_id == user.id), None)
    return MemberAddResult(member=member,
                           entitled_by_account_only=entitled_by_account_only)


@router.patch("/{slug}/members/{user_id}", response_model=MemberOut)
def update_member(slug: str, user_id: int, body: MemberUpdate,
                  db: Session = Depends(get_db),
                  admin: PublicUser = Depends(require_admin)):
    acc = _account_or_404(db, slug)
    role = (body.role or "").strip().lower()
    if role not in ROLES:
        raise HTTPException(422, f"role must be one of {', '.join(ROLES)}.")
    row = (db.query(InsightsAccountMember)
             .filter(InsightsAccountMember.account_id == acc.id,
                     InsightsAccountMember.public_user_id == user_id)
             .one_or_none())
    if row is None:
        raise HTTPException(404, "That user is not a member of this account.")
    row.role = role
    db.commit()
    member = next((m for m in _members(db, acc.id)
                   if m.public_user_id == user_id), None)
    return member


@router.delete("/{slug}/members/{user_id}", status_code=204)
def remove_member(slug: str, user_id: int,
                  db: Session = Depends(get_db),
                  admin: PublicUser = Depends(require_admin)):
    """Remove a member. Revokes Pro for anyone whose only tier was this account.

    Removing the LAST member is allowed and is not an error. The account keeps
    its sites and its extracted history; it just has nobody who can open it,
    which is the state every account is in the moment it is imported. Refusing
    would mean an admin could not correct a membership they had just added to
    the wrong account.
    """
    acc = _account_or_404(db, slug)
    row = (db.query(InsightsAccountMember)
             .filter(InsightsAccountMember.account_id == acc.id,
                     InsightsAccountMember.public_user_id == user_id)
             .one_or_none())
    if row is None:
        raise HTTPException(404, "That user is not a member of this account.")
    db.delete(row)
    db.commit()
    logger.warning("admin %s removed user %s from insights account %s",
                   admin.email, user_id, acc.slug)
    return None
