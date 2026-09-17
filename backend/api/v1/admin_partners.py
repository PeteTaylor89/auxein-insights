"""Admin management of partner clients, API keys and per-key endpoint grants.

Behind `require_admin`. This is the write side of everything
`core/partner_security.py` reads.

## The secret is returned exactly once, by exactly two routes

`POST /keys` and `POST /keys/{id}/rotate`. Nothing else in this file can return
a plaintext key, and there is no route that re-reads one, because there is
nothing to re-read — only the HMAC is stored. The UI has to treat that moment as
irreversible, which is why it blocks.

## Rotation issues, it does not cut over

`rotate` creates a SECOND credential carrying the same grants and limits and
leaves the original active. The partner switches on their own schedule and the
old row is revoked afterwards, which `last_used_at` says is safe. A rotate that
invalidated the old key the moment it was clicked would break a partner at
whatever hour we happened to click it — that is a cutover, and it is a different
operation with a different risk.

## A grant can never exceed the contract

`PUT /grants` rejects any endpoint outside `partner_client.entitled_endpoints`.
The UI greys those rows, but the UI is not the enforcement — a greyed control is
a courtesy and a 422 here is the rule. It is the same two-level check the
request path runs, written once on each side.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from core.admin_security import require_admin
from db.models.partner import (
    ENDPOINTS, ENDPOINT_LABELS, PartnerClient, PartnerCredential, PartnerGrant,
    PartnerLimit, PartnerRequestLog,
)
from db.models.public_user import PublicUser
from db.session import get_db
from services import partner_keys

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/partners", tags=["admin-partners"])

_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


# --- schemas --------------------------------------------------------------

class ClientIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    slug: str = Field(..., min_length=1, max_length=60)
    contact_email: Optional[EmailStr] = None
    environment: str = Field("live", pattern="^(live|test)$")
    status: str = Field("active", pattern="^(active|suspended|ended)$")
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    site_cap: Optional[int] = Field(None, ge=0)
    history_from: Optional[date] = None
    entitled_endpoints: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class ClientPatch(BaseModel):
    name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    status: Optional[str] = Field(None, pattern="^(active|suspended|ended)$")
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    site_cap: Optional[int] = Field(None, ge=0)
    history_from: Optional[date] = None
    entitled_endpoints: Optional[List[str]] = None
    notes: Optional[str] = None


class KeyIn(BaseModel):
    label: str = Field(..., min_length=1, max_length=60)
    expires_at: Optional[datetime] = None
    ip_allowlist: Optional[List[str]] = None


class GrantsIn(BaseModel):
    # {endpoint: enabled}. A partial map is a partial update — only the keys
    # present are touched, so two admins editing different rows of the matrix
    # do not overwrite each other.
    grants: dict[str, bool]


class LimitsIn(BaseModel):
    requests_per_minute: Optional[int] = Field(None, ge=0)
    rows_per_day: Optional[int] = Field(None, ge=0)
    objects_per_day: Optional[int] = Field(None, ge=0)
    bytes_per_day: Optional[int] = Field(None, ge=0)
    raster_lag_days: Optional[int] = Field(None, ge=0, le=365)


# --- serialisation --------------------------------------------------------

def _client_out(db: Session, c: PartnerClient, detail: bool = False) -> dict:
    out = {
        "id": c.id, "name": c.name, "slug": c.slug, "status": c.status,
        "environment": c.environment, "contact_email": c.contact_email,
        "contract_start": c.contract_start, "contract_end": c.contract_end,
        "site_cap": c.site_cap, "history_from": c.history_from,
        "entitled_endpoints": list(c.entitled_endpoints or []),
        "notes": c.notes,
        "is_live": c.is_live,
        "created_at": c.created_at,
    }
    if detail:
        out["sites_in_use"] = db.execute(text("""
            SELECT count(*) FROM insights_site s
              JOIN insights_account a ON a.id = s.account_id
             WHERE a.slug = :slug
        """), {"slug": c.slug}).scalar() or 0
        # An account has to exist for `site.create` to work at all. Surfaced
        # rather than discovered later as a 403 the partner reports to us.
        out["account_exists"] = bool(db.execute(
            text("SELECT 1 FROM insights_account WHERE slug = :s"),
            {"s": c.slug}).first())
    return out


def _cred_out(c: PartnerCredential, grants: dict, limits) -> dict:
    return {
        "id": c.id, "label": c.label,
        "key_prefix": c.key_prefix, "key_last4": c.key_last4,
        "masked": c.masked,
        "created_at": c.created_at, "last_used_at": c.last_used_at,
        "expires_at": c.expires_at, "revoked_at": c.revoked_at,
        "is_active": c.is_active,
        "ip_allowlist": list(c.ip_allowlist or []) or None,
        "grants": {e: bool(grants.get(e) and grants[e].enabled)
                   for e in ENDPOINTS},
        "limits": {
            "requests_per_minute": limits.requests_per_minute if limits else None,
            "rows_per_day": limits.rows_per_day if limits else None,
            "objects_per_day": limits.objects_per_day if limits else None,
            "bytes_per_day": limits.bytes_per_day if limits else None,
            "raster_lag_days": limits.raster_lag_days if limits else 14,
        },
    }


def _get_client(db: Session, client_id: int) -> PartnerClient:
    c = db.query(PartnerClient).get(client_id)
    if c is None:
        raise HTTPException(404, "No such partner client.")
    return c


def _get_cred(db: Session, client_id: int, key_id: int) -> PartnerCredential:
    c = (db.query(PartnerCredential)
         .filter(PartnerCredential.id == key_id,
                 PartnerCredential.client_id == client_id)
         .first())
    if c is None:
        raise HTTPException(404, "No such key on this client.")
    return c


# --- clients --------------------------------------------------------------

@router.get("")
def list_clients(db: Session = Depends(get_db),
                 admin: PublicUser = Depends(require_admin)):
    rows = db.query(PartnerClient).order_by(PartnerClient.name).all()
    return {
        "clients": [_client_out(db, c) for c in rows],
        "endpoints": [{"key": e, "label": ENDPOINT_LABELS[e]} for e in ENDPOINTS],
        # The admin page says which pepper is in force, because the derived
        # fallback couples every partner key to SECRET_KEY — rotating that would
        # invalidate all of them, and that is worth knowing BEFORE it happens.
        "pepper_is_derived": partner_keys.pepper_is_derived(),
    }


@router.post("", status_code=201)
def create_client(body: ClientIn, db: Session = Depends(get_db),
                  admin: PublicUser = Depends(require_admin)):
    if not _SLUG.match(body.slug):
        raise HTTPException(422, "slug must be lowercase words joined by hyphens.")
    if db.query(PartnerClient).filter(PartnerClient.slug == body.slug).first():
        raise HTTPException(409, f"A client with slug {body.slug!r} already exists.")
    bad = set(body.entitled_endpoints) - set(ENDPOINTS)
    if bad:
        raise HTTPException(422, f"Unknown endpoints: {sorted(bad)}")

    c = PartnerClient(**body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    log.info("admin %s created partner client %s", admin.id, c.slug)
    return _client_out(db, c, detail=True)


@router.get("/{client_id}")
def get_client(client_id: int, db: Session = Depends(get_db),
               admin: PublicUser = Depends(require_admin)):
    c = _get_client(db, client_id)
    creds = (db.query(PartnerCredential)
             .filter(PartnerCredential.client_id == c.id)
             .order_by(PartnerCredential.revoked_at.isnot(None),
                       PartnerCredential.created_at)
             .all())
    ids = [x.id for x in creds]
    grants: dict[int, dict] = {i: {} for i in ids}
    if ids:
        for g in db.query(PartnerGrant).filter(
                PartnerGrant.credential_id.in_(ids)).all():
            grants[g.credential_id][g.endpoint] = g
    limits = {l.credential_id: l for l in db.query(PartnerLimit).filter(
        PartnerLimit.credential_id.in_(ids)).all()} if ids else {}

    return {
        "client": _client_out(db, c, detail=True),
        "keys": [_cred_out(x, grants[x.id], limits.get(x.id)) for x in creds],
        "endpoints": [{"key": e, "label": ENDPOINT_LABELS[e]} for e in ENDPOINTS],
    }


@router.patch("/{client_id}")
def patch_client(client_id: int, body: ClientPatch,
                 db: Session = Depends(get_db),
                 admin: PublicUser = Depends(require_admin)):
    c = _get_client(db, client_id)
    data = body.model_dump(exclude_unset=True)
    if "entitled_endpoints" in data:
        bad = set(data["entitled_endpoints"]) - set(ENDPOINTS)
        if bad:
            raise HTTPException(422, f"Unknown endpoints: {sorted(bad)}")
    for k, v in data.items():
        setattr(c, k, v)
    db.commit()
    log.info("admin %s updated partner client %s: %s", admin.id, c.slug,
             sorted(data))
    return _client_out(db, c, detail=True)


# --- keys -----------------------------------------------------------------

@router.post("/{client_id}/keys", status_code=201)
def create_key(client_id: int, body: KeyIn, db: Session = Depends(get_db),
               admin: PublicUser = Depends(require_admin)):
    """Mint a key. **The plaintext is in this response and nowhere else, ever.**"""
    c = _get_client(db, client_id)
    minted = partner_keys.issue(c.environment)

    cred = PartnerCredential(
        client_id=c.id, label=body.label,
        key_prefix=minted["key_prefix"], key_last4=minted["key_last4"],
        key_hash=minted["key_hash"],
        created_by=admin.id,
        expires_at=body.expires_at,
        ip_allowlist=body.ip_allowlist or None,
    )
    db.add(cred)
    db.flush()
    # A key with no limit row would be unlimited on every dial. The defaults
    # here are the ones in the build scope, sized so a normal nightly pull is
    # four objects and a full-archive sweep is visible in the log before it
    # completes.
    db.add(PartnerLimit(credential_id=cred.id, requests_per_minute=120,
                        rows_per_day=2_000_000, objects_per_day=250,
                        bytes_per_day=2 * 1024 ** 3, raster_lag_days=14))
    # Every endpoint present and OFF. A missing row and an off row read the same
    # to the request path, but not to the admin UI — the matrix needs something
    # to render, and an explicit false is also an auditable "we chose not to".
    for endpoint in ENDPOINTS:
        db.add(PartnerGrant(credential_id=cred.id, endpoint=endpoint,
                            enabled=False, updated_by=admin.id))
    db.commit()
    db.refresh(cred)
    log.info("admin %s minted partner key %s for %s", admin.id,
             cred.key_prefix, c.slug)

    return {
        # Shown once. Never logged, never re-readable.
        "key": minted["key"],
        "credential": _cred_out(cred, {}, None),
        "warning": ("This key is shown once and cannot be recovered. "
                    "Store it now."),
    }


@router.post("/{client_id}/keys/{key_id}/rotate", status_code=201)
def rotate_key(client_id: int, key_id: int, db: Session = Depends(get_db),
               admin: PublicUser = Depends(require_admin)):
    """Issue a replacement carrying the same grants and limits. **Both stay active.**

    The old key is revoked separately, after the partner has cut over.
    `last_used_at` on the old row is what says that is safe.
    """
    c = _get_client(db, client_id)
    old = _get_cred(db, client_id, key_id)
    minted = partner_keys.issue(c.environment)

    new = PartnerCredential(
        client_id=c.id, label=f"{old.label} (rotated)",
        key_prefix=minted["key_prefix"], key_last4=minted["key_last4"],
        key_hash=minted["key_hash"], created_by=admin.id,
        expires_at=old.expires_at,
        ip_allowlist=list(old.ip_allowlist) if old.ip_allowlist else None,
    )
    db.add(new)
    db.flush()

    old_limits = db.query(PartnerLimit).get(old.id)
    db.add(PartnerLimit(
        credential_id=new.id,
        requests_per_minute=old_limits.requests_per_minute if old_limits else 120,
        rows_per_day=old_limits.rows_per_day if old_limits else 2_000_000,
        objects_per_day=old_limits.objects_per_day if old_limits else 250,
        bytes_per_day=old_limits.bytes_per_day if old_limits else 2 * 1024 ** 3,
        raster_lag_days=old_limits.raster_lag_days if old_limits else 14,
    ))
    old_grants = {g.endpoint: g for g in db.query(PartnerGrant).filter(
        PartnerGrant.credential_id == old.id).all()}
    for endpoint in ENDPOINTS:
        prior = old_grants.get(endpoint)
        db.add(PartnerGrant(
            credential_id=new.id, endpoint=endpoint,
            enabled=bool(prior and prior.enabled),
            config=prior.config if prior else None,
            updated_by=admin.id))
    db.commit()
    db.refresh(new)
    log.info("admin %s rotated partner key %s -> %s for %s", admin.id,
             old.key_prefix, new.key_prefix, c.slug)

    return {
        "key": minted["key"],
        "credential": _cred_out(new, {}, None),
        "warning": ("This key is shown once and cannot be recovered. "
                    "The previous key is STILL ACTIVE — revoke it once the "
                    "partner has cut over."),
    }


@router.delete("/{client_id}/keys/{key_id}", status_code=200)
def revoke_key(client_id: int, key_id: int, db: Session = Depends(get_db),
               admin: PublicUser = Depends(require_admin)):
    """Revoke immediately. The row is kept — the usage history hangs off it."""
    cred = _get_cred(db, client_id, key_id)
    if cred.revoked_at is None:
        cred.revoked_at = datetime.now(timezone.utc)
        cred.revoked_by = admin.id
        db.commit()
        log.info("admin %s revoked partner key %s", admin.id, cred.key_prefix)
    return {"id": cred.id, "revoked_at": cred.revoked_at, "is_active": False}


# --- grants and limits ----------------------------------------------------

@router.put("/{client_id}/keys/{key_id}/grants")
def set_grants(client_id: int, key_id: int, body: GrantsIn,
               db: Session = Depends(get_db),
               admin: PublicUser = Depends(require_admin)):
    """Set endpoint toggles on one key. **Cannot exceed the client's contract.**"""
    client = _get_client(db, client_id)
    cred = _get_cred(db, client_id, key_id)

    bad = set(body.grants) - set(ENDPOINTS)
    if bad:
        raise HTTPException(422, f"Unknown endpoints: {sorted(bad)}")

    entitled = set(client.entitled_endpoints or [])
    # The UI greys these, but a greyed control is a courtesy and this is the
    # rule. Turning on something the client never bought is refused, named.
    over = {e for e, on in body.grants.items() if on and e not in entitled}
    if over:
        raise HTTPException(
            422, f"Not in this client's contract: {sorted(over)}. "
                 "Add it to the client's entitlements first.")

    existing = {g.endpoint: g for g in db.query(PartnerGrant).filter(
        PartnerGrant.credential_id == cred.id).all()}
    now = datetime.now(timezone.utc)
    for endpoint, enabled in body.grants.items():
        g = existing.get(endpoint)
        if g is None:
            db.add(PartnerGrant(credential_id=cred.id, endpoint=endpoint,
                                enabled=enabled, updated_by=admin.id))
        else:
            g.enabled = enabled
            g.updated_at = now
            g.updated_by = admin.id
    db.commit()
    log.info("admin %s set grants on key %s: %s", admin.id, cred.key_prefix,
             body.grants)

    refreshed = {g.endpoint: g for g in db.query(PartnerGrant).filter(
        PartnerGrant.credential_id == cred.id).all()}
    return {"id": cred.id,
            "grants": {e: bool(refreshed.get(e) and refreshed[e].enabled)
                       for e in ENDPOINTS}}


@router.put("/{client_id}/keys/{key_id}/limits")
def set_limits(client_id: int, key_id: int, body: LimitsIn,
               db: Session = Depends(get_db),
               admin: PublicUser = Depends(require_admin)):
    cred = _get_cred(db, client_id, key_id)
    limits = db.query(PartnerLimit).get(cred.id)
    if limits is None:
        limits = PartnerLimit(credential_id=cred.id)
        db.add(limits)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(limits, k, v)
    db.commit()
    log.info("admin %s set limits on key %s", admin.id, cred.key_prefix)
    return {"id": cred.id, "limits": {
        "requests_per_minute": limits.requests_per_minute,
        "rows_per_day": limits.rows_per_day,
        "objects_per_day": limits.objects_per_day,
        "bytes_per_day": limits.bytes_per_day,
        "raster_lag_days": limits.raster_lag_days,
    }}


# --- usage ----------------------------------------------------------------

@router.get("/{client_id}/usage")
def usage(client_id: int, days: int = Query(30, ge=1, le=365),
          db: Session = Depends(get_db),
          admin: PublicUser = Depends(require_admin)):
    """What this client actually pulled. The renewal conversation, as data.

    Bounded by `at` on purpose — `partner_request_log` only grows, and an
    unbounded aggregate over it is the slowest query on the page.
    """
    _get_client(db, client_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    totals = db.query(
        func.count(PartnerRequestLog.id),
        func.coalesce(func.sum(PartnerRequestLog.row_count), 0),
        func.coalesce(func.sum(PartnerRequestLog.object_count), 0),
        func.coalesce(func.sum(PartnerRequestLog.bytes), 0),
    ).filter(PartnerRequestLog.client_id == client_id,
             PartnerRequestLog.at >= since).one()

    per_key = db.execute(text("""
        SELECT l.credential_id, c.label, c.key_prefix,
               count(*)                            AS requests,
               coalesce(sum(l.row_count), 0)       AS rows,
               coalesce(sum(l.object_count), 0)    AS objects,
               coalesce(sum(l.bytes), 0)           AS bytes,
               max(l.at)                           AS last_at
          FROM partner_request_log l
          LEFT JOIN partner_credential c ON c.id = l.credential_id
         WHERE l.client_id = :cid AND l.at >= :since
         GROUP BY l.credential_id, c.label, c.key_prefix
         ORDER BY requests DESC
    """), {"cid": client_id, "since": since}).mappings().all()

    refusals = db.execute(text("""
        SELECT decision, count(*) AS n
          FROM partner_request_log
         WHERE client_id = :cid AND at >= :since AND status >= 400
         GROUP BY decision ORDER BY n DESC LIMIT 10
    """), {"cid": client_id, "since": since}).mappings().all()

    return {
        "days": days,
        "totals": {"requests": totals[0], "rows": int(totals[1]),
                   "objects": int(totals[2]), "bytes": int(totals[3])},
        "per_key": [dict(r) for r in per_key],
        # What they were REFUSED and why. This is where "they keep hitting a
        # 403 on rasters" becomes visible before it becomes an email.
        "refusals": [dict(r) for r in refusals],
    }
