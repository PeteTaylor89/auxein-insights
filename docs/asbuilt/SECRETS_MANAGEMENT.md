# Secrets Management

**Created:** 2026-04-27
**Scope:** Where every category of secret lives, who can see it, and how to rotate it.

---

## Short answer

**Multiple sources, by necessity.** EAS builds run on Expo's infrastructure, so EAS env vars are the only place mobile build-time secrets can live. AWS Secrets Manager is the right home for backend runtime secrets. The two cannot be unified — but they can be managed cleanly with a single human-readable index (1Password / Bitwarden) as the source of truth for "this secret exists, lives here, rotates on this cadence".

---

## Inventory

| Category | Where | Examples | Rotation |
|---|---|---|---|
| Backend runtime — DB | AWS Secrets Manager | `auxein/rds/postgres` (username, password, host, port, dbname) | Manual; rotate in Secrets Manager → no code change (cached lookup re-fetches on next cold start) |
| Backend runtime — config | Elastic Beanstalk environment properties | `SECRET_KEY`, `SMTP_PASSWORD`, `RDS_SECRET_NAME`, `ARTICLE_IMAGES_S3_BUCKET`, `FROM_EMAIL`, etc. | Update via EB console → triggers env update |
| Backend runtime — third-party APIs | Elastic Beanstalk environment properties | NIWA, TDC, GDC, future Mapbox server-side, etc. | EB console |
| Local dev | `backend/.env` (gitignored) | Same vars as above, mirrored locally | Manual; sync from Secrets Manager / EB when needed |
| Mobile build-time — secret | EAS env vars (`secret` visibility) | `MAPBOX_DOWNLOAD_TOKEN` (sk.\*) | `eas env:update` — write-once, never readable |
| Mobile build-time — sensitive | EAS env vars (`sensitive` visibility) | `MAPBOX_PUBLIC_TOKEN` (pk.\*), future Sentry DSN | `eas env:update` — readable in EAS dashboard |
| Mobile build-time — plaintext | `eas.json` `env` block (in repo) | `API_URL` per profile | Edit `eas.json`, commit |
| Future CI (GitHub Actions) | GitHub Actions secrets | EAS robot token, AWS deploy creds, etc. | Repo settings → Actions → Secrets |
| Future store submission | EAS env vars (`secret`) | App Store Connect `.p8` key, Google Play service account JSON | `eas env:update` |
| Human source of truth | 1Password (or chosen vault) | Master list pointing to where each lives | Out-of-band rotation reminder |

---

## Why multiple stores

Each platform has a constraint:

- **AWS Secrets Manager** — perfect for backend runtime (audit log, IAM access control, rotation hooks). Useless for mobile builds because EAS build servers can't authenticate as our AWS account during a `prebuild` step without us shipping AWS creds, which is worse.
- **EAS env vars** — only place mobile build-time secrets are accessible to the build pipeline. Three visibility levels (`plaintext` / `sensitive` / `secret`) cover the spectrum.
- **EB environment properties** — easy to manage, integrated with EB deploys, fine for non-rotating secrets. Not ideal for high-rotation secrets (no audit, no versioning) — those should move to Secrets Manager.
- **`.env` files** — local dev only, gitignored. Never the source of truth.
- **GitHub Actions secrets** — only place CI workflows can see secrets. Used minimally; main secret here would be an EAS robot token to trigger builds from CI.

Trying to force everything into one store would either (a) require unsafe cross-account credentials living in EAS, or (b) duplicate AWS Secrets Manager content into EAS by hand, defeating the audit trail.

---

## Rule of thumb

When you encounter a new secret, ask:

1. **Who needs to read it?** Backend runtime → AWS. Mobile build → EAS. CI → GitHub.
2. **How sensitive?** Determines visibility level (within EAS) or whether it warrants Secrets Manager vs plain EB env (within AWS).
3. **How often does it rotate?** Frequent → Secrets Manager (audit, versioning). One-shot → plain env property is fine.

---

## Index pattern

Maintain a single 1Password vault item ("Auxein Secrets Index") that lists every secret by name + location, **without** the value. Example:

```
SECRET_KEY              -> EB env property (auxein-prod)
RDS password            -> AWS Secrets Manager: auxein/rds/postgres
MAPBOX_DOWNLOAD_TOKEN   -> EAS env (auxein-grow, all environments, secret)
MAPBOX_PUBLIC_TOKEN     -> EAS env (auxein-grow, all environments, sensitive)
SMTP_PASSWORD           -> EB env property (auxein-prod)
NIWA_API_KEY            -> EB env property (auxein-prod)
```

Stops the "I forgot we had this token" problem without creating a second copy of the value (which would itself need rotation).

---

## Rotation playbook

| Secret | Steps |
|---|---|
| RDS password | Update in AWS Secrets Manager → EB instances pick up on next request (cached lookup expires) → no deploy needed |
| `SECRET_KEY` (JWT) | New value in EB env → redeploy → all sessions invalidated (intentional — users re-login) |
| Mapbox tokens | Mint new at https://account.mapbox.com/access-tokens/ → `eas env:update --name X --value Y` → next build picks up. Old token can be revoked once new build is rolled out. |
| SMTP password | Update at provider → update EB env → redeploy |
| Apple `.p8` / Google service JSON | Mint new in respective console → `eas env:update` → next `eas submit` uses new |

---

## What is NOT a secret

For clarity — these are public and live in the repo:

- API URLs (`https://api.auxein.co.nz/api`, `http://192.168.1.144:8000/api`)
- Mapbox style IDs, default zoom levels, tileset URLs
- Bundle IDs (`co.nz.auxein.grow`)
- EAS project ID
- Backend feature flags (toggles in code)

---

## Open items

- **Migrate non-DB EB env properties → AWS Secrets Manager** when the list grows past ~10 secrets, for audit + rotation tooling.
- **Rotation cadence** — currently ad-hoc. Set quarterly reminder for `SECRET_KEY` + Mapbox tokens at minimum.
- **Per-developer .env** — no shared template. Worth committing a `backend/.env.example` so new devs know which vars to populate.
