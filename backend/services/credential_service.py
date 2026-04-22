"""
Credential resolver for ingestion sources.

Phase B1 of DATA_INGESTION_PLATFORM_PLAN.md.

Resolves a credential ref string ('harvest/default', 'harvest/black-estate')
into the actual secret value (typically an API key). Devices reference a
credential via `devices.api_credential_ref`; the matching `ingestion_credentials`
row points to either an AWS Secrets Manager ARN or an env var fallback.

Lookup order per ref:
  1. `ingestion_credentials` row matching (provider, name) — case-insensitive on provider
  2. If `secret_arn` is set → fetch from AWS Secrets Manager (cached per process)
  3. Else if `env_var_fallback` is set → read os.environ
  4. Else raise CredentialNotFound

Caches resolved values in-process so a single ingestion run only fetches each
secret once even when many devices share the same credential. Secret values
are never logged.
"""
import logging
import os
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class CredentialError(Exception):
    """Base for credential resolution failures."""


class CredentialNotFound(CredentialError):
    """Ref does not exist in ingestion_credentials, or the row has neither
    secret_arn nor env_var_fallback configured."""


class CredentialFetchFailed(CredentialError):
    """Lookup row found but fetching the actual secret failed (AWS error,
    env var unset, etc.)."""


class CredentialResolver:
    """
    Resolves credential refs to secret values, cached per process.

    Construction:
        resolver = CredentialResolver(db=session)               # uses default boto3 client
        resolver = CredentialResolver(db=session, secrets_client=mock)  # for tests

    Use:
        api_key = resolver.resolve('harvest/default')
    """

    def __init__(self, db: Session, secrets_client=None, region_name: Optional[str] = None):
        self.db = db
        self._secrets_client = secrets_client
        self._region_name = region_name or os.getenv('AWS_REGION', 'ap-southeast-2')
        self._cache: dict[str, str] = {}

    @property
    def secrets_client(self):
        """Lazy boto3 client — only instantiated if a Secrets Manager fetch is actually needed."""
        if self._secrets_client is None:
            self._secrets_client = boto3.client('secretsmanager', region_name=self._region_name)
        return self._secrets_client

    @staticmethod
    def parse_ref(ref: str) -> tuple[str, str]:
        """'harvest/default' -> ('HARVEST', 'default'). Provider uppercased to match
        ingestion_credentials.provider; name kept verbatim."""
        if not ref or '/' not in ref:
            raise CredentialNotFound(
                f"Invalid credential ref '{ref}': expected '<provider>/<name>'"
            )
        provider, name = ref.split('/', 1)
        return provider.upper(), name

    def resolve(self, ref: str) -> str:
        """Resolve a credential ref to its secret value. Cached per process."""
        if ref in self._cache:
            return self._cache[ref]

        provider, name = self.parse_ref(ref)

        row = self.db.execute(text("""
            SELECT id, secret_arn, env_var_fallback, is_active
            FROM ingestion_credentials
            WHERE provider = :provider AND name = :name
        """), {'provider': provider, 'name': name}).fetchone()

        if row is None:
            raise CredentialNotFound(
                f"No ingestion_credentials row for provider='{provider}', name='{name}'"
            )
        if not row.is_active:
            raise CredentialNotFound(
                f"Credential {provider}/{name} (id={row.id}) is inactive"
            )

        value = self._fetch_value(provider, name, row.secret_arn, row.env_var_fallback)
        self._cache[ref] = value
        return value

    def _fetch_value(
        self,
        provider: str,
        name: str,
        secret_arn: Optional[str],
        env_var_fallback: Optional[str],
    ) -> str:
        """Pull the actual secret from AWS Secrets Manager (preferred) or env var fallback."""
        if secret_arn:
            try:
                response = self.secrets_client.get_secret_value(SecretId=secret_arn)
            except (BotoCoreError, ClientError) as e:
                # Log error class only — don't include the ARN's tail in case it's path-sensitive
                logger.error(
                    "Failed to fetch secret for %s/%s from Secrets Manager: %s",
                    provider, name, type(e).__name__,
                )
                raise CredentialFetchFailed(
                    f"AWS Secrets Manager fetch failed for {provider}/{name}: {e}"
                ) from e

            value = response.get('SecretString')
            if not value:
                raise CredentialFetchFailed(
                    f"Secret {provider}/{name} contains no SecretString (binary secrets unsupported)"
                )
            logger.info("Resolved %s/%s from Secrets Manager (length=%d)", provider, name, len(value))
            return value

        if env_var_fallback:
            value = os.environ.get(env_var_fallback)
            if not value:
                raise CredentialFetchFailed(
                    f"Credential {provider}/{name} declares env_var_fallback="
                    f"'{env_var_fallback}' but the env var is not set"
                )
            logger.info(
                "Resolved %s/%s from env var %s (length=%d)",
                provider, name, env_var_fallback, len(value),
            )
            return value

        raise CredentialNotFound(
            f"Credential {provider}/{name} has neither secret_arn nor env_var_fallback set"
        )
