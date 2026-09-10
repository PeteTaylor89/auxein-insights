"""Read a phenological stage out of an observation spot, and roll spots up.

The sibling of `services/count_metrics.py`, and here for the same reason: two
surfaces need it. The phenology REPORT aggregates by it, and the phenology
PANEL's "observed" track reads the same spots. A second definition is how the
two would end up disagreeing about what a block is doing.

## WHY THE COUNTS MACHINERY CANNOT BE REUSED

A count is a number. `count_metrics` takes a weighted mean of it, reports a
standard deviation across spots, and suppresses that SD below three spots.

A stage is not a number — it is an ordered category. Live spots hold
`{"scale": "EL", "el_stage": "EL-2"}`. The mean of EL-2 and EL-9 is not EL-5.5,
and an SD over stage codes is meaningless. So:

  * the **modal** stage is what most of the block is doing,
  * the **most advanced** stage is what the earliest part is doing, which is the
    one that decides when work has to start,
  * and the spread is the RANGE between the two, stated as stages.

A block sitting at EL-2 with one spot at EL-9 is a real and important shape —
one hillside has moved and the rest has not — and a mean would erase it while an
SD would put a number on it that means nothing.

## THE TIE RULE

When two stages are equally common the MORE ADVANCED wins. Under-reporting a
block's progress delays work; over-reporting it by one stage on a tie does not,
and the range is beside it either way.

## BBCH IS READ BUT NOT MIXED

The system template offers `scale: 'EL' | 'BBCH'`. Every live spot is EL. A BBCH
spot is counted and reported as unreadable rather than converted: the two scales
do not map one-to-one, and a lookup table that pretended otherwise would put a
made-up EL code on somebody's real observation.
"""
from collections import Counter
from typing import Dict, List, Optional

from utils.el_scale import EL_STAGES

#: Template types that record a stage. Matched the same two ways as a count
#: metric — by type here, and by FIELD NAME below, because a company's own
#: template carries `type='other'` and would otherwise be invisible.
PHENOLOGY_TEMPLATE_TYPES = ("phenology",)

#: Ordered; first present wins. `el_stage` is what the system template writes.
STAGE_FIELDS = ("el_stage", "el_code", "stage")

#: Present and non-empty means the spot used the BBCH scale. Reported, never
#: converted — see the module docstring.
BBCH_FIELDS = ("bbch_code",)


def order_of(stage: Optional[str]) -> Optional[int]:
    """Position of an EL stage on the scale, or None if it is not one.

    `phase_order` is the scale's own ordering, not the dict's insertion order,
    so it survives someone re-sorting EL_STAGES.
    """
    if not stage:
        return None
    info = EL_STAGES.get(stage)
    return info["phase_order"] if info else None


def stage_name(stage: Optional[str]) -> Optional[str]:
    info = EL_STAGES.get(stage or "")
    return info["name"] if info else None


def stage_phase(stage: Optional[str]) -> Optional[str]:
    info = EL_STAGES.get(stage or "")
    return info["phase"] if info else None


def is_phenology_template(template) -> bool:
    """Does this template record a stage? Type first, then field name."""
    if template is None:
        return False
    if getattr(template, "type", None) in PHENOLOGY_TEMPLATE_TYPES:
        return True
    names = {f.get("name") for f in (getattr(template, "fields_json", None) or [])
             if isinstance(f, dict)}
    return any(n in names for n in STAGE_FIELDS)


def read_stage(data: Optional[dict]) -> Optional[str]:
    """The EL stage a spot recorded, or None.

    None covers three different things — no stage field, an empty one, and a
    code the scale does not contain — and the caller separates them with
    `read_bbch` and its own unreadable count. Returning None for a bad code
    rather than passing it through is deliberate: an unknown code has no order,
    so it cannot be ranked, and ranking is the whole job.
    """
    for field in STAGE_FIELDS:
        raw = (data or {}).get(field)
        if raw is None:
            continue
        value = str(raw).strip()
        if not value:
            continue
        if value in EL_STAGES:
            return value
        # Tolerate "EL2" and "2" for a code the UI writes as "EL-2". A stage
        # typed into a company's own template will not match the system
        # template's spelling, and dropping it would silently shrink n.
        digits = value.upper().replace("EL", "").strip(" -")
        candidate = f"EL-{digits}"
        if candidate in EL_STAGES:
            return candidate
    return None


def read_bbch(data: Optional[dict]) -> Optional[str]:
    for field in BBCH_FIELDS:
        raw = (data or {}).get(field)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    return None


class StageRollup:
    """Stages observed across one block (or one run), rolled up.

    Accumulates rather than taking a list, so a caller streaming spots does not
    have to hold them.
    """

    def __init__(self) -> None:
        self.counts: Counter = Counter()
        self.spots = 0
        #: Spots that recorded something this cannot rank — a BBCH code, or a
        #: stage field that is not on the EL scale. Carried so a thin-looking
        #: block can be explained rather than just looking unobserved.
        self.unreadable = 0
        self.bbch = 0
        self.latest_observed = None

    def add(self, data: Optional[dict], observed_at=None) -> None:
        self.spots += 1
        if observed_at is not None and (self.latest_observed is None
                                        or observed_at > self.latest_observed):
            self.latest_observed = observed_at

        stage = read_stage(data)
        if stage is None:
            self.unreadable += 1
            if read_bbch(data):
                self.bbch += 1
            return
        self.counts[stage] += 1

    @property
    def readable(self) -> int:
        return sum(self.counts.values())

    @property
    def modal(self) -> Optional[str]:
        """The commonest stage. On a tie, the MORE ADVANCED — see the docstring."""
        if not self.counts:
            return None
        top = max(self.counts.values())
        tied = [s for s, n in self.counts.items() if n == top]
        return max(tied, key=lambda s: order_of(s) or -1)

    @property
    def most_advanced(self) -> Optional[str]:
        if not self.counts:
            return None
        return max(self.counts, key=lambda s: order_of(s) or -1)

    @property
    def least_advanced(self) -> Optional[str]:
        if not self.counts:
            return None
        return min(self.counts, key=lambda s: order_of(s) or 10**6)

    @property
    def range_label(self) -> Optional[str]:
        """"EL-2 – EL-9", or just "EL-2" when the block is uniform."""
        lo, hi = self.least_advanced, self.most_advanced
        if lo is None:
            return None
        return lo if lo == hi else f"{lo} – {hi}"

    @property
    def is_uniform(self) -> bool:
        return len(self.counts) <= 1

    def note(self) -> Optional[str]:
        """Why this row might be thinner than it looks. None when it is not."""
        if self.spots == 0:
            return None
        if self.readable == 0:
            if self.bbch:
                return (f"{self.bbch} spot{'s' if self.bbch != 1 else ''} recorded "
                        "on the BBCH scale, which is not converted to E–L")
            return "No spot recorded a stage on the E–L scale"
        parts = []
        if self.readable == 1:
            parts.append("One spot only — not a block average")
        if self.bbch:
            parts.append(f"{self.bbch} BBCH spot{'s' if self.bbch != 1 else ''} excluded")
        other = self.unreadable - self.bbch
        if other > 0:
            parts.append(f"{other} spot{'s' if other != 1 else ''} recorded no readable stage")
        return "; ".join(parts) or None

    def distribution(self) -> List[Dict]:
        """Every stage seen, most advanced first, with its share of the block."""
        total = self.readable or 1
        return [
            {"stage": s, "name": stage_name(s), "spots": n,
             "share_percent": round(n / total * 100, 1)}
            for s, n in sorted(self.counts.items(),
                               key=lambda kv: order_of(kv[0]) or -1, reverse=True)
        ]
