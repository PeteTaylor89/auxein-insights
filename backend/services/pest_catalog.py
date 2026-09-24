# backend/services/pest_catalog.py
"""
The vineyard pest, disease and biosecurity catalogue, for New Zealand.

ONE list, read by two things that must agree:
  * `scripts/seed_pest_disease_catalogs.py` writes it to `reference_items`
    (categories `pest`, `disease`, `biosecurity_agent`);
  * the Pests & Diseases and Biosecurity reports use it to decide which report
    a recorded organism belongs to, and to label it when the catalogue rows are
    missing.

## The split (Pete, 2026-09-24)

BIOSECURITY is an organism NOT established in New Zealand — report it to MPI —
or an established one under a regional pest management plan, reported to the
regional council. Everything else is an ordinary pest or disease, managed rather
than reported.

Phylloxera and harlequin ladybird are established here and so are ordinary
pests, despite phylloxera's movement controls.

## Legacy values

The live Pests & Diseases template records lowercase option values, and
`run_completion._check_biosecurity_alerts` knows seven of them as `*_alert`.
Those are carried as ALIASES of the matching biosecurity item, so a record made
before this split still lands in the Biosecurity report.
"""
from __future__ import annotations

from typing import Dict, List, Optional

MPI_HOTLINE = "0800 80 99 66"

_MPI = f"Not established in NZ. Report to MPI, {MPI_HOTLINE}."
_COUNCIL = "Regional pest management plan. Report to your regional council."


def _item(key, label, description="", aliases=None, notify=None):
    return {"key": key, "label": label, "description": description,
            "aliases": aliases or [], "notify": notify}


DISEASES: List[Dict] = [
    _item("BOTRYTIS", "Botrytis (Botrytis cinerea)", "Botrytis cinerea", ["Botrytis bunch rot", "botrytis"]),
    _item("POWDERY_MILDEW", "Powdery mildew (Erysiphe necator)", "Erysiphe necator", ["Oidium", "powdery_mildew"]),
    _item("DOWNY_MILDEW", "Downy mildew (Plasmopara viticola)", "Plasmopara viticola", ["downy_mildew"]),
    _item("SOUR_ROT", "Sour rot", "Yeast and acetic acid bacteria complex", ["sour_rot"]),
    _item("RIPE_ROT", "Ripe rot", "Colletotrichum spp.", ["ripe_rot"]),
    _item("BLACK_SPOT", "Black spot (Elsinoe ampelina)", "Elsinoe ampelina", ["Anthracnose", "black_spot"]),
    _item("PHOMOPSIS", "Phomopsis (Phomopsis viticola)", "Phomopsis viticola", ["phomopsis"]),
    _item("GTD_EUTYPA", "Grapevine trunk disease – Eutypa (Eutypa lata)", "Eutypa lata", ["Eutypa dieback"]),
    _item("GTD_BOTRYOSPHAERIA", "Grapevine trunk disease – Botryosphaeria", "Botryosphaeriaceae spp.", ["Bot canker"]),
    _item("ROOT_BLACKFOOT", "Grapevine root disease – Blackfoot", "Ilyonectria/Cylindrocarpon spp."),
    _item("GLRAV_3", "Grapevine leafroll-associated virus type 3 (GLRaV-3)", "", ["Leafroll", "GLRaV-3", "leafroll"]),
]

PESTS: List[Dict] = [
    _item("MEALYBUG", "Mealybug (general)", "", ["mealybug"]),
    _item("LONG_TAILED_MEALYBUG", "Long-tailed mealybug (Pseudococcus longispinus)", "Pseudococcus longispinus"),
    _item("CITROPHILUS_MEALYBUG", "Citrophilus mealybug (Pseudococcus calceolariae)", "Pseudococcus calceolariae"),
    _item("OBSCURE_MEALYBUG", "Obscure mealybug (Pseudococcus viburni)", "Pseudococcus viburni"),
    _item("LEAFROLLER", "Leafroller (general)", "", ["leafroller"]),
    _item("GREENHEADED_LEAFROLLER", "Greenheaded leafroller (Planotortrix excessana)", "Planotortrix excessana"),
    _item("BROWNHEADED_LEAFROLLER", "Brownheaded leafroller (Ctenopseustis obliquana)", "Ctenopseustis obliquana"),
    _item("LBAM", "Light brown apple moth (Epiphyas postvittana)", "Epiphyas postvittana", ["Leafroller LBAM", "lbam"]),
    _item("GRAPEVINE_SCALE", "Grapevine scale (Parthenolecanium persicae)", "Parthenolecanium persicae",
          ["Soft scale", "scale"]),
    _item("LATANIA_SCALE", "Latania scale (Hemiberlesia lataniae)", "Hemiberlesia lataniae"),
    _item("ERINEUM_MITE", "Erineum mite (Colomerus vitis)", "Colomerus vitis", ["Blister mite"]),
    _item("TWO_SPOTTED_SPIDER_MITE", "Two spotted spider mite (Tetranychus urticae)", "Tetranychus urticae", ["TSSM"]),
    _item("GRASS_GRUB_BROWN_BEETLES", "Grass grub – Brown beetles (Costelytra zealandica)", "Costelytra zealandica",
          ["Grass grub"]),
    _item("BRONZE_BEETLE", "Bronze beetle (Eucolaspis brunnea)", "Eucolaspis brunnea"),
    _item("BLACK_BEETLE", "Black beetle (Heteronychus arator)", "Heteronychus arator"),
    _item("GARDEN_WEEVIL", "Garden weevil (Phlyctinus callosus)", "Phlyctinus callosus"),
    _item("HARLEQUIN_LADYBIRD", "Harlequin ladybird (Harmonia axyridis)", "Harmonia axyridis"),
    _item("PHYLLOXERA", "Phylloxera (Daktulosphaira vitifoliae)", "Daktulosphaira vitifoliae", ["phylloxera"]),
    _item("WASPS", "Wasps (Vespula spp.)", "Vespula germanica, V. vulgaris", ["wasp"]),
]

BIOSECURITY: List[Dict] = [
    _item("BMSB", "Brown marmorated stink bug (Halyomorpha halys)", _MPI,
          ["Stink bug", "bmsb_alert"], "mpi"),
    _item("SPOTTED_LANTERNFLY", "Spotted lanternfly (Lycorma delicatula)", _MPI, ["SLF", "slf_alert"], "mpi"),
    _item("GLASSY_WINGED_SHARPSHOOTER", "Glassy-winged sharpshooter (Homalodisca vitripennis)", _MPI,
          ["GWSS", "pierces_gwss_alert"], "mpi"),
    _item("PIERCE_DISEASE", "Pierce’s disease (Xylella fastidiosa)", _MPI, ["Xylella"], "mpi"),
    _item("FLAVESCENCE_DOREE", "Flavescence dorée (phytoplasma)", _MPI, ["FD", "fd_alert"], "mpi"),
    _item("BOIS_NOIR", "Bois noir (Candidatus Phytoplasma solani)", _MPI, [], "mpi"),
    _item("BLACK_ROT", "Black rot (Guignardia bidwellii)", _MPI, [], "mpi"),
    _item("EGM", "European grapevine moth (Lobesia botrana)", _MPI, ["EGVM", "egvm_alert"], "mpi"),
    _item("SWD", "Spotted wing drosophila (Drosophila suzukii)", _MPI, ["swd_alert"], "mpi"),
    _item("VINE_MEALYBUG", "Vine mealybug (Planococcus ficus)", _MPI, ["vine_mealybug_alert"], "mpi"),
    _item("FRUIT_FLY", "Fruit fly (unidentified)", _MPI, ["Tephritidae"], "mpi"),
    _item("FRUIT_FLY_QUEENSLAND", "Queensland fruit fly (Bactrocera tryoni)", _MPI, ["Qfly"], "mpi"),
    _item("FRUIT_FLY_ORIENTAL", "Oriental fruit fly (Bactrocera dorsalis)", _MPI, [], "mpi"),
    _item("FRUIT_FLY_MEDITERRANEAN", "Mediterranean fruit fly (Ceratitis capitata)", _MPI, ["Medfly"], "mpi"),
    _item("FRUIT_FLY_NATAL", "Natal fruit fly (Ceratitis rosa)", _MPI, [], "mpi"),
    _item("FRUIT_FLY_SOUTH_AMERICAN", "South American fruit fly (Anastrepha fraterculus)", _MPI, [], "mpi"),
    _item("SUSPECT_EXOTIC", "Suspected exotic (unidentified)",
          f"Anything unfamiliar. Photograph it, contain it, report to MPI, {MPI_HOTLINE}.", [], "mpi"),
    _item("CHILEAN_NEEDLE_GRASS", "Chilean needle grass (Nassella neesiana)", _COUNCIL, ["CNG", "Chilean"], "council"),
]

CATALOG = {"disease": DISEASES, "pest": PESTS, "biosecurity_agent": BIOSECURITY}


def _norm(value: str) -> str:
    return "".join(ch for ch in str(value).lower() if ch.isalnum())


# Every spelling a recorded value might take — key, alias, label — to its item.
_INDEX: Dict[str, Dict] = {}
for _category, _items in CATALOG.items():
    for _it in _items:
        for _spelling in [_it["key"], _it["label"], *_it["aliases"]]:
            _INDEX.setdefault(_norm(_spelling), {**_it, "category": _category})


def lookup(value: Optional[str]) -> Optional[Dict]:
    """The catalogue item a recorded value names, or None."""
    if not value:
        return None
    return _INDEX.get(_norm(value))


def is_biosecurity(value: Optional[str]) -> bool:
    """Whether a recorded organism belongs in the Biosecurity report.

    A `*_alert` value is biosecurity even when it is not one of the seven
    known ones: the suffix was the live template's own marker.
    """
    if not value:
        return False
    if str(value).lower().endswith("_alert"):
        return True
    item = lookup(value)
    return bool(item and item["category"] == "biosecurity_agent")


# Values an observer records to say "looked, found nothing". Such a spot is a
# clean check, not a finding.
_NONE_VALUES = {_norm(v) for v in (
    "none", "nil", "no", "nothing", "none observed", "none found", "not found", "clean", "n/a",
)}


def is_none_value(value: Optional[str]) -> bool:
    return bool(value) and _norm(value) in _NONE_VALUES
