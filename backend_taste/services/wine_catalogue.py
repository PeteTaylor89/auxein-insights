# backend_taste/services/wine_catalogue.py — the canonical wine catalogue (F3).
#
# THE RULE THIS FILE EXISTS TO ENFORCE: a user never writes `taste.wine_ref`.
# They write their own `taste.wines` row, which always saves, and they propose
# into the shared table. Promotion is a reviewed step that leaves a log entry.
#
# That is what makes the shared data stay clean without anyone having to clean
# it: a bad row never lands in the first place, rather than being found and
# removed later. The cost is a queue, and the queue is the point.
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.wine_identity import dedupe_key, normalise, normalise_producer, rank_candidates
from db.models import User, Wine, WineMergeLog, WineProposal, WineRef

log = logging.getLogger(__name__)

# Roles whose proposals are promoted on arrival rather than queued. The
# mechanism is identical either way — a proposal row and a log entry are still
# written — so the audit trail does not have a hole where trusted users are.
TRUSTED_ROLES = ("moderator", "admin")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _log(db: Session, action: str, ref_id: str, *, actor_id=None, source_ref_id=None,
         proposal_id=None, affected=0, detail=None) -> None:
    db.add(WineMergeLog(
        action=action, ref_id=ref_id, actor_id=actor_id, source_ref_id=source_ref_id,
        proposal_id=proposal_id, affected_wines=affected, detail=detail,
    ))


def resolve(db: Session, ref_id: Optional[str]) -> Optional[WineRef]:
    """Follow a canonical id to the row that supersedes it.

    A merged row is kept rather than deleted, so a personal wine pointing at one
    still resolves instead of dangling. The hop count is bounded because a merge
    chain can, through repeated moderator decisions, be made to point in a
    circle; a loop here would hang a request.
    """
    seen = set()
    row = db.query(WineRef).filter(WineRef.id == ref_id).first() if ref_id else None
    while row is not None and row.status == "merged" and row.merged_into_id:
        if row.id in seen:
            log.error("merge cycle detected at wine_ref %s", row.id)
            return None
        seen.add(row.id)
        row = db.query(WineRef).filter(WineRef.id == row.merged_into_id).first()
    return row


def find_by_key(db: Session, key: str) -> Optional[WineRef]:
    """The live canonical row for an identity, following any merge."""
    row = db.query(WineRef).filter(WineRef.dedupe_key == key).first()
    return resolve(db, row.id) if row is not None else None


def _create_ref(db: Session, *, producer, label, vintage, variety, region_id,
                key, created_by, verified) -> WineRef:
    ref = WineRef(
        id=str(uuid.uuid4()),
        producer=(producer or "").strip(),
        label=(label or "").strip() or None,
        vintage=vintage,
        variety=variety,
        producer_norm=normalise_producer(producer),
        label_norm=normalise(label) or None,
        dedupe_key=key,
        region_id=region_id,
        created_by=created_by,
        verified=verified,
    )
    db.add(ref)
    db.flush()
    return ref


def backlink(db: Session, ref: WineRef) -> int:
    """Point every personal wine whose identity matches this canonical row at it.

    Runs on promotion so that wines saved BEFORE the canonical existed are not
    left unlinked forever — which is the normal case, since the proposal is
    created by the very first person to save one.

    Only fills NULLs. A wine already pointing somewhere was either linked to a
    different canonical or repointed by a merge, and quietly overwriting that
    would undo a decision someone made.
    """
    rows = (
        db.query(Wine)
        .filter(Wine.wine_ref_id.is_(None), Wine.deleted.is_(False))
        .all()
    )
    n = 0
    for wine in rows:
        if dedupe_key(wine.producer, wine.label, wine.vintage) == ref.dedupe_key:
            wine.wine_ref_id = ref.id
            n += 1
    return n


def link_or_propose(db: Session, wine: Wine, user: User) -> Optional[WineProposal]:
    """Called after a personal wine is written. Never raises, never blocks the save.

    Three outcomes:
      - the identity already exists canonically  -> link, no proposal;
      - it does not, and the user is trusted     -> create it, link, log;
      - it does not, and the user is not         -> queue a proposal, leave NULL.

    A NULL `wine_ref_id` is an ordinary state. The user's row is complete and
    usable without one, which is what lets this whole mechanism be invisible to
    someone who just wants to record a tasting.
    """
    try:
        if not (wine.producer or "").strip():
            # Nothing to identify. A wine with no producer is a draft, not a
            # claim about a shared object.
            return None

        key = dedupe_key(wine.producer, wine.label, wine.vintage)
        existing = db.query(WineRef).filter(WineRef.dedupe_key == key).first()
        existing = resolve(db, existing.id) if existing else None

        if existing is not None:
            wine.wine_ref_id = existing.id
            return None

        # Do not queue the same identity twice for the same user.
        pending = (
            db.query(WineProposal)
            .filter(
                WineProposal.dedupe_key == key,
                WineProposal.proposed_by == user.id,
                WineProposal.state == "pending",
            )
            .first()
        )
        if pending is not None:
            pending.wine_id = wine.id
            return pending

        proposal = WineProposal(
            wine_id=wine.id,
            proposed_by=user.id,
            producer=(wine.producer or "").strip(),
            label=(wine.label or "").strip() or None,
            vintage=wine.vintage,
            variety=wine.variety,
            region_id=wine.geo_ref_id,
            dedupe_key=key,
        )
        db.add(proposal)
        db.flush()

        if (user.role or "user") in TRUSTED_ROLES:
            accept(db, proposal, user, auto=True)

        return proposal
    except Exception as exc:  # noqa: BLE001
        # The catalogue is a secondary concern to the taster. If anything here
        # goes wrong the personal wine must still be saved, so this swallows and
        # logs rather than turning a tasting note into a 500.
        log.error("wine catalogue link failed for wine %s: %s", getattr(wine, "id", "?"), exc)
        return None


def accept(db: Session, proposal: WineProposal, actor: User, *, auto: bool = False) -> WineRef:
    """Promote a proposal into the canonical table, or attach it to what is there."""
    if proposal.state != "pending":
        raise ValueError("Proposal is already %s" % proposal.state)

    existing = db.query(WineRef).filter(WineRef.dedupe_key == proposal.dedupe_key).first()
    existing = resolve(db, existing.id) if existing else None

    if existing is not None:
        # Someone else's proposal got there first. Not a failure — the outcome
        # the proposer wanted is now true.
        ref = existing
    else:
        try:
            ref = _create_ref(
                db, producer=proposal.producer, label=proposal.label, vintage=proposal.vintage,
                variety=proposal.variety, region_id=proposal.region_id, key=proposal.dedupe_key,
                created_by=proposal.proposed_by, verified=not auto,
            )
        except IntegrityError:
            # Lost a race on the unique dedupe key. The row now exists; use it.
            db.rollback()
            ref = db.query(WineRef).filter(WineRef.dedupe_key == proposal.dedupe_key).first()
            if ref is None:
                raise

    proposal.state = "accepted"
    proposal.resolved_ref_id = ref.id
    proposal.reviewed_by = actor.id
    proposal.reviewed_at = _now()

    affected = backlink(db, ref)
    _log(db, "created", ref.id, actor_id=actor.id, proposal_id=proposal.id, affected=affected,
         detail={"auto": auto, "dedupe_key": ref.dedupe_key})
    return ref


def reject(db: Session, proposal: WineProposal, actor: User, note: Optional[str] = None) -> None:
    if proposal.state != "pending":
        raise ValueError("Proposal is already %s" % proposal.state)
    proposal.state = "rejected"
    proposal.reviewed_by = actor.id
    proposal.reviewed_at = _now()
    proposal.review_note = note
    # No log entry: nothing about the canonical table changed. The proposal row
    # is itself the record.


def mark_duplicate(db: Session, proposal: WineProposal, ref: WineRef, actor: User) -> None:
    """Resolve a proposal onto an existing canonical row it duplicates.

    Distinct from reject, because the proposer was right that the wine exists —
    they simply described it differently. Their wine gets linked.
    """
    if proposal.state != "pending":
        raise ValueError("Proposal is already %s" % proposal.state)
    target = resolve(db, ref.id)
    if target is None:
        raise ValueError("That canonical wine no longer resolves")

    proposal.state = "duplicate"
    proposal.resolved_ref_id = target.id
    proposal.reviewed_by = actor.id
    proposal.reviewed_at = _now()

    if proposal.wine_id:
        wine = db.query(Wine).filter(Wine.id == proposal.wine_id).first()
        if wine is not None and wine.wine_ref_id is None:
            wine.wine_ref_id = target.id


def merge(db: Session, source: WineRef, target: WineRef, actor: User) -> int:
    """Fold one canonical row into another. Returns how many personal wines moved.

    The source is marked merged rather than deleted so that anything still
    pointing at it resolves forward instead of dangling.
    """
    if source.id == target.id:
        raise ValueError("A wine cannot be merged into itself")
    resolved_target = resolve(db, target.id)
    if resolved_target is None:
        raise ValueError("That target no longer resolves")
    if resolved_target.id == source.id:
        # Merging A into B when B already points at A would make a cycle, and
        # `resolve` would then return None for both — every personal wine on
        # either row would lose its link at once.
        raise ValueError("That merge would create a cycle")
    if source.status == "merged":
        raise ValueError("That wine is already merged")

    moved = (
        db.query(Wine)
        .filter(Wine.wine_ref_id == source.id)
        .update({"wine_ref_id": resolved_target.id}, synchronize_session=False)
    )
    source.status = "merged"
    source.merged_into_id = resolved_target.id
    source.updated_at = _now()

    _log(db, "merged", resolved_target.id, actor_id=actor.id, source_ref_id=source.id,
         affected=moved, detail={"source_key": source.dedupe_key})
    return moved


def suggestions(db: Session, producer: str, label: Optional[str], *, limit: int = 5) -> list:
    """Canonical rows that might be the same wine. A prompt for a human only.

    Narrowed by a shared first token before scoring so this does not load the
    whole catalogue to compare against one proposal.
    """
    head = (normalise_producer(producer) or "").split(" ")[0]
    if not head:
        return []
    rows = (
        db.query(WineRef)
        .filter(WineRef.status == "active", WineRef.producer_norm.like(f"%{head}%"))
        .limit(200)
        .all()
    )
    return rank_candidates(producer, label, rows)[:limit]
