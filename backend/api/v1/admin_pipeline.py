# api/v1/admin_pipeline.py — the sales pipeline.
#
# Leads from first contact to a sale (won) or not (lost), for three kinds of
# deal told apart by `deal_type`: a Grow sign-up, an Insights Pro upgrade, or an
# enterprise contract. Shared across admins: a lead is the business's, not the
# typist's.
#
# Two things arrive by themselves, every time the list is read:
#   - Insights subscribers who opted in to marketing become grow leads
#     (`_sync_insights`).
#   - Insights Pro enquiries become insights_pro leads (`_sync_pro_enquiries`).
# Both syncs only ever add — they never overwrite what an admin has written on a
# lead — except that a new enquiry reopens a closed Pro lead for the same email,
# because that person is asking again. Enterprise leads are always manual.
from datetime import date, datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.grow_pipeline import (
    GrowLead, GrowLeadActivity,
    DEAL_TYPES, LEAD_STAGES, CLOSED_STAGES, LEAD_SOURCES, LOST_REASONS, ACTIVITY_KINDS,
)
from db.models.public_user import PublicUser
from core.admin_security import require_admin

router = APIRouter(prefix="/pipeline")

NZ = ZoneInfo("Pacific/Auckland")

# Kinds a person can log by hand. 'stage' and 'enquiry' rows are written only by
# the API, so a hand-typed one can never contradict the lead's history.
MANUAL_KINDS = tuple(k for k in ACTIVITY_KINDS if k not in ("stage", "enquiry"))

# Sources only the syncs can set. 'enquiry' is NOT here: a Pro enquiry that
# came by phone is added by hand and is still an enquiry.
SYNC_ONLY_SOURCES = ("insights",)


def _nz_today() -> date:
    # NOT date.today(): on the prod box that is UTC, which is yesterday for the
    # whole NZ morning — every follow-up due today would read as not yet due.
    return datetime.now(NZ).date()


# ------------------------------------------------------------------------ sync

# GROW. Insert every verified, active, marketing-opted-in subscriber who is not
# already a grow lead, is not an admin, and does not already have a Grow login —
# either linked (grow_user_id) or simply the same email in `users`. Those people
# are already on Grow; there is nothing to convert.
#
# If a hand-added grow lead already carries the subscriber's email, the first
# statement ADOPTS it (links public_user_id) instead of creating a duplicate.
# Pro and enterprise leads are never adopted: they are different deals.
_ADOPT_SQL = text("""
    UPDATE grow_leads gl
       SET public_user_id = pu.id, updated_at = now()
      FROM public_users pu
     WHERE gl.deal_type = 'grow'
       AND gl.public_user_id IS NULL
       AND gl.email IS NOT NULL
       AND lower(gl.email) = lower(pu.email)
       AND pu.marketing_opt_in AND pu.is_verified AND pu.is_active
       AND NOT EXISTS (SELECT 1 FROM grow_leads x
                        WHERE x.deal_type = 'grow' AND x.public_user_id = pu.id)
""")

_SYNC_SQL = text("""
    INSERT INTO grow_leads
        (deal_type, public_user_id, source, contact_name, email, company_name, region, stage)
    SELECT 'grow', pu.id, 'insights',
           NULLIF(trim(concat_ws(' ', pu.first_name, pu.last_name)), ''),
           pu.email, NULLIF(trim(pu.company_name), ''),
           NULLIF(trim(pu.region_of_interest), ''), 'new'
      FROM public_users pu
     WHERE pu.marketing_opt_in
       AND pu.is_verified
       AND pu.is_active
       AND NOT pu.is_admin
       AND pu.grow_user_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(pu.email))
       AND NOT EXISTS (
             SELECT 1 FROM grow_leads gl
              WHERE gl.deal_type = 'grow'
                AND gl.email IS NOT NULL AND lower(gl.email) = lower(pu.email))
    ON CONFLICT (public_user_id) WHERE deal_type = 'grow' DO NOTHING
""")


def _sync_insights(db: Session) -> int:
    db.execute(_ADOPT_SQL)
    added = db.execute(_SYNC_SQL).rowcount or 0
    db.commit()
    return added


# PRO. Every enquiry not yet filed under a lead. SKIP LOCKED so two admins
# loading the page at once cannot both file the same enquiry.
_PENDING_ENQUIRIES_SQL = text("""
    SELECT id, public_user_id, name, email, phone, business, region, hectares,
           sites, message, created_at
      FROM insights_pro_enquiry
     WHERE pipeline_lead_id IS NULL
     ORDER BY created_at, id
       FOR UPDATE SKIP LOCKED
""")


def _enquiry_body(e) -> Optional[str]:
    parts = []
    if e.sites:
        parts.append(f"Sites: {e.sites}")
    if e.message and e.message.strip():
        parts.append(e.message.strip())
    return "\n".join(parts) or None


def _sync_pro_enquiries(db: Session) -> int:
    """File each new Pro enquiry under a lead. Returns how many NEW leads."""
    added = 0
    for e in db.execute(_PENDING_ENQUIRIES_SQL).all():
        on = e.created_at.astimezone(NZ).date()
        # Someone asking again goes on the lead they already have, newest
        # first — the history belongs in one place, not split over two cards.
        lead = (
            db.query(GrowLead)
            .filter(GrowLead.deal_type == "insights_pro")
            .filter(text("lower(grow_leads.email) = lower(:e)")).params(e=e.email)
            .order_by(GrowLead.created_at.desc())
            .first()
        )
        if lead is not None:
            if lead.stage in CLOSED_STAGES:
                old = lead.stage
                _apply_stage(lead, "new")
                db.add(GrowLeadActivity(
                    lead_id=lead.id, kind="stage", from_stage=old, to_stage="new",
                    body="Reopened by a new Pro enquiry", occurred_on=on,
                ))
            if lead.public_user_id is None and e.public_user_id is not None:
                lead.public_user_id = e.public_user_id
            db.add(GrowLeadActivity(
                lead_id=lead.id, kind="enquiry", body=_enquiry_body(e), occurred_on=on,
            ))
            lead.updated_at = datetime.now(timezone.utc)
        else:
            lead = GrowLead(
                deal_type="insights_pro", source="enquiry", stage="new",
                public_user_id=e.public_user_id,
                contact_name=e.name, email=e.email, phone=e.phone,
                company_name=e.business, region=e.region, hectares=e.hectares,
                # The enquiry's own time, so "added" on the card is when they
                # asked, not when an admin next opened the page.
                created_at=e.created_at, stage_changed_at=e.created_at,
            )
            db.add(lead)
            db.flush()
            db.add(GrowLeadActivity(
                lead_id=lead.id, kind="stage", from_stage=None, to_stage="new",
                body="Pro enquiry", occurred_on=on,
            ))
            db.add(GrowLeadActivity(
                lead_id=lead.id, kind="enquiry", body=_enquiry_body(e), occurred_on=on,
            ))
            added += 1
        db.execute(
            text("UPDATE insights_pro_enquiry SET pipeline_lead_id = :l WHERE id = :id"),
            {"l": lead.id, "id": e.id},
        )
    db.commit()
    return added


# -------------------------------------------------------------------- reading

# One query for the whole board. The joins carry the context a lead card needs
# that the lead row itself does not own:
#   - the Insights subscriber, live: opted out since? last seen? Pro?
#   - for a grow lead, a Grow account with the same email — the signal that
#     they have signed up on their own and the lead should be marked won.
#   - for a Pro lead, the same signal: their subscriber is now on Pro.
_LIST_SQL = """
    SELECT gl.*,
           pu.marketing_opt_in       AS pu_marketing_opt_in,
           pu.last_login             AS pu_last_login,
           pu.user_type              AS pu_user_type,
           pu.subscription_tier      AS pu_subscription_tier,
           pu.created_at             AS pu_created_at,
           c.name                    AS grow_company_name,
           ia.name                   AS insights_account_name,
           gu.id                     AS grow_user_match_id,
           gu.company_id             AS grow_user_match_company_id,
           gc.name                   AS grow_user_match_company_name,
           pm.id                     AS pro_match_id,
           pm.email                  AS pro_match_email,
           owner.email               AS owner_email,
           (SELECT count(*) FROM grow_lead_activities a
             WHERE a.lead_id = gl.id AND a.kind <> 'stage') AS touch_count,
           (SELECT max(a.occurred_on) FROM grow_lead_activities a
             WHERE a.lead_id = gl.id AND a.kind <> 'stage') AS last_touch_on
      FROM grow_leads gl
      LEFT JOIN public_users pu     ON pu.id = gl.public_user_id
      LEFT JOIN companies c         ON c.id = gl.grow_company_id
      LEFT JOIN insights_account ia ON ia.id = gl.insights_account_id
      LEFT JOIN public_users owner  ON owner.id = gl.owner_user_id
      LEFT JOIN LATERAL (
            SELECT u.id, u.company_id FROM users u
             WHERE gl.deal_type = 'grow'
               AND gl.email IS NOT NULL AND lower(u.email) = lower(gl.email)
             LIMIT 1) gu ON TRUE
      LEFT JOIN companies gc ON gc.id = gu.company_id
      LEFT JOIN LATERAL (
            SELECT p.id, p.email FROM public_users p
             WHERE gl.deal_type = 'insights_pro'
               AND p.subscription_tier = 'pro'
               AND (p.id = gl.public_user_id
                    OR (gl.email IS NOT NULL AND lower(p.email) = lower(gl.email)))
             LIMIT 1) pm ON TRUE
      {where}
     ORDER BY gl.next_action_on NULLS LAST, gl.updated_at DESC
"""


def _iso(v):
    return v.isoformat() if v is not None else None


def _num(v):
    return float(v) if v is not None else None


def _row_out(r, today: date) -> dict:
    m = r._mapping
    still_open = m["stage"] not in CLOSED_STAGES
    return {
        "id": m["id"],
        "deal_type": m["deal_type"],
        "source": m["source"],
        "public_user_id": m["public_user_id"],
        "contact_name": m["contact_name"],
        "email": m["email"],
        "phone": m["phone"],
        "company_name": m["company_name"],
        "region": m["region"],
        "hectares": _num(m["hectares"]),
        "value_nzd": _num(m["value_nzd"]),
        "stage": m["stage"],
        "stage_changed_at": _iso(m["stage_changed_at"]),
        "closed_at": _iso(m["closed_at"]),
        "lost_reason": m["lost_reason"],
        "next_action": m["next_action"],
        "next_action_on": _iso(m["next_action_on"]),
        # Computed against the NZ calendar here, once, so the board and the
        # table cannot disagree about what is late.
        "overdue": bool(
            m["next_action_on"] is not None
            and m["next_action_on"] < today
            and still_open
        ),
        "grow_company_id": m["grow_company_id"],
        "grow_company_name": m["grow_company_name"],
        "insights_account_id": m["insights_account_id"],
        "insights_account_name": m["insights_account_name"],
        "owner_user_id": m["owner_user_id"],
        "owner_email": m["owner_email"],
        "notes": m["notes"],
        "touch_count": m["touch_count"] or 0,
        "last_touch_on": _iso(m["last_touch_on"]),
        "created_at": _iso(m["created_at"]),
        "updated_at": _iso(m["updated_at"]),
        "insights": None if m["public_user_id"] is None else {
            "marketing_opt_in": m["pu_marketing_opt_in"],
            "last_login": _iso(m["pu_last_login"]),
            "user_type": m["pu_user_type"],
            "subscription_tier": m["pu_subscription_tier"],
            "signed_up_at": _iso(m["pu_created_at"]),
        },
        # Only worth surfacing while the lead is still open and not yet linked.
        "grow_match": None if (
            m["grow_user_match_id"] is None
            or not still_open
            or m["grow_company_id"] is not None
        ) else {
            "company_id": m["grow_user_match_company_id"],
            "company_name": m["grow_user_match_company_name"],
        },
        "pro_match": None if (m["pro_match_id"] is None or not still_open) else {
            "public_user_id": m["pro_match_id"],
            "email": m["pro_match_email"],
        },
    }


def _load_one(db: Session, lead_id: int) -> dict:
    row = db.execute(
        text(_LIST_SQL.format(where="WHERE gl.id = :id")), {"id": lead_id}
    ).first()
    if row is None:
        raise HTTPException(404, "Lead not found")
    return _row_out(row, _nz_today())


def _activity_out(a: GrowLeadActivity, authors: dict) -> dict:
    return {
        "id": a.id,
        "kind": a.kind,
        "body": a.body,
        "occurred_on": _iso(a.occurred_on),
        "from_stage": a.from_stage,
        "to_stage": a.to_stage,
        "author_email": authors.get(a.author_user_id),
        "created_at": _iso(a.created_at),
    }


def _detail(db: Session, lead_id: int) -> dict:
    out = _load_one(db, lead_id)
    acts = (
        db.query(GrowLeadActivity)
        .filter(GrowLeadActivity.lead_id == lead_id)
        .order_by(GrowLeadActivity.occurred_on.desc(), GrowLeadActivity.created_at.desc())
        .all()
    )
    author_ids = {a.author_user_id for a in acts if a.author_user_id}
    authors = {}
    if author_ids:
        authors = dict(
            db.query(PublicUser.id, PublicUser.email)
            .filter(PublicUser.id.in_(author_ids)).all()
        )
    out["activities"] = [_activity_out(a, authors) for a in acts]
    return out


# -------------------------------------------------------------------- payloads

def _clean(v):
    if v is None:
        return None
    v = v.strip()
    return v or None


class LeadCreate(BaseModel):
    deal_type: str = "grow"
    contact_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    company_name: Optional[str] = Field(None, max_length=200)
    region: Optional[str] = Field(None, max_length=100)
    hectares: Optional[float] = Field(None, ge=0)
    value_nzd: Optional[float] = Field(None, ge=0)
    source: str = "other"
    stage: str = "new"
    next_action: Optional[str] = Field(None, max_length=300)
    next_action_on: Optional[date] = None
    notes: Optional[str] = None

    @field_validator(
        "contact_name", "email", "phone", "company_name", "region", "next_action",
    )
    @classmethod
    def _trim(cls, v):
        # Trimmed, and empty becomes NULL, so '' and 'Acme ' are not values.
        return _clean(v)

    @field_validator("deal_type")
    @classmethod
    def _deal_type(cls, v):
        if v not in DEAL_TYPES:
            raise ValueError(f"deal_type must be one of {', '.join(DEAL_TYPES)}")
        return v

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        # 'insights' is reserved for the sync, which is the only thing that can
        # attach a subscriber. A hand-made 'insights' lead would have no
        # subscriber behind it and nothing to show in the Insights panel.
        if v not in LEAD_SOURCES or v in SYNC_ONLY_SOURCES:
            allowed = [s for s in LEAD_SOURCES if s not in SYNC_ONLY_SOURCES]
            raise ValueError(f"source must be one of {', '.join(allowed)}")
        return v

    @field_validator("stage")
    @classmethod
    def _stage(cls, v):
        if v not in LEAD_STAGES:
            raise ValueError(f"stage must be one of {', '.join(LEAD_STAGES)}")
        return v


class LeadUpdate(BaseModel):
    """A PATCH. Nullable fields use `model_fields_set` to tell 'clear' from 'leave'."""
    deal_type: Optional[str] = None
    contact_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    company_name: Optional[str] = Field(None, max_length=200)
    region: Optional[str] = Field(None, max_length=100)
    hectares: Optional[float] = Field(None, ge=0)
    value_nzd: Optional[float] = Field(None, ge=0)
    source: Optional[str] = None
    stage: Optional[str] = None
    lost_reason: Optional[str] = None
    next_action: Optional[str] = Field(None, max_length=300)
    next_action_on: Optional[date] = None
    grow_company_id: Optional[int] = None
    insights_account_id: Optional[int] = None
    owner_user_id: Optional[int] = None
    notes: Optional[str] = None
    # Optional context for a stage change, written into the timeline row.
    stage_note: Optional[str] = None

    @field_validator(
        "contact_name", "email", "phone", "company_name", "region", "next_action",
    )
    @classmethod
    def _trim(cls, v):
        # Trimmed, and empty becomes NULL, so '' and 'Acme ' are not values.
        return _clean(v)

    @field_validator("deal_type")
    @classmethod
    def _deal_type(cls, v):
        if v is not None and v not in DEAL_TYPES:
            raise ValueError(f"deal_type must be one of {', '.join(DEAL_TYPES)}")
        return v

    @field_validator("stage")
    @classmethod
    def _stage(cls, v):
        if v is not None and v not in LEAD_STAGES:
            raise ValueError(f"stage must be one of {', '.join(LEAD_STAGES)}")
        return v

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        if v is not None and v not in LEAD_SOURCES:
            raise ValueError(f"source must be one of {', '.join(LEAD_SOURCES)}")
        return v

    @field_validator("lost_reason")
    @classmethod
    def _lost(cls, v):
        if v is not None and v not in LOST_REASONS:
            raise ValueError(f"lost_reason must be one of {', '.join(LOST_REASONS)}")
        return v


class ActivityCreate(BaseModel):
    kind: str = "note"
    body: Optional[str] = None
    occurred_on: Optional[date] = None

    @field_validator("kind")
    @classmethod
    def _kind(cls, v):
        if v not in MANUAL_KINDS:
            raise ValueError(f"kind must be one of {', '.join(MANUAL_KINDS)}")
        return v


def _email_taken(db: Session, email: str, deal_type: str, exclude_id: Optional[int] = None):
    """Another lead of the SAME type with this email. The same person can be a
    Grow lead and a Pro lead at once — those are two deals."""
    return db.execute(
        text("""SELECT id FROM grow_leads
                 WHERE lower(email) = lower(:e) AND deal_type = :t
                   AND (CAST(:x AS bigint) IS NULL OR id <> :x)
                 LIMIT 1"""),
        {"e": email, "t": deal_type, "x": exclude_id},
    ).scalar()


# ---------------------------------------------------------------------- routes

@router.get("/leads")
def list_leads(
    include_closed: bool = Query(True),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    added = _sync_insights(db)
    added_pro = _sync_pro_enquiries(db)
    today = _nz_today()

    where = "" if include_closed else "WHERE gl.stage NOT IN ('won','lost')"
    rows = db.execute(text(_LIST_SQL.format(where=where))).all()

    # No summary here: the page totals whatever type it is filtered to, from
    # the leads themselves, so the strip and the board always agree.
    return {
        "leads": [_row_out(r, today) for r in rows],
        "synced": added,
        "synced_pro": added_pro,
        "options": {
            "deal_types": list(DEAL_TYPES),
            "stages": list(LEAD_STAGES),
            "sources": list(LEAD_SOURCES),
            "lost_reasons": list(LOST_REASONS),
            "activity_kinds": list(MANUAL_KINDS),
        },
    }


@router.get("/leads/{lead_id}")
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    return _detail(db, lead_id)


def _log_stage(db: Session, lead: GrowLead, old: str, new: str, admin: PublicUser,
               note: Optional[str]):
    db.add(GrowLeadActivity(
        lead_id=lead.id, kind="stage", from_stage=old, to_stage=new,
        body=_clean(note), occurred_on=_nz_today(), author_user_id=admin.id,
    ))


def _apply_stage(lead: GrowLead, new: str):
    lead.stage = new
    lead.stage_changed_at = datetime.now(timezone.utc)
    if new in CLOSED_STAGES:
        lead.closed_at = datetime.now(timezone.utc)
    else:
        lead.closed_at = None
    # Leaving lost (reopened, or corrected to won) clears the reason — a stale
    # one would be read as the reason for a loss that has not happened.
    if new != "lost":
        lead.lost_reason = None


def _has_enquiries(db: Session, lead_id: int) -> bool:
    return bool(db.execute(
        text("SELECT 1 FROM insights_pro_enquiry WHERE pipeline_lead_id = :id LIMIT 1"),
        {"id": lead_id},
    ).scalar())


@router.post("/leads", status_code=201)
def create_lead(
    payload: LeadCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    if not (payload.contact_name or payload.email or payload.company_name):
        raise HTTPException(422, "Give the lead a name, an email or a company")

    if payload.email:
        dup = _email_taken(db, payload.email, payload.deal_type)
        if dup:
            raise HTTPException(409, f"A lead of this type with that email already exists (#{dup})")

    data = payload.model_dump()
    lead = GrowLead(**data, owner_user_id=admin.id)
    if lead.stage in CLOSED_STAGES:
        lead.closed_at = datetime.now(timezone.utc)
    db.add(lead)
    db.flush()
    db.add(GrowLeadActivity(
        lead_id=lead.id, kind="stage", from_stage=None, to_stage=lead.stage,
        body="Added to pipeline", occurred_on=_nz_today(), author_user_id=admin.id,
    ))
    db.commit()
    return _detail(db, lead.id)


@router.patch("/leads/{lead_id}")
def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    lead = db.get(GrowLead, lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")

    sent = payload.model_fields_set
    new_type = payload.deal_type if ("deal_type" in sent and payload.deal_type) else lead.deal_type

    if new_type != lead.deal_type:
        # An Insights opt-in lead IS a grow lead: retyped, the next sync would
        # add the subscriber again as a fresh grow lead.
        if lead.source == "insights":
            raise HTTPException(422, "Leads pulled from Insights opt-ins stay Grow leads")
        if new_type == "grow" and lead.public_user_id is not None:
            clash = db.execute(
                text("""SELECT id FROM grow_leads WHERE deal_type = 'grow'
                         AND public_user_id = :p AND id <> :id LIMIT 1"""),
                {"p": lead.public_user_id, "id": lead_id},
            ).scalar()
            if clash:
                raise HTTPException(409, f"That subscriber is already a Grow lead (#{clash})")

    email = payload.email if "email" in sent else lead.email
    if email and (
        (lead.email or "").lower() != email.lower() or new_type != lead.deal_type
    ):
        dup = _email_taken(db, email, new_type, exclude_id=lead_id)
        if dup:
            raise HTTPException(409, f"A lead of this type with that email already exists (#{dup})")

    if "source" in sent and payload.source is not None:
        # The Insights link is what 'insights' means; it cannot be set or
        # removed by relabelling.
        if (payload.source == "insights") != (lead.source == "insights"):
            raise HTTPException(422, "Source 'insights' belongs only to leads pulled from Insights")

    if "grow_company_id" in sent and payload.grow_company_id is not None:
        exists = db.execute(
            text("SELECT 1 FROM companies WHERE id = :id"), {"id": payload.grow_company_id}
        ).scalar()
        if not exists:
            raise HTTPException(422, "No Grow company with that id")

    if "insights_account_id" in sent and payload.insights_account_id is not None:
        exists = db.execute(
            text("SELECT 1 FROM insights_account WHERE id = :id"),
            {"id": payload.insights_account_id},
        ).scalar()
        if not exists:
            raise HTTPException(422, "No Insights account with that id")

    for field in (
        "deal_type", "contact_name", "email", "phone", "company_name", "region",
        "hectares", "value_nzd", "source", "next_action", "next_action_on",
        "grow_company_id", "insights_account_id", "owner_user_id", "notes",
    ):
        if field in sent:
            if field in ("source", "deal_type") and getattr(payload, field) is None:
                continue
            setattr(lead, field, getattr(payload, field))

    if "stage" in sent and payload.stage and payload.stage != lead.stage:
        old = lead.stage
        _apply_stage(lead, payload.stage)
        _log_stage(db, lead, old, payload.stage, admin, payload.stage_note)

    # After the stage, so a move to lost and its reason can arrive in one PATCH.
    if "lost_reason" in sent:
        if payload.lost_reason is not None and lead.stage != "lost":
            raise HTTPException(422, "A lost reason only applies to a lost lead")
        lead.lost_reason = payload.lost_reason

    db.commit()
    return _detail(db, lead_id)


@router.delete("/leads/{lead_id}")
def delete_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    lead = db.get(GrowLead, lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    # A synced lead would be recreated by the next sync as a blank 'new' lead,
    # silently undoing the delete and dropping its history. Closing it as lost
    # is the durable way to take it off the board.
    if lead.source == "insights":
        raise HTTPException(
            409, "Insights leads come back on the next sync — mark it Lost instead",
        )
    if _has_enquiries(db, lead_id):
        raise HTTPException(
            409, "Leads from a Pro enquiry come back on the next sync — mark it Lost instead",
        )
    db.delete(lead)
    db.commit()
    return {"deleted": lead_id}


@router.post("/leads/{lead_id}/activities", status_code=201)
def add_activity(
    lead_id: int,
    payload: ActivityCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    lead = db.get(GrowLead, lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    body = _clean(payload.body)
    if not body and payload.kind == "note":
        raise HTTPException(422, "A note needs some text")
    db.add(GrowLeadActivity(
        lead_id=lead_id, kind=payload.kind, body=body,
        occurred_on=payload.occurred_on or _nz_today(), author_user_id=admin.id,
    ))
    # Touch the lead so a logged call floats it in "recently updated".
    lead.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _detail(db, lead_id)


@router.delete("/leads/{lead_id}/activities/{activity_id}")
def delete_activity(
    lead_id: int,
    activity_id: int,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    act = db.get(GrowLeadActivity, activity_id)
    if act is None or act.lead_id != lead_id:
        raise HTTPException(404, "Activity not found")
    # A stage MOVE can go: a card dropped on the wrong column logs a move that
    # never really happened. Deleting it only tidies the timeline; the lead's
    # stage is whatever it is now. The "Added as" row and enquiries are where
    # the lead came from, so they stay.
    if act.kind == "enquiry" or (act.kind == "stage" and act.from_stage is None):
        raise HTTPException(409, "How a lead arrived cannot be deleted")
    db.delete(act)
    db.commit()
    return _detail(db, lead_id)


@router.get("/companies")
def search_companies(
    q: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Grow companies to link a won lead to. Small table; a prefix-free ILIKE."""
    rows = db.execute(text("""
        SELECT id, name, created_at FROM companies
         WHERE (:q = '' OR name ILIKE '%' || :q || '%')
         ORDER BY created_at DESC NULLS LAST
         LIMIT 25
    """), {"q": q.strip()}).all()
    return {"companies": [
        {"id": r.id, "name": r.name, "created_at": _iso(r.created_at)} for r in rows
    ]}


@router.get("/accounts")
def search_accounts(
    q: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    """Insights enterprise accounts to link a won enterprise deal to."""
    rows = db.execute(text("""
        SELECT id, name, created_at FROM insights_account
         WHERE (:q = '' OR name ILIKE '%' || :q || '%')
         ORDER BY created_at DESC NULLS LAST
         LIMIT 25
    """), {"q": q.strip()}).all()
    return {"accounts": [
        {"id": r.id, "name": r.name, "created_at": _iso(r.created_at)} for r in rows
    ]}
