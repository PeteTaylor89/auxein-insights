"""Country + industry scoping for the public climate endpoints.

Phase 1 of `docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md`.

Every public list of regions or zones is now scoped by a (country, industry)
pair. The pair comes from the URL — `/nz/wine/marlborough` — so the scope is
linkable and crawlable rather than hidden in client state.

## The defaults are load-bearing

`DEFAULT_COUNTRY` and `DEFAULT_INDUSTRY` are what every existing caller gets
when it passes nothing, and they are chosen so that an unscoped request returns
**byte-identical** results to what it returned before this module existed. New
Zealand wine is not a "sensible default" here — it is the entire contents of the
database, and any other choice would be a silent behaviour change for the live
frontend, the article widgets and the sitemap generator.

Remove the defaults only when a second country has data AND every caller passes
a scope explicitly. Until then a required scope parameter is a breaking change
dressed up as strictness.

## Unknown scope is 404, inactive scope is not

An unrecognised country or industry is a genuinely missing page. An inactive but
recognised one — Australia today — is a real place we intend to cover, and the
right answer is an empty result the caller can render as "coming soon", not an
error. So this resolver raises only on *unknown*, and reports `active` for the
caller to decide.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


DEFAULT_COUNTRY = 'NZ'
DEFAULT_INDUSTRY = 'wine'


@dataclass(frozen=True)
class Scope:
    """A resolved (country, industry) pair.

    `active` is the AND of both flags. A caller that wants to distinguish "the
    country is coming" from "the industry is coming" has the two ids and can
    ask; almost nothing needs to.
    """
    country_id: int
    country_iso2: str
    country_name: str
    country_active: bool
    industry_id: int
    industry_key: str
    industry_name: str
    industry_active: bool

    # False when the caller reached this scope by an ALIAS rather than by the
    # canonical segment — `/aus/wine` instead of `/au/wine`. The router uses it
    # to redirect, so there is still exactly one indexable URL per scope.
    canonical: bool = True

    @property
    def active(self) -> bool:
        return self.country_active and self.industry_active

    @property
    def canonical_country(self) -> str:
        """The segment this scope SHOULD be addressed by: lowercase ISO2."""
        return self.country_iso2.lower()


def resolve(
    db: Session,
    country: Optional[str] = None,
    industry: Optional[str] = None,
) -> Scope:
    """Resolve a scope, falling back to New Zealand wine.

    Raises 404 if either name is unknown. Case-insensitive on both, because
    these arrive from a URL segment and `/NZ/Wine/...` should not 404.

    The country may be given as ISO2 (`nz`) or ISO3 (`nzl`, `aus`). The returned
    scope reports `canonical=False` for the ISO3 form so the caller can redirect
    to the one address search engines should see.
    """
    iso2 = (country or DEFAULT_COUNTRY).strip()
    key = (industry or DEFAULT_INDUSTRY).strip()

    # ISO3 is accepted as an ALIAS. People type /aus/wine, and a 404 on a
    # guessable URL is a worse outcome than a redirect — but it must not become
    # a second indexable address for the same page, so `canonical` records which
    # form was used and the caller redirects the alias to the ISO2 form.
    row = db.execute(text("""
        SELECT c.id AS country_id, c.iso2, c.name AS country_name,
               c.is_active AS country_active,
               i.id AS industry_id, i.key, i.name AS industry_name,
               i.is_active AS industry_active,
               (lower(c.iso2) = lower(:iso2)) AS by_iso2
          FROM countries c
          CROSS JOIN industries i
         WHERE (lower(c.iso2) = lower(:iso2) OR lower(c.iso3) = lower(:iso2))
           AND lower(i.key) = lower(:key)
         -- An exact ISO2 hit always wins, in case some future country's ISO3
         -- collides with another's ISO2.
         ORDER BY by_iso2 DESC
         LIMIT 1
    """), {"iso2": iso2, "key": key}).mappings().first()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scope: country '{iso2}', industry '{key}'")

    return Scope(
        country_id=row["country_id"],
        country_iso2=row["iso2"],
        country_name=row["country_name"],
        country_active=row["country_active"],
        industry_id=row["industry_id"],
        industry_key=row["key"],
        industry_name=row["industry_name"],
        industry_active=row["industry_active"],
        canonical=bool(row["by_iso2"]),
    )
