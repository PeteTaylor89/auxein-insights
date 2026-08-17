# db/models/map_feature.py - User-drawn map points of interest (Maps V2)
#
# A map feature is ANNOTATION: a gate, a ford, a pump, a slip, a fence line.
# It is deliberately NOT a managed entity — it has no lifecycle, no schedule,
# no compliance meaning. That is why it is its own table rather than being
# bolted onto Asset (which drags in calibration, maintenance and depreciation)
# or SpatialArea (whose geometry column is POLYGON-only, so it physically
# cannot store a point).
#
# NOTE ON HAZARDS: there is deliberately no 'hazard' feature type. Hazards
# belong in SiteRisk, which is the WorkSafe register. Two competing hazard
# registers would be worse than none — see docs/plans/MAP_POI_AND_PRINT.md §A3.
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry

from db.base_class import Base


# App-level vocabulary, NOT a Postgres ENUM. Adding a type should be a code
# change, not a migration plus an ALTER TYPE — same reasoning as
# vineyard_blocks.status being a plain VARCHAR.
FEATURE_TYPES = (
    "access",          # gate, ford, culvert, crossing
    "infrastructure",  # pump, tank, valve, shed, weather station
    "water",           # dam, bore, trough, race
    "amenity",         # toilet, smoko shed, parking
    "note",            # free annotation
)


class MapFeature(Base):
    __tablename__ = "map_features"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)

    # Nullable = a company-wide feature not tied to one property. Every scoped
    # query MUST handle the NULL case explicitly (see build_map_feature_scope_filter
    # in api/v1/map_features.py) — an accidental IN (...) drops these silently.
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=True, index=True)

    feature_type = Column(String(40), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)

    # Generic GEOMETRY, not POINT: the same drawing toolbar produces points,
    # lines (a race, a fence) and polygons (a slip, a frost pocket), MapboxDraw
    # draws all three, and Mapbox GL styles by $type. One column, three shapes.
    geometry = Column(Geometry("GEOMETRY", srid=4326), nullable=False)

    style = Column(JSONB, nullable=True)  # {icon, colour} — bounded user choice
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    # NOT `property` — that name shadows the built-in @property decorator used
    # for geometry_geojson below, and fails at class-definition time with
    # "'_RelationshipDeclared' object is not callable". Asset, Incident and
    # SiteRisk all use `assigned_property` for the same reason.
    assigned_property = relationship("Property", foreign_keys=[property_id])
    created_by = relationship("User", foreign_keys=[created_by_id])

    # No explicit GiST index on `geometry` here: geoalchemy2 creates
    # `idx_map_features_geometry` automatically for a Geometry column. Declaring
    # a second one produced two identical GiST indexes on the same column in
    # prod, which is pure write overhead.
    __table_args__ = (
        Index("ix_map_features_company_active", "company_id", "is_active"),
    )

    @property
    def geometry_geojson(self):
        """PostGIS geometry -> GeoJSON dict, or None if it can't be read."""
        if self.geometry is None:
            return None
        try:
            from geoalchemy2.shape import to_shape
            from shapely.geometry import mapping
            return mapping(to_shape(self.geometry))
        except Exception:
            return None

    def __repr__(self):
        return (
            f"<MapFeature(id={self.id}, {self.feature_type}:{self.name!r}, "
            f"company={self.company_id})>"
        )
