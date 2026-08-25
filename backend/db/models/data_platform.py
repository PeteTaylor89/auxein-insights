# db/models/data_platform.py
"""
Data Ingestion Platform catalog models.

Phase 0.1 of DATA_INGESTION_PLATFORM_PLAN.md.

Introduces the generic catalog layer that will back the future devices /
timeseries_observations rename:

  - Country:             global country registry (hemisphere, vintage convention,
                         default TZ) — replaces hardcoded NZ assumptions.
  - DataSource:          catalog of ingestion providers (HARVEST, BoM, councils).
  - MeasurementCatalog:  canonical variable registry (temp, rh, pump_flow, ...).
  - IngestionCredential: per-provider / per-company API credential registry
                         (Secrets Manager ARN or env var fallback).
  - DeviceMeasurement:   which measurements a given device reports, with the
                         provider's source label + unit. Replaces hardcoded
                         per-source measurement_map dicts.

Back-compat note: DeviceMeasurement.device_id FKs to weather_stations.station_id
for now. A later migration renames weather_stations -> devices and the FK target
updates in place.
"""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey,
    UniqueConstraint, CheckConstraint, Index, text,
)
from sqlalchemy.orm import relationship

from db.base_class import Base


class Country(Base):
    __tablename__ = 'countries'

    id = Column(Integer, primary_key=True, autoincrement=True)
    iso2 = Column(String(2), nullable=False, unique=True, index=True)
    iso3 = Column(String(3), nullable=True)
    name = Column(String(100), nullable=False)
    hemisphere = Column(String(1), nullable=False)  # 'N' | 'S'
    vintage_start_month = Column(Integer, nullable=False)  # 1-12

    # The GROWING season start (1 September for NZ wine), which is NOT the same
    # quantity as vintage_start_month (July) — that one is the vintage-year
    # boundary. Conflating them silently shifts every seasonal total.
    # Added by `country_industry_dim`. Nothing reads it yet: the services keep
    # their SEASON_START_MONTH constant until a Northern Hemisphere country
    # exists, because Australia is Southern Hemisphere and needs no change.
    # Known limitation: on `countries`, so it is correct only while every active
    # industry in a country shares a season start. Kiwifruit does not start in
    # September; when a second industry activates this moves to a
    # (country, industry) grain.
    season_start_month = Column(Integer, nullable=False, server_default='9')

    default_timezone = Column(String(50), nullable=False)  # IANA TZ
    is_active = Column(Boolean, nullable=False, server_default=text('true'))
    display_order = Column(Integer, nullable=False, server_default='0')
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

    __table_args__ = (
        CheckConstraint("hemisphere IN ('N','S')", name='ck_countries_hemisphere'),
        CheckConstraint('vintage_start_month BETWEEN 1 AND 12', name='ck_countries_vintage_month'),
        CheckConstraint('season_start_month BETWEEN 1 AND 12', name='ck_countries_season_month'),
    )

    def __repr__(self):
        return f"<Country(iso2='{self.iso2}', name='{self.name}')>"


class Industry(Base):
    """Primary industries the platform covers.

    Created by `country_industry_dim` to replace the hardcoded INDUSTRIES array
    in `packages/insights/src/components/home/IndustryChips.jsx`. `is_active`
    is the launch gate — wine is true, the other four are visibly pending.

    `key` is the URL segment: /nz/wine/marlborough. `icon` names a lucide-react
    export so the chips keep their glyphs without a second source of truth.

    An industry owns its own `climate_zones` ROWS rather than sharing them: a
    kiwifruit "Bay of Plenty" is block-intersected against kiwifruit plantings
    and is a different polygon from the wine zone of the same name.
    """
    __tablename__ = 'industries'

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(30), nullable=False, unique=True, index=True)
    name = Column(String(100), nullable=False)
    icon = Column(String(50), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text('false'))
    display_order = Column(Integer, nullable=False, server_default='0')
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

    def __repr__(self):
        return f"<Industry(key='{self.key}', active={self.is_active})>"


class DataSource(Base):
    __tablename__ = 'data_sources'

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    kind = Column(String(50), nullable=False)  # weather | hydrology | operational | alerts | mixed
    api_pattern = Column(String(50), nullable=True)  # hilltop | rest | ftp | csv | scrape
    base_url = Column(Text, nullable=True)
    requires_credentials = Column(Boolean, nullable=False, server_default=text('false'))
    country_id = Column(Integer, ForeignKey('countries.id'), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, server_default=text('true'))
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

    country = relationship('Country', backref='data_sources')

    __table_args__ = (
        CheckConstraint(
            "kind IN ('weather','hydrology','operational','alerts','mixed')",
            name='ck_data_sources_kind',
        ),
    )

    def __repr__(self):
        return f"<DataSource(code='{self.code}', kind='{self.kind}')>"


class MeasurementCatalog(Base):
    __tablename__ = 'measurement_catalog'

    code = Column(String(50), primary_key=True)
    display_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    canonical_unit = Column(String(20), nullable=False)
    value_type = Column(String(20), nullable=False)  # continuous | cumulative | boolean | categorical
    rollup_method = Column(String(20), nullable=False)  # mean | sum | last | max | min | any_true
    domain = Column(String(50), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, server_default=text('true'))
    display_order = Column(Integer, nullable=False, server_default='0')
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

    __table_args__ = (
        CheckConstraint(
            "value_type IN ('continuous','cumulative','boolean','categorical')",
            name='ck_measurement_value_type',
        ),
        CheckConstraint(
            "rollup_method IN ('mean','sum','last','max','min','any_true')",
            name='ck_measurement_rollup',
        ),
    )

    def __repr__(self):
        return f"<MeasurementCatalog(code='{self.code}', domain='{self.domain}')>"


class IngestionCredential(Base):
    __tablename__ = 'ingestion_credentials'

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(50), nullable=False, index=True)  # matches data_sources.code
    name = Column(String(100), nullable=False)
    secret_arn = Column(Text, nullable=True)  # AWS Secrets Manager ARN
    env_var_fallback = Column(String(100), nullable=True)  # e.g. 'HARVEST_API_KEY'
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, server_default=text('true'))
    rotated_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

    company = relationship('Company', backref='ingestion_credentials')

    __table_args__ = (
        UniqueConstraint('provider', 'name', name='uq_ingestion_credentials_provider_name'),
    )

    def __repr__(self):
        return f"<IngestionCredential(provider='{self.provider}', name='{self.name}')>"


class DeviceMeasurement(Base):
    """
    Which measurements a given device reports.

    Replaces the hardcoded measurement_map dicts inside each ingestion source
    class. Populated from existing dicts in Phase C; during Phase 0.1 this
    table is empty and ingestion continues to read from the Python configs.
    """
    __tablename__ = 'device_measurements'

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(
        Integer,
        ForeignKey('weather_stations.station_id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    measurement_code = Column(
        String(50),
        ForeignKey('measurement_catalog.code'),
        nullable=False,
        index=True,
    )
    source_measurement_name = Column(String(200), nullable=True)  # provider's label
    unit = Column(String(20), nullable=True)  # source unit (may differ from canonical)
    is_primary = Column(Boolean, nullable=False, server_default=text('true'))
    is_active = Column(Boolean, nullable=False, server_default=text('true'))
    created_at = Column(DateTime(timezone=True), server_default=text('NOW()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('NOW()'))

    measurement = relationship('MeasurementCatalog', backref='device_measurements')

    __table_args__ = (
        UniqueConstraint('device_id', 'measurement_code', name='uq_device_measurements_device_code'),
    )

    def __repr__(self):
        return f"<DeviceMeasurement(device_id={self.device_id}, code='{self.measurement_code}')>"
