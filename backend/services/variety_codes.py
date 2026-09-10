"""Resolve a Grow block's free-text variety to the phenology model's code.

`vineyard_blocks.variety` is typed by whoever set the block up. Live values
across 107 customer blocks include "Pinot Noir" and "Pinot noir" as separate
strings, "Viognier/Riesling/Pinot Noir" on one block, and "Pinot Gris (2.0ha)
and Pinot Noir" on another. The phenology models are keyed on a two-letter code.
Something has to sit between them, and it has to be the same something
everywhere or the panel and the report will disagree about what a block grows.

## THE TWO MODELS DO NOT COVER THE SAME VARIETIES

This is the part that makes a single `has_model` boolean a lie:

    phenology_thresholds  (GDD: flowering, veraison, harvest)
        CF CS CH GR ME PN RI SB SY          -- nine, no Pinot gris
    budburst_parameters   (APSIM chilling-forcing: budburst)
        CH ME PG PN SB SY                   -- six

So **Pinot gris has a budburst date and no flowering, veraison or harvest**, and
**Cabernet franc, Cabernet sauvignon, Grenache and Riesling have stages but no
budburst date**. `services/site_phenology.varieties` already unions the two and
leaves `current_stage` unset for a budburst-only variety; this reports the same
distinction as two flags rather than flattening it, because a caller that shows
a blank flowering date needs to know whether it is missing or not modelled.

## NOTE: GR IS GRENACHE

Not Gewurztraminer. The codes read like initials and two of them are traps —
`GR` is Grenache and `CS` is Cabernet sauvignon, so a Gewurztraminer block has
**no model at all**, as do Chenin blanc, Pinotage and Aglianico. Four of the
fourteen distinct variety strings in Grow today resolve to nothing.

## NO FALLBACK, EVER

An unmatched variety returns nothing and says so. The tempting default is Pinot
noir, because it is the most planted variety in the database — and it would put
a confident flowering date on a Chenin blanc block that is weeks out, with
nothing on screen to suggest it was invented. Same rule costing uses for a
missing denominator: no answer beats a wrong one.
"""
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

#: Free text -> variety code. Keys are already normalised by `_normalise`.
#:
#: Bare "pinot" is deliberately ABSENT. It is ambiguous between noir, gris and
#: meunier, and including it would match "Pinotage" — a different grape
#: entirely, which has no model and must stay unmatched rather than silently
#: becoming Pinot noir.
ALIASES: Dict[str, str] = {
    "pinot noir": "PN",
    "pinot noire": "PN",
    "pn": "PN",
    "sauvignon blanc": "SB",
    "sauvignon blance": "SB",
    "sauv blanc": "SB",
    "savvy": "SB",
    "sb": "SB",
    "chardonnay": "CH",
    "chard": "CH",
    "ch": "CH",
    "riesling": "RI",
    "ri": "RI",
    "pinot gris": "PG",
    "pinot grigio": "PG",
    "pg": "PG",
    "cabernet franc": "CF",
    "cab franc": "CF",
    "cf": "CF",
    "cabernet sauvignon": "CS",
    "cabernet sauv": "CS",
    "cab sauv": "CS",
    "cab sav": "CS",
    "cs": "CS",
    "merlot": "ME",
    "me": "ME",
    "syrah": "SY",
    "shiraz": "SY",
    "sy": "SY",
    "grenache": "GR",
    "gr": "GR",
}

#: What a compound variety string is split on. "Pinot Gris (2.0ha) and Pinot
#: Noir" and "Viognier/Riesling/Pinot Noir" are both real live values.
_SPLIT = re.compile(r"\s*(?:/|,|&|\+|\band\b|\bwith\b)\s*", re.IGNORECASE)

#: Parentheticals carry areas and notes — "(2.0ha)", "(Thomas Brothers)" —
#: never the variety, and they break every match they sit inside.
_PARENS = re.compile(r"\([^)]*\)")


def _normalise(fragment: str) -> str:
    """Lowercase, de-accent, strip punctuation. 'Gewürztraminer' -> 'gewurztraminer'."""
    text_ = unicodedata.normalize("NFKD", fragment or "")
    text_ = "".join(c for c in text_ if not unicodedata.combining(c))
    text_ = text_.lower()
    text_ = re.sub(r"[^a-z0-9\s]", " ", text_)
    return re.sub(r"\s+", " ", text_).strip()


@dataclass
class VarietyMatch:
    """One variety found in a block's variety string, and what it can be modelled for."""
    variety_code: str
    variety_name: str
    #: The fragment of the original string this came from, so a UI can show the
    #: user which of their own words was understood.
    matched_text: str
    #: GDD stages: flowering, veraison, harvest. False for Pinot gris.
    has_gdd: bool = False
    #: Chilling-forcing budburst date. False for CF, CS, GR, RI.
    has_budburst: bool = False

    @property
    def has_any_model(self) -> bool:
        return self.has_gdd or self.has_budburst


@dataclass
class VarietyResolution:
    """Everything a caller needs to render honestly."""
    matches: List[VarietyMatch] = field(default_factory=list)
    #: Fragments that matched nothing — Chenin blanc, Pinotage, Aglianico,
    #: Gewurztraminer, Viognier. Surfaced, not swallowed: "we hold no model for
    #: Chenin blanc" is a useful thing to read, and an empty panel is not.
    unmatched: List[str] = field(default_factory=list)

    @property
    def codes(self) -> List[str]:
        return [m.variety_code for m in self.matches]

    @property
    def is_empty(self) -> bool:
        return not self.matches


def model_coverage(db: Session) -> Dict[str, dict]:
    """Every code either model holds, and which of the two holds it.

    Read from the DB rather than hardcoded because the tables are the
    calibration and they change — Pinot gris arrived in `budburst_parameters`
    and still is not in `phenology_thresholds`. A hardcoded list would have to
    be edited in step with a data load, which is the drift this whole module
    exists to prevent.
    """
    coverage: Dict[str, dict] = {}
    for row in db.execute(text(
        "SELECT variety_code, variety_name FROM phenology_thresholds"
    )).mappings():
        coverage.setdefault(row["variety_code"], {
            "variety_name": row["variety_name"], "has_gdd": False, "has_budburst": False,
        })["has_gdd"] = True
    for row in db.execute(text(
        "SELECT variety_code, variety_name FROM budburst_parameters"
    )).mappings():
        entry = coverage.setdefault(row["variety_code"], {
            "variety_name": row["variety_name"], "has_gdd": False, "has_budburst": False,
        })
        entry["has_budburst"] = True
        # The GDD table's spelling wins where both hold the variety: it is the
        # older table and the one the zone payload already renders from.
        entry.setdefault("variety_name", row["variety_name"])
    return coverage


def _match_fragment(fragment: str) -> Optional[str]:
    """A code for this fragment, or None.

    Exact first, then longest alias contained in the fragment. Longest-first
    matters: "cabernet sauvignon" must not be decided by the "cs" alias, and a
    fragment reading "block 4 pinot noir" should resolve rather than be dropped.
    """
    norm = _normalise(fragment)
    if not norm:
        return None
    if norm in ALIASES:
        return ALIASES[norm]
    for alias in sorted(ALIASES, key=len, reverse=True):
        # Two-letter aliases are only ever accepted as an exact match, handled
        # above. Allowing them here would match "sy" inside "syrah" harmlessly
        # but also inside any word containing those letters.
        if len(alias) <= 2:
            continue
        if re.search(rf"\b{re.escape(alias)}\b", norm):
            return ALIASES[alias]
    return None


def resolve(db: Session, variety_text: Optional[str]) -> VarietyResolution:
    """Resolve a block's variety string to the codes the models can run.

    Returns every variety found, in the order they appear in the string, so a
    block planted to two varieties yields two phenology tracks rather than one
    arbitrary winner.
    """
    result = VarietyResolution()
    if not variety_text or not variety_text.strip():
        return result

    coverage = model_coverage(db)
    cleaned = _PARENS.sub(" ", variety_text)
    seen = set()

    for fragment in _SPLIT.split(cleaned):
        if not fragment.strip():
            continue
        code = _match_fragment(fragment)
        if code is None:
            result.unmatched.append(fragment.strip())
            continue
        if code in seen:
            # "Pinot Noir / Pinot noir" is one variety written twice.
            continue
        seen.add(code)
        info = coverage.get(code)
        if info is None:
            # Recognised the grape, hold no calibration for it under either
            # model. Not the same as not recognising the words, but it looks the
            # same on screen, so it lands in `unmatched` with the reason.
            result.unmatched.append(fragment.strip())
            continue
        result.matches.append(VarietyMatch(
            variety_code=code,
            variety_name=info["variety_name"],
            matched_text=fragment.strip(),
            has_gdd=info["has_gdd"],
            has_budburst=info["has_budburst"],
        ))
    return result


def resolve_blocks(db: Session, blocks) -> Dict[int, VarietyResolution]:
    """Resolve many blocks at once, reading the coverage table only once.

    `resolve` per block would run two queries per block; a property with 35
    blocks is 70 round trips for a table of fifteen rows.
    """
    coverage = model_coverage(db)
    out: Dict[int, VarietyResolution] = {}
    for block in blocks:
        out[block.id] = _resolve_with(coverage, getattr(block, "variety", None))
    return out


def _resolve_with(coverage: Dict[str, dict],
                  variety_text: Optional[str]) -> VarietyResolution:
    """`resolve`, against coverage already in hand."""
    result = VarietyResolution()
    if not variety_text or not variety_text.strip():
        return result
    cleaned = _PARENS.sub(" ", variety_text)
    seen = set()
    for fragment in _SPLIT.split(cleaned):
        if not fragment.strip():
            continue
        code = _match_fragment(fragment)
        if code is None or code not in coverage:
            result.unmatched.append(fragment.strip())
            continue
        if code in seen:
            continue
        seen.add(code)
        info = coverage[code]
        result.matches.append(VarietyMatch(
            variety_code=code, variety_name=info["variety_name"],
            matched_text=fragment.strip(),
            has_gdd=info["has_gdd"], has_budburst=info["has_budburst"],
        ))
    return result
