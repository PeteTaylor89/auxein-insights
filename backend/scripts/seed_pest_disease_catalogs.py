# backend/scripts/seed_pest_disease_catalogs.py
"""
Seed system (company_id=NULL) reference catalogs:
- category='disease'
- category='pest'

Adds the exact vineyard/biosecurity items requested. Optionally prunes extras.

Usage:
  python -m scripts.seed_pest_disease_catalogs
  python -m scripts.seed_pest_disease_catalogs --prune-extras
"""
from __future__ import annotations
import os, json, argparse
from pathlib import Path
from typing import List, Dict, Any, Tuple
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load DB URL from repo root .env
ROOT_DIR = Path(__file__).resolve().parents[1].parent
load_dotenv(ROOT_DIR / ".env")
DB_URL = os.getenv("DATABASE_URL") or os.getenv("SQLALCHEMY_DATABASE_URL")
if not DB_URL:
    raise SystemExit("No DB URL. Set DATABASE_URL/SQLALCHEMY_DATABASE_URL in .env")

engine = create_engine(DB_URL, future=True)

UPSERT_SQL = """
INSERT INTO reference_items (company_id, category, key, label, description, aliases, is_active)
VALUES (NULL, :category, :key, :label, :description, CAST(:aliases AS JSONB), TRUE)
ON CONFLICT (company_id, category, key)
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  aliases = EXCLUDED.aliases,
  is_active = TRUE;
"""

PRUNE_SQL = """
DELETE FROM reference_items
WHERE category = :category
  AND company_id IS NULL
  AND key <> ALL(:keep_keys)
"""

# ---------------------------
# DISEASES
# ---------------------------
DISEASES: List[Dict[str, Any]] = [
  {"key":"GLRAV_3", "label":"Grapevine leafroll-associated virus type 3 (GLRaV-3)",
   "aliases":["Leafroll","GLRaV-3"], "description":""},

  {"key":"BOTRYTIS", "label":"Botrytis (Botrytis cinerea)",
   "aliases":["Botrytis bunch rot"], "description":"Botrytis cinerea"},

  {"key":"POWDERY_MILDEW", "label":"Powdery mildew (Erysiphe necator)",
   "aliases":["Oidium"], "description":"Erysiphe necator"},

  {"key":"DOWNY_MILDEW", "label":"Downy mildew (Plasmopara viticola)",
   "aliases":[], "description":"Plasmopara viticola"},

  {"key":"BLACK_SPOT", "label":"Black spot (Elsinoe ampelina)",
   "aliases":["Anthracnose"], "description":"Elsinoe ampelina"},

  {"key":"PHOMOPSIS", "label":"Phomopsis (Phomopsis viticola)",
   "aliases":[], "description":"Phomopsis viticola"},

  {"key":"BLACK_ROT", "label":"Black rot",
   "aliases":[], "description":"Guignardia bidwellii"},

  {"key":"GTD_EUTYPA", "label":"Grapevine trunk disease – Eutypa (Eutypa lata)",
   "aliases":["Eutypa dieback"], "description":"Eutypa lata"},

  {"key":"GTD_BOTRYOSPHAERIA", "label":"Grapevine trunk disease – Botryosphaeria",
   "aliases":["Bot canker"], "description":"Botryosphaeriaceae spp."},

  {"key":"ROOT_BLACKFOOT", "label":"Grapevine root disease – Blackfoot",
   "aliases":[], "description":"Ilyonectria/Cylindrocarpon spp."},

  {"key":"RIPE_ROT", "label":"Ripe rot", "aliases":[], "description":""},
  {"key":"SOUR_ROT", "label":"Sour rot", "aliases":[], "description":""},

  {"key":"PIERCE_DISEASE", "label":"Pierce’s Disease",
   "aliases":["Xylella"], "description":"Xylella fastidiosa"},

  {"key":"FLAVESCENCE_DOREE", "label":"Flavescence Dorée",
   "aliases":[], "description":"Phytoplasma (FD)"},

  {"key":"BOIS_NOIR", "label":"Bois Noir phytoplasma",
   "aliases":[], "description":"‘Candidatus Phytoplasma solani’"},
]

# ---------------------------
# PESTS
# ---------------------------
PESTS: List[Dict[str, Any]] = [
  # Mealybugs (general + species)
  {"key":"MEALYBUG", "label":"Mealybug (general)", "aliases":[], "description":""},
  {"key":"LONG_TAILED_MEALYBUG", "label":"Long-tailed mealybug (Pseudococcus longispinus)",
   "aliases":[], "description":"Pseudococcus longispinus"},
  {"key":"CITROPHILUS_MEALYBUG", "label":"Citrophilus mealybug (Pseudococcus calceolariae)",
   "aliases":[], "description":"Pseudococcus calceolariae"},
  {"key":"OBSCURE_MEALYBUG", "label":"Obscure mealybug (Pseudococcus viburni)",
   "aliases":[], "description":"Pseudococcus viburni"},
  {"key":"VINE_MEALYBUG", "label":"Vine mealybug (Planococcus ficus)",
   "aliases":[], "description":"Planococcus ficus"},

  # Leafrollers (general + species, incl. LBAM)
  {"key":"LEAFROLLER", "label":"Leafroller (general)", "aliases":[], "description":""},
  {"key":"GREENHEADED_LEAFROLLER", "label":"Greenheaded leafroller (Planotortrix excessana)",
   "aliases":[], "description":"Planotortrix excessana"},
  {"key":"BROWNHEADED_LEAFROLLER", "label":"Brownheaded leafroller (Ctenopseustis obliquana)",
   "aliases":[], "description":"Ctenopseustis obliquana"},
  {"key":"LBAM", "label":"Light brown apple moth (Epiphyas postvittana)",
   "aliases":["Leafroller LBAM"], "description":"Epiphyas postvittana"},

  {"key":"ERINEUM_MITE", "label":"Erineum mite (Colomerus vitis)",
   "aliases":[], "description":"Colomerus vitis"},
  {"key":"TWO_SPOTTED_SPIDER_MITE", "label":"Two spotted spider mite (Tetranychus urticae)",
   "aliases":["TSSM"], "description":"Tetranychus urticae"},

  {"key":"GRASS_GRUB_BROWN_BEETLES", "label":"Grass grub – Brown beetles (Costelytra zealandica)",
   "aliases":["Grass grub"], "description":"Costelytra zealandica"},
  {"key":"BLACK_BEETLE", "label":"Black beetle (Heteronychus arator)",
   "aliases":[], "description":"Heteronychus arator"},

  {"key":"LATANIA_SCALE", "label":"Latania scale (Hemiberlesia lataniae)",
   "aliases":[], "description":"Hemiberlesia lataniae"},

  {"key":"HARLEQUIN_LADYBIRD", "label":"Harlequin ladybird (Harmonia axyridis)",
   "aliases":[], "description":"Harmonia axyridis"},

  {"key":"PHYLLOXERA", "label":"Phylloxera (Daktulosphaira vitifoliae)",
   "aliases":[], "description":"Daktulosphaira vitifoliae"},

  {"key":"GARDEN_WEEVIL", "label":"Garden weevil (Phlyctinus callosus)",
   "aliases":[], "description":"Phlyctinus callosus"},

  # Added biosecurity pests
  {"key":"CHILEAN_NEEDLE_GRASS", "label":"Chilean needle grass (Nassella neesiana)",
   "aliases":["CNG"], "description":"Nassella neesiana"},
  {"key":"BMSB", "label":"Brown marmorated stink bug (Halyomorpha halys)",
   "aliases":["Stink bug"], "description":"Halyomorpha halys"},
  {"key":"GLASSY_WINGED_SHARPSHOOTER", "label":"Glassy-winged sharpshooter (Homalodisca vitripennis)",
   "aliases":["GWSS"], "description":"Homalodisca vitripennis"},
  {"key":"SWD", "label":"Spotted wing drosophila (Drosophila suzukii)",
   "aliases":[], "description":"Drosophila suzukii"},
  {"key":"SPOTTED_LANTERNFLY", "label":"Spotted lanternfly (Lycorma delicatula)",
   "aliases":["SLF"], "description":"Lycorma delicatula"},
  {"key":"EGM", "label":"European grapevine moth (Lobesia botrana)",
   "aliases":[], "description":"Lobesia botrana"},

  # Fruit fly complex: general + four species
  {"key":"FRUIT_FLY", "label":"Fruit fly (general)", "aliases":[], "description":"Tephritidae"},
  {"key":"FRUIT_FLY_SOUTH_AMERICAN", "label":"South American fruit fly (Anastrepha fraterculus)",
   "aliases":[], "description":"Anastrepha fraterculus"},
  {"key":"FRUIT_FLY_MEDITERRANEAN", "label":"Mediterranean fruit fly (Ceratitis capitata)",
   "aliases":["Medfly"], "description":"Ceratitis capitata"},
  {"key":"FRUIT_FLY_NATAL", "label":"Natal fruit fly (Ceratitis rosa)",
   "aliases":[], "description":"Ceratitis rosa"},
  {"key":"FRUIT_FLY_QUEENSLAND", "label":"Queensland fruit fly (Bactrocera tryoni)",
   "aliases":["Qfly"], "description":"Bactrocera tryoni"},
]

def seed_category(conn, category: str, items: List[Dict[str, Any]]) -> int:
    upserts = 0
    for it in items:
        params = {
            "category": category,
            "key": it["key"],
            "label": it["label"],
            "description": it.get("description") or "",
            "aliases": json.dumps(it.get("aliases") or []),
        }
        conn.execute(text(UPSERT_SQL), params)
        upserts += 1
    return upserts

def prune_extras(conn, category: str, keep_keys: List[str]) -> int:
    res = conn.execute(
        text(PRUNE_SQL),
        {"category": category, "keep_keys": keep_keys}
    )
    return res.rowcount or 0

def main():
    parser = argparse.ArgumentParser(description="Seed disease/pest catalogs (and optionally prune extras).")
    parser.add_argument("--prune-extras", action="store_true", help="Delete any other rows not in this list.")
    args = parser.parse_args()

    with engine.begin() as conn:
        up_d = seed_category(conn, "disease", DISEASES)
        up_p = seed_category(conn, "pest", PESTS)
        pruned_d = pruned_p = 0
        if args.prune_extras:
            pruned_d = prune_extras(conn, "disease", [i["key"] for i in DISEASES])
            pruned_p = prune_extras(conn, "pest", [i["key"] for i in PESTS])

    print(f"Upserts — disease={up_d} pest={up_p}" + (f" | Pruned — disease={pruned_d} pest={pruned_p}" if args.prune_extras else ""))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
