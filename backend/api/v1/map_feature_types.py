# api/v1/map_feature_types.py - The POI vocabulary (Maps V2)
#
# Companies define their own POI types on top of the five system ones. Reading
# is open to anyone who can see the map — otherwise the picker is empty for the
# people who use it most — but creating, renaming and retiring a type is
# manager+, because a vocabulary is shared state and type sprawl is the failure
# mode this table exists to prevent.
#
# THE HAZARD GUARD (see docs/plans/MAP_POI_CUSTOM_TYPES_2026-08-19.md §2)
# ----------------------------------------------------------------------
# The POI feature has refused a `hazard` type since it shipped, in three files,
# because hazards belong in SiteRisk — the WorkSafe register, which carries
# notifiability. That prohibition used to be enforced by a closed pydantic enum.
# Opening the vocabulary to free text would have quietly deleted it: nothing
# would stop a user creating "Hazard" and rebuilding the second, non-compliant
# register the design refused, except now it looks sanctioned because they built
# it themselves. So the guard moves here, and it is deliberately loud — it names
# where the thing actually belongs rather than just saying no.
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from core.permissions import has_permission
from db.models.map_feature_type import MapFeatureType, SYSTEM_SLUGS
from db.models.user import User
from schemas.map_feature_type import (
    MapFeatureTypeCreate,
    MapFeatureTypeResponse,
    MapFeatureTypeUpdate,
    slugify,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# Matched against the slug, so casing and punctuation are already normalised —
# "Near Miss!" arrives here as "near-miss". Matching is on whole hyphen-separated
# WORDS, not substrings: substring matching would block "brisk-walk-track" for
# containing "risk", while word matching still catches the ones that matter —
# "water-hazard" and "slip-danger" are exactly the names someone reaches for
# when they are building a hazard register by another name.
RESERVED_WORDS = frozenset({
    "hazard", "hazards",
    "risk", "risks",
    "danger", "dangers", "dangerous",
    "unsafe",
    "incident", "incidents",
    "near-miss", "nearmiss",
    "accident", "accidents",
    "injury", "injuries",
})

RESERVED_MESSAGE = (
    "Hazards belong in the Risk Register, where they carry WorkSafe "
    "notifiability. Add it under Health & Safety → Risks and it will appear "
    "on the map automatically, with its own marker. Pick a different name for "
    "this map type."
)

# The fifty icon keys the client can actually draw. Mirrors POI_ICON_LIBRARY /
# POI_ICON_KEYS in maps-v2/utils/mapIcons.js — an icon key that has no ICON_DEFS
# entry renders as a blank marker on screen and, worse, silently as nothing at
# all on a printed sheet. Kept as an explicit list rather than inferred, because
# the two sides live in different languages and a type saved against a glyph
# that does not exist is not recoverable from the data.
ALLOWED_ICONS = frozenset({
    # Access
    "poiAccess", "poiTrack", "poiBridge", "poiFord",
    "poiCattleStop", "poiFence", "poiLock", "poiSign",
    "poiParking", "poiHelipad",
    # Structures
    "poiInfrastructure", "poiShed", "poiWorkshop", "poiTank",
    "poiSilo", "poiPump", "poiWeatherStation", "poiPower",
    "poiSolar", "poiFuel", "poiGlasshouse",
    # Water
    "poiWater", "poiDam", "poiBore", "poiTrough",
    "poiCreek", "poiValve", "poiHydrant", "poiSprinkler",
    "poiDripLine", "poiFilter",
    # Ground
    "poiSlip", "poiFrost", "poiWetArea", "poiRock",
    "poiTree", "poiShelterBelt", "poiScrub", "poiCompost",
    # Vineyard
    "poiVine", "poiFlag", "poiNursery", "poiBeehive",
    # Amenity
    "poiAmenity", "poiNote", "poiToilet", "poiSmoko",
    "poiFirstAid", "poiFireExtinguisher", "poiMuster",
})

# The bounded palette, mirroring POI_COLOURS. Free colour choice is deliberately
# not offered — a pale badge with a white ring vanishes against bare dirt on
# satellite imagery, which is most of the imagery for most of the season.
ALLOWED_COLOURS = frozenset({
    "#0369a1", "#0891b2", "#15803d", "#b45309",
    "#b91c1c", "#7c3aed", "#6b7280", "#2f2f2f",
})


def _assert_not_reserved(slug: str):
    """Refuse anything that reads as a hazard register."""
    words = set(slug.split("-"))
    if slug in RESERVED_WORDS or words & RESERVED_WORDS:
        raise HTTPException(status_code=400, detail=RESERVED_MESSAGE)


def _assert_can_manage(user: User):
    if not has_permission(user.user_type, "map_feature_types", "create"):
        raise HTTPException(
            status_code=403,
            detail="Only managers and admins can change the map type list",
        )


def _visible_types_filter(user: User):
    """System types plus the caller's own company's.

    The NULL branch is the whole point — a plain `company_id == x` drops every
    system type, which is the same trap map_features.property_id carries.
    """
    if user.user_type == "auxein_admin" and not user.company_id:
        return MapFeatureType.company_id.is_(None)
    return or_(
        MapFeatureType.company_id.is_(None),
        MapFeatureType.company_id == user.company_id,
    )


def _to_response(t: MapFeatureType) -> MapFeatureTypeResponse:
    out = MapFeatureTypeResponse.model_validate(t)
    out.is_system = t.company_id is None
    return out


@router.get("/", response_model=List[MapFeatureTypeResponse])
def list_map_feature_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    include_inactive: bool = Query(False),
):
    """The picker's vocabulary: system types plus this company's."""
    q = db.query(MapFeatureType).filter(_visible_types_filter(current_user))
    if not include_inactive:
        q = q.filter(MapFeatureType.is_active.is_(True))
    # System types first so the familiar five head the list, then alphabetical.
    rows = q.order_by(
        MapFeatureType.company_id.isnot(None),
        MapFeatureType.label,
    ).all()
    return [_to_response(t) for t in rows]


@router.post("/", response_model=MapFeatureTypeResponse, status_code=status.HTTP_201_CREATED)
def create_map_feature_type(
    payload: MapFeatureTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_can_manage(current_user)

    if not current_user.company_id:
        raise HTTPException(
            status_code=400,
            detail="No company context — a map type belongs to a company",
        )

    slug = slugify(payload.label)
    if not slug:
        raise HTTPException(status_code=400, detail="That name has no letters or numbers in it")

    _assert_not_reserved(slug)

    if payload.icon not in ALLOWED_ICONS:
        raise HTTPException(status_code=400, detail=f"Unknown icon {payload.icon!r}")
    if payload.colour not in ALLOWED_COLOURS:
        raise HTTPException(
            status_code=400,
            detail="Pick a colour from the palette — free colours do not hold up on satellite imagery",
        )

    # A company cannot shadow a system slug: the map would have two types with
    # the same key and the `match` expression would take whichever came first.
    if slug in SYSTEM_SLUGS:
        raise HTTPException(
            status_code=409,
            detail=f"‘{payload.label}’ is already a built-in type",
        )

    existing = db.query(MapFeatureType).filter(
        MapFeatureType.company_id == current_user.company_id,
        MapFeatureType.slug == slug,
    ).first()
    if existing:
        # Re-activating beats a duplicate-key error: the usual way to hit this
        # is recreating a type someone retired last season.
        if not existing.is_active:
            existing.is_active = True
            existing.label = payload.label
            existing.icon = payload.icon
            existing.colour = payload.colour
            db.commit()
            db.refresh(existing)
            return _to_response(existing)
        raise HTTPException(
            status_code=409,
            detail=f"You already have a type called ‘{existing.label}’",
        )

    row = MapFeatureType(
        company_id=current_user.company_id,
        slug=slug,
        label=payload.label,
        icon=payload.icon,
        colour=payload.colour,
        created_by_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.patch("/{type_id}", response_model=MapFeatureTypeResponse)
def update_map_feature_type(
    type_id: int,
    payload: MapFeatureTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_can_manage(current_user)

    row = db.query(MapFeatureType).filter(MapFeatureType.id == type_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Map type not found")
    if row.company_id is None:
        raise HTTPException(status_code=403, detail="Built-in types cannot be changed")
    if row.company_id != current_user.company_id and current_user.user_type != "auxein_admin":
        raise HTTPException(status_code=403, detail="Access denied")

    data = payload.model_dump(exclude_unset=True)

    # The label may change freely; the slug does NOT follow it. Every existing
    # feature stores the slug, so re-slugging on rename would orphan all of
    # them — the rename is a display change by design.
    if "label" in data:
        _assert_not_reserved(slugify(data["label"]))
        row.label = data["label"]
    if "icon" in data:
        if data["icon"] not in ALLOWED_ICONS:
            raise HTTPException(status_code=400, detail=f"Unknown icon {data['icon']!r}")
        row.icon = data["icon"]
    if "colour" in data:
        if data["colour"] not in ALLOWED_COLOURS:
            raise HTTPException(
                status_code=400,
                detail="Pick a colour from the palette — free colours do not hold up on satellite imagery",
            )
        row.colour = data["colour"]
    if "is_active" in data:
        row.is_active = data["is_active"]

    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/{type_id}", response_model=MapFeatureTypeResponse)
def retire_map_feature_type(
    type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete. Features keep their type and keep rendering; it just leaves
    the picker. A hard delete would strand every feature that used it."""
    _assert_can_manage(current_user)

    row = db.query(MapFeatureType).filter(MapFeatureType.id == type_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Map type not found")
    if row.company_id is None:
        raise HTTPException(status_code=403, detail="Built-in types cannot be removed")
    if row.company_id != current_user.company_id and current_user.user_type != "auxein_admin":
        raise HTTPException(status_code=403, detail="Access denied")

    row.is_active = False
    db.commit()
    db.refresh(row)
    return _to_response(row)


# ---------------------------------------------------------------------------
# Used by api/v1/map_features.py, which can no longer validate feature_type
# with a pydantic enum — the valid set is now per-company and needs a session.
# ---------------------------------------------------------------------------
def resolve_feature_type(db: Session, user: User, slug: str) -> MapFeatureType:
    """Validate a feature_type slug for this caller, or raise 422."""
    row = db.query(MapFeatureType).filter(
        MapFeatureType.slug == slug,
        MapFeatureType.is_active.is_(True),
        _visible_types_filter(user),
    ).order_by(
        # Prefer the company's own row if it somehow shadows a system slug.
        MapFeatureType.company_id.isnot(None).desc(),
    ).first()
    if not row:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown map type {slug!r}",
        )
    return row
