# Provision S3 Buckets — Pro web + User uploads

**Created:** 2026-05-08
**Region:** `ap-southeast-2` (matches existing infra)
**AWS profile:** `eb-cli`

This runbook provisions two S3 buckets:

1. **`auxein-grow-web`** — static hosting for Pro web SPA at `grow.auxein.co.nz` (CloudFront + ACM + Route53)
2. **`auxein-uploads`** — private bucket for user-uploaded files (incident photos, calibration photos, risk photos, asset photos, etc.) — accessed via backend-minted pre-signed URLs

> **Brand note:** `grow.auxein.co.nz` will host the Pro web operator tool. The mobile app is also branded "Auxein Grow". They coexist (web operator + mobile field worker) — the mobile app's marketing landing should still link out via auxein.co.nz, not grow.auxein.co.nz, to avoid login confusion.

---

## Pre-flight — confirmed state (2026-05-08)

- ✅ Route53 hosted zone `auxein.co.nz.` exists — `Z0932031205PZ3XGHREAD`
- ✅ EB instance profile is `aws-elasticbeanstalk-ec2-role` (default) — backend uploads policy must attach here
- ✅ EB environment name is `auxein-api-prod-lb` (not `auxein-api-prod` — deploy runbook updated)
- ✅ Existing pattern reference: `auxein-insights-webapp` (CF `E1LDN7KQ7TOFXN` → insights.auxein.co.nz). Use the same pattern for the Pro web bucket.

---

## Stage A — Pro web at grow.auxein.co.nz

### A.1 ACM certificate (must be in us-east-1 for CloudFront)

```powershell
aws acm request-certificate `
  --domain-name grow.auxein.co.nz `
  --validation-method DNS `
  --region us-east-1 `
  --profile eb-cli
# Note the CertificateArn from the response — needed in A.4
```

Then add the DNS validation CNAME to Route53:

```powershell
# Get the validation record
aws acm describe-certificate `
  --certificate-arn <cert-arn-from-above> `
  --region us-east-1 `
  --profile eb-cli `
  --query "Certificate.DomainValidationOptions[0].ResourceRecord"
```

Manually create the CNAME via the Route53 console (or with `change-resource-record-sets`). Validation usually completes within a few minutes — re-run `describe-certificate` until `Status` is `ISSUED`.

### A.2 S3 bucket (private — CloudFront access only via OAC)

```powershell
aws s3api create-bucket `
  --bucket auxein-grow-web `
  --region ap-southeast-2 `
  --create-bucket-configuration LocationConstraint=ap-southeast-2 `
  --profile eb-cli

aws s3api put-public-access-block `
  --bucket auxein-grow-web `
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" `
  --profile eb-cli
```

### A.3 CloudFront Origin Access Control (modern OAC pattern, not legacy OAI)

```powershell
aws cloudfront create-origin-access-control `
  --origin-access-control-config "Name=auxein-grow-web-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" `
  --profile eb-cli
# Note the Id — needed in A.4
```

### A.4 CloudFront distribution

This is fiddly via CLI — easiest is the AWS Console:

1. CloudFront → Create distribution
2. Origin domain: `auxein-grow-web.s3.ap-southeast-2.amazonaws.com`
3. Origin access: **Origin access control settings** → select `auxein-grow-web-oac` from A.3
4. Viewer protocol: Redirect HTTP to HTTPS
5. Allowed methods: GET, HEAD
6. Cache policy: `CachingOptimized` (managed)
7. Alternate domain (CNAME): `grow.auxein.co.nz`
8. Custom SSL certificate: select the ACM cert from A.1
9. Default root object: `index.html`
10. **Custom error responses** — both required for SPA routing:
    - 403 → response code 200, response page `/index.html`
    - 404 → response code 200, response page `/index.html`
11. Create distribution. Note the distribution ID + domain (`d…cloudfront.net`).

### A.5 S3 bucket policy — allow OAC

After CloudFront returns the distribution ID, attach the bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipalReadOnly",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::auxein-grow-web/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::992914515416:distribution/<DIST-ID>"
      }
    }
  }]
}
```

```powershell
# Save the JSON above to bucket-policy.json with the right DIST-ID, then:
aws s3api put-bucket-policy `
  --bucket auxein-grow-web `
  --policy file://bucket-policy.json `
  --profile eb-cli
```

### A.6 Route53 alias

Console is easiest:

1. Route53 → Hosted zone `auxein.co.nz.`
2. Create record: name `grow`, type `A`, alias `Yes`, target the CloudFront distribution domain from A.4

### A.7 First deploy + smoke

```powershell
cd A:\auxein-insights-V0.1\packages\web
npm run build
aws s3 sync dist/ s3://auxein-grow-web/ --delete --profile eb-cli
aws cloudfront create-invalidation --distribution-id <DIST-ID> --paths "/*" --profile eb-cli
```

- [ ] DNS propagates (~5 min): `nslookup grow.auxein.co.nz`
- [ ] Open `https://grow.auxein.co.nz` → Pro web loads, no cert warning, deep links (e.g. `/calibrations`) hard-refresh without 404

---

## Stage B — Uploads bucket (private, signed-URL access)

### B.1 Create the bucket — fully private

```powershell
aws s3api create-bucket `
  --bucket auxein-uploads `
  --region ap-southeast-2 `
  --create-bucket-configuration LocationConstraint=ap-southeast-2 `
  --profile eb-cli

aws s3api put-public-access-block `
  --bucket auxein-uploads `
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" `
  --profile eb-cli
```

### B.2 Versioning (recommended — undelete on accidental delete)

```powershell
aws s3api put-bucket-versioning `
  --bucket auxein-uploads `
  --versioning-configuration Status=Enabled `
  --profile eb-cli
```

### B.3 Lifecycle — clean up incomplete multipart uploads

```json
{
  "Rules": [{
    "ID": "AbortIncompleteMultipart",
    "Status": "Enabled",
    "Filter": {},
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
  }]
}
```

```powershell
# Save to lifecycle.json:
aws s3api put-bucket-lifecycle-configuration `
  --bucket auxein-uploads `
  --lifecycle-configuration file://lifecycle.json `
  --profile eb-cli
```

### B.4 CORS — allow the backend domain (for direct browser PUT via signed URLs, if used later)

For now, all uploads go through the backend so CORS isn't strictly required. If we later add direct-from-browser uploads, this will be needed:

```json
{
  "CORSRules": [{
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": [
      "https://grow.auxein.co.nz",
      "https://insights.auxein.co.nz"
    ],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
```

```powershell
# Defer until direct browser PUT is needed:
# aws s3api put-bucket-cors --bucket auxein-uploads --cors-configuration file://cors.json --profile eb-cli
```

### B.5 IAM policy → attach to EB instance role

The backend (running on EB) needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on the bucket. Mobile + web do not get direct S3 credentials — they go through the backend.

Save as `auxein-uploads-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ],
    "Resource": [
      "arn:aws:s3:::auxein-uploads",
      "arn:aws:s3:::auxein-uploads/*"
    ]
  }]
}
```

```powershell
# Create the managed policy
aws iam create-policy `
  --policy-name AuxeinUploadsRW `
  --policy-document file://auxein-uploads-policy.json `
  --profile eb-cli
# Note the PolicyArn from the response

# Attach to the EB instance role (confirmed name: aws-elasticbeanstalk-ec2-role)
aws iam attach-role-policy `
  --role-name aws-elasticbeanstalk-ec2-role `
  --policy-arn <policy-arn-from-above> `
  --profile eb-cli
```

### B.6 EB env vars

Set these in the EB Console → Configuration → Software → Environment properties (so the backend knows the bucket exists when the code migration lands):

| Key | Value |
|---|---|
| `UPLOADS_S3_BUCKET` | `auxein-uploads` |
| `UPLOADS_S3_REGION` | `ap-southeast-2` |
| `UPLOADS_PRESIGNED_URL_TTL_SECONDS` | `900` (15 min default for read URLs) |

Setting these now is harmless — `files.py` doesn't read them yet. When the migration ships they'll already be in place, no second EB config change needed.

---

## After this runbook — what's deferred

### Backend `files.py` migration (separate phase, ~1 day)

`backend/api/v1/files.py` currently writes to local `UPLOAD_DIR` on the EB instance — **wiped on every redeploy**.

Migration steps (write up as its own runbook when scoped):

1. Add a `services/file_storage.py` abstraction with `put_object(key, fileobj, content_type) -> s3_key` and `get_presigned_url(s3_key, ttl) -> str`. Mirror the boto3 pattern in `backend/api/v1/article_images.py` (`_get_s3_client`).
2. Update `files.py` upload handler to write to S3 instead of local disk; persist `s3_key` (or update `file_path` semantics) in the `files` table.
3. Update download handler to mint a pre-signed URL and 302 redirect (or return URL in JSON for clients to fetch directly).
4. Migration script: walk existing `UPLOAD_DIR` on the EB instance, upload to S3, update DB rows.
5. Cutover: deploy backend, run migration script over SSH (`eb ssh auxein-api-prod-lb`), verify, drop local files.

**Until that ships, do NOT redeploy the backend** if anyone has uploaded photos since the last redeploy — they'll be lost. Today's `eb deploy` may have already wiped any incident/calibration/risk photos uploaded between the prior deploy and today. Check with the user list before next backend redeploy.

### Mobile photos already going through the backend

Mobile screens (`CreateIncidentScreen`, `CreateRiskScreen`, `CreateAssetScreen`, calibration `FeedItemModal`, observation `SpotCaptureScreen`) all upload via the backend `files` endpoint, so they automatically benefit from the S3 migration once it ships. No mobile-side change needed beyond perhaps swapping local file URLs for the backend-returned signed URL in viewers.

---

## Summary

| | Bucket | Domain / Access |
|---|---|---|
| Stage A | `auxein-grow-web` (new) | `https://grow.auxein.co.nz` via CloudFront `<DIST-ID>` |
| Stage B | `auxein-uploads` (new) | Backend-only via instance role; pre-signed URLs for clients |

After both stages: `packages/web` can deploy to `grow.auxein.co.nz`; backend has the IAM + env vars ready for the `files.py` migration whenever you scope it.
