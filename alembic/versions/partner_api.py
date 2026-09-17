"""Partner Data API — clients, credentials, per-key grants, limits, request log.

Revision ID: partner_api
Revises: site_reference_station
Create Date: 2026-09-17

Five tables behind `/api/v1/partner/*`. Scope in
`docs/Integrape Project/partner_api_build_scope.md`; the reasoning that belongs
with the DDL is here.

## Two levels, deliberately: the client is the ceiling, the key is the dial

`partner_client` carries what was SOLD — history floor, site cap, raster tiers.
`partner_grant` is per CREDENTIAL and can only narrow it. That split is what
makes ending a contract ONE edit rather than an audit of every key ever issued,
and it is why a toggle can read "not sold" (greyed) as distinct from "off"
(unticked) — a difference that is the upsell conversation.

The check order every request runs is: key valid -> client active -> client
entitled -> key grant -> per-endpoint config -> limits. Each step has its own
error code so a partner can tell those five apart without emailing us.

## Why the secret is HMAC-SHA256 and NOT bcrypt or argon2

A slow KDF exists to make a LOW-ENTROPY secret expensive to guess. An API key
here is 32 bytes from `secrets.token_urlsafe` — 256 bits — and is not guessable
at any speed. What a slow KDF WOULD do is run on every single API request:
bcrypt at default cost is ~100 ms, which would make the partner API roughly a
hundred times slower than the queries it is serving, and would hand anyone
holding a valid key a trivial way to saturate the workers.

So: HMAC-SHA256 with a server-side pepper, verified in constant time. This is
what GitHub and Stripe do with their tokens and for the same reason. The pepper
is NOT in this table — a database dump must not be enough to verify a key
against.

`key_prefix` is indexed and unique because it is the LOOKUP. Verification is one
indexed read plus one HMAC, not a scan-and-compare over every live credential.

## Multiple live credentials per client is the point, not an oversight

Rotation has to OVERLAP. Issue the replacement, both work, the partner cuts over
on their own schedule, then the old row is revoked — `last_used_at` is what says
that is safe. A rotation that invalidates the old key the moment it is clicked
is a cutover, and it breaks a partner at whatever hour we happen to click it.

## `partner_request_log` stores no payloads

It stores what was asked for and how much came back. That is enough for support,
for abuse, and for the renewal conversation ("you pulled 40 M rows this year"),
and it keeps the table from becoming a second copy of the archive.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "partner_api"
down_revision = "site_reference_station"
branch_labels = None
depends_on = None


# The seven sellable endpoints, plus the three that are always on. Stored as a
# CHECK rather than a Postgres ENUM: adding an endpoint to an ENUM needs
# ALTER TYPE, which cannot run inside a transaction on older servers, and this
# list will grow. See `project_sqlalchemy_enum_vs_db` — `sa.Enum` is not a
# Postgres ENUM either, and conflating the two has bitten this repo before.
ENDPOINTS = (
    "site.create", "site.history", "site.season",
    "region.history", "region.summary",
    "raster.daily", "raster.monthly",
)


def upgrade():
    op.create_table(
        "partner_client",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False, unique=True),
        # active | suspended | ended. `ended` keeps the row and its history for
        # the renewal conversation; it does not delete a client.
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("environment", sa.Text(), nullable=False,
                  server_default="live"),
        sa.Column("contact_email", sa.Text(), nullable=True),
        sa.Column("contract_start", sa.Date(), nullable=True),
        sa.Column("contract_end", sa.Date(), nullable=True),

        # --- the contracted ceiling ------------------------------------------
        #
        # NULL means unlimited, which is a real contractual position and not the
        # same as 0. A flat-rate agreement with no site cap is exactly the
        # unbounded-cost case worth being able to represent and see.
        sa.Column("site_cap", sa.Integer(), nullable=True),
        # The earliest date any endpoint will serve this client. NULL = no floor.
        sa.Column("history_from", sa.Date(), nullable=True),
        # What was sold. A key grant outside this set is rejected at write time
        # AND at read time — the admin UI greys it, the API refuses it.
        sa.Column("entitled_endpoints", postgresql.ARRAY(sa.Text()),
                  nullable=False, server_default="{}"),

        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('active','suspended','ended')",
                           name="ck_partner_client_status"),
        sa.CheckConstraint("environment IN ('live','test')",
                           name="ck_partner_client_env"),
    )

    op.create_table(
        "partner_credential",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(),
                  sa.ForeignKey("partner_client.id", ondelete="CASCADE"),
                  nullable=False),
        # What a human calls this key: "ETL nightly", "raster puller". Two keys
        # differing only by a hash prefix is not an operable set.
        sa.Column("label", sa.Text(), nullable=False),

        # THE LOOKUP. `auxp_live_` + the first 8 characters of the secret.
        # Unique and indexed so verification is one read, not a scan.
        sa.Column("key_prefix", sa.Text(), nullable=False, unique=True),
        # For support: "the key ending 9c". Never enough to reconstruct one.
        sa.Column("key_last4", sa.String(4), nullable=False),
        # HMAC-SHA256 hex. See the module docstring for why this is not a KDF.
        sa.Column("key_hash", sa.Text(), nullable=False),

        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", sa.Integer(),
                  sa.ForeignKey("public_users.id", ondelete="SET NULL"),
                  nullable=True),
        # Written on use. It is what tells us a rotation is safe to complete,
        # so it is not decoration.
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.Integer(),
                  sa.ForeignKey("public_users.id", ondelete="SET NULL"),
                  nullable=True),
        # NULL = any address. Optional per client, off by default: some security
        # reviews require it and it costs one column.
        sa.Column("ip_allowlist", postgresql.ARRAY(sa.Text()), nullable=True),
    )
    op.create_index("ix_partner_credential_client", "partner_credential",
                    ["client_id"])

    op.create_table(
        "partner_grant",
        sa.Column("credential_id", sa.Integer(),
                  sa.ForeignKey("partner_credential.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("endpoint", sa.Text(), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False,
                  server_default="false"),
        # Per-endpoint qualifiers that are not worth a column each: a zone
        # allowlist, a granularity subset, a per-endpoint history floor.
        sa.Column("config", postgresql.JSONB(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_by", sa.Integer(),
                  sa.ForeignKey("public_users.id", ondelete="SET NULL"),
                  nullable=True),
        sa.CheckConstraint(
            "endpoint IN (%s)" % ",".join("'%s'" % e for e in ENDPOINTS),
            name="ck_partner_grant_endpoint"),
    )

    op.create_table(
        "partner_limit",
        sa.Column("credential_id", sa.Integer(),
                  sa.ForeignKey("partner_credential.id", ondelete="CASCADE"),
                  primary_key=True),
        # NULL means unlimited at every one of these. Deliberate: a sandbox key
        # and a raster-only key want genuinely different subsets of them set.
        sa.Column("requests_per_minute", sa.Integer(), nullable=True),
        sa.Column("rows_per_day", sa.BigInteger(), nullable=True),
        sa.Column("objects_per_day", sa.Integer(), nullable=True),
        sa.Column("bytes_per_day", sa.BigInteger(), nullable=True),
        # How far behind present a raster object may be requested. 14 by
        # default: the weekly D-9..D-3 refit REWRITES objects at the same key,
        # so anything newer than this is not yet final. Per credential, because
        # a sandbox key has no reason to wait.
        sa.Column("raster_lag_days", sa.Integer(), nullable=False,
                  server_default="14"),
    )

    op.create_table(
        "partner_request_log",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("client_id", sa.Integer(),
                  sa.ForeignKey("partner_client.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("credential_id", sa.Integer(),
                  sa.ForeignKey("partner_credential.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("method", sa.String(8), nullable=True),
        sa.Column("route", sa.Text(), nullable=True),
        sa.Column("endpoint", sa.Text(), nullable=True),
        sa.Column("status", sa.Integer(), nullable=True),
        # The error code when refused, so the log answers WHY without a join
        # against application logs that roll off.
        sa.Column("decision", sa.Text(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("object_count", sa.Integer(), nullable=True),
        sa.Column("bytes", sa.BigInteger(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
    )
    # The quota query is "this credential, since midnight" and runs on EVERY
    # metered request. Without this it is a sequential scan over a table that
    # only grows. See `project_next_session_2026-08-28` — an unindexed FK here
    # is the same trap as the block delete that scanned 22 GB.
    op.create_index("ix_partner_log_cred_at", "partner_request_log",
                    ["credential_id", "at"])
    op.create_index("ix_partner_log_client_at", "partner_request_log",
                    ["client_id", "at"])


def downgrade():
    op.drop_index("ix_partner_log_client_at", table_name="partner_request_log")
    op.drop_index("ix_partner_log_cred_at", table_name="partner_request_log")
    op.drop_table("partner_request_log")
    op.drop_table("partner_limit")
    op.drop_table("partner_grant")
    op.drop_index("ix_partner_credential_client",
                  table_name="partner_credential")
    op.drop_table("partner_credential")
    op.drop_table("partner_client")
