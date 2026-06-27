# Provision Auxein Taste infrastructure (P10, one-time)

**Created:** 2026-06-28
**Region:** `ap-southeast-2` (CloudFront ACM cert in `us-east-1`)
**AWS profile:** `eb-cli` · **Account:** `992914515416` · **Hosted zone:** `auxein.co.nz.` = `Z0932031205PZ3XGHREAD`

Stands up the isolated Taste service end-to-end. Taste shares only the RDS *instance*, the
`auxein-uploads` S3 bucket, and the JWT `SECRET_KEY` — its own EB env, own `taste` Postgres schema,
own Alembic history, own CloudFront/bucket. Per the dev plan §1/§5.7.

Two domains:
- `taste-api.auxein.co.nz` → backend (EB env `auxein-taste-prod`)
- `taste.auxein.co.nz` → PWA (S3 `auxein-taste-web` + CloudFront)

Photos reuse the existing private **`auxein-uploads`** bucket under a `taste/<user_id>/...` prefix —
**no new uploads bucket**.

---

## Pre-flight — confirmed infra (reuse, don't recreate)

- ✅ Route53 zone `auxein.co.nz.` = `Z0932031205PZ3XGHREAD`
- ✅ EB instance profile `aws-elasticbeanstalk-ec2-role` already carries `AuxeinUploadsRW`
  (PutObject/GetObject/HeadObject on `auxein-uploads`) → the Taste EB env reuses this default profile
  and inherits S3 access for presign. **No new IAM policy needed.**
- ✅ EB service role `aws-elasticbeanstalk-service-role`
- ✅ Shared RDS reachable from the main API's security group (`auxein-api-prod-lb`)
- ✅ Main API at `api.auxein.co.nz` serves `/api/v1/public/auth/login` (Taste reuses it for login)
- ✅ SPA pattern reference: `auxein-insights-webapp` (CF `E1LDN7KQ7TOFXN` → insights.auxein.co.nz)

---

## Stage A — Backend: taste-api EB environment

### A.1 `eb init` (creates `backend_taste/.elasticbeanstalk/config.yml`)

```powershell
cd C:\Auxein\auxein-insights-v0.1\backend_taste
eb init auxein-taste-api `
  --platform "Python 3.13" `
  --region ap-southeast-2 `
  --profile eb-cli
# If 3.13 isn't an available platform, pick the latest "Python 3.x running on 64bit Amazon Linux 2023".
```

### A.2 Create the environment (load-balanced so we can attach an ACM cert on the ALB)

```powershell
eb create auxein-taste-prod `
  --elb-type application `
  --instance-types t3.micro `
  --service-role aws-elasticbeanstalk-service-role `
  --instance_profile aws-elasticbeanstalk-ec2-role `
  --region ap-southeast-2 `
  --profile eb-cli
```

> ⚠️ Put this env in the **same VPC + subnets** as `auxein-api-prod-lb` so its instances can reach the
> shared RDS. If `eb create` lands it in a different VPC, set the VPC/subnets via the EB console (or
> `--vpc.*` flags) and ensure the **RDS security group inbound** allows the Taste env's instance SG on
> 5432. No new DB, no new credentials.

### A.3 Environment variables (must match the main API where noted)

```powershell
aws elasticbeanstalk update-environment `
  --application-name auxein-taste-api `
  --environment-name auxein-taste-prod `
  --region ap-southeast-2 --profile eb-cli `
  --option-settings `
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=ENV,Value=production" `
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value=postgresql://USER:PASSWORD@<shared-rds-host>:5432/auxein" `
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=SECRET_KEY,Value=<SAME-AS-MAIN-API>" `
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=ALGORITHM,Value=HS256" `
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=UPLOADS_S3_BUCKET,Value=auxein-uploads" `
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=UPLOADS_S3_REGION,Value=ap-southeast-2" `
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=UPLOADS_PRESIGNED_URL_TTL_SECONDS,Value=900"
```

> `SECRET_KEY` **must equal** the main API's — the Taste service only uses it to validate the existing
> Insights public JWT. A mismatch = every data call 401s.

### A.4 First deploy + run the migration (creates schema `taste`)

```powershell
# Deploy the code (ships the working directory — commit/clean first; see deploy-taste-api.md)
eb deploy auxein-taste-prod --profile eb-cli

# Migration — run from your laptop with prod DB creds in the shell ONLY (Option A pattern):
cd C:\Auxein\auxein-insights-v0.1\backend_taste
$env:DATABASE_URL = "postgresql://USER:PASSWORD@<shared-rds-host>:5432/auxein"
alembic -c alembic_taste.ini upgrade head   # CREATE SCHEMA taste + taste.records + alembic_version in taste
Remove-Item Env:\DATABASE_URL
```

The Alembic history table lives at `taste.alembic_version` (version_table_schema='taste') — it never
touches the Grow chain at `public.alembic_version`.

### A.5 TLS + DNS for the API

```powershell
# ACM cert for the API on the ALB — region ap-southeast-2 (NOT us-east-1; that's only for CloudFront)
aws acm request-certificate `
  --domain-name taste-api.auxein.co.nz `
  --validation-method DNS --region ap-southeast-2 --profile eb-cli
# Add the returned DNS validation CNAME to Route53; wait for Status=ISSUED.
```

Then add a **443 HTTPS listener** with that cert to the env's ALB (EB console → Configuration → Load
balancer → Add listener: 443/HTTPS → the ACM cert), and point DNS at the env:

```powershell
# Route53: CNAME taste-api.auxein.co.nz → the EB env CNAME (eb status shows it)
# (console, or change-resource-record-sets against Z0932031205PZ3XGHREAD)
```

### A.6 Smoke

```powershell
curl https://taste-api.auxein.co.nz/taste/health   # → {"status":"ok","service":"auxein-taste-api","schema":"taste"}
```

---

## Stage B — Main API CORS (one redeploy)

`backend/main.py` already includes `https://taste.auxein.co.nz` + `http://localhost:5175` in
`allowed_origins` (added 2026-06-28). Just **redeploy the main API** so the Taste SPA's cross-origin
login to `/api/v1/public/auth/login` is allowed:

```powershell
cd C:\Auxein\auxein-insights-v0.1\backend
eb deploy auxein-api-prod-lb --profile eb-cli
```

---

## Stage C — Frontend: PWA at taste.auxein.co.nz

Mirror `provision-s3-buckets.md` Stage A (the Pro-web pattern), with Taste names.

### C.1 ACM cert (CloudFront → must be us-east-1)

```powershell
aws acm request-certificate `
  --domain-name taste.auxein.co.nz `
  --validation-method DNS --region us-east-1 --profile eb-cli
# Add the DNS validation CNAME to Route53; wait for ISSUED.
```

### C.2 Private S3 bucket (CloudFront-only via OAC)

```powershell
aws s3api create-bucket --bucket auxein-taste-web `
  --region ap-southeast-2 `
  --create-bucket-configuration LocationConstraint=ap-southeast-2 --profile eb-cli
aws s3api put-public-access-block --bucket auxein-taste-web `
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true `
  --profile eb-cli
```

### C.3 CloudFront distribution

Create a distribution (console is simplest) with:
- **Origin** `auxein-taste-web` S3, access via **Origin Access Control (OAC)**; add the generated
  bucket policy so only this distribution can read.
- **Default root object** `index.html`.
- **SPA error routing**: custom error responses `403` and `404` → response page `/index.html`,
  HTTP response code `200`.
- **Alternate domain name** `taste.auxein.co.nz` + the us-east-1 ACM cert from C.1.
- Compress objects automatically; HTTP→HTTPS redirect.

> **PWA caching**: `index.html` and the service worker (`sw.js` / `registerSW.js`) must be served
> **no-cache** so updates roll out. The deploy runbook sets `Cache-Control` on those objects; the
> hashed `assets/*` are immutable and cache long. (CacheFirst for images is handled inside the SW.)

### C.4 Route53 alias

```powershell
# A/AAAA ALIAS taste.auxein.co.nz → the CloudFront domain (dxxxx.cloudfront.net) in Z0932031205PZ3XGHREAD
```

### C.5 First deploy

Follow `deploy-taste.md` (build → `s3 sync` → invalidate). Then smoke: open `https://taste.auxein.co.nz`,
install the PWA, toggle airplane mode (still boots), sign in, capture a note + photo, **Sync now**,
confirm the photo lands in `auxein-uploads` under `taste/<user_id>/...`.

---

## Record after provisioning

Update `project_aws_infra` memory with: bucket `auxein-taste-web`, the new CF distribution id, EB app
`auxein-taste-api` / env `auxein-taste-prod` (+ actual `-lb` suffix if EB adds one), and the two ACM
cert ARNs.
