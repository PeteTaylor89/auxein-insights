# Deploy — Taste API (backend_taste → EB)

**AWS profile:** `eb-cli` · **Region:** `ap-southeast-2` · **App:** `auxein-taste-api` · **Env:** `auxein-taste-prod`

Deploys the isolated Taste backend. First-time setup is in `provision-taste-infra.md`. This is the
per-release checklist. Deploying Taste **never** redeploys Grow/Insights (separate EB app).

## Pre-flight

- [ ] On `main`, `git status` clean — ⚠️ EB ships the **working directory** (`sc:null`), not git HEAD,
      so uncommitted/dirty files would deploy. Commit or stash first.
- [ ] `python -m compileall backend_taste/api backend_taste/core backend_taste/db backend_taste/services backend_taste/main.py` is clean
- [ ] `eb status auxein-taste-prod` shows `Health: Green`

## 1. Deploy the code

```powershell
cd C:\Auxein\auxein-insights-v0.1\backend_taste
eb deploy auxein-taste-prod --profile eb-cli
# Watch ~3-5 min. Tail logs if needed: eb logs --all --stream
```

## 2. Run migrations (EB does NOT auto-migrate)

Only when there are new revisions in `backend_taste/alembic_taste/versions/`.

```powershell
cd C:\Auxein\auxein-insights-v0.1\backend_taste
$env:DATABASE_URL = "postgresql://USER:PASSWORD@<shared-rds-host>:5432/auxein"
alembic -c alembic_taste.ini current
alembic -c alembic_taste.ini upgrade head
Remove-Item Env:\DATABASE_URL
```

Keep slugs ≤32 chars (Alembic `version_num` limit). History lives in `taste.alembic_version`, isolated
from the Grow chain.

## 3. Smoke

```powershell
curl https://taste-api.auxein.co.nz/taste/health        # 200 {"status":"ok",...}
# With a valid Insights public JWT in $T:
#   curl -H "Authorization: Bearer $T" https://taste-api.auxein.co.nz/taste/bootstrap   # 200 {entities,...}
#   401 without/with a bad token = auth wired correctly.
```

If data calls 401 with a *valid* token, the env `SECRET_KEY` doesn't match the main API's (§A.3).
