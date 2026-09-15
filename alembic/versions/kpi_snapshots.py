"""Platform KPI snapshots, and an explicit internal-company flag

Monthly point-in-time measurements of the platform, taken on the 1st and kept
forever. Scoped in `docs/plans/KPI_DASHBOARD_SCOPE_2026-09-15.md`.

## WHY `companies.is_internal` INSTEAD OF A NAME LIST

Every Grow KPI excludes Auxein's own companies, and the exclusion is not
cosmetic: it removes 3 of 8 companies and 9 of 18 Grow users — half the user
table. Doing that with `name IN ('Auxein', 'Auxein Test', 'App Store Test')`
fails in the worst possible direction. Rename a company, or add "Auxein Demo",
and the filter silently stops matching: the test data is INCLUDED, every figure
inflates, and nothing errors. A flag cannot drift that way, survives renames,
and is one place to change.

Seeded here for the three companies that exist today (7, 24, 17) by name,
because that is the only signal available at migration time. That is a one-off
identification, not an ongoing rule.

## WHY A KEY/VALUE TABLE RATHER THAN A COLUMN PER METRIC

`metric_key` is a string, so adding a KPI is an INSERT, not a migration. The
dashboard renders whatever keys it finds. Seventeen metrics were in the initial
scope and the list will grow.

## WHY BOTH `value` AND `period_value`

Stock metrics (verified users, companies, hectares) are a level: the value at
the snapshot. A running total of them would be meaningless — it would re-count
the same users every month. Flow metrics (tasks completed, observations made)
want both readings: the month's own increment AND cumulative-to-date. So `value`
carries the level or the cumulative, and `period_value` carries the increment,
NULL for stock metrics.

## WHY `meta` IS NOT DECORATION

Several of these numbers are only interpretable alongside the definition in
force when they were taken — which hectare source, which MAU definition, which
exclusions. `meta.source` also separates 'manual' rows (hand-tracked before
automation, and more accurate than any reconstruction — see below) from
'computed' ones. Storing it per row means a later definition change shows up in
the series instead of silently rewriting history.

## WHY UNIQUE (snapshot_date, metric_key)

Makes the job idempotent: a re-run upserts rather than duplicating. Seeding
scripts in this repo have created duplicates on a bare second run before.
"""
from alembic import op
import sqlalchemy as sa


# Keep under 32 characters — a longer slug silently rolls back the DDL.
revision = "kpi_snapshots"
down_revision = "property_insights_site"
branch_labels = None
depends_on = None


# The three internal companies as at 2026-09-15. Identified by name ONCE, here,
# so that nothing downstream ever has to.
INTERNAL_COMPANY_NAMES = ("Auxein", "Auxein Test", "App Store Test")


def upgrade():
    # ── companies.is_internal ───────────────────────────────────────────────
    op.add_column(
        "companies",
        sa.Column(
            "is_internal",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # Partial index: the KPI queries all filter `is_internal = false`, and the
    # false side is the overwhelming majority, so index the true side and let
    # the planner seq-scan what it would have anyway.
    op.create_index(
        "ix_companies_is_internal",
        "companies",
        ["is_internal"],
        postgresql_where=sa.text("is_internal"),
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE companies SET is_internal = true WHERE name IN :names"
        ).bindparams(sa.bindparam("names", value=INTERNAL_COMPANY_NAMES, expanding=True))
    )

    # ── kpi_snapshots ──────────────────────────────────────────────────────
    op.create_table(
        "kpi_snapshots",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        # Always the 1st of a month. The value is the state AT that moment, so
        # the row dated 2026-09-01 describes the month that ended 31 Aug.
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("metric_key", sa.String(64), nullable=False),
        # Numeric, not Integer: hectares and percentages both live here.
        sa.Column("value", sa.Numeric(18, 4), nullable=False),
        sa.Column("period_value", sa.Numeric(18, 4), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("snapshot_date", "metric_key", name="uq_kpi_snapshot"),
    )

    # The dashboard reads one metric's whole series at a time.
    op.create_index(
        "ix_kpi_snapshots_metric_date",
        "kpi_snapshots",
        ["metric_key", "snapshot_date"],
    )


def downgrade():
    op.drop_index("ix_kpi_snapshots_metric_date", table_name="kpi_snapshots")
    op.drop_table("kpi_snapshots")
    op.drop_index("ix_companies_is_internal", table_name="companies")
    op.drop_column("companies", "is_internal")
