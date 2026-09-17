"""Authentication and entitlement for `/api/v1/partner/*`.

## The check chain, in order

    key present -> key valid -> key active -> client active and in contract
      -> client entitled to the endpoint -> this key granted the endpoint
      -> per-endpoint config (history floor, geography) -> limits

**Each step has its own error code**, so a partner can tell "never sold",
"switched off on this key", "outside the licensed history" and "out of quota"
apart without emailing us. Collapsing them into one 403 is what turns every
refusal into a support round trip.

## The isolation requirement — the part that must not be casual

A partner key and a `public_users` JWT must be **mutually unacceptable**.

This matters more than it looks. `get_current_public_user` reads `user_id`
straight out of the token claims, so a credential carrying a well-chosen claim
set is exactly the kind of thing that ends up authenticating somewhere nobody
intended. The two directions are guarded differently and both are guarded:

* A partner key is not a JWT and carries no claims, so it cannot satisfy
  `decode_access_token` — it fails as a malformed token.
* This dependency looks the presented string up in `partner_credential` and
  nowhere else. A JWT has no `auxp_` prefix, so `prefix_of` returns None and it
  is rejected before a database round trip.

`tests/test_partner_auth_isolation.py` asserts both directions.

## 401 vs 403, deliberately

`HTTPBearer(auto_error=True)` answers **403 to an anonymous caller**, which
tells an integrations engineer their key was wrong when in fact it was absent —
an hour of somebody's afternoon, and this platform has made that mistake before.
So `auto_error=False` here, and a missing key is **401 `auth.missing_key`** with
`WWW-Authenticate: Bearer`.
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.partner import (
    ALWAYS_ON, PartnerClient, PartnerCredential, PartnerGrant, PartnerLimit,
    PartnerRequestLog,
)
from services import partner_keys

log = logging.getLogger(__name__)

# auto_error=False — see the module docstring. A missing key is our 401, not
# FastAPI's 403.
bearer = HTTPBearer(auto_error=False)


class PartnerError(HTTPException):
    """A refusal that carries a stable machine-readable `code`.

    `application/problem+json` per the specification. The shape is built here
    rather than at each raise site so every refusal in the partner API looks the
    same to a consumer branching on `code`.
    """

    def __init__(self, status_code: int, code: str, detail: str,
                 kind: str = "about:blank"):
        self.code = code
        super().__init__(
            status_code=status_code,
            detail={
                "type": f"https://api.auxein.co.nz/errors/{kind}",
                "title": detail.split(".")[0],
                "status": status_code,
                "code": code,
                "detail": detail,
            },
            headers=({"WWW-Authenticate": "Bearer"}
                     if status_code == 401 else None),
        )


class PartnerContext:
    """Who is calling, what they may do, and the accounting for this request.

    Handed to every partner route. `metered()` is how a route reports what it
    actually returned — the log row and the quota both depend on it, and a route
    that forgets to call it shows up as a zero-row request in the usage panel
    rather than silently costing nothing.
    """

    def __init__(self, db: Session, client: PartnerClient,
                 credential: PartnerCredential,
                 grants: dict[str, PartnerGrant],
                 limits: Optional[PartnerLimit]):
        self.db = db
        self.client = client
        self.credential = credential
        self.grants = grants
        self.limits = limits
        self.started = time.monotonic()
        self.rows = 0
        self.objects = 0
        self.bytes = 0

    # --- entitlement -----------------------------------------------------

    def granted_endpoints(self) -> list[str]:
        """What this key may actually reach: the client ceiling AND the toggle."""
        entitled = set(self.client.entitled_endpoints or [])
        return sorted(e for e, g in self.grants.items()
                      if g.enabled and e in entitled)

    def require(self, endpoint: str) -> PartnerGrant:
        """Assert this key may use `endpoint`, or raise the right refusal.

        Three distinct answers, deliberately:
          * the client never bought it        -> entitlement.resource
          * they bought it, this key is off   -> auth.endpoint_not_granted
          * granted                           -> the grant, for its config
        """
        if endpoint in ALWAYS_ON:
            return None
        if endpoint not in set(self.client.entitled_endpoints or []):
            raise PartnerError(
                403, "entitlement.resource",
                f"{endpoint} is not included in this agreement.",
                kind="entitlement")
        grant = self.grants.get(endpoint)
        if grant is None or not grant.enabled:
            raise PartnerError(
                403, "auth.endpoint_not_granted",
                f"This key is not granted {endpoint}.", kind="auth")
        return grant

    def history_floor(self, endpoint: str) -> Optional[date]:
        """The earliest date this key may read, or None for no floor.

        A per-endpoint floor in `grant.config` NARROWS the client's floor and
        can never widen it — taking the later of the two is what enforces that
        in one line, rather than trusting whoever edits the JSON.
        """
        floor = self.client.history_from
        grant = self.grants.get(endpoint)
        if grant and grant.config:
            raw = grant.config.get("history_from")
            if raw:
                try:
                    per_endpoint = date.fromisoformat(raw)
                    floor = (per_endpoint if floor is None
                             else max(floor, per_endpoint))
                except ValueError:
                    log.warning("credential %s %s has an unparseable "
                                "history_from %r — ignoring the override",
                                self.credential.id, endpoint, raw)
        return floor

    def check_history(self, endpoint: str, requested_from: Optional[date]):
        """Refuse a window that reaches behind the licensed history."""
        floor = self.history_floor(endpoint)
        if floor and requested_from and requested_from < floor:
            raise PartnerError(
                403, "entitlement.history_depth",
                f"History before {floor.isoformat()} is not included in this "
                "agreement.", kind="entitlement")

    def clamp_from(self, endpoint: str, requested_from: Optional[date]) -> Optional[date]:
        """The floor applied silently, for list endpoints with no explicit window.

        Distinct from `check_history` on purpose: an EXPLICIT request for
        forbidden dates is an error the caller should see, but a default window
        that happens to reach too far is just clamped. Erroring on the latter
        would make an unparameterised call fail for a reason the caller never
        asked about.
        """
        floor = self.history_floor(endpoint)
        if floor is None:
            return requested_from
        if requested_from is None:
            return floor
        return max(floor, requested_from)

    # --- accounting ------------------------------------------------------

    def metered(self, rows: int = 0, objects: int = 0, nbytes: int = 0):
        """Report what this request returned. Drives the log row and the quota."""
        self.rows += rows
        self.objects += objects
        self.bytes += nbytes

    def raster_cutoff(self) -> date:
        """The newest `valid_at` a raster object may be released at.

        The weekly refit REWRITES daily objects at the same S3 key, so anything
        inside that window is not final. Serving it would hand a partner an
        object that changes underneath them with no way to notice.
        """
        lag = self.limits.raster_lag_days if self.limits else 14
        return date.today() - timedelta(days=lag)


# --- quota ---------------------------------------------------------------

def _usage_today(db: Session, credential_id: int) -> dict:
    """Rows, objects and bytes billed to this key since midnight UTC.

    One aggregate over `ix_partner_log_cred_at`. The timestamp bound is not
    optional — `partner_request_log` only grows, and an unbounded aggregate here
    becomes the slowest thing in the request.
    """
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0,
                                               microsecond=0)
    row = db.query(
        func.coalesce(func.sum(PartnerRequestLog.row_count), 0),
        func.coalesce(func.sum(PartnerRequestLog.object_count), 0),
        func.coalesce(func.sum(PartnerRequestLog.bytes), 0),
    ).filter(
        PartnerRequestLog.credential_id == credential_id,
        PartnerRequestLog.at >= since,
    ).one()
    return {"rows": int(row[0]), "objects": int(row[1]), "bytes": int(row[2])}


def _check_quota(db: Session, credential: PartnerCredential,
                 limits: Optional[PartnerLimit]) -> dict:
    """Refuse before doing the work when a daily allowance is already spent.

    Checked on the way IN, against what has already been logged. A request that
    tips a quota over mid-flight is allowed to finish — refusing after the
    database work is done costs us the work and gives the partner nothing.
    """
    if limits is None:
        return {}
    used = _usage_today(db, credential.id)
    if limits.rows_per_day is not None and used["rows"] >= limits.rows_per_day:
        raise PartnerError(429, "quota.rows_exhausted",
                           f"Daily row allowance of {limits.rows_per_day:,} "
                           "is exhausted.", kind="quota")
    if (limits.objects_per_day is not None
            and used["objects"] >= limits.objects_per_day):
        raise PartnerError(429, "quota.objects_exhausted",
                           f"Daily object allowance of "
                           f"{limits.objects_per_day:,} is exhausted.",
                           kind="quota")
    if (limits.bytes_per_day is not None
            and used["bytes"] >= limits.bytes_per_day):
        raise PartnerError(429, "quota.objects_exhausted",
                           "Daily byte allowance is exhausted.", kind="quota")
    return used


# --- the dependency -------------------------------------------------------

def get_partner(request: Request,
                credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
                db: Session = Depends(get_db)) -> PartnerContext:
    """Authenticate a partner key and build the request context.

    Every refusal below is a distinct code. See the module docstring.
    """
    if credentials is None or not credentials.credentials:
        raise PartnerError(401, "auth.missing_key",
                           "An API key is required.", kind="auth")

    key = credentials.credentials
    prefix = partner_keys.prefix_of(key)
    if prefix is None:
        # Not our shape at all — a JWT, or junk. Rejected without touching the
        # database, which is also what keeps a public token from ever being
        # looked up here.
        raise PartnerError(401, "auth.invalid_key",
                           "The API key was not recognised.", kind="auth")

    credential = (db.query(PartnerCredential)
                  .filter(PartnerCredential.key_prefix == prefix)
                  .first())
    if credential is None or not partner_keys.verify_key(key,
                                                         credential.key_hash):
        raise PartnerError(401, "auth.invalid_key",
                           "The API key was not recognised.", kind="auth")

    if not credential.is_active:
        raise PartnerError(401, "auth.key_revoked",
                           "This API key has been revoked or has expired.",
                           kind="auth")

    if credential.ip_allowlist:
        caller = request.client.host if request.client else None
        if caller not in credential.ip_allowlist:
            raise PartnerError(403, "auth.invalid_key",
                               "This API key is not permitted from this "
                               "address.", kind="auth")

    client = db.query(PartnerClient).get(credential.client_id)
    if client is None or not client.is_live:
        raise PartnerError(403, "entitlement.resource",
                           "This account is not active.", kind="entitlement")

    grants = {g.endpoint: g for g in db.query(PartnerGrant)
              .filter(PartnerGrant.credential_id == credential.id).all()}
    limits = db.query(PartnerLimit).get(credential.id)

    _check_quota(db, credential, limits)

    # Written on every authenticated request. It is what tells us a rotation is
    # safe to complete, so it is not decoration — but it is also one UPDATE per
    # request, which is why it is a bare column write and not a read-modify-write.
    credential.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return PartnerContext(db, client, credential, grants, limits)


def log_request(ctx: PartnerContext, request: Request, status_code: int,
                endpoint: Optional[str] = None,
                decision: Optional[str] = None) -> None:
    """Write the request log row. Never raises.

    A logging failure must not turn a successful 200 into a 500 — the partner
    got their data, and losing one usage row is strictly better than losing the
    response. The failure is logged locally so it is not silent.
    """
    try:
        ctx.db.add(PartnerRequestLog(
            client_id=ctx.client.id,
            credential_id=ctx.credential.id,
            method=request.method,
            route=str(request.url.path),
            endpoint=endpoint,
            status=status_code,
            decision=decision,
            row_count=ctx.rows or None,
            object_count=ctx.objects or None,
            bytes=ctx.bytes or None,
            latency_ms=int((time.monotonic() - ctx.started) * 1000),
        ))
        ctx.db.commit()
    except Exception:
        ctx.db.rollback()
        log.exception("failed to write partner_request_log for credential %s",
                      ctx.credential.id)
