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
    Column, BigInteger, Boolean, Date, Integer, Numeric, SmallInteger, String,
    Text, Float, DateTime, ForeignKey, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import ARRAY

from db.base_class import Base


# A point is movable, but not freely: without a cap "one point per
# subscription" is unenforceable, because a subscriber can sample the whole
# country one move at a time. Two moves buys forgiveness for a mis-click and a
# genuine relocation without buying a survey.
MOVES_PER_WINDOW = 2
MOVE_WINDOW_DAYS = 365


class InsightsSite(Base):
    """One saved point, owned by a subscriber slot OR by an enterprise account.

    EXACTLY ONE OWNER, enforced by `ck_insights_site_one_owner`: either
    `public_user_id` (a Pro slot, where quota and move rules apply) or
    `account_id` (provisioned for a client, where they do not). The constraint
    guards the case that would otherwise go unnoticed — a site with NEITHER
    owner, which no query returns and no page shows, while it goes on being
    extracted nightly.

    `company_id` is still a LABEL and still not the owner. It is the Grow tenant
    resolved through the one-way SSO link, NULL for direct subscribers, and it
    can sit beside `account_id` on a client who is also a Grow customer.
    """
    __tablename__ = 'insights_site'

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # NULLABLE since `alembic/versions/insights_accounts.py`. An account-owned
    # site has no individual owner, and the UNIQUE (public_user_id, slot_index)
    # still holds for Pro slots because Postgres treats NULLs as distinct.
    public_user_id = Column(Integer,
                            ForeignKey('public_users.id', ondelete='CASCADE'),
                            nullable=True, index=True)
    account_id = Column(BigInteger,
                        ForeignKey('insights_account.id', ondelete='CASCADE'),
                        nullable=True, index=True)
    company_id = Column(Integer,
                        ForeignKey('companies.id', ondelete='SET NULL'),
                        nullable=True, index=True)
    # 'pro_slot' | 'account'. What the quota and move rules apply to, and what
    # they do not — nobody moves a client's monitoring network.
    source = Column(Text, nullable=False, server_default='pro_slot')
    # 'regional' | 'sub_regional' | 'phenology', from the client's own list.
    # NULL for a Pro slot, which has no such distinction. The three want
    # different things on screen, which is why it is stored rather than derived.
    site_type = Column(Text, nullable=True)
    # The client's identifier for the place. Their list is the system of record
    # for what a site is called; matching on our label would break the first
    # time somebody tidies a name.
    external_ref = Column(Text, nullable=True)
    # What the client asked for AT THIS SITE, from their own tick columns. NOT
    # derivable from `site_type`: on the BSI list, Nelson AWS is Regional and
    # does not want ET, while Appleby is Regional and wants ET and nothing
    # else. NULL means nobody said — a Pro subscriber's own site.
    requested_metrics = Column(ARRAY(Text), nullable=True)
    # The variety this site is monitored for, in the client's own words.
    # Phenology is a per-variety model, so two rows at one coordinate with
    # different varieties are two answers, not a duplicate.
    variety = Column(Text, nullable=True)
    # Resolved to `phenology_thresholds.variety_code`, or NULL where we hold no
    # thresholds for it. `variety` set with `variety_code` NULL is the signal
    # that a client asked for something the model cannot yet produce — four BSI
    # sites want Pinot gris, which is not in the table.
    variety_code = Column(String(10), nullable=True)
    # Which of the subscriber's entitled slots this occupies. A second point
    # subscription adds a slot rather than replacing the first point. Meaningless
    # for an account site, which is why every account row carries the default.
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

    @property
    def owner_ref(self) -> str:
        """Who this belongs to, for a log line that has to be unambiguous."""
        return (f"account={self.account_id}" if self.account_id
                else f"user={self.public_user_id} slot={self.slot_index}")

    def __repr__(self) -> str:
        return f"<InsightsSite {self.id} {self.owner_ref} {self.status}>"


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


class InsightsSiteProjection(Base):
    """One projected value at this site's cell, and the baseline it moves from.

    Created by `alembic/versions/site_projection.py`; the reasoning is there.
    The point-level twin of `climate_zone_projection`, and the two differ in
    exactly two ways, both because a site is one cell:

    * No `p10` / `p90`. Those describe the spread ACROSS a zone's cells. At a
      point the honest value is absent, not a repeat of the mean.
    * `baseline_value` is sampled from the `kind='baseline'` raster at this
      same cell rather than aggregated out of `climate_zone_monthly`. Same
      provenance, and exact at a point instead of an area mean.

    `delta = projected_value - baseline_value` is stored, not derived at read
    time, so a row stays self-describing if the surfaces are ever re-composed.
    """
    __tablename__ = 'insights_site_projection'

    id = Column(BigInteger, primary_key=True)
    site_id = Column(BigInteger,
                     ForeignKey('insights_site.id', ondelete='CASCADE'),
                     nullable=False, index=True)

    scenario = Column(Text, nullable=False)
    period = Column(Text, nullable=False)
    season = Column(Text, nullable=False)
    variable = Column(Text, nullable=False)
    statistic = Column(Text, nullable=False)

    # NULL where this cell is off the land mask on that raster. NEVER zero.
    baseline_value = Column(Float, nullable=True)
    projected_value = Column(Float, nullable=True)
    delta = Column(Float, nullable=True)

    unit = Column(Text, nullable=True)
    model_version = Column(Text, nullable=True)
    rule = Column(Text, nullable=True)
    # The cell sampled. A site can be MOVED, and a row read before the move
    # describes the old cell — this is what lets a reader tell.
    grid_key = Column(Text, nullable=True)
    extracted_at = Column(DateTime(timezone=True), server_default=func.now(),
                          nullable=False)

    __table_args__ = (
        UniqueConstraint('site_id', 'scenario', 'period', 'season',
                         'variable', 'statistic',
                         name='uq_site_projection_cell'),
    )

    def __repr__(self) -> str:
        return (f"<InsightsSiteProjection {self.site_id} {self.scenario}/"
                f"{self.period} {self.variable}.{self.statistic}>")


class InsightsSiteYield(Base):
    """Harvest yield at a site. ENTERED BY THE CLIENT, never modelled.

    Created by `alembic/versions/insights_accounts.py`. This is the only table
    in the site family whose values do not come from a surface, and nothing
    about it may imply otherwise — there is no yield model on this platform.

    `entered_by` is not bookkeeping. A number nobody can attribute is a number
    nobody will trust six months later, and this one will be read beside modelled
    figures that carry their own provenance.
    """
    __tablename__ = 'insights_site_yield'

    site_id = Column(BigInteger,
                     ForeignKey('insights_site.id', ondelete='CASCADE'),
                     primary_key=True)
    # The HARVEST year, matching `InsightsSiteSeason.vintage_year` and the
    # Sep-Apr season everything else at this site is labelled by.
    vintage_year = Column(SmallInteger, primary_key=True)
    # 'ALL' where the client reports one figure for the site. A per-variety
    # breakdown uses the variety codes `phenology_thresholds` already carries.
    variety_code = Column(Text, primary_key=True, server_default='ALL')

    value = Column(Float, nullable=True)
    # Stored, never assumed. t/ha and kg/vine are both in normal use, and a
    # column that silently means one of them is a number nobody can check.
    unit = Column(Text, nullable=False, server_default='t/ha')
    note = Column(Text, nullable=True)
    entered_by = Column(Integer,
                        ForeignKey('public_users.id', ondelete='SET NULL'),
                        nullable=True)
    entered_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)

    def __repr__(self) -> str:
        return (f"<InsightsSiteYield {self.site_id} {self.vintage_year} "
                f"{self.variety_code}>")


class InsightsSitePhenology(Base):
    """Phenology computed at this site's cell, with the region's figure beside it.

    Created by `alembic/versions/site_phenology.py`. The Pro page previously
    read `phenology_estimates` through `site.zone_id`, so a subscriber's own
    point showed their REGION's dates while looking site-specific.

    `zone_*` columns are STORED, not joined. The zone model runs on its own
    schedule and overwrites its rows, so a read-time join compares today's site
    estimate against whatever the zone happens to hold now, and the two drift
    apart with nothing to show it. The comparison is the product here — a grower
    asks whether they are ahead of the district, not when they will flower — so
    both halves have to carry the same estimate date.

    The SPREAD across an account's sites in one zone is deliberately absent. It
    depends on which sites exist, so a stored percentile would go stale, and
    silently, the moment a site is added.
    """
    __tablename__ = 'insights_site_phenology'

    site_id = Column(BigInteger,
                     ForeignKey('insights_site.id', ondelete='CASCADE'),
                     primary_key=True)
    variety_code = Column(String(10), primary_key=True)
    # Rolls on 1 JULY, matching `phenology_estimates`. The accumulation below
    # starts on 1 September. Two different rules, both load-bearing.
    vintage_year = Column(SmallInteger, primary_key=True)
    estimate_date = Column(Date, primary_key=True)

    # Base 0 from 1 September. `insights_site_daily.gdd_cumulative` already
    # starts there, so this is read rather than derived from a July total.
    gdd_accumulated = Column(Numeric(8, 2), nullable=True)
    # Base 0 from 1 October, which is what the harvest thresholds are
    # calibrated against. One accumulation cannot serve both.
    gdd_from_oct1 = Column(Numeric(8, 2), nullable=True)
    current_stage = Column(String(30), nullable=True)
    # Every projected date is a GDD shortfall divided by this. Stored so a date
    # can be argued with rather than merely believed.
    avg_daily_gdd = Column(Numeric(6, 2), nullable=True)

    flowering_date = Column(Date, nullable=True)
    flowering_is_actual = Column(Boolean, nullable=False, server_default='false')
    veraison_date = Column(Date, nullable=True)
    veraison_is_actual = Column(Boolean, nullable=False, server_default='false')
    harvest_170_date = Column(Date, nullable=True)
    harvest_180_date = Column(Date, nullable=True)
    harvest_190_date = Column(Date, nullable=True)
    harvest_200_date = Column(Date, nullable=True)
    harvest_210_date = Column(Date, nullable=True)
    harvest_220_date = Column(Date, nullable=True)

    # Against the SITE's own 1986-2005 baseline, not the zone's.
    days_vs_baseline = Column(Integer, nullable=True)
    gdd_vs_baseline = Column(Numeric(8, 2), nullable=True)
    # NULL where the site has no zone, or the zone has no daily baseline.
    # Absent, never zero, and it names which baseline was used.
    baseline_source = Column(Text, nullable=True)

    zone_id = Column(Integer,
                     ForeignKey('climate_zones.id', ondelete='SET NULL'),
                     nullable=True)
    zone_gdd_accumulated = Column(Numeric(8, 2), nullable=True)
    zone_flowering_date = Column(Date, nullable=True)
    zone_veraison_date = Column(Date, nullable=True)
    zone_harvest_210_date = Column(Date, nullable=True)

    confidence = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)

    def __repr__(self) -> str:
        return (f"<InsightsSitePhenology {self.site_id} {self.variety_code} "
                f"{self.vintage_year} {self.estimate_date}>")
