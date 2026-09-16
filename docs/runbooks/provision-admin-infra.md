# Runbook — provision `admin.auxein.co.nz`

Phase 6 of `docs/plans/ADMIN_SUBDOMAIN_SCOPE_2026-09-15.md`.

Static SPA only. **No new EB environment, no new database, no new schema** — the admin app
talks to the existing `api.auxein.co.nz`. This mirrors Stage C of
`provision-taste-infra.md`, which built `auxein-taste-web` / `E1EIEGH40S0ECX`.

Account `992914515416`, profile `eb-cli`, hosted zone `Z0932031205PZ3XGHREAD`.

## Provisioned so far (2026-09-16)

| Resource | Value |
|---|---|
| ACM cert (us-east-1) | `arn:aws:acm:us-east-1:992914515416:certificate/0a872edd-bd3e-4179-9a13-8324405e2dbb` — **ISSUED** |
| Validation CNAME | `_3a3a10cc4ea5c81993ff7f7dd61400ae.admin.auxein.co.nz` — INSYNC in Z0932031205PZ3XGHREAD. Leave it in place; ACM re-validates on renewal |
| S3 bucket | `auxein-admin-web`, ap-southeast-2, all four public-access blocks ON (verified) |
| CloudFront distribution | `EFRES9N55UALS` → `dl0cf03l6vbgl.cloudfront.net` |
| Origin access control | `EH3RLRYP1W2LV` (`auxein-admin-web-oac`) |
| Bucket policy | applied, scoped to distribution `EFRES9N55UALS` |
| Route53 alias | **OUTSTANDING** — see step 5 |
| WAF allow-list | not created yet — step 4 |

## Pre-flight — already done

- [x] **Phase 0 CORS is live.** `https://admin.auxein.co.nz` is in `backend/main.py`
      `allowed_origins` and was deployed 2026-09-16. Verified: a preflight from that
      Origin returns `access-control-allow-origin` for it, and `/api/v1/admin/kpis`
      answers 403 `Not authenticated` rather than 404.
- [x] Code committed at `9af2608`.

---

## 1. ACM certificate — us-east-1

CloudFront only reads certs from us-east-1. This is the long pole; start it first and
let DNS validation run while you do steps 2 and 3.

```powershell
aws acm request-certificate `
  --domain-name admin.auxein.co.nz `
  --validation-method DNS --region us-east-1 --profile eb-cli
```

Take the returned ARN, read the validation CNAME, add it to Route53, wait for `ISSUED`:

```powershell
aws acm describe-certificate --certificate-arn <ARN> `
  --region us-east-1 --profile eb-cli `
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

## 2. Private S3 bucket

```powershell
aws s3api create-bucket --bucket auxein-admin-web `
  --region ap-southeast-2 `
  --create-bucket-configuration LocationConstraint=ap-southeast-2 --profile eb-cli

aws s3api put-public-access-block --bucket auxein-admin-web `
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true `
  --profile eb-cli
```

All four blocks ON. CloudFront reaches it via OAC, nothing else does.

## 3. CloudFront distribution

Console is simplest. Settings:

| Setting | Value |
|---|---|
| Origin | `auxein-admin-web` S3, **Origin Access Control (OAC)**, create a new OAC |
| Bucket policy | Apply the generated policy (step 3.1) |
| Default root object | `index.html` |
| Custom error response | `403` → `/index.html`, HTTP 200 |
| Custom error response | `404` → `/index.html`, HTTP 200 |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Compress objects | Yes |
| Alternate domain name | `admin.auxein.co.nz` |
| Custom SSL certificate | the us-east-1 ARN from step 1 |

SPA error routing is what makes a deep link like `/kpis` or `/grow/companies` work on a
hard refresh — without it S3 returns 403 for a key that does not exist and the app never
loads.

### 3.1 Bucket policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::auxein-admin-web/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::992914515416:distribution/EFRES9N55UALS"
      }
    }
  }]
}
```

## 4. IP allow-list

Decided at scoping: do it at provision time, because nothing on this origin is
customer-facing so an allow-list costs nothing in UX.

**Use a WAF IPv4 IP set, not a hardcoded CloudFront function.** The set is edited in
seconds from the console and takes effect without a function publish or a distribution
deployment — which matters because the list has to change whenever the admin is on a
different network.

```powershell
aws wafv2 create-ip-set --name auxein-admin-allow `
  --scope CLOUDFRONT --region us-east-1 `
  --ip-address-version IPV4 --addresses <YOUR-IP>/32 --profile eb-cli
```

Then a web ACL with default action **Block** and one rule allowing that IP set, associated
with the distribution. WAF for CLOUDFRONT scope is always us-east-1.

Two things to be clear about before switching it on:

- **It protects the origin, not the API.** `/api/v1/admin/*` stays reachable from anywhere
  CORS allows. The allow-list stops someone loading the admin UI; it does not stop someone
  calling the API with a valid token. It is not a substitute for 2FA (deferred, not cancelled).
- **Lockout is recoverable.** A rotated residential IP or a hotel network locks the UI out,
  but the AWS console is not behind the allow-list, so the fix is always a one-line IP set
  edit. Note the web ACL name somewhere reachable from a phone.

## 5. Route53 — OUTSTANDING

A + AAAA ALIAS for `admin.auxein.co.nz` → `dl0cf03l6vbgl.cloudfront.net`. The alias
hosted-zone id `Z2FDTNDATAQYW2` is the fixed global CloudFront value, not our zone.

Save as `r53-admin.json`:

```json
{
  "Comment": "admin.auxein.co.nz -> CloudFront EFRES9N55UALS",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "admin.auxein.co.nz.",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "dl0cf03l6vbgl.cloudfront.net.",
          "EvaluateTargetHealth": false
        }
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "admin.auxein.co.nz.",
        "Type": "AAAA",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "dl0cf03l6vbgl.cloudfront.net.",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
```

```powershell
aws route53 change-resource-record-sets `
  --hosted-zone-id Z0932031205PZ3XGHREAD `
  --change-batch file://r53-admin.json --profile eb-cli
```

Console equivalent: Route53 → `auxein.co.nz` → Create record → name `admin`, type `A`,
Alias yes, target CloudFront distribution `dl0cf03l6vbgl.cloudfront.net`. Repeat for AAAA.

---

## 6. Deploy

The whole deploy, every time. `packages/admin/.env.production` already points at
`https://api.auxein.co.nz/api`, so the build takes no flags.

```powershell
cd A:\auxein-insights-V0.1\packages\admin
npm run build

aws s3 sync dist/ s3://auxein-admin-web/ --delete --profile eb-cli

aws s3 cp dist/index.html s3://auxein-admin-web/index.html `
  --cache-control "no-cache, no-store, must-revalidate" `
  --content-type "text/html" --profile eb-cli

aws cloudfront create-invalidation --distribution-id EFRES9N55UALS `
  --paths "/*" --profile eb-cli
```

### Why the separate `index.html` copy

`s3 sync` uploads `index.html` with no `Cache-Control`, so CloudFront applies the cache
policy default (24 h) and a deploy silently does not reach anyone until it expires. The
`cp` re-uploads the same object with no-cache headers. It must come **after** the sync,
or the sync overwrites it.

The hashed `assets/*` are content-addressed and can cache indefinitely — the default
sync behaviour is correct for those. Only `index.html` needs the override.

No service worker here. This is not a PWA, so none of the Taste SW caveats apply.

### First deploy only

Nothing is in the bucket yet, so until the first `npm run build` + sync, `admin.auxein.co.nz`
returns the SPA error route (`/index.html` → 403 from an empty bucket → 200 with no body).
That is expected, not a misconfiguration.

## 7. Smoke test

1. `https://admin.auxein.co.nz` loads the sign-in screen.
2. Sign in with **Grow** credentials. The SPA calls `/public/auth/exchange` on mount for
   the Insights token — watch the network tab for it.
3. An Insights tab (`/kpis`) and a Grow tab (`/grow/:tab`) both render. If every Grow tab
   works and every Insights tab bounces, the exchange failed or `is_admin` is false.
4. Hard-refresh on `/kpis` — proves the 403/404 error routing.
5. From an IP outside the allow-list, the origin is blocked.

## 8. Record afterwards

Add to the `project_aws_infra` memory: bucket `auxein-admin-web`, the distribution id,
the OAC id, the us-east-1 cert ARN, and the WAF web ACL + IP set names.

---

## What must NOT happen yet

**Phase 5 stays untouched until this is live and proven.** Phase 5 strips `/admin` from
`packages/insights` and `packages/web` and replaces it with bare permanent redirects —
that is the point of no return. Until then both old admin surfaces keep working, so there
is no window where admin is unavailable.
