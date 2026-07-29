# Runbook — migrate weather ingestion to AWS (Sydney)

**Goal:** run the hourly weather ingestion from an EC2 instance in **`ap-southeast-2`
(Sydney)** instead of GitHub Actions (US runners). The council Hilltop APIs are in
NZ; from a US runner each request pays ~180 ms RTT × a TCP+TLS handshake, so a run
of a few hundred sequential requests balloons to 45 min and times out. From Sydney
(~30 ms to NZ) — plus the `requests.Session` keep-alive already in `http_util.py` —
the same run is a few minutes.

**Scope:** only `weather-ingestion.yml` (the 7 council/harvest sources) moves. SYNOP
(`synop-live.yml`) and `daily-processing.yml` stay on GitHub for now (low volume,
not latency-bound).

**Decisions (change if you prefer):**
- Instance: **t3.micro** (x86, free-tier eligible 12 mo; 2 vCPU / 1 GB) or **t4g.nano**
  (ARM, ~US$3/mo, cheapest post-free-tier). This runbook uses t3.micro.
- OS: Amazon Linux 2023.
- Schedule: hourly, one wrapper that runs the 7 sources with modest parallelism.
- RDS creds via **Secrets Manager + instance IAM role** (no password on the box).
- GitHub workflow stays present but disabled — instant fallback.

> Prereq you provide: an SSH keypair in ap-southeast-2, the VPC + subnet that the
> `auxein-db` RDS lives in, and permission to create IAM roles / EC2 / security groups.
> I don't have deploy creds — run the `aws`/console steps yourself; commands below are
> copy-paste.

Known facts used below: region `ap-southeast-2`, RDS instance `auxein-db`
(`auxein-db.cnmusikiqmmn.ap-southeast-2.rds.amazonaws.com:5432`, db `auxein_db`),
RDS secret `rds!db-49a041ba-9fc8-4df2-8fa6-ae50b09498ca`, sources
`harvest ecan mdc gw hbrc tdc gdc`.

### PROVISIONED 2026-07-29 (Steps 1-2 done)
| Resource | ID |
|---|---|
| Account | `992914515416` |
| IAM instance profile / role | `auxein-ingest-ec2` |
| Ingest security group | `sg-034c47350a16e6df5` |
| VPC | `vpc-03a13bd8504825dd9` |
| Public subnet (chosen) | `subnet-0317587a16a8b5e59` (ap-southeast-2a) |
| RDS security group | `sg-011550f434d067f69` (ingress from ingest SG on 5432 added) |
| Keypair | `auxein-ingest` (private key at `C:\Users\Peter Taylor\.ssh\auxein-ingest.pem`, chmod 600) |
| SSH allowed from | `203.211.79.144/32` (update if your IP changes) |
| **EC2 instance** | **`i-04224f070f54386a0` @ `54.79.120.8`** (t3.micro, ap-southeast-2a, running) |
| SSM secrets staged | `/auxein/ingest/HARVEST_API_KEY`, `/auxein/ingest/SECRET_KEY` |

Remaining: Steps 4-8 (SSH into the box and set it up). SSH:
`ssh -i ~/.ssh/auxein-ingest.pem ec2-user@54.79.120.8`

> **Git Bash gotcha:** any `aws` command with a `/`-prefixed arg (SSM names/paths)
> needs `MSYS_NO_PATHCONV=1` or Git Bash rewrites it into a Windows path.

**Repo auth (needed for Step 4 `git clone`):** the repo is private, so on the box you
need either (a) a read-only GitHub **deploy key** — `ssh-keygen` on the EC2, add the
`.pub` to the repo's Deploy Keys — or (b) a fine-grained read-only **PAT** in the clone
URL. Pick one before Step 4.

---

## Step 1 — IAM role for the instance

Lets the box read the RDS secret (and the two app secrets if you use SSM) without
storing any password.

```bash
# trust policy
cat > /tmp/ec2-trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON

aws iam create-role --role-name auxein-ingest-ec2 \
  --assume-role-policy-document file:///tmp/ec2-trust.json --region ap-southeast-2

# read the RDS secret + (optional) SSM params for HARVEST_API_KEY / SECRET_KEY
cat > /tmp/ingest-policy.json <<'JSON'
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["secretsmanager:GetSecretValue"],
  "Resource":"arn:aws:secretsmanager:ap-southeast-2:992914515416:secret:rds!db-*"},
 {"Effect":"Allow","Action":["ssm:GetParameter","ssm:GetParameters"],
  "Resource":"arn:aws:ssm:ap-southeast-2:992914515416:parameter/auxein/ingest/*"}
]}
JSON
aws iam put-role-policy --role-name auxein-ingest-ec2 \
  --policy-name auxein-ingest-secrets --policy-document file:///tmp/ingest-policy.json

aws iam create-instance-profile --instance-profile-name auxein-ingest-ec2
aws iam add-role-to-instance-profile \
  --instance-profile-name auxein-ingest-ec2 --role-name auxein-ingest-ec2
```

## Step 2 — Security group + RDS reachability

The instance must reach RDS on 5432. If `auxein-db` is **publicly accessible** (it is
today — your workstation connects to it directly), the EC2 reaches it the same way;
you still want its SG allowed on the RDS SG.

```bash
# find the RDS's VPC + security group
aws rds describe-db-instances --db-instance-identifier auxein-db --region ap-southeast-2 \
  --query 'DBInstances[0].{vpc:DBSubnetGroup.VpcId,sg:VpcSecurityGroups[0].VpcSecurityGroupId,subnet:DBSubnetGroup.Subnets[0].SubnetIdentifier}'

# create an SG for the ingest box in that VPC
aws ec2 create-security-group --group-name auxein-ingest-sg \
  --description "Auxein ingestion EC2" --vpc-id <VPC_ID> --region ap-southeast-2
# outbound is open by default (needs internet to reach NZ council APIs).
# allow SSH from your IP only:
aws ec2 authorize-security-group-ingress --group-id <INGEST_SG> \
  --protocol tcp --port 22 --cidr <YOUR_IP>/32 --region ap-southeast-2

# allow the ingest SG to reach RDS on 5432
aws ec2 authorize-security-group-ingress --group-id <RDS_SG> \
  --protocol tcp --port 5432 --source-group <INGEST_SG> --region ap-southeast-2
```
If the box is in a private subnet it needs a NAT gateway for outbound internet. The
simplest path: put it in a **public subnet** with a public IP (SSH locked to your IP).

## Step 3 — Launch the instance

```bash
aws ec2 run-instances --region ap-southeast-2 \
  --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type t3.micro \
  --key-name <YOUR_KEYPAIR> \
  --iam-instance-profile Name=auxein-ingest-ec2 \
  --security-group-ids <INGEST_SG> --subnet-id <PUBLIC_SUBNET> \
  --associate-public-ip-address \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=auxein-ingest}]'
```
SSH in: `ssh -i <key.pem> ec2-user@<PUBLIC_IP>`

## Step 4 — Instance setup (repo + venv)

```bash
sudo dnf -y install git python3.11 python3.11-pip
sudo mkdir -p /opt/auxein && sudo chown ec2-user /opt/auxein
git clone <REPO_URL> /opt/auxein        # or deploy via your preferred method
cd /opt/auxein
python3.11 -m venv .venv
. .venv/bin/activate
pip install boto3==1.34.0 pydantic==2.5.0 pydantic-settings==2.1.0
pip install -r ingestion/requirements.txt
```

## Step 5 — Secrets / environment

RDS creds come from Secrets Manager via the instance role. The two app secrets
(`HARVEST_API_KEY`, `SECRET_KEY`) go in SSM Parameter Store (SecureString) so nothing
sensitive sits in a file:

```bash
# you run these once (values from your current GitHub secrets)
aws ssm put-parameter --name /auxein/ingest/HARVEST_API_KEY --type SecureString --value '<...>' --region ap-southeast-2
aws ssm put-parameter --name /auxein/ingest/SECRET_KEY      --type SecureString --value '<...>' --region ap-southeast-2
```

Create `/opt/auxein/ingestion/aws.env` (non-secret config only; `chmod 600`):
```
ENV=staging
AWS_REGION=ap-southeast-2
RDS_SECRET_NAME=rds!db-49a041ba-9fc8-4df2-8fa6-ae50b09498ca
RDS_DATABASE=auxein_db
RDS_ENDPOINT=auxein-db.cnmusikiqmmn.ap-southeast-2.rds.amazonaws.com
RDS_PORT=5432
VITE_API_URL=https://api.auxein.co.nz/api/v1
```

## Step 6 — Wrapper script + cron

`/opt/auxein/ingestion/run_all.sh` (runs the 7 sources, ≤3 in parallel, each capped):
```bash
#!/usr/bin/env bash
set -uo pipefail
cd /opt/auxein/ingestion
mkdir -p /var/log/auxein

# config + secrets into the environment
set -a; . /opt/auxein/ingestion/aws.env; set +a
export HARVEST_API_KEY=$(aws ssm get-parameter --name /auxein/ingest/HARVEST_API_KEY --with-decryption --query Parameter.Value --output text --region ap-southeast-2)
export SECRET_KEY=$(aws ssm get-parameter --name /auxein/ingest/SECRET_KEY --with-decryption --query Parameter.Value --output text --region ap-southeast-2)
export PYTHONIOENCODING=utf-8
PY=/opt/auxein/.venv/bin/python

for s in harvest ecan mdc gw hbrc tdc gdc; do
  ( timeout 40m "$PY" run_ingestion.py --source "$s" --period incremental \
      >> "/var/log/auxein/ingest_${s}.log" 2>&1 ) &
  while [ "$(jobs -rp | wc -l)" -ge 3 ]; do wait -n; done   # cap at 3 concurrent
done
wait
```
```bash
chmod +x /opt/auxein/ingestion/run_all.sh
```

Cron (hourly at :05, UTC on the box):
```bash
( crontab -l 2>/dev/null; echo '5 * * * * /opt/auxein/ingestion/run_all.sh' ) | crontab -
```
Log rotation:
```bash
sudo tee /etc/logrotate.d/auxein <<'EOF'
/var/log/auxein/*.log { weekly rotate 4 compress missingok notifempty }
EOF
```

## Step 7 — Validate (before cutting over)

```bash
# one source, watch it fly (should be a few minutes, not 45)
time /opt/auxein/.venv/bin/python run_all.sh   # or a single: --source hbrc
tail -n 40 /var/log/auxein/ingest_hbrc.log
```
Confirm fresh rows in the DB (from your workstation):
```sql
SELECT data_source, max(created_at) FROM timeseries_observations o
JOIN weather_stations w ON w.station_id=o.station_id
WHERE w.data_source IN ('HBRC','MDC','GDC') GROUP BY 1;
```
Watch one full hourly tick, confirm all 7 logs show completion well under the hour.

## Step 8 — Cut over

Once a couple of hourly ticks look good on AWS: **disable `weather-ingestion.yml`** in
GitHub (Actions → the workflow → Disable). Leave the file in the repo as a fallback —
re-enable it if the box has an issue. SYNOP + daily-processing stay on GitHub.

---

## Maintenance

- **Code updates:** you push to `main`; on the box `cd /opt/auxein && git pull` (or add
  a nightly `git pull` cron). Restarting nothing needed — cron picks up the new code on
  the next tick.
- **Patching:** `sudo dnf -y update` periodically; reboots are fine (cron resumes).
- **Monitoring:** the same `ingestion_log` table + `created_at` freshness checks work.
  Optionally install the CloudWatch agent to ship `/var/log/auxein/*.log` + a freshness
  alarm (e.g. no HBRC rows in 2 h → alert).
- **If a source ever wedges:** the `timeout 40m` in the wrapper + the in-code hard
  request timeout + per-source concurrency cap mean one bad source can't block the rest.

## Cost
t3.micro is free-tier eligible for 12 months (750 h/mo); after that ~US$8/mo on-demand,
or ~US$3/mo for t4g.nano. SSM + Secrets Manager reads are negligible.

## Rollback
Re-enable `weather-ingestion.yml` in GitHub and stop the box's cron
(`crontab -r`). No data migration — both paths write the same RDS.

## Future
When validated, an even lower-ops option is **ECS Fargate scheduled tasks** (EventBridge
→ one task per source): no server to patch, pay-per-run. The container just needs the
repo + the same env; the IAM task role replaces the instance role. Defer unless the box
becomes a maintenance burden.
