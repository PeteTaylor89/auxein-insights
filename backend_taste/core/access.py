# backend_taste/core/access.py — who may see and change a row.
#
# F2. This replaces `scoped()` in api/crud.py, which filtered every query by
# `user_id` and was, on its own, the entire authorisation model of this service.
#
# Two mechanisms, because neither derives from the other:
#   - `visibility` on the row      — its own default reach;
#   - `taste.shares`               — named exceptions on top of it.
# A layer can be public AND have two named editors.
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from db.models import SHAREABLE_MODELS, Share, User

# Ordered weakest to strongest. `owner` is not a grant — it is not writable into
# `shares` — but it ranks here so one comparison covers every caller.
ROLE_ORDER = ("view", "comment", "edit", "owner")


def _rank(role: Optional[str]) -> int:
    return ROLE_ORDER.index(role) if role in ROLE_ORDER else -1


def at_least(role: Optional[str], needed: str) -> bool:
    return _rank(role) >= _rank(needed)


# Model -> the `subject_type` string used in taste.shares. Derived from the
# registry in models.py rather than written out again, so a new shareable entity
# cannot be added to one list and forgotten in the other.
SUBJECT_TYPES = {model: name for name, model in SHAREABLE_MODELS.items()}


def subject_type_for(model) -> str:
    try:
        return SUBJECT_TYPES[model]
    except KeyError:
        # Reached only by a programming error — an entity wired into a sharing
        # route without being declared shareable. Loud, because the quiet
        # version of this bug is a row with no access rules at all.
        raise RuntimeError(f"{model.__name__} is not a shareable entity")


def _live_share_filter(user: Optional[User]):
    """Grants that are currently in force for this caller."""
    from sqlalchemy import func

    if user is None:
        return None
    return and_(
        Share.revoked_at.is_(None),
        or_(Share.expires_at.is_(None), Share.expires_at > func.now()),
        # Group grants are accepted by the schema but cannot resolve yet: groups
        # are S1 and do not exist. Matching only `user` here means a group grant
        # written early grants nothing, which is the safe direction to be wrong in.
        Share.grantee_type == "user",
        Share.grantee_id == user.id,
    )


def visible_filter(model, user: Optional[User], *, include_public: bool = False):
    """SQL predicate for 'rows this caller may at least view'.

    NOTE ON LIST SEMANTICS: public rows are deliberately NOT unioned in by
    default. "My wines" must not silently become "everyone's public wines" the
    day someone makes one public — discovery is its own surface (S4), with its
    own route and its own ordering. `include_public` is set only for templates,
    which is where the builtin grids live and where global visibility is the
    existing, expected behaviour.
    """
    clauses = []

    if user is not None:
        clauses.append(model.user_id == user.id)

        share_filter = _live_share_filter(user)
        subject_type = SUBJECT_TYPES.get(model)
        if subject_type is not None:
            # F4: a grant does not survive hiding either. Only the owner does.
            clauses.append(
                model.id.in_(
                    select(Share.subject_id).where(
                        and_(Share.subject_type == subject_type, share_filter)
                    )
                )
                & model.hidden_at.is_(None)
            )

    if include_public:
        # F4: a hidden row is not public. This is on the PUBLIC clause and not on
        # the owner clause on purpose — the owner keeps seeing their own row.
        clauses.append((model.visibility == "public") & model.hidden_at.is_(None))
        # Builtin templates predate `visibility` and are marked by a NULL owner.
        # Migration 0006 set them public as well, so this is belt and braces —
        # and it is what keeps a half-migrated database serving its grids.
        clauses.append(model.user_id.is_(None))

    if not clauses:
        # An anonymous caller on a non-public entity sees nothing. Returning a
        # false predicate rather than None matters: a caller that forgets to
        # handle None would otherwise get an unfiltered query.
        return model.id.is_(None) & model.id.isnot(None)

    return or_(*clauses)


def access_role(db: Session, model, row, user: Optional[User]) -> Optional[str]:
    """The strongest role this caller holds on this row, or None.

    Order matters: ownership first (cheap, and cannot be revoked by a share),
    then explicit grants, then the row's own visibility. The row's visibility is
    checked LAST because a grant may be stronger than it — a public row can
    still name an editor.
    """
    if row is None:
        return None

    if user is not None and row.user_id is not None and row.user_id == user.id:
        return "owner"

    # F4 — hidden content. Checked AFTER ownership and BEFORE everything else:
    # the owner still sees their own row (with the reason attached, so a
    # moderation decision is explainable rather than a vanishing act), a
    # moderator sees it because reviewing it is the job, and nobody else does —
    # not via a share, not via a link, not publicly.
    if getattr(row, "hidden_at", None) is not None:
        if user is not None and (user.role or "user") in ("moderator", "admin"):
            return "view"
        return None

    subject_type = SUBJECT_TYPES.get(model)

    if user is not None and subject_type is not None:
        share = db.query(Share).filter(
            Share.subject_type == subject_type,
            Share.subject_id == row.id,
            _live_share_filter(user),
        ).first()
        if share is not None:
            return share.role

    visibility = getattr(row, "visibility", "private")
    if visibility == "public":
        return "view"
    # 'link' resolves only through the slug route, which is the point of a link
    # share: holding the URL is the credential. Knowing the row id is not.
    # 'group' cannot resolve until groups exist (S1).
    return None


def require(db: Session, model, row, user: Optional[User], needed: str):
    """Assert a role on a row, or raise. Returns the role actually held.

    404 rather than 403 when the caller may not even view the row: a 403 confirms
    that the id exists, which is a membership oracle over every note in the
    database.
    """
    role = access_role(db, model, row, user)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not at_least(role, needed):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted")
    return role
