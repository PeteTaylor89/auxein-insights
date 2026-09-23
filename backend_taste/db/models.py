# backend_taste/db/models.py
# Typed tables, one per entity, all in schema `taste`. The PWA's Dexie is still the
# system of record at capture; the server mirrors each client row into real columns
# (scalars promoted to typed columns, nested/variable data kept as JSONB) so the DB
# is queryable. The sync wire protocol is unchanged — payload in, columns out.
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, Float, ForeignKey, Index,
    Integer, String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.inspection import inspect as sqla_inspect

from db.base import Base

SCHEMA = {"schema": "taste"}


def parse_dt(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class SyncMixin:
    """Common sync columns + generic payload<->columns mapping.

    Column names match the client row field names exactly, so applying a payload
    and serialising back is a straight per-column copy. created_at/updated_at are
    real timestamps (updated_at drives LWW); other date-like fields (tasted_at,
    event.date, photo.taken_at) stay strings to round-trip the client verbatim.
    """

    id = Column(String, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    deleted = Column(Boolean, nullable=False, default=False)

    # Columns the server owns — never taken from the client payload directly.
    # `share_slug` is in here deliberately (F2): a client that could choose its
    # own slug could choose someone else's, or guess at one. `visibility` is NOT
    # in here — the owner setting it is the entire point of the feature.
    _SERVER_COLS = {
        "id", "user_id", "updated_at", "version", "deleted", "share_slug", "wine_ref_id",
        # F4: a row that could unhide itself by sending a field is not hidden.
        "hidden_at", "hidden_reason",
    }
    _DT_COLS = {"created_at", "updated_at"}

    def apply(self, payload: Dict[str, Any], user_id: int, updated_at: datetime, version: int, deleted: bool) -> None:
        cols = {c.key for c in sqla_inspect(type(self)).columns}
        for key in cols - self._SERVER_COLS:
            if key in payload:
                val = payload[key]
                if key in self._DT_COLS:
                    val = parse_dt(val)
                setattr(self, key, val)
        self.user_id = user_id
        self.updated_at = updated_at
        self.version = version
        self.deleted = deleted

    def to_client(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for c in sqla_inspect(type(self)).columns:
            if c.key == "user_id":
                continue
            val = getattr(self, c.key)
            if isinstance(val, datetime):
                val = val.isoformat()
            out[c.key] = val
        return out


class VisibilityMixin:
    """F2 — who may see this row, beyond its owner.

    `visibility` is the row's own default reach; `taste.shares` grants named
    exceptions on top of it. Both are needed: a layer can be public AND have a
    named editor, and neither fact is derivable from the other.

    VARCHAR + CHECK, not a Postgres ENUM — adding a value to a native enum is a
    migration with a lock, and this list will grow (see the repo note on
    SQLAlchemy Enum vs the database's own type).
    """

    visibility = Column(
        String(10), nullable=False, default="private", server_default="private"
    )
    # Populated by the server only when visibility != 'private'; NULL otherwise.
    # Unguessable (secrets.token_urlsafe(16)) because for a `link` row the slug
    # IS the credential.
    #
    # No `unique=True` here on purpose. Uniqueness is a PARTIAL unique index
    # created in migration 0006 (`WHERE share_slug IS NOT NULL`), so the great
    # majority of rows — private ones, carrying NULL — cost nothing to index.
    # Declaring it here as well would add a second, full unique constraint on a
    # freshly-created database and quietly undo that.
    share_slug = Column(String(32), nullable=True)

    # F4 — set when a moderator hides this row. NOT a delete and not a
    # visibility value: the owner keeps seeing their own row (with the reason),
    # because content vanishing without explanation is how a person concludes
    # the product is broken. What it stops is everyone ELSE seeing it — shares,
    # links and public listings all resolve to nothing while it is set.
    hidden_at = Column(DateTime(timezone=True))
    hidden_reason = Column(Text)


class Template(SyncMixin, VisibilityMixin, Base):
    __tablename__ = "templates"
    __table_args__ = SCHEMA
    # NULL user_id = a global builtin template, visible to everyone (the CMS grid).
    # A real user_id = a template that user created/duplicated.
    user_id = Column(Integer, nullable=True, index=True)
    name = Column(String)
    kind = Column(String)
    is_builtin = Column(Boolean, default=False)
    sections = Column(JSONB)


class Event(SyncMixin, VisibilityMixin, Base):
    __tablename__ = "events"
    __table_args__ = SCHEMA
    name = Column(String)
    date = Column(String)
    location_text = Column(String)
    host = Column(String)
    attendees = Column(JSONB)
    theme = Column(String)
    general_notes = Column(String)
    default_blind = Column(Boolean, default=False)
    default_template_id = Column(String)


class Wine(SyncMixin, VisibilityMixin, Base):
    __tablename__ = "wines"
    __table_args__ = SCHEMA
    producer = Column(String)
    label = Column(String)
    vintage = Column(Integer)
    variety = Column(JSONB)
    geo_country = Column(String)
    geo_region = Column(String)
    geo_subregion_appellation = Column(String)
    geo_vineyard = Column(String)
    geo_ref_id = Column(String)
    price = Column(Float)
    source = Column(String)
    abv = Column(Float)
    # F3 — the canonical wine this personal row refers to, if one exists yet.
    # NULL is an ordinary state, not an error: the row is complete and usable
    # without it, and stays that way while a proposal is pending. Server-owned
    # (see SyncMixin._SERVER_COLS) because a client choosing its own canonical
    # id would be choosing someone else's wine.
    wine_ref_id = Column(String, index=True)


class Note(SyncMixin, VisibilityMixin, Base):
    __tablename__ = "notes"
    __table_args__ = SCHEMA
    wine_id = Column(String, index=True)
    event_id = Column(String, index=True)
    template_id = Column(String)
    template_version = Column(Integer)
    template_snapshot = Column(JSONB)
    values = Column(JSONB)
    general_notes = Column(String)
    tasted_at = Column(String)
    blind = Column(Boolean, default=False)
    revealed = Column(Boolean, default=False)
    blind_conclusions = Column(JSONB)
    score = Column(Float)
    flight_id = Column(String, index=True)
    flight_position = Column(Integer)
    glass_color = Column(String)
    photos = Column(JSONB)


class Flight(SyncMixin, VisibilityMixin, Base):
    __tablename__ = "flights"
    __table_args__ = SCHEMA
    event_id = Column(String, index=True)
    name = Column(String)
    blind = Column(Boolean, default=False)
    general_notes = Column(String)
    note_ids = Column(JSONB)


class Photo(SyncMixin, Base):
    __tablename__ = "photos"
    __table_args__ = SCHEMA
    note_id = Column(String, index=True)
    s3_key = Column(String)
    status = Column(String)
    width = Column(Integer)
    height = Column(Integer)
    taken_at = Column(String)


class Vocab(SyncMixin, Base):
    """Per-user tasting vocabulary — terms the user has added while tasting so their
    pickers grow with use and sync across devices. `dimension` buckets the term:
    'variety', 'region', or a template field key (aroma/taste descriptors);
    `group_label` scopes descriptor terms to their aroma group (NULL otherwise).
    """

    __tablename__ = "vocab"
    __table_args__ = SCHEMA
    dimension = Column(String, nullable=False, index=True)
    group_label = Column(String)
    term = Column(String, nullable=False)


class Region(Base):
    """Global wine-geography reference data (countries → regions → subregions →
    vineyards). Server-owned, seeded from seed_data; NOT user-scoped and never
    soft-deleted. `id` is a deterministic slug; wines reference it via geo_ref_id.
    """

    __tablename__ = "regions"
    __table_args__ = SCHEMA
    id = Column(String, primary_key=True)
    parent_id = Column(String, index=True)
    level = Column(Integer, nullable=False, default=0)  # 0=country .. 3=vineyard
    kind = Column(String)  # country | region | subregion | vineyard
    name = Column(String, nullable=False, index=True)
    country_code = Column(String, index=True)
    path = Column(String)  # "New Zealand > Marlborough > Wairau Valley"
    aliases = Column(JSONB)
    gi_id = Column(String)  # optional link to Insights GI


class User(Base):
    """F1 — Taste's own user. Not a mirror of, and not dependent on, public_users.

    Taste owns its identity outright: its own table, its own id space, its own
    signing key, its own token type. Insights is reached later through an
    external bridge API, and `external_auth_id` is the only join key that
    crossing ever needs.

    `id` is a plain serial int rather than a client UUID, unlike every other
    table here. Two reasons: every existing `user_id` column in this schema is
    already `Integer`, so keeping it an int makes the cutover a value re-key
    instead of a type change across seven tables; and a user is never created
    offline, so the client-UUID rule that the tasting entities live by does not
    apply.
    """

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="ck_users_email_lower"),
        CheckConstraint("handle IS NULL OR handle = lower(handle)", name="ck_users_handle_lower"),
        CheckConstraint("role IN ('user','moderator','admin')", name="ck_users_role"),
        CheckConstraint("status IN ('active','suspended','deleted')", name="ck_users_status"),
        UniqueConstraint("external_auth_source", "external_auth_id", name="uq_users_external_auth"),
        {"schema": "taste"},
    )

    id = Column(Integer, primary_key=True)

    # Stored lower-cased and enforced by CHECK, because a case-insensitive
    # unique index is the difference between one account and two for the same
    # person. citext would also do it but costs an extension on a shared RDS.
    email = Column(String(255), nullable=False, unique=True, index=True)
    # NULL is legal and meaningful: an account bridged in from Insights that has
    # not yet set a Taste password. The login route must reject NULL explicitly
    # rather than letting a hash comparison decide.
    hashed_password = Column(String, nullable=True)

    # Public identity. `handle` is nullable on purpose — the backfill will not
    # invent one, because a handle is public, near-permanent and the user's to
    # choose. The app prompts for it at first sign-in.
    handle = Column(String(30), nullable=True, unique=True, index=True)
    display_name = Column(String(80))
    bio = Column(Text)
    avatar_s3_key = Column(String)

    # F4/F5 need these on day one: a moderation queue with no role column is an
    # admin panel anyone can reach, and a suspension with nowhere to record it
    # is a suspension that does not happen.
    role = Column(String(20), nullable=False, default="user", server_default="user")
    status = Column(String(20), nullable=False, default="active", server_default="active")

    # Bumped on password change, sign-out-everywhere and suspension. It is
    # carried in the access token and compared on every request, so a ban takes
    # effect within one access-token lifetime instead of within seven days.
    token_version = Column(Integer, nullable=False, default=1, server_default="1")

    is_verified = Column(Boolean, nullable=False, default=False, server_default="false")
    verification_token = Column(String(255))
    verification_sent_at = Column(DateTime(timezone=True))
    verified_at = Column(DateTime(timezone=True))
    reset_token = Column(String(255))
    reset_token_expires = Column(DateTime(timezone=True))

    last_login = Column(DateTime(timezone=True))
    login_count = Column(Integer, nullable=False, default=0, server_default="0")

    prefs = Column(JSONB)

    # The documented seam from BUILD_SPEC story 7.1. A loose int and a source
    # label, never an FK: `public_users` belongs to another service, and the
    # whole point of this phase is that Taste survives without it.
    external_auth_id = Column(Integer, index=True)
    external_auth_source = Column(String(20))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class RefreshToken(Base):
    """F1 — a revocable session.

    Insights issues a single self-contained 7-day access token and has no way to
    take it back. That is survivable for a read-mostly climate site and is not
    survivable for a social product: F4 has to be able to suspend an account and
    have it mean something before next week.

    So the pair is a short access token plus a long refresh row that lives in
    this table and can be deleted. Only the SHA-256 of the token is stored — a
    leaked database should not hand over live sessions.
    """

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_user_active", "user_id", "revoked_at"),
        {"schema": "taste"},
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("taste.users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    # Set when this token is rotated, so a replayed old token is detectable as
    # theft rather than merely expired.
    replaced_by_id = Column(Integer)
    user_agent = Column(String(255))
    ip = Column(String(45))


class Share(Base):
    """F2 — a named grant on one row, to one user or group.

    Polymorphic on purpose. The alternative is a grant table per entity, and
    there will be at least eight entities by the end of the platform plan
    (notes, flights, events, wines, templates, map layers, knowledge entries,
    groups' own content) — eight tables that must not drift apart.

    `subject_id` is String because every tasting entity's primary key is a
    client-generated UUID string. `grantee_id` is Integer because users and
    groups are both server-issued serials.
    """

    __tablename__ = "shares"
    __table_args__ = (
        CheckConstraint(
            "subject_type IN ('note','flight','event','wine','template','map_layer','knowledge_entry')",
            name="ck_shares_subject_type",
        ),
        CheckConstraint("grantee_type IN ('user','group')", name="ck_shares_grantee_type"),
        CheckConstraint("role IN ('view','comment','edit')", name="ck_shares_role"),
        # One live grant per (row, grantee). Re-sharing updates the role rather
        # than stacking a second row, so revoking cannot leave a shadow grant
        # behind that still lets someone in.
        UniqueConstraint("subject_type", "subject_id", "grantee_type", "grantee_id",
                         name="uq_shares_subject_grantee"),
        # The read path: "everything shared with me" and "who can see this row".
        Index("ix_shares_subject", "subject_type", "subject_id"),
        Index("ix_shares_grantee", "grantee_type", "grantee_id"),
        {"schema": "taste"},
    )

    id = Column(Integer, primary_key=True)
    subject_type = Column(String(20), nullable=False)
    subject_id = Column(String, nullable=False)
    grantee_type = Column(String(10), nullable=False)
    grantee_id = Column(Integer, nullable=False)
    role = Column(String(10), nullable=False, default="view", server_default="view")
    granted_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Both nullable: a grant with no expiry is the common case, and revoking is
    # a soft act so that an audit can still answer "who had access in March".
    expires_at = Column(DateTime(timezone=True))
    revoked_at = Column(DateTime(timezone=True))



class WineRef(Base):
    """F3 — the canonical wine. Server-owned; users never write this table directly.

    `taste.wines` stays exactly as it is: a PERSONAL row, carrying whatever the
    taster typed. This is the shared identity it points at, and the two coexist
    on purpose.

    That is not a new idea here — it is decision D1 ("store raw and canonical,
    never lose either") applied to wine identity instead of to a tasting scale,
    and it is already how geography works in this schema: `wines` keeps the
    discrete `geo_*` text the user entered AND a loose `geo_ref_id` into the
    server-owned `regions` tree. A personal row that disagrees with the canonical
    one is therefore not a conflict to resolve; it is the taster's own note about
    what was on the label.

    `regions` is the model for ownership too: seeded, never user-written, never
    soft-deleted.
    """

    __tablename__ = "wine_ref"
    __table_args__ = (
        # The dedupe key, unique. Two canonical rows that normalise the same way
        # ARE the same wine, and the database should be the thing that says so
        # rather than a service that can be bypassed.
        UniqueConstraint("dedupe_key", name="uq_wine_ref_dedupe_key"),
        Index("ix_wine_ref_producer", "producer_norm"),
        CheckConstraint("status IN ('active','merged')", name="ck_wine_ref_status"),
        {"schema": "taste"},
    )

    id = Column(String, primary_key=True)

    # Display form: what a human should see. Preserved as the proposer typed it,
    # minus surrounding whitespace.
    producer = Column(String, nullable=False)
    label = Column(String)
    vintage = Column(Integer)
    variety = Column(JSONB)

    # Normalised forms, used for matching and never shown.
    producer_norm = Column(String, nullable=False, index=True)
    label_norm = Column(String)
    dedupe_key = Column(String, nullable=False)

    # Geography by reference, never by string: the loose id into taste.regions
    # that the rest of this schema already uses.
    region_id = Column(String, index=True)

    # 'merged' rows are kept, not deleted, so that a personal wine pointing at a
    # superseded canonical still resolves — through merged_into_id — instead of
    # dangling. A hard delete here would orphan other people's data.
    status = Column(String(10), nullable=False, default="active", server_default="active")
    merged_into_id = Column(String, index=True)

    # Set when a moderator has actually looked at it, as opposed to it having
    # been promoted automatically. Display can treat the two differently; the
    # matching logic does not.
    verified = Column(Boolean, nullable=False, default=False, server_default="false")

    created_by = Column(Integer)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class WineProposal(Base):
    """F3 — a user's suggestion that a canonical wine should exist.

    This is the safeguard Pete asked for, expressed as a queue rather than a
    cleanup: users never write `wine_ref`, they propose into it, and promotion is
    a reviewed step that leaves a record. Nothing a user does can dirty the
    shared table, and nothing they do is blocked by the queue either — their own
    `taste.wines` row saves and works whatever the proposal's state.
    """

    __tablename__ = "wine_proposal"
    __table_args__ = (
        CheckConstraint(
            "state IN ('pending','accepted','rejected','duplicate')", name="ck_wine_proposal_state"
        ),
        Index("ix_wine_proposal_state", "state"),
        {"schema": "taste"},
    )

    id = Column(Integer, primary_key=True)
    # The personal wine that prompted this, so an accepted proposal can link the
    # row that asked for it. Loose, like every id reference in this schema.
    wine_id = Column(String, index=True)
    proposed_by = Column(Integer, nullable=False, index=True)

    producer = Column(String, nullable=False)
    label = Column(String)
    vintage = Column(Integer)
    variety = Column(JSONB)
    region_id = Column(String)
    dedupe_key = Column(String, nullable=False, index=True)

    state = Column(String(12), nullable=False, default="pending", server_default="pending")
    # Set on accept (the row created or matched) or on duplicate (the row it
    # duplicates). Either way it answers "where did this end up?".
    resolved_ref_id = Column(String, index=True)
    reviewed_by = Column(Integer)
    reviewed_at = Column(DateTime(timezone=True))
    review_note = Column(Text)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WineMergeLog(Base):
    """F3 — an append-only record of every change to the canonical table.

    Separate from the proposal because merges are not proposals: a moderator
    deciding that two existing canonical rows are one wine has no proposal
    behind it, and that is exactly the kind of edit that needs to be traceable
    afterwards. Never updated, never deleted.
    """

    __tablename__ = "wine_merge_log"
    __table_args__ = (
        CheckConstraint(
            "action IN ('created','merged','edited','unmerged')", name="ck_wine_merge_log_action"
        ),
        Index("ix_wine_merge_log_ref", "ref_id"),
        {"schema": "taste"},
    )

    id = Column(Integer, primary_key=True)
    action = Column(String(10), nullable=False)
    ref_id = Column(String, nullable=False)
    # For a merge: the row that was absorbed.
    source_ref_id = Column(String)
    proposal_id = Column(Integer)
    actor_id = Column(Integer)
    # How many personal wines were repointed, so a mistaken merge can be judged
    # by its blast radius before anyone tries to undo it.
    affected_wines = Column(Integer, nullable=False, default=0, server_default="0")
    detail = Column(JSONB)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())



class Report(Base):
    """F4 — someone flagging a row, or a person, for a moderator to look at.

    Polymorphic on the same `subject_type` vocabulary as `taste.shares`, plus
    'user', because the thing being reported is as often an account as a note.

    Reports are never deleted. A dismissed report is evidence too: a pattern of
    one account reporting another is itself the thing a moderator needs to see,
    and it is invisible if dismissals disappear.
    """

    __tablename__ = "report"
    __table_args__ = (
        CheckConstraint(
            "subject_type IN ('note','flight','event','wine','template','map_layer',"
            "'knowledge_entry','user')",
            name="ck_report_subject_type",
        ),
        CheckConstraint(
            "state IN ('open','actioned','dismissed')", name="ck_report_state"
        ),
        CheckConstraint(
            "reason IN ('spam','abuse','wrong_data','copyright','other')", name="ck_report_reason"
        ),
        # One OPEN report per reporter per subject. Partial, so the same person
        # may report the same row again after an earlier one was resolved —
        # a repeat offence is a new report, not a duplicate.
        Index(
            "uq_report_open_per_reporter",
            "subject_type", "subject_id", "reported_by",
            unique=True,
            postgresql_where=text("state = 'open'"),
        ),
        Index("ix_report_state", "state"),
        {"schema": "taste"},
    )

    id = Column(Integer, primary_key=True)
    subject_type = Column(String(20), nullable=False)
    # String, because every tasting entity's PK is a client UUID. A reported
    # USER is stored here as the decimal id in string form, so one column covers
    # both without a second nullable id.
    subject_id = Column(String, nullable=False)
    reported_by = Column(Integer, nullable=False, index=True)
    reason = Column(String(20), nullable=False)
    detail = Column(Text)

    state = Column(String(10), nullable=False, default="open", server_default="open")
    reviewed_by = Column(Integer)
    reviewed_at = Column(DateTime(timezone=True))
    review_note = Column(Text)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ModerationLog(Base):
    """F4 — append-only record of every moderator action. Never updated or deleted.

    Separate from `wine_merge_log`, which records changes to the wine catalogue.
    The two could have been one table, but a catalogue merge and a user
    suspension are read by different people answering different questions, and
    merging them would mean every moderation review scrolls through months of
    wine admin.
    """

    __tablename__ = "moderation_log"
    __table_args__ = (
        CheckConstraint(
            "action IN ('hide','unhide','suspend','unsuspend','dismiss','role_change')",
            name="ck_moderation_log_action",
        ),
        Index("ix_moderation_log_subject", "subject_type", "subject_id"),
        {"schema": "taste"},
    )

    id = Column(Integer, primary_key=True)
    action = Column(String(20), nullable=False)
    subject_type = Column(String(20), nullable=False)
    subject_id = Column(String, nullable=False)
    actor_id = Column(Integer, nullable=False)
    report_id = Column(Integer)
    # The reason is required by the service, not by the column: an unexplained
    # moderation action is useless to whoever reviews it later, including the
    # person who took it.
    reason = Column(Text)
    detail = Column(JSONB)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RateLimit(Base):
    """F4 — a durable fixed-window counter, shared across instances.

    Replaces the in-process dicts in api/auth.py, which reset on deploy and gave
    an attacker one budget PER EB INSTANCE. A counter that lives in the database
    the instances already share is the smallest thing that is actually a limit.

    Fixed window rather than sliding: a sliding window needs a row per event,
    and the point of this table is to be cheap enough to write on every login
    attempt. The cost is that a caller can spend two windows' budget across a
    boundary, which is acceptable for the things being limited here.
    """

    __tablename__ = "rate_limit"
    __table_args__ = {"schema": "taste"}

    # "login:someone@example.com", "report:14". Opaque to this table.
    bucket = Column(String(200), primary_key=True)
    window_start = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    count = Column(Integer, nullable=False, default=0, server_default="0")


# Entities that carry `visibility` + `share_slug`. Photos are deliberately
# absent: a photo's reach is its note's reach, and a second source of truth for
# that is a leak waiting for the two to disagree.
SHAREABLE_MODELS = {
    "template": Template,
    "event": Event,
    "wine": Wine,
    "note": Note,
    "flight": Flight,
}


# Wire entity name -> model. Order matters for bootstrap/pull (templates/wines
# before the notes that reference them).
ENTITY_MODELS = {
    "template": Template,
    "event": Event,
    "wine": Wine,
    "flight": Flight,
    "note": Note,
    "photo": Photo,
}

ENTITIES = set(ENTITY_MODELS)
