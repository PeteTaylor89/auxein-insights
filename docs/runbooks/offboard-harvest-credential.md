# Offboarding a Harvest credential — runbook

Reverse of `onboard-harvest-credential.md`. Use when:

- A customer leaves and their API key must be retired (Phase B4+)
- A key is compromised / rotated and the old one needs clean removal
- An Auxein-owned key is consolidated or decommissioned

The AWS secret is **not deleted immediately** — Secrets Manager schedules
deletion with a recovery window (default 30 days). Rolling back during
that window is a one-click `RestoreSecret` call.

Prerequisites:

- Credential ref to retire (e.g. `harvest/black-estate`)
- Awareness of which devices point at it — the audit script tells you:
  `python backend/scripts/audit_credentials.py`
- AWS console access with permission to delete secrets under
  `auxein/ingestion/*`
- Prod DB write access

---

## Step 1 — Decide: move devices, or deactivate them?

For each device pointing at the ref, pick one:

- **Move** to `harvest/default` (shared Auxein key still covers it — e.g.
  when consolidating a customer-owned key back to Auxein-owned after an
  agreement change) — data keeps flowing uninterrupted.
- **Deactivate** (`is_active = false`) — stop ingesting entirely. Existing
  history preserved; no new observations. Use when the devices themselves
  are being retired, not just the credential.

Preview the device list first:

```sql
SELECT id, station_code, is_active,
       (SELECT MAX(timestamp) FROM timeseries_observations
        WHERE device_id = d.id) AS last_observation
FROM devices d
WHERE api_credential_ref = 'harvest/<slug>'
ORDER BY station_code;
```

---

## Step 2 — Apply the chosen action

**Option A — move to default:**

```sql
UPDATE devices
SET api_credential_ref = 'harvest/default'
WHERE api_credential_ref = 'harvest/<slug>';
```

**Option B — deactivate:**

```sql
UPDATE devices
SET is_active = false
WHERE api_credential_ref = 'harvest/<slug>';
```

**Option C — mixed:** script a WHERE clause that splits by station_code
prefix or by company_id, running Option A for some and B for others.

After either, the audit script should confirm no active device still
references the ref:

```bash
python backend/scripts/audit_credentials.py
```

Category [B] should be clean. Category [C] will now flag
`harvest/<slug>` as unused — expected at this point.

---

## Step 3 — Deactivate the credential row

```sql
UPDATE ingestion_credentials
SET is_active = false,
    notes = COALESCE(notes, '') || E'\nDeactivated <YYYY-MM-DD> by <your-email>: <reason>'
WHERE provider = 'HARVEST' AND name = '<slug>';
```

Leave the row in place — historical `ingestion_log` entries still point
at devices that used this credential; deleting the row would orphan that
audit trail. `is_active = false` is enough to take it out of resolver
scope.

---

## Step 4 — Verify the next ingestion cron leaves this ref alone

Wait one cron tick (or trigger `weather-ingestion.yml` manually). Confirm:

```sql
-- No SUCCESS entries for the affected devices since the UPDATE
SELECT station_id, data_source, status, end_time, records_inserted
FROM ingestion_log
WHERE data_source = 'HARVEST'
  AND end_time > NOW() - INTERVAL '12 hours'
  AND station_id IN (<the device IDs>)
ORDER BY end_time DESC;
```

Option A devices: SUCCESS entries using the default credential (indirectly
confirms via `records_inserted > 0`).
Option B devices: no entries at all (they're `is_active = false`).

---

## Step 5 — Schedule the AWS secret for deletion

AWS console → Secrets Manager → select `auxein/ingestion/harvest/<slug>`
→ **Actions → Delete secret**.

Recovery window: **30 days** (the default). During this window a single
`RestoreSecret` call brings the secret back — use it if a deactivated
device unexpectedly needs to come back online.

Under no circumstances use **force-delete-without-recovery**. The 30-day
window is our insurance policy against a rushed offboarding.

Tag the secret `offboarded_at = <YYYY-MM-DD>` and `offboarded_by = <email>`
before scheduling deletion, for audit trail consistency (the tags survive
the recovery window).

---

## Step 6 — Record the offboarding

Append a row to the credential notes (already done in step 3) and, for
customer offboardings, add a note in the customer record / ticket with:

- Ref name
- AWS secret ARN
- Scheduled deletion date (30 days out)
- Affected device count + action taken (moved to default / deactivated)
- Reason

---

## Rollback during the 30-day recovery window

If the offboarding was premature:

1. AWS console → Secrets Manager → **deleted secrets** tab → select the
   secret → **Restore secret**
2. Flip `ingestion_credentials.is_active = true`
3. UPDATE devices back to `api_credential_ref = 'harvest/<slug>'` (if
   they were moved to default) or `is_active = true` (if deactivated)
4. Probe to confirm: `python backend/scripts/probe_credential_resolver.py harvest/<slug>`
5. Manually trigger `weather-ingestion.yml`; confirm SUCCESS in
   `ingestion_log`

After the 30-day window expires the secret is permanently gone and a new
AWS secret must be created from scratch via the onboarding runbook.

---

## Permanent deletion (after 30 days)

No manual action needed — AWS purges the secret automatically. The
`ingestion_credentials` row stays (with `is_active = false`) as a
historical breadcrumb. Category [D] of the audit will no longer list
this secret in the AWS side.

If you want to fully purge the DB row as well (rare — only for fully
closed customer accounts), first confirm no `ingestion_log` rows point
at devices that historically used this credential, then:

```sql
DELETE FROM ingestion_credentials
WHERE provider = 'HARVEST' AND name = '<slug>' AND is_active = false;
```

Skip this if you're unsure. Inactive rows are cheap; surprises from
deleting audit trail are not.
