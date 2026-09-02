# services/count_metrics.py — what a countable observation is, and how to read
# one out of a spot.
#
# Lives here rather than in the reports module because two surfaces need it and
# neither should carry a copy: the counts report aggregates by it, and the
# observation list uses it to say what a run measures (which decides where its
# Insights link goes). A second definition is how the run summary and the report
# it links to would end up disagreeing.
from typing import List, Optional

#: Below this many spots a standard deviation is not reported. Two readings
#: always produce one — |a-b|/sqrt(2) — and it says nothing about the spread of
#: the block. Reporting it invites someone to act on the difference between two
#: vines.
MIN_SPOTS_FOR_SD = 3


class CountMetric:
    """One countable thing, and how to find it in a spot's `data_json`.

    Templates are matched two ways on purpose. `template_types` catches the
    system templates. `value_fields` ALSO matches a company's own template by
    field name — Greystone built their own "Bud Counts" template with
    `type='other'`, and a report keyed on type alone would silently ignore
    every spot they ever captured through it.
    """

    def __init__(self, key, label, template_types, value_fields,
                 weight_field=None, target_field=None, unit=None):
        self.key = key
        self.label = label
        self.template_types = template_types
        self.value_fields = value_fields          # ordered; first present wins
        self.weight_field = weight_field          # vines behind the reading
        self.target_field = target_field
        self.unit = unit


# Ordered by GROWTH STAGE, not alphabetically or by build order: buds burst
# into shoots, shoots flower, flowers set into bunches. A grower reading down
# the list is reading forward through their own season, and the UI takes its
# order from this dict.
COUNT_METRICS = {
    m.key: m for m in [
        CountMetric(
            "bud_count", "Bud count", ["bud_count"],
            ["buds_per_vine", "bud_count"],
            weight_field="vines_sampled", target_field="target_buds_per_vine",
            unit="buds/vine",
        ),
        CountMetric(
            "shoot_count", "Active shoots", [],
            ["active_shoot_count", "shoots_per_vine"],
            weight_field="vines_sampled", unit="shoots/vine",
        ),
        CountMetric(
            "flower_set", "Flower count / fruit set", ["flower_set"],
            ["flowers_per_bunch", "flower_count", "set_percent"],
            weight_field="bunches_sampled", unit="flowers/bunch",
        ),
        CountMetric(
            "bunch_count", "Bunch count", ["bunch_count"],
            ["bunches_per_vine", "bunch_count"],
            weight_field="vines_sampled", unit="bunches/vine",
        ),
    ]
}


def metric_for_template(template) -> Optional[str]:
    """Which count metric, if any, a template records. None for the rest.

    Type wins over field name, so a system template is classified by what it
    declares itself to be even if a field name happens to collide.
    """
    if template is None:
        return None
    names = {f.get("name") for f in (template.fields_json or []) if isinstance(f, dict)}
    for spec in COUNT_METRICS.values():
        if template.type in spec.template_types:
            return spec.key
    for spec in COUNT_METRICS.values():
        if any(name in names for name in spec.value_fields):
            return spec.key
    return None


def coerce_number(value) -> Optional[float]:
    """Coerce a value out of `data_json`, tolerantly.

    The same field arrives as a number from one client and a STRING from
    another — `vines_sampled` is stored as `"1"` on at least one live spot. A
    strict cast drops those rows silently, which is the worst outcome: a
    smaller n that still renders a confident mean.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out and out not in (float("inf"), float("-inf")) else None


def first_field(data: dict, names: List[str]) -> Optional[float]:
    for name in names:
        if name in (data or {}):
            value = coerce_number(data[name])
            if value is not None:
                return value
    return None
