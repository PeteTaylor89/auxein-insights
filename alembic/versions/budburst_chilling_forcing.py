"""Chilling-forcing budburst: parameter table and per-site results

Budburst is the one phenological stage Insights has never modelled. The earliest
stage in `phenology_thresholds` is flowering, and budburst appears in the
platform only as a LABEL in `utils/el_scale.py` and as the multiplier
`'budburst': 0.1` in `disease_service_v2.py` -- which is unreachable, because
nothing ever sets the stage that early and a missing stage defaults to
`ripening` = 1.0, the maximum.

## WHY A SECOND TABLE INSTEAD OF COLUMNS ON `phenology_thresholds`

`phenology_thresholds` holds base-0 GDD totals accumulated from a FIXED calendar
date -- 1 September for flowering and veraison, 1 October for harvest. Every one
of its columns is the same kind of number in the same units on the same clock.

Budburst is not that model. It runs from a photoperiod trigger that moves with
latitude, accumulates a dimensionless CHILLING response to a requirement, and
only then accumulates degree-days above a per-cultivar base. Different start,
different units, different base temperature, two requirements rather than one.
Bolting five columns of a different model onto that table would produce a row
where half the numbers are meaningless to whichever service is reading it, and
the first person to average a column would get an answer with no meaning. So:
its own table, joined on `variety_code`.

There is deliberately NO foreign key to `phenology_thresholds`. The two are
independent calibrations of independent models and neither is a parent of the
other -- and in practice `phenology_thresholds` has no Pinot gris row while
APSIM does, so an FK would reject a cultivar we can actually run.

## WHERE THE NUMBERS COME FROM, AND WHY NOT THE PAPER

Zhu et al. (2021), `in silico Plants` 3(2) diab021, is the New Zealand
calibration: Marlborough 2004-2020, validated over five regions covering 93% of
national vineyard area. But its Table 2 is described in the paper itself as "a
partial list of model parameters" and it publishes the RESPONSE FUNCTIONS only.
Neither the chilling requirement nor the forcing requirement appears anywhere in
the paper, and without both the model has no stopping condition.

Both are in `Models/Resources/Grapevine.json` in the ApsimX repository, where
Sauvignon blanc is the BASE model -- its Cultivar node carries an empty command
list, so the base values ARE Sauvignon blanc -- and the other five are overrides.
`Xo`, `b` and `Tb` there match the paper's published 12.42, -3.865 and 0.008
exactly, which is what confirms the resource is the same calibration.

Stored at NUMERIC(10,5), which holds every published value verbatim rather than
rounding it. `f_star` differs by 38% between Sauvignon blanc (1011) and Pinot
noir (627); measured on the 2026 season that difference moved four Central Otago
sites by twelve days, from outside the observed range to inside it. These are not
figures to round for tidiness.

## THE COLUMNS ON `insights_site_phenology` ARE ALL NULLABLE

Following [[bacchus_botrytis_index]] rather than the older `flowering_is_actual`
pattern: a row written before this model existed did not run it, and that is not
the same claim as a chilling total of zero. `variety_is_assumed` is the column
that matters most -- 38 of 68 Pro sites currently have no variety recorded, and
running all five cultivars at those sites produces budburst dates spanning 5 to
20 days. The published validation RMSE for this model is 4.9 days. An assumed
variety is therefore a larger error than the model's own, and a row that cannot
say which it is has no business presenting a date.

Revision ID: budburst_chilling_forcing
Revises: bacchus_botrytis_index
"""
from alembic import op
import sqlalchemy as sa


revision = "budburst_chilling_forcing"
down_revision = "bacchus_botrytis_index"
branch_labels = None
depends_on = None


# (variety_code, variety_name, c_star, xo, b, f_star, t_b)
#
# c_star  chilling requirement, chill-days      Dormancy.Target.BaseTarget
# xo      chilling sigmoid midpoint, degC       Dormancy.Progression.Response.Xo
# b       chilling sigmoid scale, negative      Dormancy.Progression.Response.b
# f_star  forcing requirement, degC-days        Budding.Target
# t_b     forcing base temperature, degC        Budding.Progression.Response.X[1]
#
# Syrah carries Merlot's phenology verbatim in the source resource; it is
# repeated here rather than aliased so a future recalibration of one cannot
# silently move the other.
CULTIVARS = (
    ("SB", "Sauvignon blanc", "52.60000", "12.42000", "-3.86500", "1011.00000", "0.00800"),
    ("CH", "Chardonnay",      "52.06470", "10.98000", "-25.56110", "906.40650", "0.27668"),
    ("PN", "Pinot noir",      "72.10000",  "7.95000", "-45.30830", "627.03820", "0.24400"),
    ("PG", "Pinot gris",      "74.16300", "12.53467", "-66.50920", "519.16880", "1.93454"),
    ("ME", "Merlot",          "88.74292", "15.07995",  "-1.27593", "767.61130", "0.35328"),
    ("SY", "Syrah",           "88.74292", "15.07995",  "-1.27593", "767.61130", "0.35328"),
)

SOURCE = ("APSIM NG Models/Resources/Grapevine.json; "
          "Zhu et al. 2021 in silico Plants 3(2) diab021")

# Critical photoperiod for the onset of endo-dormancy, hours. 13.14 with
# Twilight = 0.0 in the source resource, so it is GEOMETRIC daylength and not
# civil twilight -- the distinction moves the trigger date by 23 days.
# Per-cultivar because the resource says it "depends on grape variety", even
# though all six currently carry the same value.
CRITICAL_PHOTOPERIOD = "13.140"

RESULT_COLUMNS = (
    # The answer, and the date endo-dormancy released. Both nullable: a site
    # whose daily series starts after its own photoperiod trigger cannot compute
    # either, and must say so rather than accumulate from whenever its data
    # happens to begin.
    ("budburst_date", sa.Date()),
    ("endodormancy_date", sa.Date()),

    # Accumulations at `estimate_date`. Recomputed in full every run -- never
    # carried forward -- because the weekly surface refit rewrites D-9..D-3 and
    # a stored running total would outlive the inputs that produced it.
    ("chill_units", sa.Numeric(7, 2)),
    ("forcing_units", sa.Numeric(9, 2)),

    # TRUE where `budburst_date` came from a field observation rather than the
    # model. Nothing writes it yet; Grow's phenology observations are the
    # intended source.
    ("budburst_is_actual", sa.Boolean()),

    # TRUE where the site had no variety recorded and a cultivar was assumed.
    # See the header: this is worth 5-20 days, against a model RMSE of 4.9.
    ("variety_is_assumed", sa.Boolean()),
)


def upgrade():
    op.create_table(
        "budburst_parameters",
        sa.Column("variety_code", sa.String(20), primary_key=True),
        sa.Column("variety_name", sa.String(100), nullable=False),
        sa.Column("c_star", sa.Numeric(10, 5), nullable=False),
        sa.Column("xo", sa.Numeric(10, 5), nullable=False),
        sa.Column("b", sa.Numeric(10, 5), nullable=False),
        sa.Column("f_star", sa.Numeric(10, 5), nullable=False),
        sa.Column("t_b", sa.Numeric(10, 5), nullable=False),
        sa.Column("critical_photoperiod", sa.Numeric(5, 3), nullable=False,
                  server_default=CRITICAL_PHOTOPERIOD),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False,
                  server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    params = sa.table(
        "budburst_parameters",
        sa.column("variety_code", sa.String),
        sa.column("variety_name", sa.String),
        sa.column("c_star", sa.Numeric),
        sa.column("xo", sa.Numeric),
        sa.column("b", sa.Numeric),
        sa.column("f_star", sa.Numeric),
        sa.column("t_b", sa.Numeric),
        sa.column("source", sa.Text),
    )
    op.bulk_insert(params, [
        {
            "variety_code": code,
            "variety_name": name,
            "c_star": c_star,
            "xo": xo,
            "b": b,
            "f_star": f_star,
            "t_b": t_b,
            "source": SOURCE,
        }
        for code, name, c_star, xo, b, f_star, t_b in CULTIVARS
    ])

    for name, type_ in RESULT_COLUMNS:
        op.add_column("insights_site_phenology",
                      sa.Column(name, type_, nullable=True))


def downgrade():
    for name, _ in reversed(RESULT_COLUMNS):
        op.drop_column("insights_site_phenology", name)
    op.drop_table("budburst_parameters")
