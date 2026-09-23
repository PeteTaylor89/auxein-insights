# api/v1/admin_pipeline.py — the Grow conversion pipeline.
#
# Leads from first contact to a Grow sign-up (won) or not (lost). Shared across
# admins: a lead is the business's, not the typist's.
#
# Insights subscribers who opted in to marketing are pulled in by `_sync_insights`
# every time the list is read. The sync is insert-only and idempotent — it never
# updates or removes a lead — so what an admin writes on a lead is never
# overwritten, and a lead closed as lost stays lost.
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
    LEAD_STAGES, CLOSED_STAGES, LEAD_SOURCES, LOST_REASONS, ACTIVITY_KINDS,
)
from db.models.public_user import PublicUser
from core.admin_security import require_admin

router = APIRouter(prefix="/pipeline")

NZ = ZoneInfo("Pacific/Auckland")

# Kinds a person can log by hand. 'stage' rows are written only by the API on a
# stage change, so a hand-typed one can never contradict the lead's history.
MANUAL_KINDS = tuple(k for k in ACTIVITY_KINDS if k != "stage")


def _nz_today() -> date:
    # NOT date.today(): on the prod box that is UTC, which is yesterday for the
    # whole NZ morning — every follow-up due today would read as not yet due.
    return datetime.now(NZ).date()


# ------------------------------------------------------------------------ sync

# Insert every verified, active, marketing-opted-in subscriber who is not
# already a lead, is not an admin, and does not already have a Grow login —
# either linked (grow_user_id) or simply the same email in `users`. Those people
# are already on Grow; there is nothing to convert.
#
# If a hand-added lead already carries the subscriber's email, the first
# statement ADOPTS it (links public_user_id) instead of creating a duplicate.
_ADOPT_SQL = text("""
    UPDATE grow_leads gl
       SET public_user_id = pu.id, updated_at = now()
      FROM public_users pu
     WHERE gl.public_user_id IS NULL
       AND gl.email IS NOT NULL
       AND lower(gl.email) = lower(pu.email)
       AND pu.marketing_opt_in AND pu.is_verified AND pu.is_active
       AND NOT EXISTS (SELECT 1 FROM grow_leads x WHERE x.public_user_id = pu.id)
""")

_SYNC_SQL = text("""
    INSERT INTO grow_leads
        (public_user_id, source, contact_name, email, company_name, region, stage)
    SELECT pu.id, 'insights',
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
              WHERE gl.email IS NOT NULL AND lower(gl.email) = lower(pu.email))
    ON CONFLICT (public_user_id) DO NOTHING
""")


def _sync_insights(db: Session) -> int:
    db.execute(_ADOPT_SQL)
    added = db.execute(_SYNC_SQL).rowcount or 0
    db.commit()
    return added


# -------------------------------------------------------------------- reading

# One query for the whole board. The joins carry the context a lead card needs
# that the lead row itself does not own:
#   - the Insights subscriber, live: opted out since? last seen? Pro?
#   - a Grow account with the same email — the signal that a lead has signed up
#     on their own and should be marked won.
_LIST_SQL = """
    SELECT gl.*,
           pu.marketing_opt_in       AS pu_marketing_opt_in,
           pu.last_login             AS pu_last_login,
           pu.user_type              AS pu_user_type,
           pu.subscription_tier      AS pu_subscription_tier,
           pu.created_at             AS pu_created_at,
           c.name                    AS grow_company_name,
           gu.id                     AS grow_user_match_id,
           gu.company_id             AS grow_user_match_company_id,
           gc.name                   AS grow_user_match_company_name,
           owner.email               AS owner_email,
           (SELECT count(*) FROM grow_lead_activities a
             WHERE a.lead_id = gl.id AND a.kind <> 'stage') AS touch_count,
           (SELECT max(a.occurred_on) FROM grow_lead_activities a
             WHERE a.lead_id = gl.id AND a.kind <> 'stage') AS last_touch_on
      FROM grow_leads gl
      LEFT JOIN public_users pu    ON pu.id = gl.public_user_id
      LEFT JOIN companies c        ON c.id = gl.grow_company_id
      LEFT JOIN public_users owner ON owner.id = gl.owner_user_id
      LEFT JOIN LATERAL (
            SELECT u.id, u.company_id FROM users u
             WHERE gl.email IS NOT NULL AND lower(u.email) = lower(gl.email)
             LIMIT 1) gu ON TRUE
      LEFT JOIN companies gc ON gc.id = gu.company_id
      {where}
     ORDER BY gl.next_action_on NULLS LAST, gl.updated_at DESC
"""


def _iso(v):
    return v.isoformat() if v is not None else None


def _row_out(r, today: date) -> dict:
    m = r._mapping
    return {
        "id": m["id"],
        "source": m["source"],
        "public_user_id": m["public_user_id"],
        "contact_name": m["contact_name"],
        "email": m["email"],
        "phone": m["phone"],
        "company_name": m["company_name"],
        "region": m["region"],
        "hectares": float(m["hectares"]) if m["hectares"] is not None else None,
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
            and m["stage"] not in CLOSED_STAGES
        ),
        "grow_company_id": m["grow_company_id"],
        "grow_company_name": m["grow_company_name"],
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
            or m["stage"] == "won"
            or m["grow_company_id"] is not None
        ) else {
            "company_id": m["grow_user_match_company_id"],
            "company_name": m["grow_user_match_company_name"],
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
    contact_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    company_name: Optional[str] = Field(None, max_length=200)
    region: Optional[str] = Field(None, max_length=100)
    hectares: Optional[float] = Field(None, ge=0)
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

    @field_validator("source")
    @classmethod
    def _source(cls, v):
        # 'insights' is reserved for the sync, which is the only thing that can
        # attach a subscriber. A hand-made 'insights' lead would have no
        # subscriber behind it and nothing to show in the Insights panel.
        if v not in LEAD_SOURCES or v == "insights":
            raise ValueError("source must be one of referral, event, website, outbound, other")
        return v

    @field_validator("stage")
    @classmethod
    def _stage(cls, v):
        if v not in LEAD_STAGES:
            raise ValueError(f"stage must be one of {', '.join(LEAD_STAGES)}")
        return v


class LeadUpdate(BaseModel):
    """A PATCH. Nullable fields use `model_fields_set` to tell 'clear' from 'leave'."""
    contact_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=50)
    company_name: Optional[str] = Field(None, max_length=200)
    region: Optional[str] = Field(None, max_length=100)
    hectares: Optional[float] = Field(None, ge=0)
    source: Optional[str] = None
    stage: Optional[str] = None
    lost_reason: Optional[str] = None
    next_action: Optional[str] = Field(None, max_length=300)
    next_action_on: Optional[date] = None
    grow_company_id: Optional[int] = None
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


# ---------------------------------------------------------------------- routes

@router.get("/leads")
def list_leads(
    include_closed: bool = Query(True),
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    added = _sync_insights(db)
    today = _nz_today()

    where = "" if include_closed else "WHERE gl.stage NOT IN ('won','lost')"
    rows = db.execute(text(_LIST_SQL.format(where=where))).all()
    leads = [_row_out(r, today) for r in rows]

    # Summary over ALL leads regardless of the filter, so hiding closed leads
    # does not also hide the conversion rate.
    s = db.execute(text("""
        SELECT stage, count(*) AS n FROM grow_leads GROUP BY stage
    """)).all()
    by_stage = {st: 0 for st in LEAD_STAGES}
    by_stage.update({r.stage: r.n for r in s})

    recent = db.execute(text("""
        SELECT count(*) FILTER (WHERE stage = 'won')  AS won,
               count(*) FILTER (WHERE stage = 'lost') AS lost
          FROM grow_leads
         WHERE closed_at >= now() - interval '90 days'
    """)).first()
    won_all, lost_all = by_stage["won"], by_stage["lost"]

    overdue = db.execute(text("""
        SELECT count(*) FROM grow_leads
         WHERE next_action_on < :today AND stage NOT IN ('won','lost')
    """), {"today": today}).scalar()

    return {
        "leads": leads,
        "synced": added,
        "summary": {
            "by_stage": by_stage,
            "open": sum(by_stage[st] for st in LEAD_STAGES if st not in CLOSED_STAGES),
            "overdue": overdue,
            "won_90d": recent.won,
            "lost_90d": recent.lost,
            # Won over everything that has reached an outcome. None rather than
            # 0% when nothing has closed — a zero would read as a verdict.
            "win_rate": round(100 * won_all / (won_all + lost_all))
                        if (won_all + lost_all) else None,
        },
        "options": {
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


@router.post("/leads", status_code=201)
def create_lead(
    payload: LeadCreate,
    db: Session = Depends(get_db),
    admin: PublicUser = Depends(require_admin),
):
    if not (payload.contact_name or payload.email or payload.company_name):
        raise HTTPException(422, "Give the lead a name, an email or a company")

    if payload.email:
        dup = db.execute(
            text("SELECT id FROM grow_leads WHERE lower(email) = lower(:e) LIMIT 1"),
            {"e": payload.email},
        ).scalar()
        if dup:
            raise HTTPException(409, f"A lead with that email already exists (#{dup})")

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

    if "email" in sent and payload.email and (
        (lead.email or "").lower() != payload.email.lower()
    ):
        dup = db.execute(
            text("SELECT id FROM grow_leads WHERE lower(email) = lower(:e) AND id <> :id LIMIT 1"),
            {"e": payload.email, "id": lead_id},
        ).scalar()
        if dup:
            raise HTTPException(409, f"A lead with that email already exists (#{dup})")

    if "source" in sent and payload.source is not None:
        # The Insights link is what 'insights' means; it cannot be set or
        # removed by relabelling.
        if (payload.source == "insights") != (lead.public_user_id is not None):
            raise HTTPException(422, "Source 'insights' belongs only to leads pulled from Insights")

    if "grow_company_id" in sent and payload.grow_company_id is not None:
        exists = db.execute(
            text("SELECT 1 FROM companies WHERE id = :id"), {"id": payload.grow_company_id}
        ).scalar()
        if not exists:
            raise HTTPException(422, "No Grow company with that id")

    for field in (
        "contact_name", "email", "phone", "company_name", "region", "hectares",
        "source", "next_action", "next_action_on", "grow_company_id",
        "owner_user_id", "notes",
    ):
        if field in sent:
            if field == "source" and payload.source is None:
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
    # An Insights lead would be recreated by the next sync as a blank 'new'
    # lead, silently undoing the delete and dropping its history. Closing it
    # as lost is the durable way to take it off the board.
    if lead.public_user_id is not None:
        raise HTTPException(
            409, "Insights leads come back on the next sync — mark it Lost instead",
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
    # Stage rows are the lead's history, not commentary on it.
    if act.kind == "stage":
        raise HTTPException(409, "Stage changes cannot be deleted")
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
