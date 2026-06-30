# Deploy — Taste PWA (packages/taste → S3/CloudFront)

**AWS profile:** `eb-cli` · **Bucket:** `auxein-taste-web` · **CloudFront:** `E1EIEGH40S0ECX` (domain `d3b8297mozm63z.cloudfront.net`)

Static SPA deploy for `taste.auxein.co.nz`. Same manual pattern as Insights. First-time infra is in
`provision-taste-infra.md`.

## Pre-flight

- [ ] `npm install` clean at repo root (workspace deps resolved)
- [ ] `packages/taste/.env.production` present (`VITE_API_URL=https://api.auxein.co.nz/api/v1`,
      `VITE_TASTE_API_URL=https://taste-api.auxein.co.nz`)
- [ ] taste-api already deployed + healthy (`deploy-taste-api.md`)

## 1. Build (uses .env.production automatically)

```powershell
cd C:\Auxein\auxein-insights-v0.1\packages\taste
npm run build      # tsc --noEmit && vite build → dist/ (incl. the PWA service worker + manifest)
```

## 2. Sync to S3

```powershell
# Hashed assets are immutable → long cache. The HTML + SW must NOT cache (PWA update correctness).
aws s3 sync dist/ s3://auxein-taste-web/ --delete --profile eb-cli `
  --cache-control "public,max-age=31536000,immutable" `
  --exclude "index.html" --exclude "sw.js" --exclude "registerSW.js" --exclude "manifest.webmanifest"

# Re-upload the no-cache set explicitly.
aws s3 cp dist/index.html           s3://auxein-taste-web/index.html           --profile eb-cli --cache-control "no-cache"
aws s3 cp dist/sw.js                 s3://auxein-taste-web/sw.js                 --profile eb-cli --cache-control "no-cache" 2>$null
aws s3 cp dist/registerSW.js         s3://auxein-taste-web/registerSW.js         --profile eb-cli --cache-control "no-cache" 2>$null
aws s3 cp dist/manifest.webmanifest  s3://auxein-taste-web/manifest.webmanifest  --profile eb-cli --cache-control "no-cache" 2>$null
```

> The exact SW filename depends on `vite-plugin-pwa` output (`sw.js` with `registerType: autoUpdate`).
> Check `dist/` after the build; adjust the `cp` lines to whatever SW/registration files are emitted.

## 3. Invalidate CloudFront

```powershell
aws cloudfront create-invalidation --distribution-id E1EIEGH40S0ECX --paths "/*" --profile eb-cli
```

## 4. Smoke

> Server-backed (online-only) since the 2026-06-28 rearchitecture — the app is a thin REST client.
> There is no offline shell / "Sync now"; data round-trips to `taste-api` on every action.

- [ ] `https://taste.auxein.co.nz` loads; install the PWA (Add to Home Screen) → standalone docked app
- [ ] Sign in (Insights account) → grid loads the **builtin (global) CMS template** from the server
- [ ] Origin typeahead returns regions (`GET /taste/v1/regions`, 151 rows)
- [ ] Capture a flight → real rows land in `taste.wines` / `taste.notes` (verify via Swagger)
- [ ] Capture a photo → uploads direct to S3 → object appears in `auxein-uploads` under `taste/<user_id>/<note_id>/...`
- [ ] Second device / browser: sign in → the same notes load from the server; photo displays via presigned URL
