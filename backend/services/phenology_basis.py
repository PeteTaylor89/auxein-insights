"""Whether a phenology date is fit to show, and why not when it isn't.

Shared by the Pro dashboard and the public region pages so that one rule governs
both. Two surfaces disagreeing about which dates are trustworthy is worse than
either rule on its own.

## The defect this exists to stop

The phenology model accumulates growing degree days to a variety threshold and
reads a date off it. Before a season starts that accumulation is ZERO, and the
projection runs off the end of the calendar. Measured at Waipara on 2026-08-19,
vintage 2027, `gdd_accumulated = 0.00`:

    variety   flowering     veraison      harvest 220   confidence
    CF        2027-04-30    2028-02-22    2028-05-17    high
    PN        2027-04-29    2028-01-22    2028-04-20    high

Flowering in New Zealand is November-December. These land roughly 650 days out,
inside the FOLLOWING vintage, and every one is stamped `confidence = 'high'`.
All 5,733 rows of the 2027 vintage sat at zero GDD; the 2026 vintage had none,
so the model is sound in season and fails only before one starts.

**`confidence` is therefore useless as the gate** — it reads "high" for exactly
the rows that are wrong. The basis is tested directly instead.

## Two independent tests, and a date must pass both

1. **Something to project from.** Below `MIN_GDD_FOR_PREDICTION` the model is
   extrapolating from nothing.
2. **The date must land inside its own vintage.** A 2027 harvest predicted for
   June 2028 is not a distant estimate, it is a wrong one, and it stays wrong
   even when accumulation is healthy.

## Five outcomes, not two

`beyond_season` is the one that earns its place. A variety whose 220 g/L date
falls past the end of the season has not "got no date" — it is not expected to
reach that sugar, which is the more useful thing to tell a grower. Collapsing it
into a blank throws that away.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

# Below this there is nothing to project from.
MIN_GDD_FOR_PREDICTION = 1.0

# Statuses whose date may be shown. Anything else must have its date stripped
# from the payload — a withheld date left in the response is a withheld date the
# next client renders.
SHOWN = ("observed", "projected")


def classify(value: Optional[date], is_actual: bool, gdd: Optional[float],
             season_start: date, season_end: date) -> str:
    """Why a phenology date is or is not fit to show.

    Returns one of: observed, projected, no_basis, beyond_season, not_modelled.
    """
    # An OBSERVED date is a fact and is never withheld.
    #
    # Note the two meanings of "actual" on this platform. The stored
    # `flowering_is_actual` / `veraison_is_actual` columns are false on all
    # 30,510 rows — nothing has ever been confirmed against a real observation.
    # The region endpoint derives its own `is_actual` as "accumulated GDD has
    # passed the threshold", which is a different claim. Either way, a caller
    # that says a date is actual is asserting it happened, and this does not
    # second-guess that.
    if is_actual and value is not None:
        return "observed"
    if gdd is None or float(gdd) < MIN_GDD_FOR_PREDICTION:
        return "no_basis"
    if value is None:
        return "not_modelled"
    if value < season_start or value > season_end:
        return "beyond_season"
    return "projected"


def is_shown(status: str) -> bool:
    return status in SHOWN


def no_basis_reason() -> str:
    return ("The season has not accumulated any growing degree days yet, so "
            "there is nothing to project dates from.")


# --- only the NEXT stage carries a date --------------------------------------
#
# WHY THIS EXISTS. Passing the two tests above means a date is not nonsense. It
# does NOT mean the model can see that far. A 220 g/L date projected in early
# September is eight months of accumulated forward extrapolation from two days
# of measured season, and printing it beside a flowering date — same font, same
# column, same confidence — tells a grower the model knows their picking window
# before their vines have broken bud.
#
# So one date is shown at a time: the next stage the vineyard is heading for.
# Everything past it says what has to happen first. The model has lost no
# capability; it has stopped claiming one it does not have. Every later date is
# still computed, still stored, and still surfaces the moment its own turn
# comes, which for flowering is a few weeks away.
#
# The order is fixed and physical, not a display preference. Véraison cannot
# precede flowering, and a run of dates that says otherwise is a fault to notice
# rather than a sequence to re-sort.
STAGE_ORDER = ("flowering", "veraison", "harvest_210", "harvest_220")

# What the placeholder names. Deliberately the EVENT, not the column: a grower
# waits for flowering, not for `flowering_date`.
STAGE_NAMES = {
    "flowering": "flowering",
    "veraison": "véraison",
    "harvest_210": "210 g/L",
    "harvest_220": "220 g/L",
}


def stage_progress(stages: dict, today: date,
                   order: tuple = None, names: dict = None) -> dict:
    """Per stage: is it behind us, is it next, or is it too far to speak to.

    `stages` is {key: {"date": iso or None, "status": str, "is_actual": bool}} —
    the shape both endpoints already build. Returns {key: {...}} adding:

        role     passed | next | awaiting | unavailable
        after    for `awaiting`, the stage that has to happen first
        basis    observed | modelled | predicted, for the one stage shown

    ## `modelled` and `predicted` are different claims and are labelled so

    A date the model puts in the FUTURE is a prediction. The same date once it
    is behind us is not a prediction any more, and it is not an observation
    either — nobody walked the block. It is what the model says happened, which
    is `modelled`. `flowering_is_actual` is false on all 30,510 stored rows, so
    `observed` is currently unreachable through this path; it is here because
    the column exists and the day it starts carrying real observations this
    should not need rewriting.
    """
    # The public region endpoint carries a different and longer sequence —
    # flowering then six sugar levels, no véraison — so the order is an argument
    # with the Pro sequence as its default. What must NOT vary between callers
    # is the rule; that is why they share this function rather than each
    # deciding for themselves which of their dates is trustworthy.
    order = order or STAGE_ORDER
    names = names or STAGE_NAMES

    out: dict[str, dict] = {}
    blocked_by: Optional[str] = None

    for key in order:
        stage = stages.get(key) or {}
        status = stage.get("status")
        raw = stage.get("date")

        if blocked_by is not None:
            # Something earlier has not happened yet, so this cannot be spoken
            # to no matter how good its own date looks.
            out[key] = {"role": "awaiting", "after": names[blocked_by],
                        "basis": None}
            continue

        if not is_shown(status) or not raw:
            # No date at all: `beyond_season`, `no_basis`, `not_modelled`. It
            # blocks nothing — a variety not expected to reach 220 g/L does not
            # stop 220 g/L being the thing after 210 — but it shows no date
            # either, and the existing status already says why.
            out[key] = {"role": "unavailable", "after": None, "basis": None}
            continue

        when = date.fromisoformat(raw) if isinstance(raw, str) else raw
        if stage.get("is_actual"):
            out[key] = {"role": "passed", "after": None, "basis": "observed"}
            continue
        if when <= today:
            # Reached, on the model's own reckoning. It stays visible — a grower
            # comparing this week against when flowering was called wants both —
            # but it is no longer the stage being predicted.
            out[key] = {"role": "passed", "after": None, "basis": "modelled"}
            continue

        out[key] = {"role": "next", "after": None, "basis": "predicted"}
        blocked_by = key

    return out


def next_stage(progress: dict, order: tuple = None) -> Optional[str]:
    """The one stage carrying a live prediction, or None if there is none."""
    return next((k for k in (order or STAGE_ORDER)
                 if progress.get(k, {}).get("role") == "next"), None)
