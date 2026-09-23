# backend_taste/api/catalogue.py — the canonical wine catalogue surface (F3).
#
# Mounted at /taste/v1. Two audiences, deliberately separated:
#   - any signed-in user may SEARCH the catalogue and see their own proposals;
#   - only a moderator may change it.
#
# There is no route here that lets a user write `wine_ref`. That is the whole
# safeguard: the shared table has exactly one door and a moderator is standing
# in it. Proposals arrive automatically when a wine is saved
# (services/wine_catalogue.link_or_propose), so nobody has to be taught a
# workflow to contribute.
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

import schemas as s
from core.auth import get_current_user, require_admin
from core.wine_identity import normalise, normalise_producer
from db.base import get_db
from db.models import User, Wine, WineMergeLog, WineProposal, WineRef
from services import wine_catalogue as catalogue

router = APIRouter()


def _ref_or_404(db: Session, ref_id: str) -> WineRef:
    ref = db.query(WineRef).filter(WineRef.id == ref_id).first()
    if ref is None:
        raise HTTPException(status_code=404, detail="Not found")
    return ref


def _proposal_or_404(db: Session, proposal_id: int) -> WineProposal:
    row = db.query(WineProposal).filter(WineProposal.id == proposal_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return row


# ---------------------------------------------------------------- read (any user)
@router.get("/wine-ref", response_model=list[s.WineRefOut])
def search_catalogue(
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search the canonical catalogue.

    Merged rows are excluded: they are kept so old links resolve, not so they
    show up twice in a picker.
    """
    q = db.query(WineRef).filter(WineRef.status == "active")
    if search:
        # Matched against the normalised columns, so an accent or an apostrophe
        # in the query does not decide whether a wine is findable.
        term = f"%{normalise(search)}%"
        producer_term = f"%{normalise_producer(search)}%"
        q = q.filter(or_(WineRef.producer_norm.like(producer_term), WineRef.label_norm.like(term)))
    return q.order_by(WineRef.producer, WineRef.label, WineRef.vintage).limit(limit).all()


@router.get("/wine-ref/{ref_id}", response_model=s.WineRefOut)
def get_canonical(ref_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Fetch one canonical wine, following a merge rather than 404ing on it."""
    ref = catalogue.resolve(db, ref_id)
    if ref is None:
        raise HTTPException(status_code=404, detail="Not found")
    return ref


@router.get("/wine-proposals", response_model=list[s.WineProposalOut])
def list_proposals(
    state: Optional[str] = None,
    mine: bool = False,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The review queue for a moderator; your own submissions for anyone else.

    A plain user is scoped to their own rows whatever they pass, because the
    queue is other people's half-entered wine labels and is nobody else's
    business.
    """
    q = db.query(WineProposal)
    if mine or (user.role or "user") not in catalogue.TRUSTED_ROLES:
        q = q.filter(WineProposal.proposed_by == user.id)
    if state:
        q = q.filter(WineProposal.state == state)
    return q.order_by(WineProposal.created_at.desc()).limit(limit).all()


@router.get("/wine-proposals/{proposal_id}/suggestions", response_model=list[s.WineSuggestion])
def proposal_suggestions(
    proposal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Canonical rows that might already be this wine.

    A PROMPT FOR THE REVIEWER, never an action. Nothing in this service merges on
    a similarity score: a false merge silently rewrites someone else's tasting
    history, while a missed one is a row a moderator can join later.
    """
    proposal = _proposal_or_404(db, proposal_id)
    return [
        s.WineSuggestion(ref=ref, score=score)
        for ref, score in catalogue.suggestions(db, proposal.producer, proposal.label)
    ]


# ---------------------------------------------------------------- write (moderator)
@router.post("/wine-proposals/{proposal_id}/accept", response_model=s.WineRefOut)
def accept_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    proposal = _proposal_or_404(db, proposal_id)
    try:
        ref = catalogue.accept(db, proposal, actor)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()
    db.refresh(ref)
    return ref


@router.post("/wine-proposals/{proposal_id}/reject", status_code=204)
def reject_proposal(
    proposal_id: int,
    body: s.ReviewNote,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    proposal = _proposal_or_404(db, proposal_id)
    try:
        catalogue.reject(db, proposal, actor, body.note)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()


@router.post("/wine-proposals/{proposal_id}/duplicate", status_code=204)
def duplicate_proposal(
    proposal_id: int,
    body: s.DuplicateOf,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    """Resolve a proposal onto the canonical row it duplicates.

    Not the same as rejecting it: the proposer was right that the wine exists,
    they just described it differently, so their wine gets linked.
    """
    proposal = _proposal_or_404(db, proposal_id)
    ref = _ref_or_404(db, body.ref_id)
    try:
        catalogue.mark_duplicate(db, proposal, ref, actor)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()


@router.post("/wine-ref/{ref_id}/merge", response_model=s.MergeResult)
def merge_canonical(
    ref_id: str,
    body: s.MergeInto,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    """Fold this canonical wine into another. The source is kept, marked merged."""
    source = _ref_or_404(db, ref_id)
    target = _ref_or_404(db, body.into_id)
    try:
        moved = catalogue.merge(db, source, target, actor)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()
    return s.MergeResult(merged_into=target.id, wines_moved=moved)


@router.get("/wine-ref/{ref_id}/log", response_model=list[s.WineMergeLogOut])
def canonical_log(
    ref_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    """Every change that touched this canonical row, newest first."""
    return (
        db.query(WineMergeLog)
        .filter(or_(WineMergeLog.ref_id == ref_id, WineMergeLog.source_ref_id == ref_id))
        .order_by(WineMergeLog.created_at.desc())
        .all()
    )


@router.get("/wine-ref/{ref_id}/usage")
def canonical_usage(
    ref_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    """How many personal wines point here — the blast radius of a merge.

    Deliberately a count and not a list: how many people recorded this wine is
    what a moderator needs to judge a merge, and whose notes they are is not.
    """
    ref = _ref_or_404(db, ref_id)
    n = db.query(Wine).filter(Wine.wine_ref_id == ref.id, Wine.deleted.is_(False)).count()
    return {"ref_id": ref.id, "wines": n, "status": ref.status, "merged_into_id": ref.merged_into_id}
