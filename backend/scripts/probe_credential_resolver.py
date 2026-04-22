#!/usr/bin/env python3
"""
scripts/probe_credential_resolver.py

Resolve a credential ref against the live DB + AWS / env, print outcome
without revealing the secret value. Used to validate the resolver path
end-to-end before relying on it in ingestion.

Usage:
    python scripts/probe_credential_resolver.py harvest/default
    python scripts/probe_credential_resolver.py harvest/black-estate
    python scripts/probe_credential_resolver.py --all-active

Output (success):
    OK   harvest/default               source=env_var (HARVEST_API_KEY)        len=32
    OK   harvest/maori-point           source=secrets_manager                  len=32

Output (failure):
    FAIL harvest/missing               CredentialNotFound: No ingestion_credentials row for ...

Exit code: 0 if all probed refs resolved, 1 otherwise.
"""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text

from db.session import SessionLocal
from services.credential_service import (
    CredentialResolver, CredentialError, CredentialNotFound,
)

logging.basicConfig(
    level=logging.WARNING,
    format='%(levelname)s: %(message)s',
)


def list_active_refs(db) -> list[str]:
    """Every distinct api_credential_ref currently set on an active device,
    plus every active row in ingestion_credentials (so we surface seeded-but-
    unused credentials too)."""
    on_devices = db.execute(text("""
        SELECT DISTINCT api_credential_ref
        FROM devices
        WHERE api_credential_ref IS NOT NULL
          AND is_active = true
        ORDER BY api_credential_ref
    """)).scalars().all()

    seeded = db.execute(text("""
        SELECT lower(provider) || '/' || name
        FROM ingestion_credentials
        WHERE is_active = true
        ORDER BY provider, name
    """)).scalars().all()

    return sorted(set(on_devices) | set(seeded))


def probe(resolver, ref: str) -> tuple[bool, str]:
    """Return (ok, summary_string) for one ref."""
    try:
        # Inspect the credential row first so we can describe the source
        # without leaking values.
        provider, name = resolver.parse_ref(ref)
        row = resolver.db.execute(text("""
            SELECT secret_arn, env_var_fallback, is_active
            FROM ingestion_credentials
            WHERE provider = :p AND name = :n
        """), {'p': provider, 'n': name}).fetchone()
        if row is None:
            raise CredentialNotFound(
                f"No ingestion_credentials row for {provider}/{name}"
            )

        if row.secret_arn:
            source = "secrets_manager"
            detail = ""
        elif row.env_var_fallback:
            source = "env_var"
            detail = f"({row.env_var_fallback})"
        else:
            source = "unconfigured"
            detail = ""

        value = resolver.resolve(ref)
        return True, f"source={source} {detail}".strip() + f"  len={len(value)}"
    except CredentialError as e:
        return False, f"{type(e).__name__}: {e}"
    except Exception as e:  # noqa: BLE001 — surface anything unexpected
        return False, f"UNEXPECTED {type(e).__name__}: {e}"


def main():
    parser = argparse.ArgumentParser(description="Probe credential resolver")
    parser.add_argument(
        'refs',
        nargs='*',
        help="Refs to probe, e.g. harvest/default. If omitted, use --all-active.",
    )
    parser.add_argument(
        '--all-active',
        action='store_true',
        help="Probe every active credential ref found in DB.",
    )
    args = parser.parse_args()

    if not args.refs and not args.all_active:
        parser.error("Provide at least one ref, or pass --all-active.")

    with SessionLocal() as db:
        resolver = CredentialResolver(db=db)

        refs = list(args.refs)
        if args.all_active:
            refs = list_active_refs(db)
            print(f"Found {len(refs)} active credential ref(s)\n")

        if not refs:
            print("Nothing to probe.")
            return 0

        all_ok = True
        for ref in refs:
            ok, summary = probe(resolver, ref)
            status = "OK  " if ok else "FAIL"
            print(f"{status} {ref:30s} {summary}")
            if not ok:
                all_ok = False

        return 0 if all_ok else 1


if __name__ == '__main__':
    sys.exit(main())
