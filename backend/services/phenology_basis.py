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
