# schemas/map_feature_type.py - The POI vocabulary (Maps V2)
#
# The slug is derived server-side from the label rather than accepted from the
# client, so two people typing "Cattle Stop" and "cattle stop" land on the same
# type instead of two that render identically and legend twice.
import re
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


HEX_COLOUR = re.compile(r"^#[0-9a-fA-F]{6}$")
ICON_KEY = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,39}$")


def slugify(label: str) -> str:
    """Lower-case, hyphenated, collapsed. 'Cattle Stop!' -> 'cattle-stop'."""
    s = re.sub(r"[^a-z0-9]+", "-", (label or "").strip().lower())
    return s.strip("-")[:40]


class MapFeatureTypeBase(BaseModel):
    label: str = Field(..., min_length=1, max_length=60)
    icon: str = Field(..., max_length=40)
    colour: str = Field(..., max_length=7)

    @field_validator("colour")
    @classmethod
    def _check_colour(cls, v):
        if not HEX_COLOUR.match(v or ""):
            raise ValueError("colour must be a 6-digit hex like #0369a1")
        return v.lower()

    @field_validator("icon")
    @classmethod
    def _check_icon(cls, v):
        # The endpoint checks it against the real ICON_DEFS allow-list; this
        # only rejects anything that could not be a key at all.
        if not ICON_KEY.match(v or ""):
            raise ValueError("icon must be an icon key, e.g. poiAccess")
        return v


class MapFeatureTypeCreate(MapFeatureTypeBase):
    pass


class MapFeatureTypeUpdate(BaseModel):
    """Every field optional — PATCH semantics.

    `slug` is intentionally absent. Renaming the label does NOT re-slug, because
    the slug is what every existing feature stores; re-slugging would orphan
    them all. The label is the display name and is free to change.
    """
    label: Optional[str] = Field(None, min_length=1, max_length=60)
    icon: Optional[str] = Field(None, max_length=40)
    colour: Optional[str] = Field(None, max_length=7)
    is_active: Optional[bool] = None

    @field_validator("colour")
    @classmethod
    def _check_colour(cls, v):
        if v is None:
            return v
        if not HEX_COLOUR.match(v):
            raise ValueError("colour must be a 6-digit hex like #0369a1")
        return v.lower()

    @field_validator("icon")
    @classmethod
    def _check_icon(cls, v):
        if v is None:
            return v
        if not ICON_KEY.match(v):
            raise ValueError("icon must be an icon key, e.g. poiAccess")
        return v


class MapFeatureTypeResponse(MapFeatureTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: Optional[int] = None
    slug: str
    is_active: bool
    created_at: Optional[datetime] = None

    # Convenience for the client: a system type is read-only in the UI, and
    # deriving that from `company_id is None` in three components is the kind of
    # rule that drifts.
    is_system: bool = False
