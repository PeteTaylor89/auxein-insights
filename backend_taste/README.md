# backend_taste — Auxein Taste API (P8)

Isolated FastAPI service for the Taste PWA. Shares only the RDS instance, S3 bucket
and JWT `SECRET_KEY` with the main API; its own EB app, own Postgres schema `taste`,
own Alembic history. Never imports or writes Grow/Insights tables. See
`docs/taste_plan/TASTE_DEV_PLAN.md` §5 + §5.7.

## What it is
A durable **last-write-wins sync relay**. The PWA's Dexie is the system of record at
capture; this service stores each client record by its UUID in a single generic
`taste.records` table (entity + JSONB payload + sync columns). Endpoints:

- `GET  /taste/health` — EB health check
- `GET  /taste/bootstrap` — all live records for the user, grouped by entity
- `POST /taste/sync` — `{ outbox: Mutation[], last_pulled_at }` → `{ applied, pull, server_time }`

Auth: validates the existing Insights **public JWT** (shared `SECRET_KEY`) and uses
`public_users.id` as the loose `user_id` on every row. No Taste user table.

## Local dev
1. `python -m venv venv` then `venv\Scripts\pip install -r requirements.txt`
2. Copy `.env.example` → `.env`; set `LOCAL_DATABASE_URL` + the **same** `SECRET_KEY`/`ALGORITHM` as the main API.
3. Create the schema + table: `venv\Scripts\alembic -c alembic_taste.ini upgrade head`
4. Run it: from repo root `npm run dev:taste-api` (port **8001**), or `npm run dev:taste-stack` (API + PWA).

## Migrations
Own root: `alembic -c alembic_taste.ini upgrade head`. History table is
`taste.alembic_version` (never tangles with the Grow chain). Keep revision slugs ≤32 chars.

## Deploy (P10)
Own EB app `auxein-taste-api` (t3.micro, health `/taste/health`, `ENV=production`,
env vars `DATABASE_URL` + `SECRET_KEY` + `ALGORITHM` [+ `UPLOADS_S3_BUCKET` for P9]).
Deploy from this directory (`eb deploy`); run `alembic upgrade head` separately after.
