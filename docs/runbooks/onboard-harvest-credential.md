# Onboarding a Harvest credential — runbook

When to use this:
- New Auxein-owned Harvest API key arrives (your B1.5 backlog)
- New customer brings their own Harvest API key (Phase B4 — same steps,
  difference is `company_id` is set on the credential row)

Prerequisites:
- Phase B1 deployed (resolver + `harvest/default` seeded + Harvest ingestion
  reads `api_credential_ref`)
- AWS console access with permission to create secrets in
  `auxein/ingestion/*`
- Live prod DB write access (the SQL UPDATE step)
- The new Harvest API key value, and the list of station codes / device IDs
  it covers

---

## Step 1 — Create the AWS secret

1. AWS console → Secrets Manager → **Store a new secret**
2. **Secret type:** *Other type of secret*
3. **Key/value pairs:** plaintext mode → paste the API key as the entire
   value. (Don't wrap in JSON unless every consumer agrees on a schema.)
4. **Encryption key:** default `aws/secretsmanager`
5. **Secret name:** `auxein/ingestion/harvest/<slug>` where `<slug>` is:
   - For Auxein-owned site keys: a short site identifier, e.g.
     `auxein/ingestion/harvest/maori-point`
   - For customer keys: the customer slug, e.g.
     `auxein/ingestion/harvest/black-estate`
   - Lowercase, hyphens, no spaces
6. **Required tags** — `audit_credentials.py` check [D] fails without
   all five. Set them at creation time; adding them later is easy to
   forget.
   - `provider` = `HARVEST`
   - `purpose` = `ingestion`
   - `company_id` = `<id>` for customer keys, or `auxein-owned` for
     Auxein-managed keys (incl. public data partners like CODC)
   - `created_by` = `<your email>`
   - `contact_email` = customer security/billing contact, or yours for
     Auxein-owned keys. This is the address we alert when the key fails
     to resolve.
7. Disable rotation for now (manual rotation only — defer until B7)
8. Copy the **Secret ARN** — needed in Step 2

---

## Step 2 — Insert the credential row

```sql
INSERT INTO ingestion_credentials
    (provider, name, secret_arn, env_var_fallback, company_id, is_active, notes)
VALUES (
    'HARVEST',
    'maori-point',                              -- matches the slug used in step 1
    'arn:aws:secretsmanager:ap-southeast-2:<account>:secret:auxein/ingestion/harvest/maori-point-XXXXXX',
    NULL,                                        -- prefer secret_arn over env_var when set
    NULL,                                        -- NULL = Auxein-owned; set to company.id for customer-supplied
    true,
    'Auxein-owned Harvest API key for Maori Point sites — added 2026-04-22'
);
```

Notes:
- `env_var_fallback` stays NULL — the resolver always prefers `secret_arn` if
  set, but having both is allowed (fallback used if AWS call fails). For
  this runbook, leave it NULL so we don't carry undeclared dependencies on
  env vars.
- Pick the credential `name` value carefully — once devices reference it,
  renaming requires updating every device row.

---

## Step 3 — Probe the new credential

Before pointing any device at it:

```bash
python backend/scripts/probe_credential_resolver.py harvest/maori-point
```

Expected output:

```
OK   harvest/maori-point   source=secrets_manager   len=<N>
```

If `FAIL`, do **not** proceed to step 4. Common causes:
- IAM policy missing `auxein/ingestion/*` — see `docs/plans/DATA_INGESTION_PLATFORM_PLAN.md` §B1
- Secret ARN typo'd in the credential row
- Secret stored as JSON when resolver expects plaintext (see step 1.3)

---

## Step 4 — Move affected devices to the new credential

Identify the devices that should use this key (typically by station_code
prefix or by source_id range):

```sql
-- Preview first
SELECT id, station_code, api_credential_ref
FROM devices
WHERE data_source = 'HARVEST'
  AND station_code LIKE 'MAORI%';

-- Then move them (each device is one UPDATE; small batch is fine to do all at once)
UPDATE devices
SET api_credential_ref = 'harvest/maori-point'
WHERE data_source = 'HARVEST'
  AND station_code LIKE 'MAORI%';
```

Old code (already deployed) is unaffected by `api_credential_ref` changes.
The new code (also deployed) reads the column on every ingestion run.

---

## Step 5 — Wait one cron tick, verify

The Harvest ingestion cron runs every 6h. After the next tick:

```sql
-- Should show recent SUCCESS entries for the moved devices
SELECT station_id, status, end_time, records_inserted, error_msg
FROM ingestion_log
WHERE data_source = 'HARVEST'
  AND station_id IN (<the moved device IDs>)
  AND end_time > NOW() - INTERVAL '12 hours'
ORDER BY end_time DESC;
```

Expected: SUCCESS rows with `records_inserted > 0`. If FAILED with
"Credential 'harvest/maori-point' unavailable", check probe output again —
something changed between step 3 and step 5.

To force an immediate cron run instead of waiting 6h:
- GitHub Actions → `weather-ingestion.yml` → **Run workflow**

---

## Rollback

If anything goes wrong in step 4 or 5, revert the device assignments:

```sql
UPDATE devices
SET api_credential_ref = 'harvest/default'
WHERE data_source = 'HARVEST'
  AND api_credential_ref = 'harvest/maori-point';
```

Devices fall back to the shared default key. The credential row + AWS secret
can be left in place (or deactivated) while you investigate.

---

## When deactivating / offboarding (later)

Full offboarding playbook lives at `docs/runbooks/offboard-harvest-credential.md`
(to be written in Phase B1.6). Short version:

1. Move devices off the credential (UPDATE to `harvest/default` or deactivate
   them)
2. Set `ingestion_credentials.is_active = false`
3. Schedule AWS secret deletion with 30-day recovery window (Secrets Manager
   default)
