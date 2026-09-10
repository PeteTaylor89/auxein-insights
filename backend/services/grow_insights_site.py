"""Give a Grow property its own point in the Insights archive.

A Grow property showing its region's climate is showing somebody else's. This
provisions the property an `insights_site` — a resolved surface cell and its
extracted 1986-2023 record — so This Season answers about the property rather
than the zone it sits in.

## THE COMMERCIAL SHAPE, AND WHY IT NEEDED NO NEW MACHINERY

The open question was whether a Grow property consumes an Insights
`pro_site_quota` slot. It does not, and it must not: a point subscription is
priced separately and stacks, so charging a Grow customer per property would
bill them twice for something the Grow subscription already covers.

`core/entitlements.py` already puts `'grow'` in `PRO_TIERS`, so a Grow user
passes `require_pro` the moment SSO projects them into `public_users`. What they
lack is quota. And `ck_insights_site_one_owner` already allows a site owned by an
ACCOUNT instead of a person — which is how BSI's 67 sites work, consuming
nobody's quota — while `insights_account.company_id` already exists to name the
Grow company behind one. So:

    a Grow company  ->  an insights_account (company_id set, status active)
    its properties  ->  account sites (source='grow')
    its users       ->  account members, which is a third route to Pro

Three tables that already existed, wired the way they were built to be wired.

## WHAT THIS REFUSES, AND WHY REFUSING IS THE POINT

A property with **no forecast point** cannot be given a site. The lat/lon IS the
placement, and there is nothing to guess from: a property polygon centroid would
put the point in a random paddock, and the region centroid is exactly the
regional figure this exists to replace. So it raises, and the caller tells the
user to set the point in Manage -> Weather.

`resolve_cell` refuses an off-mask point for the same class of reason — a site
over water populates to 456 nulls and reports 'ready'. That refusal carries the
distance to the nearest land cell, and it is passed straight through rather than
swallowed, because "move it 300 m inland" is something the user can act on.
"""
import logging
import re
from typing import Optional

from sqlalchemy.orm import Session

from db.models.insights_account import InsightsAccount, InsightsAccountMember
from db.models.insights_site import InsightsSite
from db.models.property import Property
from db.models.company import Company
from services import insights_site_service as svc

log = logging.getLogger(__name__)

#: Marks a site as Grow-provisioned. `source` already carries 'pro_slot' and
#: 'account'; this distinguishes a point that exists because a Grow property
#: exists, which matters for reporting and for never billing it as a point sub.
GROW_SOURCE = "grow"


class ProvisioningError(Exception):
    """A refusal the user can act on. `code` is for the client, not the log."""

    def __init__(self, code: str, message: str, detail: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail or {}


def _slugify(name: str, company_id: int) -> str:
    """A URL-safe account slug, always suffixed with the company id.

    The suffix is not decoration. `insights_account.slug` is UNIQUE across every
    client, and two Grow companies called "Greystone" would otherwise collide on
    provisioning — a failure that would surface as a 500 on somebody's first
    attempt to switch on their own weather.
    """
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:100]
    return f"{base}-{company_id}" if base else f"company-{company_id}"


def account_for_company(db: Session, company_id: int) -> InsightsAccount:
    """The Insights account for a Grow company, created on first use.

    Matched on `company_id`, not on the slug — a company rename must not orphan
    the account and provision a second one alongside it.
    """
    account = (db.query(InsightsAccount)
                 .filter(InsightsAccount.company_id == company_id)
                 .first())
    if account is not None:
        return account

    company = db.get(Company, company_id)
    name = (getattr(company, "name", None) or f"Company {company_id}")[:120]
    account = InsightsAccount(
        name=name,
        slug=_slugify(name, company_id),
        status="active",
        company_id=company_id,
        notes="Created automatically for a Grow company. Sites are provisioned "
              "from Grow properties and consume no pro_site_quota.",
    )
    db.add(account)
    db.flush()
    log.info("insights account %s created for company %s", account.slug, company_id)
    return account


def ensure_member(db: Session, account_id: int, public_user_id: int,
                  role: str = "member") -> None:
    """Make a Grow user a member of their company's account, idempotently.

    Membership is what entitles them — `is_pro` checks `portfolio_accounts`
    before it looks at the tier. Without this the sites exist, are extracted
    nightly, and are reachable by nobody: exactly the hole that
    `insights_account_member` sat in until 2026-09-04, when it was read by three
    queries and written by nothing.
    """
    existing = (db.query(InsightsAccountMember)
                  .filter(InsightsAccountMember.account_id == account_id,
                          InsightsAccountMember.public_user_id == public_user_id)
                  .first())
    if existing is not None:
        return
    db.add(InsightsAccountMember(account_id=account_id,
                                 public_user_id=public_user_id,
                                 role=role))
    db.flush()
    log.info("public_user %s added to insights account %s", public_user_id, account_id)


def member_count(db: Session, account_id: int) -> int:
    """How many members this account has. Decides who becomes its owner."""
    return (db.query(InsightsAccountMember)
              .filter(InsightsAccountMember.account_id == account_id)
              .count())


def provision_site_for_property(db: Session, prop: Property) -> InsightsSite:
    """Place a site at this property's forecast point. Idempotent.

    Returns the existing site unchanged if the property already has one — this
    is reachable from a button, and a second press must not create a second
    point or restart an extraction that is already running.
    """
    if prop.insights_site_id is not None:
        existing = db.get(InsightsSite, prop.insights_site_id)
        if existing is not None:
            return existing
        # The site was deleted and the FK nulled by ON DELETE SET NULL, or the
        # pointer is stale. Fall through and place a new one.
        prop.insights_site_id = None

    lat = prop.forecast_latitude
    lon = prop.forecast_longitude
    if lat is None or lon is None:
        raise ProvisioningError(
            "no_forecast_point",
            f"{prop.name} has no weather location set, so there is no point to "
            "place. Set it in Manage → Weather, then try again.",
        )
    lat, lon = float(lat), float(lon)

    company_id = prop.owner_company_id
    if company_id is None:
        # A property reached only through a management relationship has no owner
        # company, so there is no account to hang the site on. Refusing beats
        # attaching it to the manager's account, where it would outlive the
        # relationship that justified it.
        raise ProvisioningError(
            "no_owner_company",
            f"{prop.name} has no owning company, so there is no Insights "
            "account to attach a site to.",
        )

    try:
        cell = svc.resolve_cell(db, lat, lon)
    except svc.PlacementError as exc:
        # Passed through with its detail intact: an off-mask refusal carries the
        # distance to the nearest land cell, which is the only actionable part.
        raise ProvisioningError(exc.code, exc.message, exc.detail) from exc

    account = account_for_company(db, company_id)

    site = InsightsSite(
        account_id=account.id,
        public_user_id=None,      # ck_insights_site_one_owner: account XOR user
        company_id=company_id,    # provenance; the account already names it too
        slot_index=0,             # NOT NULL; account sites all sit at 0
        label=(prop.name or "")[:80],   # label is String(80)
        latitude=lat, longitude=lon,
        grid_row=cell["row"], grid_col=cell["col"], grid_key=cell["grid_key"],
        zone_id=svc.resolve_zone(db, lat, lon),
        status="populating",
        source=GROW_SOURCE,
        external_ref=f"property|{prop.id}",
        # Deliberately no `variety`. A property grows several, and
        # `insights_site_phenology` is keyed on (site_id, variety_code, vintage)
        # so every variety is computed for every site anyway. Naming one here
        # would only set `variety_is_assumed` FALSE for a single arbitrary
        # cultivar and make the other rows look less trustworthy than they are.
    )
    db.add(site)
    db.flush()

    prop.insights_site_id = site.id
    db.flush()
    log.info("site %s placed for property %s (company %s) at %.5f,%.5f",
             site.id, prop.id, company_id, lat, lon)
    return site
