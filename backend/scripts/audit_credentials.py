#!/usr/bin/env python3
"""
scripts/audit_credentials.py

Hygiene audit for the ingestion credential system. Run before customer
onboarding, after rotations, and as a CI job after credential-related
migrations.

Runs four categories of checks:

  [A] Every active `ingestion_credentials` row resolves end-to-end
      (row → secret_arn or env_var_fallback → actual value).
  [B] Every `devices.api_credential_ref` in use points to an existing,
      active `ingestion_credentials` row.
  [C] Every active `ingestion_credentials` row is referenced by at least
      one active device (flags unused credentials).
  [D] AWS Secrets Manager hygiene for the `auxein/ingestion/*` namespace:
      - every secret has the required tags
      - every secret has a matching ingestion_credentials row
      (matched by ARN)

Usage:
    python scripts/audit_credentials.py              # all checks
    python scripts/audit_credentials.py --no-aws     # skip category [D]
    python scripts/audit_credentials.py --json       # machine-readable output

Exit code:
    0  every check clean
    1  issues found (WARN or FAIL)
    2  script error (DB connection, unexpected exception)
"""
import argparse
import json
import logging
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import text

from db.session import SessionLocal
from services.credential_service import (
    CredentialResolver, CredentialError,
)

logging.basicConfig(level=logging.WARNING, format='%(levelname)s: %(message)s')

AWS_SECRET_NAMESPACE = 'auxein/ingestion/'
REQUIRED_TAGS = {'provider', 'purpose', 'company_id', 'created_by', 'contact_email'}


def check_a_resolution(db, resolver) -> list[dict]:
    """[A] Every active credential resolves."""
    rows = db.execute(text("""
        SELECT provider, name, secret_arn, env_var_fallback
        FROM ingestion_credentials
        WHERE is_active = true
        ORDER BY provider, name
    """)).fetchall()

    findings = []
    for r in rows:
        ref = f"{r.provider.lower()}/{r.name}"
        if r.secret_arn:
            source = 'secrets_manager'
        elif r.env_var_fallback:
            source = f'env_var({r.env_var_fallback})'
        else:
            findings.append({
                'check': 'A', 'level': 'FAIL', 'ref': ref,
                'detail': 'credential has neither secret_arn nor env_var_fallback',
            })
            continue

        try:
            value = resolver.resolve(ref)
            findings.append({
                'check': 'A', 'level': 'OK', 'ref': ref,
                'detail': f'source={source} len={len(value)}',
            })
        except CredentialError as e:
            findings.append({
                'check': 'A', 'level': 'FAIL', 'ref': ref,
                'detail': f'{type(e).__name__}: {e}',
            })
    return findings


def check_b_orphan_device_refs(db) -> list[dict]:
    """[B] Every device.api_credential_ref points at an existing active credential row."""
    rows = db.execute(text("""
        SELECT d.api_credential_ref, COUNT(*) AS device_count
        FROM devices d
        WHERE d.is_active = true
          AND d.api_credential_ref IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM ingestion_credentials ic
              WHERE lower(ic.provider) || '/' || ic.name = lower(d.api_credential_ref)
                AND ic.is_active = true
          )
        GROUP BY d.api_credential_ref
        ORDER BY d.api_credential_ref
    """)).fetchall()

    if not rows:
        return [{'check': 'B', 'level': 'OK', 'ref': '*',
                 'detail': 'all active devices reference a valid credential'}]

    return [{
        'check': 'B', 'level': 'FAIL', 'ref': r.api_credential_ref,
        'detail': f'{r.device_count} active device(s) reference this, but no active ingestion_credentials row exists',
    } for r in rows]


def check_c_unused_credentials(db) -> list[dict]:
    """[C] Every active credential has at least one active device referencing it."""
    rows = db.execute(text("""
        SELECT lower(ic.provider) || '/' || ic.name AS ref
        FROM ingestion_credentials ic
        WHERE ic.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM devices d
              WHERE d.is_active = true
                AND lower(d.api_credential_ref) = lower(ic.provider) || '/' || ic.name
          )
        ORDER BY ref
    """)).fetchall()

    if not rows:
        return [{'check': 'C', 'level': 'OK', 'ref': '*',
                 'detail': 'all active credentials referenced by at least one active device'}]

    return [{
        'check': 'C', 'level': 'WARN', 'ref': r.ref,
        'detail': 'active credential has no active devices — consider deactivating',
    } for r in rows]


def check_d_aws_hygiene(db, region: str) -> list[dict]:
    """[D] AWS Secrets Manager hygiene for auxein/ingestion/*."""
    try:
        client = boto3.client('secretsmanager', region_name=region)
        secrets: list[dict] = []
        paginator = client.get_paginator('list_secrets')
        for page in paginator.paginate(
            Filters=[{'Key': 'name', 'Values': [AWS_SECRET_NAMESPACE]}]
        ):
            secrets.extend(page.get('SecretList', []))
    except (BotoCoreError, ClientError) as e:
        return [{
            'check': 'D', 'level': 'FAIL', 'ref': 'aws',
            'detail': f'could not list secrets: {type(e).__name__}: {e}',
        }]

    # Build ARN → credential row lookup (match by ARN not name — safer)
    cred_arns = {
        r.secret_arn: f"{r.provider.lower()}/{r.name}"
        for r in db.execute(text("""
            SELECT provider, name, secret_arn
            FROM ingestion_credentials
            WHERE secret_arn IS NOT NULL
        """)).fetchall()
    }

    findings: list[dict] = []
    for secret in secrets:
        name = secret.get('Name', '(unnamed)')
        arn = secret.get('ARN', '')
        tags = {t['Key']: t['Value'] for t in secret.get('Tags', [])}
        missing_tags = REQUIRED_TAGS - tags.keys()

        # Match by ARN first, fall back to name-prefix match for pre-tag drift
        linked_ref = cred_arns.get(arn)

        if missing_tags:
            findings.append({
                'check': 'D', 'level': 'FAIL', 'ref': name,
                'detail': f'missing tags: {", ".join(sorted(missing_tags))}',
            })
        elif not linked_ref:
            findings.append({
                'check': 'D', 'level': 'WARN', 'ref': name,
                'detail': 'AWS secret has no matching ingestion_credentials row (orphan)',
            })
        else:
            findings.append({
                'check': 'D', 'level': 'OK', 'ref': name,
                'detail': f'linked to {linked_ref}, tags complete',
            })

    if not findings:
        findings.append({
            'check': 'D', 'level': 'WARN', 'ref': AWS_SECRET_NAMESPACE,
            'detail': 'no secrets found in this namespace — expected at least harvest/default',
        })
    return findings


CHECK_TITLES = {
    'A': 'Credential resolution',
    'B': 'Device credential refs',
    'C': 'Unused credentials',
    'D': 'AWS Secrets Manager hygiene',
}


def print_text_report(findings: list[dict]) -> None:
    grouped = defaultdict(list)
    for f in findings:
        grouped[f['check']].append(f)

    print("=== Ingestion Credentials Audit ===\n")
    for check in sorted(grouped):
        title = CHECK_TITLES.get(check, check)
        print(f"[{check}] {title}")
        for f in grouped[check]:
            pad = {'OK': 'OK  ', 'WARN': 'WARN', 'FAIL': 'FAIL'}.get(f['level'], f['level'])
            print(f"  {pad} {f['ref']:40s} {f['detail']}")
        print()


def summarize(findings: list[dict]) -> dict:
    by_level: dict[str, int] = defaultdict(int)
    for f in findings:
        by_level[f['level']] += 1
    return dict(by_level)


def main():
    parser = argparse.ArgumentParser(description="Audit ingestion credentials")
    parser.add_argument('--no-aws', action='store_true',
                        help='skip AWS-side checks (category D)')
    parser.add_argument('--json', action='store_true', dest='as_json',
                        help='emit findings as JSON (stdout), no text report')
    parser.add_argument('--region', default=None,
                        help='AWS region for Secrets Manager (default: AWS_REGION env or ap-southeast-2)')
    args = parser.parse_args()

    try:
        with SessionLocal() as db:
            resolver = CredentialResolver(db=db, region_name=args.region)
            findings: list[dict] = []
            findings.extend(check_a_resolution(db, resolver))
            findings.extend(check_b_orphan_device_refs(db))
            findings.extend(check_c_unused_credentials(db))
            if not args.no_aws:
                import os
                region = args.region or os.getenv('AWS_REGION', 'ap-southeast-2')
                findings.extend(check_d_aws_hygiene(db, region))
    except Exception as e:  # noqa: BLE001 — anything here is a script error
        print(f"AUDIT SCRIPT ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    summary = summarize(findings)

    if args.as_json:
        print(json.dumps({'findings': findings, 'summary': summary}, indent=2))
    else:
        print_text_report(findings)
        print("=== Summary ===")
        for level in ('OK', 'WARN', 'FAIL'):
            print(f"  {level}: {summary.get(level, 0)}")
        print()

    return 1 if (summary.get('WARN', 0) or summary.get('FAIL', 0)) else 0


if __name__ == '__main__':
    sys.exit(main())
