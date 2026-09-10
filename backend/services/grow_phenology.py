"""Three answers to "where is this block", side by side.

The Grow phenology panel has always had three tracks in its design and none of
them wired — `PhenologyPanel.jsx` has carried the comment "All data below is
mock" since 2026-05-29. This assembles the real three:

    REGIONAL  the zone model. Every company has this, and it is the only track
              that needs no setup at all.
    SITE      the same model run at THIS PROPERTY's own point, against its own
              1986-2005 baseline. Needs an `insights_site` (phase 1).
    OBSERVED  what somebody actually saw and typed in. Needs field capture, and
              is the only track that can contradict the other two.

## THE PANEL IS PER PROPERTY, THE MODELS ARE PER VARIETY

So the assembly is per variety, and the varieties are the ones actually PLANTED
on the property — resolved through `services/variety_codes` from
`vineyard_blocks.variety`, which is free text. A property growing Pinot noir and
Riesling gets two variety cards, not the ten the model happens to hold.

Varieties the models cannot run are returned too, under `unmodelled`. Six of the
107 customer blocks are in that state (Chenin blanc, Pinotage, Aglianico,
Gewurztraminer) and silently dropping them would leave a grower looking for a
block that is not there.

## THE TWO MODELS DISAGREE ABOUT COVERAGE, AND THE PAYLOAD SAYS SO

`has_gdd` and `has_budburst` travel per variety. Pinot gris has a budburst date
and no flowering, veraison or harvest; Cabernet franc, Cabernet sauvignon,
Grenache and Riesling have stages but no budburst. A blank date is either "not
modelled for this variety" or "the model has nothing to project from yet", and
the panel must be able to tell a reader which.

## WITHHELD DATES STAY WITHHELD

Both the regional and site tracks come through code that already applies
`services/phenology_basis` — a date is dropped unless there is accumulation to
project from AND it lands inside its own vintage. Nothing here re-derives a
date, so nothing here can leak one that those tests rejected.
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from db.models.block import VineyardBlock
from db.models.insights_site import InsightsSite
from db.models.observation_run import ObservationRun, ObservationSpot
from db.models.observation_template import ObservationTemplate
from db.models.property import Property
from services import phenology_stages as phen
from services import variety_codes
from services import insights_dashboard as dash
from sqlalchemy import or_

log = logging.getLogger(__name__)


def _vintage_for(db: Session, site_id: Optional[int],
                 zone_id: Optional[int] = None) -> Optional[int]:
    """The latest vintage there are estimates for — site first, then zone.

    Read from the data rather than from the calendar. The two vintage
    conventions in the platform disagree in May and June — the phenology model
    follows a July-June cycle while the Pro season is Sep-Apr — and picking the
    wrong one returns an empty payload for a site that has perfectly good rows.

    **The zone fallback is the important half.** Deriving the vintage from the
    site alone meant a company with no site got no vintage, and therefore no
    REGIONAL track either — the one track that needs no setup at all was
    silently switched off by the absence of the one that does.
    """
    if site_id is not None:
        found = db.execute(text(
            "SELECT max(vintage_year) FROM insights_site_phenology WHERE site_id = :s"
        ), {"s": site_id}).scalar()
        if found is not None:
            return found
    if zone_id is not None:
        return db.execute(text(
            "SELECT max(vintage_year) FROM phenology_estimates WHERE zone_id = :z"
        ), {"z": zone_id}).scalar()
    return None


def _site_rows(db: Session, site_id: int, vintage: int) -> Dict[str, dict]:
    """Latest site estimate per variety, keyed on code.

    The same query the Pro site page runs, minus the account-sibling spread —
    that is a distribution across one client's network, which a Grow property
    does not have.
    """
    rows = db.execute(text("""
        SELECT DISTINCT ON (p.variety_code)
               p.variety_code, p.estimate_date, p.gdd_accumulated,
               p.current_stage, p.avg_daily_gdd,
               p.flowering_date, p.flowering_is_actual,
               p.veraison_date, p.veraison_is_actual,
               p.harvest_210_date, p.harvest_220_date,
               p.days_vs_baseline, p.gdd_vs_baseline, p.baseline_source,
               p.budburst_date, p.budburst_is_actual, p.chill_units,
               p.forcing_units, p.variety_is_assumed,
               p.zone_gdd_accumulated, p.zone_flowering_date,
               p.zone_veraison_date, p.zone_harvest_210_date,
               t.variety_name
          FROM insights_site_phenology p
          LEFT JOIN phenology_thresholds t ON t.variety_code = p.variety_code
         WHERE p.site_id = :sid AND p.vintage_year = :v
         ORDER BY p.variety_code, p.estimate_date DESC
    """), {"sid": site_id, "v": vintage}).mappings().all()
    return {r["variety_code"]: dict(r) for r in rows}


def _observed_by_variety(db: Session, prop: Property,
                         block_codes: Dict[int, List[str]]) -> Dict[str, phen.StageRollup]:
    """Field-observed stages for this property, rolled up per VARIETY CODE.

    Rolled up by variety rather than by block because the panel compares against
    a per-variety model. A block planted to two varieties contributes its spots
    to BOTH — which is the honest reading: the observer stood in a block that
    grows both and did not say which vine they were looking at.
    """
    block_ids = list(block_codes)
    if not block_ids:
        return {}

    templates = db.query(ObservationTemplate).filter(
        or_(ObservationTemplate.company_id == prop.owner_company_id,
            ObservationTemplate.company_id.is_(None))
    ).all()
    template_ids = [t.id for t in templates if phen.is_phenology_template(t)]
    if not template_ids:
        return {}

    pairs = (db.query(ObservationSpot)
               .join(ObservationRun, ObservationRun.id == ObservationSpot.run_id)
               .filter(ObservationSpot.block_id.in_(block_ids),
                       ObservationRun.template_id.in_(template_ids))
               .all())

    out: Dict[str, phen.StageRollup] = {}
    for spot in pairs:
        for code in block_codes.get(spot.block_id, []):
            out.setdefault(code, phen.StageRollup()).add(spot.data_json, spot.observed_at)
    return out


def _iso(value) -> Optional[str]:
    return value.isoformat() if value else None


def _site_track(row: Optional[dict]) -> Optional[dict]:
    """The site's own figures for one variety."""
    if row is None:
        return None
    gdd = row.get("gdd_accumulated")
    return {
        "estimate_date": _iso(row.get("estimate_date")),
        "gdd": float(gdd) if gdd is not None else None,
        "current_stage": row.get("current_stage"),
        "budburst_date": _iso(row.get("budburst_date")),
        "budburst_is_actual": bool(row.get("budburst_is_actual")),
        "flowering_date": _iso(row.get("flowering_date")),
        "flowering_is_actual": bool(row.get("flowering_is_actual")),
        "veraison_date": _iso(row.get("veraison_date")),
        "veraison_is_actual": bool(row.get("veraison_is_actual")),
        "harvest_210_date": _iso(row.get("harvest_210_date")),
        "harvest_220_date": _iso(row.get("harvest_220_date")),
        "days_vs_baseline": row.get("days_vs_baseline"),
        "baseline_source": row.get("baseline_source"),
        # TRUE when the SITE names no variety, which is every Grow site by
        # design — a property grows several and naming one would make the other
        # rows look less trustworthy than they are. Passed through so the panel
        # can say "modelled for this variety at your point" rather than implying
        # the point was placed for it.
        "variety_is_assumed": bool(row.get("variety_is_assumed")),
    }


def _observed_track(rollup: Optional[phen.StageRollup]) -> Optional[dict]:
    if rollup is None or rollup.readable == 0:
        return None
    return {
        "stage": rollup.modal,
        "stage_name": phen.stage_name(rollup.modal),
        "most_advanced_stage": rollup.most_advanced,
        "most_advanced_stage_name": phen.stage_name(rollup.most_advanced),
        "phase": phen.stage_phase(rollup.most_advanced),
        "stage_range": rollup.range_label,
        "is_uniform": rollup.is_uniform,
        "spots": rollup.spots,
        "readable_spots": rollup.readable,
        "observed_on": _iso(rollup.latest_observed),
        "note": rollup.note(),
    }


def property_phenology(db: Session, prop: Property,
                       vintage: Optional[int] = None) -> dict:
    """Assemble all three tracks for one property."""
    blocks = (db.query(VineyardBlock)
                .filter(VineyardBlock.property_id == prop.id)
                .all())
    resolved = variety_codes.resolve_blocks(db, blocks)

    # variety code -> the blocks growing it, and code -> display name.
    blocks_for: Dict[str, List[dict]] = {}
    names: Dict[str, str] = {}
    coverage: Dict[str, dict] = {}
    block_codes: Dict[int, List[str]] = {}
    unmodelled: Dict[str, List[dict]] = {}

    for block in blocks:
        res = resolved[block.id]
        block_codes[block.id] = res.codes
        label = block.block_name or f"Block {block.id}"
        for match in res.matches:
            blocks_for.setdefault(match.variety_code, []).append(
                {"block_id": block.id, "label": label, "variety_text": block.variety})
            names[match.variety_code] = match.variety_name
            coverage[match.variety_code] = {"has_gdd": match.has_gdd,
                                            "has_budburst": match.has_budburst}
        for fragment in res.unmatched:
            unmodelled.setdefault(fragment, []).append(
                {"block_id": block.id, "label": label})

    site = db.get(InsightsSite, prop.insights_site_id) if prop.insights_site_id else None
    site_ready = site is not None and site.status == "ready"

    # Regional: the zone model. Prefer the SITE's resolved zone over the
    # property's typed one — the site's came from a point-in-polygon test, the
    # property's was chosen from a dropdown.
    zone_id = (site.zone_id if site else None) or prop.climate_zone_id
    vintage = vintage or _vintage_for(db, site.id if site_ready else None, zone_id)

    site_rows = (_site_rows(db, site.id, vintage)
                 if (site_ready and vintage) else {})

    regional_rows: Dict[str, dict] = {}
    regional_reason = None
    if not zone_id:
        regional_reason = ("No climate zone is set for this property, so there is "
                           "no regional model to compare against. Set one in "
                           "Manage → Weather.")
    elif not vintage:
        regional_reason = "The regional phenology model has not run for this zone yet."
    else:
        rows, _any, regional_reason = dash._phenology_varieties(db, zone_id, vintage)
        regional_rows = {r["code"]: r for r in rows}

    observed = _observed_by_variety(db, prop, block_codes)

    varieties = []
    for code, blks in sorted(blocks_for.items(),
                             key=lambda kv: -len(kv[1])):
        varieties.append({
            "variety_code": code,
            "variety_name": names.get(code, code),
            "has_gdd": coverage[code]["has_gdd"],
            "has_budburst": coverage[code]["has_budburst"],
            "blocks": blks,
            "block_count": len(blks),
            "regional": regional_rows.get(code),
            "site": _site_track(site_rows.get(code)),
            "observed": _observed_track(observed.get(code)),
        })

    return {
        "property_id": prop.id,
        "property_name": prop.name,
        # No blocks on the property at all is a different thing from blocks
        # whose variety cannot be modelled, and it has a different fix. Several
        # live properties are in this state — the blocks exist but carry no
        # property_id — and without this the panel would just be empty.
        "blocks_total": len(blocks),
        "blocks_reason": (
            "No blocks are assigned to this property yet, so there is nothing "
            "to report a growth stage for. Assign them in Manage → Blocks."
            if not blocks else None),
        "vintage_year": vintage,
        "zone_id": zone_id,
        "regional_reason": regional_reason,
        # Everything the panel needs to explain a missing SITE track, rather
        # than rendering an empty column with no reason.
        "site": None if site is None else {
            "id": site.id, "status": site.status, "is_ready": site_ready,
            "latitude": site.latitude, "longitude": site.longitude,
            "label": site.label, "status_detail": site.status_detail,
        },
        "site_reason": (
            None if site_ready else
            "This property has no climate site yet, so there is no modelled "
            "estimate at its own point. Create one in Manage → Weather."
            if site is None else
            "This property's climate site is still building its history."
        ),
        "varieties": varieties,
        "unmodelled": [{"variety_text": k, "blocks": v}
                       for k, v in sorted(unmodelled.items())],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
