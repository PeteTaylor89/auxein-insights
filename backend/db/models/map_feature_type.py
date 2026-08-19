# db/models/map_feature_type.py - The POI vocabulary (Maps V2)
#
# `map_features.feature_type` was always a plain VARCHAR rather than a Postgres
# ENUM, precisely so the vocabulary could grow without an ALTER TYPE. What was
# missing was somewhere for a type to *exist* before a feature used it — so the
# picker could offer it, the legend could name it, and a rename could happen in
# one place instead of across every row.
#
# company_id NULL means a SYSTEM type: the original five, visible to everyone,
# not editable and not deletable. A company row is that company's own.
#
# There is deliberately NO foreign key from map_features.feature_type to this
# table. The slug is already the join key, and a hard FK would refuse to retire
# a type that historical features still reference — which is exactly the case
# `is_active` exists to serve.
#
# HAZARDS: the POI feature has always refused a `hazard` type, because hazards
# belong in SiteRisk, which is the WorkSafe register, and two competing hazard
# registers are worse than none. Free text would have driven straight through
# that prohibition, so the reserved-word guard in api/v1/map_feature_types.py
# now carries it instead of the old closed enum.
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from db.base_class import Base


# The five that shipped with the feature on 2026-08-17. Seeded as system rows
# by the add_map_feature_types migration; kept here because the seed and the
# runtime fallback must not drift.
SYSTEM_FEATURE_TYPES = (
    # slug,            label,            icon,                  colour
    ("access",         "Access",         "poiAccess",           "#0369a1"),
    ("infrastructure", "Infrastructure", "poiInfrastructure",   "#6b7280"),
    ("water",          "Water",          "poiWater",            "#0891b2"),
    ("amenity",        "Amenity",        "poiAmenity",          "#7c3aed"),
    ("note",           "Note",           "poiNote",             "#2F2F2F"),
)

SYSTEM_SLUGS = frozenset(s for s, _, _, _ in SYSTEM_FEATURE_TYPES)


class MapFeatureType(Base):
    __tablename__ = "map_feature_types"

    id = Column(Integer, primary_key=True, index=True)

    # NULL = system type. Every scoped query MUST handle the NULL branch
    # explicitly — the same trap map_features.property_id has, where a plain
    # `IN (...)` silently drops the shared rows.
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)

    # What lands in map_features.feature_type. Lower-case, hyphenated.
    slug = Column(String(40), nullable=False, index=True)
    # What the user typed, in their own casing.
    label = Column(String(60), nullable=False)

    # A key in ICON_DEFS (maps-v2/utils/mapIcons.js). Not a path or a URL: the
    # icons are canvas-drawn stroke geometry so they can be re-rendered at any
    # size, from a 20px legend chip to an A0 marker.
    icon = Column(String(40), nullable=False)
    colour = Column(String(7), nullable=False)

    # Soft delete. A retired type leaves the picker but keeps rendering and
    # legending the features that already use it.
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    created_by = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        # One slug per company. System rows (company_id NULL) are not covered by
        # this in Postgres — NULLs are distinct in a UNIQUE constraint — so the
        # migration adds a partial unique index for them separately.
        UniqueConstraint("company_id", "slug", name="uq_map_feature_type_company_slug"),
        Index("ix_map_feature_type_company_active", "company_id", "is_active"),
    )

    def __repr__(self):
        scope = "system" if self.company_id is None else f"company={self.company_id}"
        return f"<MapFeatureType {self.slug} ({scope})>"
