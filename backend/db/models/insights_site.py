"""Pro sites — a subscriber's own point, and its extracted climate record.

Tables created by `alembic/versions/insights_pro_sites.py`; the reasoning for
the shape lives there and is not repeated. Two things are restated here because
they read as omissions otherwise:

* `InsightsSiteMonthly` / `InsightsSiteSeason` carry a single `value` and no
  spread. A site is ONE 500 m cell, so it has a value rather than a
  distribution — unlike the zone tables, whose min/max/p10/p90 describe real
  vineyards across a region. Comparing a site to that spread is a join, not a
  column.

* `company_id` is a label, not the owner. The owner is `public_user_id`;
  `public_users` has no company of its own, so this is resolved through the Grow
  SSO link at placement and is NULL for direct Insights subscribers.
"""

from sqlalchemy import (
    Column, BigInteger, Date, Integer, SmallInteger, String, Text, Float,
    DateTime, ForeignKey, func
)

from db.base_class import Base


# A point is movable, but not freely: without a cap "one point per
# subscription" is unenforceable, because a subscriber can sample the whole
# country one move at a time. Two moves buys forgiveness for a mis-click and a
# genuine relocation without buying a survey.
MOVES_PER_WINDOW = 2
MOVE_WINDOW_DAYS = 365


class InsightsSite(Base):
    """One saved point belonging to one subscriber slot."""
    __tablename__ = 'insights_site'

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    public_user_id = Column(Integer,
                            ForeignKey('public_users.id', ondelete='CASCADE'),
                            nullable=False, index=True)
    company_id = Column(Integer,
                        ForeignKey('companies.id', ondelete='SET NULL'),
                        nullable=True, index=True)
    # Which of the subscriber's entitled slots this occupies. A second point
    # subscription adds a slot rather than replacing the first point.
    slot_index = Column(SmallInteger, nullable=False, server_default='0')

    label = Column(String(80), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    elevation_m = Column(Float, nullable=True)

    # The resolved surface cell, plus the grid those indices belong to.
    grid_row = Column(Integer, nullable=True)
    grid_col = Column(Integer, nullable=True)
    grid_key = Column(Text, nullable=True)

    # Regional comparator. NULL is legitimate — Pro is not wine-only, and a site
    # outside every zone simply has no regional background to sit against.
    zone_id = Column(Integer, ForeignKey('climate_zones.id', ondelete='SET NULL'),
                     nullable=True)

    status = Column(Text, nullable=False, server_default='populating')
    status_detail = Column(Text, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now(),
                          nullable=False)
    populated_at = Column(DateTime(timezone=True), nullable=True)

    moves_used = Column(SmallInteger, nullable=False, server_default='0')
    move_window_start = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(),
                        nullable=True)

    @property
    def is_ready(self) -> bool:
        return self.status == 'ready'

    def __repr__(self) -> str:
        return (f"<InsightsSite {self.id} user={self.public_user_id} "
                f"slot={self.slot_index} {self.status}>")


class InsightsSiteMonthly(Base):
    """One (variable, statistic) at one month, at this site's cell."""
    __tablename__ = 'insights_site_monthly'

    site_id = Column(BigInteger,
                     ForeignKey('insights_site.id', ondelete='CASCADE'),
                     primary_key=True)
    variable = Column(Text, primary_key=True)
    statistic = Column(Text, primary_key=True)
    year = Column(SmallInteger, primary_key=True)
    month = Column(SmallInteger, primary_key=True)

    # NULL means the surface held no value at this cell for that month. It is
    # NEVER zero — B4.1 was a null-rainfall-written-as-zero bug and this table
    # is the same shape of trap.
    value = Column(Float, nullable=True)

    def __repr__(self) -> str:
        return (f"<InsightsSiteMonthly {self.site_id} {self.variable}/"
                f"{self.statistic} {self.year}-{self.month:02d}>")


class InsightsSiteDaily(Base):
    """One day at this site's cell, from the live daily surface.

    Created by `alembic/versions/insights_site_daily.py`; the reasoning is
    there. The two things that read as omissions from here:

    * Four columns rather than the (variable, statistic) keying of
      `InsightsSiteMonthly`, because a daily surface has no statistic — it is
      the value, not an aggregate over a period.
    * (site_id, date) is the whole key so that writing a day is an UPSERT. The
      engine re-fits D-9..D-3 weekly and those values CHANGE; a row written once
      and never corrected would drift away from the surface it claims to come
      from.
    """
    __tablename__ = 'insights_site_daily'

    site_id = Column(BigInteger,
                     ForeignKey('insights_site.id', ondelete='CASCADE'),
                     primary_key=True)
    date = Column(Date, primary_key=True)

    # NULL means the surface held no value at this cell on that day. NEVER
    # zero — an absent rainfall day and a dry day are different facts.
    temp_min = Column(Float, nullable=True)
    temp_max = Column(Float, nullable=True)
    temp_mean = Column(Float, nullable=True)
    rainfall_mm = Column(Float, nullable=True)

    # Which era this day came from. The live surface and the archive share an
    # estimator but not their observations, and the offset between them is
    # measured, not negligible.
    model_version = Column(Text, nullable=True)
    extracted_at = Column(DateTime(timezone=True), server_default=func.now(),
                          nullable=False)

    def __repr__(self) -> str:
        return f"<InsightsSiteDaily {self.site_id} {self.date}>"


class InsightsSiteSeason(Base):
    """One growing-season metric at this site. Sep-Apr, labelled by vintage."""
    __tablename__ = 'insights_site_season'

    site_id = Column(BigInteger,
                     ForeignKey('insights_site.id', ondelete='CASCADE'),
                     primary_key=True)
    vintage_year = Column(SmallInteger, primary_key=True)
    metric = Column(Text, primary_key=True)

    value = Column(Float, nullable=True)
    unit = Column(Text, nullable=False)
    # Set only for metrics that depend on a baseline period (r99p). Same
    # convention as climate_zone_surface_season, so the site value and the zone
    # value are comparable only when these agree — which the API checks.
    baseline = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return (f"<InsightsSiteSeason {self.site_id} {self.vintage_year} "
                f"{self.metric}>")
