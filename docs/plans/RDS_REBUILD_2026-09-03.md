# RDS rebuild — `auxein-db` → `auxein-db-v2`

**Status:** SCOPED, NOT STARTED. Nothing has been modified.
**Written:** 2026-09-03
**Author:** scoped from live AWS + database inspection, not from documentation.

Every value in this document was read from the live account or the live database
on 2026-09-03. Where a step needs a secret, it names the parameter, never the
value — no credential appears in this file.

---

## 1. Read this first: what the rebuild actually buys

The rebuild is **not** the biggest cost lever, and three of the four wins do not
need a maintenance window at all. Do not take an outage for savings you can have
for free.

| Change | Annual saving | Needs a window? |
|---|---|---|
| `db.t3.medium` → `db.t4g.medium` | $87 | No — 5 min reboot |
| 1-year Reserved Instance on t4g.medium | $244 more | No |
| **100 GB gp2 → 50 GB gp3** | **$83** | **Yes — rebuild only** |
| **Move AZ 2b → 2a (co-locate)** | **~$80 of the $136** | **Yes — rebuild only** |

**The rebuild-only portion is roughly $163/yr.** Everything else is reachable
with a reboot. Decide deliberately whether ~$163/yr justifies a 4-hour outage
and the risk of a full data migration.

The honest argument *for* doing it anyway: the AZ move also removes cross-AZ
latency from every query the Fargate pipeline makes, and the gp3 move takes
baseline IOPS from 300 to 3,000. Those are operational wins the money doesn't
capture. If you are doing it for latency and headroom, it is worth it. If you
are doing it purely for $163, it is not.

### Do these first — no window required

These are independent of the rebuild and reduce risk regardless of whether it
goes ahead.

1. **Enable storage autoscaling.** `MaxAllocatedStorage` currently equals
   `AllocatedStorage` (both 100), so autoscaling is **off** and the instance
   will hard-fail when the volume fills. At ~2.8 GB/month growth against 28 GB
   used that is years away now, but there is no reason to leave the cliff in
   place.
   ```bash
   aws rds modify-db-instance --region ap-southeast-2 \
       --db-instance-identifier auxein-db \
       --max-allocated-storage 200 --apply-immediately
   ```
   No downtime, no reboot.

2. **Enable deletion protection.** Currently `DeletionProtection: false` on the
   production database.
   ```bash
   aws rds modify-db-instance --region ap-southeast-2 \
       --db-instance-identifier auxein-db \
       --deletion-protection --apply-immediately
   ```
   Note: this must be turned **off** again before step 9.3 decommissions the old
   instance.

3. **Re-class to `db.t4g.medium`** in the normal maintenance window (no
   `--apply-immediately`). See §10 for why this is a lateral move on capacity,
   not a downsize.

---

## 2. Current state (verified 2026-09-03)

### Instance

| Property | Value |
|---|---|
| Identifier | `auxein-db` |
| Endpoint | `auxein-db.cnmusikiqmmn.ap-southeast-2.rds.amazonaws.com:5432` |
| Class | `db.t3.medium` (2 vCPU, 4 GB) |
| Engine | `postgres` 17.9 |
| Storage | 100 GB **gp2**, encrypted |
| KMS key | `arn:aws:kms:ap-southeast-2:992914515416:key/fb12c101-2aa4-4878-9e56-26d74c5cbc9b` |
| `MaxAllocatedStorage` | 100 (**autoscaling off**) |
| AZ | **`ap-southeast-2b`** |
| Multi-AZ | false |
| Publicly accessible | **true** |
| Master user | `auxein_admin` |
| Default DB | `auxein_db` |
| Parameter group | `default.postgres17` (**no custom group**) |
| Option group | `default:postgres-17` |
| Security group | `sg-011550f434d067f69` |
| Subnet group | `default-vpc-03a13bd8504825dd9` (VPC `vpc-03a13bd8504825dd9`) |
| CA certificate | `rds-ca-rsa2048-g1` |
| Backup retention | 7 days |
| Backup window | `11:00–11:30 UTC` = **23:00–23:30 NZST** |
| Maintenance window | `thu:17:57–18:27 UTC` = **Fri 05:57–06:27 NZST** |
| Performance Insights | enabled |
| Enhanced Monitoring | off (`MonitoringInterval: 0`) |
| Deletion protection | **false** |
| Tags | none |

### Database contents

| | |
|---|---|
| Size | **28 GB** (was 49.7 GB before the `climate_historical_data` truncate) |
| Schemas | `public`, `taste` (9 tables), `topology` (**empty**) |
| Extensions | `postgis 3.5.1`, `postgis_topology 3.5.1`, `pg_stat_statements 1.11`, `plpgsql 1.0` |
| Roles | `auxein_admin` only (not a superuser — RDS master) |
| Tables / views / matviews / sequences | 262 / 151 / 0 / 115 |
| Partitioned parents | `timeseries_observations` (**47 partitions**) |
| Geometry / geography columns | 25 |
| `spatial_ref_sys` | exactly 8,500 rows = **stock PostGIS 3.5, no custom SRIDs** |
| `alembic_version` | single row, `invite_role_general` (no dual-row drift) |

The `spatial_ref_sys` and empty-`topology` findings matter: they let the dump
exclude both and let the target's extension supply them. Verify §5.1 again on
the night — a custom SRID added between now and then would change this.

### Compute placement — the reason for the move

| Resource | AZ | Talks to RDS |
|---|---|---|
| **`auxein-db`** | **2b** | — |
| Fargate `auxein-jobs` (all 6 schedules) | **2a** (`subnet-0317587a16a8b5e59`) | heavily |
| `auxein-ingest` (t3.micro) | **2a** | heavily |
| `auxein-api-prod-lb` node 1 | **2a** | yes |
| `auxein-api-prod-lb` node 2 | **2c** | yes |
| `auxein-taste-prod` (t3.micro) | **2c** | lightly |

**Nothing is co-located with the database.** 100% of DB traffic crosses an AZ
boundary — 183 GB/month, $11.31/month.

Subnet map:

| Subnet | AZ |
|---|---|
| `subnet-0317587a16a8b5e59` | ap-southeast-2a |
| `subnet-0fb4f714bb20de0ab` | ap-southeast-2b |
| `subnet-0bc2aa111e7bed555` | ap-southeast-2c |

---

## 3. Target state

| Property | Value | Change |
|---|---|---|
| Identifier | `auxein-db-v2` | new |
| Class | `db.t4g.medium` | Graviton, −9% |
| Storage | **50 GB gp3**, autoscale to 200 | −50 GB, 300→3,000 IOPS |
| AZ | **`ap-southeast-2a`** | co-located |
| Parameter group | **`auxein-pg17`** (custom) | enables tuning + logical replication |
| Publicly accessible | decide — see §11 | |
| Everything else | unchanged | same KMS key, SG, engine 17.9, 7-day backups |

### Why 2a and not 2b or 2c

2a is the only choice that co-locates the **heaviest** consumers: all six Fargate
schedules and the ingest box, plus one of the two API nodes. Traffic from the
2c API node and `auxein-taste-prod` still crosses — this reduces cross-AZ
traffic by roughly 60%, it does not eliminate it. Eliminating it entirely would
mean collapsing the EB environment to a single AZ, which costs you ALB
redundancy. Not worth it.

### Why 50 GB and not 100

28 GB used, growing ~2.8 GB/month. 50 GB gives ~7 months of headroom on its own,
which is too tight — but with autoscaling to 200 GB enabled from day one there
is no cliff, and you only pay for what is allocated. This is the combination
that is impossible today: RDS **cannot shrink `AllocatedStorage` in place**, so
50 GB is reachable only by rebuilding.

---

## 4. Choosing the window

Scheduled jobs, all `Pacific/Auckland` (from EventBridge Scheduler):

| Schedule | Cron | NZ time |
|---|---|---|
| `auxein-pipeline-aggregate` | `cron(20 1,6,13,19 * * ? *)` | 01:20, 06:20, 13:20, **19:20** |
| `auxein-surfaces-daily` | `cron(30 6 * * ? *)` | 06:30 |
| `auxein-pipeline-morning` | `cron(50 6 * * ? *)` | 06:50 |
| `auxein-surfaces-daily-final` | `cron(0 15 * * ? *)` | 15:00 |
| `auxein-pipeline-daily` | `cron(0 18 * * ? *)` | 18:00 |
| `auxein-surfaces-refit` | `cron(0 4 ? * SUN *)` | Sun 04:00 |

**The only long quiet gap is 19:30 → 01:15 NZ** (~5h45m). Everything else is
under 6 hours and lands in business hours.

> **Recommended window: Tuesday or Wednesday, 20:00 → 00:30 NZ.**
> Avoid Sunday (04:00 refit) and avoid Thursday night (the RDS maintenance
> window is Fri 05:57–06:27 NZST — do not stack them).

Two collisions to handle:

- **The automated backup window is 23:00–23:30 NZST and falls inside the
  recommended window.** A snapshot mid-restore is not dangerous but it competes
  for I/O. Either finish the restore before 23:00, or temporarily shift the
  backup window on the *old* instance before you start.
- **The existing maintenance window (Fri 05:57–06:27 NZST) sits 33 minutes
  before `auxein-surfaces-daily` at 06:30 and 53 minutes before
  `auxein-pipeline-morning` at 06:50.** That is uncomfortably tight
  independently of this work — an RDS patch reboot that overruns takes out the
  morning chain. Worth moving to the 20:00–01:00 gap as a separate change.

**Budget 4 hours of hands-on time inside a 4h30m window** for Path A. See §8 for
the low-downtime alternative if that is unacceptable.

---

## 5. Pre-flight — the week before

### 5.1 Re-verify the two dump assumptions

Both were true on 2026-09-03; re-check on the night, because either changing
would silently lose data.

```sql
-- MUST return exactly 8500 (stock PostGIS 3.5). Anything higher means custom
-- SRIDs exist and spatial_ref_sys must NOT be excluded from the dump.
SELECT count(*) FROM spatial_ref_sys;

-- MUST both return 0. Non-zero means the topology schema holds real data and
-- must not be excluded.
SELECT count(*) FROM topology.topology;
SELECT count(*) FROM topology.layer;

-- Note the value; it must match exactly after the restore.
SELECT version_num FROM alembic_version;
```

> Use `SELECT version_num FROM alembic_version`, **not** `alembic current` — see
> the dual-row gotcha in project memory.

### 5.2 Capture the pre-migration fingerprint

Run this and keep the output. It is the acceptance test for §9.

```bash
psql "$OLD_URL" -At -F',' -f - <<'SQL' > pre-migration-fingerprint.csv
SELECT n.nspname||'.'||c.relname, c.relkind, c.reltuples::bigint
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','S') AND n.nspname IN ('public','taste')
ORDER BY 1;
SQL

# Exact counts for the tables that matter. Slow but worth it.
psql "$OLD_URL" -At -F',' -c "
SELECT 'timeseries_observations', count(*) FROM timeseries_observations
UNION ALL SELECT 'primary_parcels', count(*) FROM primary_parcels
UNION ALL SELECT 'vineyard_blocks', count(*) FROM vineyard_blocks
UNION ALL SELECT 'insights_site_monthly', count(*) FROM insights_site_monthly
UNION ALL SELECT 'climate_zone_surface_monthly', count(*) FROM climate_zone_surface_monthly
UNION ALL SELECT 'weather_data_daily', count(*) FROM weather_data_daily
UNION ALL SELECT 'public_users', count(*) FROM public_users
ORDER BY 1;" >> pre-migration-fingerprint.csv
```

### 5.3 Build the custom parameter group

`default.postgres17` cannot be modified. Create the group now so it is ready and
so you have somewhere to tune `work_mem` later.

```bash
aws rds create-db-parameter-group --region ap-southeast-2 \
    --db-parameter-group-name auxein-pg17 \
    --db-parameter-group-family postgres17 \
    --description "Auxein production PG17 - custom tuning"
```

Leave every parameter at default for the migration itself. Changing engine
tuning and hardware in the same change makes a regression impossible to
attribute.

### 5.4 Stand up the migration host

**Do not run the dump from the workstation.** The database is publicly
accessible, so a workstation dump pulls 28 GB over the internet — slow, and it
is billed as internet egress.

Launch a temporary instance **in `subnet-0317587a16a8b5e59` (2a)**:

- `m7g.large` (2 vCPU, 8 GB), 100 GB gp3 root volume
- Security group must be allowed inbound on 5432 by `sg-011550f434d067f69`
- Install the client matching the server: `postgresql17` client tools
- Cost: ~$0.12/hr. Under $1 for the whole exercise. **Terminate it in §9.4.**

Verify the client version matches — a `pg_dump` older than the 17.9 server will
refuse, and an older `pg_restore` mishandles partitioned tables.

```bash
pg_dump --version    # must be 17.x
psql --version
```

### 5.5 Dry run

Do a full timed rehearsal against a **restored copy** of production, not against
production. Restore the most recent snapshot to a throwaway
`auxein-db-rehearsal` instance, run §6 and §7 end to end against it, and record
the real elapsed times. This is the single highest-value preparation step: it
converts "budget 4 hours" into a number you actually know.

Delete `auxein-db-rehearsal` afterwards.

---

## 6. Window step 1 — freeze and snapshot

### 6.1 Disable every schedule (T+0)

```bash
for S in auxein-pipeline-morning auxein-surfaces-daily-final \
         auxein-pipeline-aggregate auxein-pipeline-daily \
         auxein-surfaces-refit auxein-surfaces-daily; do
  aws scheduler update-schedule --region ap-southeast-2 --name "$S" \
      --state DISABLED
done

# Confirm all six report DISABLED
aws scheduler list-schedules --region ap-southeast-2 \
    --query "Schedules[].{name:Name,state:State}" --output table
```

> `update-schedule` requires the full schedule definition on some CLI versions.
> If it rejects a partial update, use the console for this step, or
> `get-schedule` into a JSON file and pass `--cli-input-json`. **Verify all six
> read DISABLED before continuing** — a job firing mid-dump produces a torn
> copy that will pass a row count and fail on content.

### 6.2 Stop the ingest box cron

`auxein-ingest` is **not** SSM-managed (`describe-instance-information` returns
nothing), so this is SSH.

```bash
ssh <auxein-ingest>
sudo crontab -l > ~/crontab.backup.$(date +%F)   # keep this
sudo crontab -r                                   # or comment out run_all.sh
ps aux | grep -E 'run_all|python'                 # confirm nothing in flight
```

### 6.3 Quiesce the API

Either scale the EB environment to zero, or accept read errors. Scaling to zero
is cleaner and makes §7 unambiguous:

```bash
aws elasticbeanstalk update-environment --region ap-southeast-2 \
    --environment-name auxein-api-prod-lb \
    --option-settings Namespace=aws:autoscaling:asg,OptionName=MinSize,Value=0 \
                      Namespace=aws:autoscaling:asg,OptionName=MaxSize,Value=0
```

Record the original MinSize/MaxSize first — you restore them in §9.2.

### 6.4 Confirm the database is idle

```sql
SELECT pid, usename, application_name, state, query_start, left(query,60)
FROM pg_stat_activity
WHERE datname = 'auxein_db' AND pid <> pg_backend_pid();
```

Only your own session should remain. If anything else is connected, find it
before proceeding — that is an endpoint reference §7.6 has missed.

### 6.5 Final snapshot (T+15)

```bash
aws rds create-db-snapshot --region ap-southeast-2 \
    --db-instance-identifier auxein-db \
    --db-snapshot-identifier pre-rebuild-$(date +%Y%m%d)

aws rds wait db-snapshot-available --region ap-southeast-2 \
    --db-snapshot-identifier pre-rebuild-$(date +%Y%m%d)
```

**This snapshot is the rollback.** Do not proceed until it reports `available`.
Expect 10–20 minutes.

---

## 7. Window step 2 — create, dump, restore

### 7.1 Create the target instance (T+35)

Runs in parallel with the dump — start it first.

```bash
aws rds create-db-instance --region ap-southeast-2 \
    --db-instance-identifier auxein-db-v2 \
    --db-instance-class db.t4g.medium \
    --engine postgres --engine-version 17.9 \
    --master-username auxein_admin \
    --master-user-password "$NEW_MASTER_PASSWORD" \
    --db-name auxein_db \
    --allocated-storage 50 --max-allocated-storage 200 \
    --storage-type gp3 \
    --storage-encrypted \
    --kms-key-id arn:aws:kms:ap-southeast-2:992914515416:key/fb12c101-2aa4-4878-9e56-26d74c5cbc9b \
    --availability-zone ap-southeast-2a \
    --db-subnet-group-name default-vpc-03a13bd8504825dd9 \
    --vpc-security-group-ids sg-011550f434d067f69 \
    --db-parameter-group-name auxein-pg17 \
    --backup-retention-period 7 \
    --preferred-backup-window 11:00-11:30 \
    --preferred-maintenance-window thu:17:57-thu:18:27 \
    --ca-certificate-identifier rds-ca-rsa2048-g1 \
    --enable-performance-insights \
    --copy-tags-to-snapshot \
    --no-multi-az \
    --no-publicly-accessible \
    --port 5432

aws rds wait db-instance-available --region ap-southeast-2 \
    --db-instance-identifier auxein-db-v2
```

Notes on the flags:

- `--no-publicly-accessible` is the **secure** default and differs from today.
  If you take it, the workstation loses direct access — see §11 before
  committing. Change to `--publicly-accessible` to preserve current behaviour.
- Set `$NEW_MASTER_PASSWORD` from a password manager. **Do not reuse the current
  one** — it is currently sitting in plaintext in the EB configuration (§11).
- `--availability-zone` is honoured only for single-AZ instances. Correct here.
- 17.9 must still be an available version on the night; if AWS has deprecated
  it, use the current 17.x and note the version change in the record.

### 7.2 Prepare the target schema (T+50)

From the migration host, against the **new** instance:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

`plpgsql` is present by default. Creating PostGIS first is what makes the
`spatial_ref_sys` exclusion in §7.3 safe.

### 7.3 Dump (T+35, parallel with 7.1)

Directory format with parallel jobs. `-j 4` on a 2-vCPU source is deliberate —
the work is I/O bound, not CPU bound.

```bash
export OLD_URL="postgresql://auxein_admin@auxein-db.cnmusikiqmmn.ap-southeast-2.rds.amazonaws.com:5432/auxein_db"

time pg_dump "$OLD_URL" \
    --format=directory --jobs=4 --compress=6 \
    --no-owner --no-acl \
    --exclude-schema=topology \
    --exclude-table=public.spatial_ref_sys \
    --verbose \
    --file=/data/auxein-dump 2> dump.log
```

Why each exclusion:

- `--exclude-schema=topology` — verified empty in §5.1; it is entirely
  extension-managed and the `CREATE EXTENSION` in §7.2 recreates it.
- `--exclude-table=public.spatial_ref_sys` — verified stock (exactly 8,500 rows)
  in §5.1; the extension supplies it. Dumping it causes PK conflicts on restore.
- `--no-owner --no-acl` — `auxein_admin` is the only role and is the master user
  on both sides; carrying ownership statements just produces noise.

**Check `dump.log` for errors before restoring.** A dump that ends with a
non-zero exit but leaves a directory behind is the classic silent trap.

```bash
grep -iE 'error|fail|warning' dump.log | head -40
du -sh /data/auxein-dump
```

Expect roughly 8–12 GB compressed and 45–90 minutes.

### 7.4 Restore (T+2:00)

```bash
export NEW_URL="postgresql://auxein_admin@auxein-db-v2.<suffix>.ap-southeast-2.rds.amazonaws.com:5432/auxein_db"

time pg_restore --dbname="$NEW_URL" \
    --format=directory --jobs=4 \
    --no-owner --no-acl \
    --verbose \
    /data/auxein-dump 2> restore.log
```

**Expect some errors and know which are benign.** Review every line:

- `extension "postgis" already exists` — benign, expected from §7.2.
- Anything mentioning `spatial_ref_sys` or the `topology` schema — benign.
- **Anything else is a real failure.** Do not proceed on "it looked mostly
  fine".

```bash
grep -iE '^pg_restore: error' restore.log | grep -viE 'already exists|spatial_ref_sys|topology' | head -40
```

`timeseries_observations` and its 47 partitions are the long pole. Partitioned
tables restore correctly under `-j`, but the indexes rebuild serially per
partition. Expect 60–120 minutes.

### 7.5 Post-restore statistics (T+3:15)

**Do not skip this.** A freshly restored database has no planner statistics.
Skipping `ANALYZE` produces an instance that is technically correct and
catastrophically slow, which reads exactly like a failed migration.

```bash
time psql "$NEW_URL" -c "ANALYZE VERBOSE;"
```

Expect 5–15 minutes. Then confirm the sequences survived — a restored sequence
that is behind produces duplicate-key errors on the next insert, which is the
worst failure mode because it appears hours later:

```sql
SELECT schemaname, sequencename, last_value
FROM pg_sequences
WHERE schemaname IN ('public','taste') AND last_value IS NOT NULL
ORDER BY 1,2;
```

Spot-check three or four against the max id of their owning table.

### 7.6 Verify against the fingerprint (T+3:30)

Re-run §5.2 against `$NEW_URL` and diff.

```bash
diff <(sort pre-migration-fingerprint.csv) <(sort post-migration-fingerprint.csv)
```

`reltuples` will differ slightly — it is an estimate and `ANALYZE` just
recomputed it. **The exact counts from the second query must match to the row.**

Also confirm:

```sql
SELECT version_num FROM alembic_version;                  -- invite_role_general
SELECT count(*) FROM spatial_ref_sys;                     -- 8500
SELECT extname, extversion FROM pg_extension ORDER BY 1;  -- 4 rows, matching versions
SELECT count(*) FROM pg_class WHERE relkind = 'p';        -- partitioned parents present
SELECT count(*) FROM pg_inherits;                         -- 47 partitions
SELECT count(*) FROM information_schema.columns
 WHERE udt_name IN ('geometry','geography');              -- 25
SELECT PostGIS_Full_Version();                            -- sanity on the spatial stack
```

A geometry smoke test — restored PostGIS columns that lost their SRID are a
known migration failure:

```sql
SELECT f_table_name, f_geometry_column, srid, type
FROM geometry_columns ORDER BY 1 LIMIT 30;
SELECT count(*) FROM vineyard_blocks WHERE boundary IS NOT NULL AND ST_IsValid(boundary);
```

---

## 8. The low-downtime alternative — logical replication

If a 4-hour outage is unacceptable, PostgreSQL 17 native logical replication cuts
the cutover to roughly **15 minutes**, at the cost of more setup and more ways to
get it subtly wrong.

**Trade-off, stated plainly:** Path A is longer but has one failure mode you can
see. Path B is shorter but replicates data only — **not DDL, not sequences** —
and a missed sequence surfaces as duplicate-key errors days later. Take Path B
only if the outage genuinely cannot be tolerated.

Outline:

1. Set `rds.logical_replication = 1` in `auxein-pg17`, attach it to the **old**
   instance, and reboot (5 min, days ahead of the window).
2. Create `auxein-db-v2` per §7.1 and the extensions per §7.2.
3. Dump and restore **schema only** first:
   `pg_dump --schema-only ... | psql "$NEW_URL"`.
4. On the source: `CREATE PUBLICATION auxein_pub FOR ALL TABLES;`
5. On the target: `CREATE SUBSCRIPTION auxein_sub CONNECTION '...' PUBLICATION auxein_pub;`
6. Wait for initial sync, then monitor lag until it is near zero:
   ```sql
   -- on the source
   SELECT slot_name, active,
          pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS lag
   FROM pg_replication_slots;
   ```
7. **Cutover window opens here.** Stop writers (§6.1–6.3), wait for lag to reach
   zero, then:
   - **Manually advance every sequence** — logical replication does not
     replicate them:
     ```sql
     SELECT 'SELECT setval('''||schemaname||'.'||sequencename||''','||last_value||');'
     FROM pg_sequences WHERE schemaname IN ('public','taste') AND last_value IS NOT NULL;
     ```
     Run the generated statements on the target. **All 115 sequences.**
   - `DROP SUBSCRIPTION auxein_sub;` on the target.
   - `ANALYZE;`
   - Proceed to §9.
8. Drop the publication and the replication slot on the source.

Known constraints: `FOR ALL TABLES` requires every table to have a replica
identity — tables without a primary key need
`ALTER TABLE ... REPLICA IDENTITY FULL`. Audit for those before the night.

---

## 9. Cutover — every endpoint reference

This is the list that decides whether the migration succeeds. There are **six**
places the endpoint appears. Missing one leaves a component writing to the old
database, which is worse than an outage because it diverges silently.

### 9.1 Repoint (T+3:45)

| # | Consumer | Where | How |
|---|---|---|---|
| 1 | Fargate — all 3 task families, all 6 schedules | SSM `/auxein/prod/RDS_ENDPOINT` | `aws ssm put-parameter --overwrite` |
| 2 | Fargate — password | SSM `/auxein/prod/RDS_PASSWORD` (SecureString) | `aws ssm put-parameter --overwrite` |
| 3 | EB `auxein-api-prod-lb` | env var `DATABASE_URL` | `update-environment` |
| 4 | EB `auxein-taste-prod` | env var `DATABASE_URL` | `update-environment` |
| 5 | `auxein-ingest` EC2 box | local `.env` — **SSH, not SSM** | manual edit |
| 6 | Local dev `.env` (**two workstations** — memory folder is a Drive junction) | `RDS_ENDPOINT` | manual edit both |

The Fargate side is the easy half — all three task definitions
(`auxein-pipeline-daily`, `auxein-pipeline-aggregate`, `auxein-surfaces`) read
from the same two SSM parameters, so one update covers all six schedules with no
task-definition revision needed.

```bash
# 1 + 2 — covers every Fargate job at once
aws ssm put-parameter --region ap-southeast-2 --overwrite \
    --name "/auxein/prod/RDS_ENDPOINT" --type String \
    --value "auxein-db-v2.<suffix>.ap-southeast-2.rds.amazonaws.com"

aws ssm put-parameter --region ap-southeast-2 --overwrite \
    --name "/auxein/prod/RDS_PASSWORD" --type SecureString \
    --value "$NEW_MASTER_PASSWORD"

# 3 + 4 — note DATABASE_URL embeds host AND password
aws elasticbeanstalk update-environment --region ap-southeast-2 \
    --environment-name auxein-api-prod-lb \
    --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value="postgresql://auxein_admin:$NEW_MASTER_PASSWORD@auxein-db-v2.<suffix>.ap-southeast-2.rds.amazonaws.com:5432/auxein_db"
```

> **Two traps here.**
> `backend/core/config.py` resolves the URL as: `ENV=production` → Secrets
> Manager → RDS_* env vars → `DATABASE_URL`. On EB the Secrets Manager lookup
> **fails** (`RDS_SECRET_NAME` in `.env` points at
> `rds!db-49a041ba-…`, which **does not exist** in ap-southeast-2) and no RDS_*
> vars are set, so it lands on `DATABASE_URL`. That fallback chain is why
> changing only `DATABASE_URL` works — and why it is fragile. Fix the dead
> secret reference separately (§11).
>
> Second: if you re-point EB before its instances have been rescaled back up,
> the change applies on next deploy. Do §9.1 then §9.2, in that order.

### 9.2 Restore service (T+4:00)

```bash
# EB back to its original MinSize/MaxSize (recorded in §6.3)
aws elasticbeanstalk update-environment --region ap-southeast-2 \
    --environment-name auxein-api-prod-lb \
    --option-settings Namespace=aws:autoscaling:asg,OptionName=MinSize,Value=<orig> \
                      Namespace=aws:autoscaling:asg,OptionName=MaxSize,Value=<orig>

# ingest box cron
ssh <auxein-ingest>
sudo crontab ~/crontab.backup.<date>
sudo crontab -l          # verify

# re-enable all six schedules
for S in auxein-pipeline-morning auxein-surfaces-daily-final \
         auxein-pipeline-aggregate auxein-pipeline-daily \
         auxein-surfaces-refit auxein-surfaces-daily; do
  aws scheduler update-schedule --region ap-southeast-2 --name "$S" --state ENABLED
done
```

Smoke tests before declaring done:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.auxein.co.nz/health   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://api.auxein.co.nz/docs     # 200
```

Then in a browser: load `insights.auxein.co.nz`, open a zone climate history
(exercises `climate_zone_surface_monthly` + PostGIS), and sign in to Grow and
open a property map (exercises geometry and property scoping).

Confirm no session is still on the old host:

```sql
-- on the OLD instance; should be empty
SELECT count(*), application_name FROM pg_stat_activity
WHERE datname='auxein_db' AND pid <> pg_backend_pid() GROUP BY 2;
```

### 9.3 Watch, then decommission

**Keep `auxein-db` running and untouched for at least 7 days.** It is the
rollback. Do not delete it the same night, whatever the pressure.

Over the following week, confirm each schedule has had a clean run — the
`/admin/jobs` panel judges jobs by **output freshness, not exit status**, which
is exactly the right check here: a job pointed at the old database would exit 0
and produce nothing new.

- `auxein-pipeline-aggregate` — four runs a day
- `auxein-surfaces-daily`, `auxein-pipeline-morning` — the D-1 morning chain
- `auxein-surfaces-refit` — **needs a Sunday**, so the watch period is at least
  8 days if you want to see it

Then:

```bash
aws rds modify-db-instance --region ap-southeast-2 \
    --db-instance-identifier auxein-db --no-deletion-protection --apply-immediately

aws rds delete-db-instance --region ap-southeast-2 \
    --db-instance-identifier auxein-db \
    --final-db-snapshot-identifier auxein-db-final-$(date +%Y%m%d)
```

Keep the final snapshot for at least a quarter. Note it accrues backup storage.

### 9.4 Clean up

- Terminate the §5.4 migration host and delete its volume.
- Delete `pre-rebuild-<date>` and `pre-truncate-chd-20260903` snapshots once the
  final snapshot exists. Manual snapshots bill against backup storage; a ~50 GB
  snapshot is roughly $7/month.
- Delete `auxein-db-rehearsal` if §5.5 left it behind.
- **Buy the Reserved Instance** — but only now, once you have watched memory on
  the new class for a few weeks. RDS RIs have **no size flexibility**, so the
  commitment is to `db.t4g.medium` exactly, for 12 months.

---

## 10. Sizing rationale — do not downsize the RAM

Recorded here because the cheap option looks attractive and is wrong.

30-day metrics on `auxein-db`:

| Metric | Value |
|---|---|
| CPU average | **5.9%** |
| CPU credit balance | pinned at 576/576, min 538 |
| Surplus credits charged | **0** |
| FreeableMemory average / min | 2.18 GB / **1.13 GB** |
| SwapUsage, 4–17 Aug | 30–40 MB/day |
| SwapUsage, 19 Aug onward | **1.0–1.4 GB peak, every day** |
| BurstBalance (gp2 IO credits) | 88–99%, one dip to 61% |
| ReadLatency average | 0.3 ms |

**CPU is 10× over-provisioned and has never once used its burst.** But something
that landed around 17–19 August roughly tripled the memory footprint, and the
instance now swaps over a gigabyte daily against 1.5 GB of free memory.

So `db.t4g.small` — 2 GB, $325/yr all-upfront, a 67% saving — is a trap.
Halving RAM would drop `shared_buffers` to ~470 MB while it is already swapping.
`db.t4g.medium` keeps 4 GB, moves to Graviton, and costs 9% less. That is the
move.

I/O is **not** a problem: burst balance holds and read latency is 0.3 ms. gp3 is
worth taking for the free 10× baseline IOPS headroom, not because anything is
currently starved.

One open question worth answering before buying a 12-month RI: **what changed on
19 August?** If the memory trend is still climbing, 4 GB may not hold and the RI
would be wasted.

---

## 11. Findings surfaced while scoping (not part of the rebuild)

Each of these is independent and none should block the migration, but the window
is a natural time to fix the first two.

1. **The database master password is stored in plaintext** in the EB
   configuration for both `auxein-api-prod-lb` and `auxein-taste-prod`, visible
   to anyone with `elasticbeanstalk:DescribeConfigurationSettings`. The Fargate
   side already does this correctly via SSM SecureString. **The rebuild changes
   the password anyway (§7.1), so this is the moment to move EB onto SSM too** —
   or at minimum not to carry the old password forward.

2. **`RDS_SECRET_NAME` points at a Secrets Manager secret that does not exist.**
   `rds!db-49a041ba-9fc8-4df2-8fa6-ae50b09498ca` is not present in
   ap-southeast-2. Every production process logs a failed lookup and falls
   through to environment variables. It works, but the intended credential path
   is dead and nobody would notice if the fallback also broke.

3. **The database is publicly accessible** (`PubliclyAccessible: true`) in the
   default VPC. §7.1 proposes `--no-publicly-accessible`. That is the right
   default, but it removes direct workstation access — which several operational
   scripts in `backend/scripts/` rely on. **Decide before the window:** either
   keep it public, or plan bastion/SSM port-forward access. Do not discover this
   at 22:00.

4. **No tags on the instance.** No cost allocation is possible. Add
   `--tags Key=Project,Value=Auxein Key=Env,Value=production` at creation.

5. **Enhanced Monitoring is off.** `MonitoringInterval: 0` means the OS-level
   memory and swap detail that would explain the 19 August change is not being
   collected. Consider `--monitoring-interval 60` on the new instance.

6. **The maintenance window is 33 minutes before the morning chain.** See §4.

---

## 12. Rollback

At every point before §9.3, rollback is: **repoint the six references in §9.1
back to `auxein-db`, re-enable the schedules, restore EB scaling.** The old
instance is untouched and still authoritative — no data is lost because
everything was frozen at §6.

The `pre-rebuild-<date>` snapshot from §6.5 is the deeper fallback if the old
instance is somehow damaged.

**The point of no return is §9.3**, when the old instance is deleted. Everything
before that is reversible in minutes.

---

## 13. Timeline summary (Path A)

| T+ | Step | Duration |
|---|---|---|
| 0:00 | Disable schedules, stop cron, quiesce API (§6.1–6.4) | 15 min |
| 0:15 | Final snapshot (§6.5) | 20 min |
| 0:35 | Create `auxein-db-v2` (§7.1) ∥ start dump (§7.3) | 15 min ∥ 60 min |
| 0:50 | Extensions on target (§7.2) | 5 min |
| 1:35 | Dump completes, review `dump.log` | 10 min |
| 2:00 | Restore (§7.4) | 90 min |
| 3:15 | `ANALYZE`, sequence check (§7.5) | 15 min |
| 3:30 | Fingerprint verification (§7.6) | 15 min |
| 3:45 | Repoint all six references (§9.1) | 10 min |
| 4:00 | Restore service, smoke tests (§9.2) | 20 min |
| **4:20** | **Window closes** | |

Against a 20:00 NZ start that finishes at 00:20, inside the 19:30–01:15 quiet
gap, with roughly an hour of slack before the 01:20 aggregate run.

**Confirm these numbers with the §5.5 rehearsal before committing to a window.**
The dump and restore figures are estimates from the data volume, not measured.
