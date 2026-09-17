"""Partner Data API — the five tables behind `/api/v1/partner/*`.

Created by `alembic/versions/partner_api.py`; the reasoning for the shape lives
there and is not repeated. Three things are restated because they read as
omissions from here:

* `PartnerCredential.key_hash` is an **HMAC-SHA256**, not a password hash. The
  secret is 256 bits of `secrets.token_urlsafe`, which no KDF makes safer, and a
  KDF would run on every request. The pepper is deliberately NOT in this table.

* **Grants hang off the CREDENTIAL, entitlement off the CLIENT.** The client is
  the ceiling (what was sold), the key is the dial (what this integration may
  use). `PartnerClient.entitled_endpoints` is checked before
  `PartnerGrant.enabled`, always.

* `PartnerLimit` columns are nullable and NULL means **unlimited**, not zero.
  A raster-only key legitimately has no `rows_per_day`.
"""

from sqlalchemy import (
    Column, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String,
    Text, func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from db.base_class import Base


# The sellable endpoints. Mirrors `ck_partner_grant_endpoint`, and the two must
# stay in step — the constraint fails loudly, this list fails as "not granted",
# which is far quieter.
ENDPOINTS = (
    "site.create", "site.history", "site.season",
    "region.history", "region.summary",
    "raster.daily", "raster.monthly",
)

# Readable names for the admin UI and for `/meta/entitlements`. Kept beside the
# codes so a new endpoint cannot ship without one.
ENDPOINT_LABELS = {
    "site.create": "Add a site",
    "site.history": "Site history",
    "site.season": "Site season vs baseline",
    "region.history": "Regional history",
    "region.summary": "Regional summary",
    "raster.monthly": "Monthly GeoTIFFs",
    "raster.daily": "Daily GeoTIFFs",
}

# Always available to any valid key, and NOT toggleable. They return identifiers
# and status only — no measurements — and the seven are unusable without them:
# `/sites` is the only way to poll a 202 to `ready`, `/regions` is the only way
# to learn a slug, and a partner who cannot read their own grants guesses at
# every 403.
ALWAYS_ON = ("meta.entitlements", "site.list", "region.list")


class PartnerClient(Base):
    """A licensed organisation. The contract, and the ceiling every key sits under."""
    __tablename__ = "partner_client"

    id = Column(Integer, primary_key=True)
    name = Column(Text, nullable=False)
    slug = Column(Text, nullable=False, unique=True)
    status = Column(Text, nullable=False, server_default="active")
    environment = Column(Text, nullable=False, server_default="live")
    contact_email = Column(Text, nullable=True)
    contract_start = Column(Date, nullable=True)
    contract_end = Column(Date, nullable=True)

    # NULL = unlimited. A real contractual position, and not the same as 0.
    site_cap = Column(Integer, nullable=True)
    history_from = Column(Date, nullable=True)
    entitled_endpoints = Column(ARRAY(Text), nullable=False,
                                server_default="{}")

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(),
                        nullable=True)

    @property
    def is_live(self) -> bool:
        """Active, and inside its contract dates if it has any.

        Checked on every request. `contract_end` in the past stops a key working
        without anybody having to remember to revoke it, which is the whole
        reason the dates are stored rather than kept in a folder.
        """
        from datetime import date as _date
        if self.status != "active":
            return False
        today = _date.today()
        if self.contract_start and today < self.contract_start:
            return False
        if self.contract_end and today > self.contract_end:
            return False
        return True

    def __repr__(self) -> str:
        return f"<PartnerClient {self.slug} {self.status}>"


class PartnerCredential(Base):
    """One API key. Multiple live rows per client, so rotation OVERLAPS."""
    __tablename__ = "partner_credential"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer,
                       ForeignKey("partner_client.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    label = Column(Text, nullable=False)

    # The lookup: `auxp_live_` + the first 8 characters of the secret. Unique
    # and indexed, so verifying a key is one read and one HMAC.
    key_prefix = Column(Text, nullable=False, unique=True)
    key_last4 = Column(String(4), nullable=False)
    key_hash = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)
    created_by = Column(Integer,
                        ForeignKey("public_users.id", ondelete="SET NULL"),
                        nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by = Column(Integer,
                        ForeignKey("public_users.id", ondelete="SET NULL"),
                        nullable=True)
    ip_allowlist = Column(ARRAY(Text), nullable=True)

    @property
    def is_active(self) -> bool:
        from datetime import datetime, timezone as _tz
        if self.revoked_at is not None:
            return False
        if self.expires_at is not None:
            return self.expires_at > datetime.now(_tz.utc)
        return True

    @property
    def masked(self) -> str:
        """What the admin UI and a support ticket may show."""
        return f"{self.key_prefix}...{self.key_last4}"

    def __repr__(self) -> str:
        return f"<PartnerCredential {self.masked} client={self.client_id}>"


class PartnerGrant(Base):
    """One endpoint toggle on one key. Narrows the client's entitlement, never widens it."""
    __tablename__ = "partner_grant"

    credential_id = Column(Integer,
                           ForeignKey("partner_credential.id",
                                      ondelete="CASCADE"),
                           primary_key=True)
    endpoint = Column(Text, primary_key=True)
    enabled = Column(Boolean, nullable=False, server_default="false")
    config = Column(JSONB, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)
    updated_by = Column(Integer,
                        ForeignKey("public_users.id", ondelete="SET NULL"),
                        nullable=True)

    def __repr__(self) -> str:
        return (f"<PartnerGrant cred={self.credential_id} {self.endpoint} "
                f"{'on' if self.enabled else 'off'}>")


class PartnerLimit(Base):
    """Throttles for one key. **NULL means unlimited**, never zero."""
    __tablename__ = "partner_limit"

    credential_id = Column(Integer,
                           ForeignKey("partner_credential.id",
                                      ondelete="CASCADE"),
                           primary_key=True)
    requests_per_minute = Column(Integer, nullable=True)
    rows_per_day = Column(BigInteger, nullable=True)
    objects_per_day = Column(Integer, nullable=True)
    bytes_per_day = Column(BigInteger, nullable=True)
    # The weekly refit rewrites daily objects at the SAME S3 key, so anything
    # newer than this is not final. 14 days puts every delivered object past
    # the D-9..D-3 window.
    raster_lag_days = Column(Integer, nullable=False, server_default="14")

    def __repr__(self) -> str:
        return f"<PartnerLimit cred={self.credential_id}>"


class PartnerRequestLog(Base):
    """What was asked for and how much came back. **No payloads.**"""
    __tablename__ = "partner_request_log"

    id = Column(BigInteger, primary_key=True)
    at = Column(DateTime(timezone=True), server_default=func.now(),
                nullable=False)
    client_id = Column(Integer,
                       ForeignKey("partner_client.id", ondelete="SET NULL"),
                       nullable=True)
    credential_id = Column(Integer,
                           ForeignKey("partner_credential.id",
                                      ondelete="SET NULL"),
                           nullable=True)
    method = Column(String(8), nullable=True)
    route = Column(Text, nullable=True)
    endpoint = Column(Text, nullable=True)
    status = Column(Integer, nullable=True)
    decision = Column(Text, nullable=True)
    row_count = Column(Integer, nullable=True)
    object_count = Column(Integer, nullable=True)
    bytes = Column(BigInteger, nullable=True)
    latency_ms = Column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<PartnerRequestLog {self.at} {self.route} {self.status}>"
