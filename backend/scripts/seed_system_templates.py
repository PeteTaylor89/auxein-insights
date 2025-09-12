# backend/scripts/seed_system_templates.py
"""
Seed system (company_id=NULL) observation templates with field schemas that match
the vineyard operations list.

Usage:
  python -m scripts.seed_system_templates
"""
from __future__ import annotations
import os, json
from pathlib import Path
from typing import Dict, Any, Tuple, List
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# --- load .env from repo root ---
ROOT_DIR = Path(__file__).resolve().parents[1].parent
load_dotenv(ROOT_DIR / ".env")

DB_URL = os.getenv("DATABASE_URL") or os.getenv("SQLALCHEMY_DATABASE_URL")
if not DB_URL:
    raise SystemExit("No DB URL. Set DATABASE_URL/SQLALCHEMY_DATABASE_URL in .env")

engine = create_engine(DB_URL, future=True)

# ---------- helpers ----------
def scope_fields(include_row=True, include_hotspot=False) -> List[Dict[str, Any]]:
    fields: List[Dict[str, Any]] = [
        {"name": "block_id", "label": "Block", "type": "entity_ref", "entity": "block", "required": False},
    ]
    if include_row:
        fields.append({"name": "row_label", "label": "Row", "type": "text", "required": False})
    if include_hotspot:
        fields.extend([
            {"name": "is_hotspot", "label": "Hot-spot", "type": "boolean"},
            {"name": "hotspot_radius_m", "label": "Hot-spot radius (m)", "type": "number", "min": 0}
        ])
    # photos “virtual field” (frontend: attach to ObservationSpot.photo_file_ids)
    fields.append({"name": "photos", "label": "Photos", "type": "photo_multi"})
    return fields

def upsert_template(conn, name: str, type_: str, fields: List[Dict[str, Any]]) -> Tuple[bool, bool]:
    SELECT_ID_SQL = """
    SELECT id FROM observation_templates
    WHERE company_id IS NULL AND name = :name AND type = :type
    """
    INSERT_SQL = """
    INSERT INTO observation_templates
    (company_id, name, type, version, is_active, fields_json, defaults_json, validations_json, created_by)
    VALUES (NULL, :name, :type, 1, TRUE, CAST(:fields_json AS JSONB), '{}'::jsonb, '{}'::jsonb, NULL)
    """
    UPDATE_SQL = """
    UPDATE observation_templates
    SET is_active = TRUE,
        version = version + 1,
        fields_json = CAST(:fields_json AS JSONB),
        updated_at = NOW()
    WHERE id = :id
    """

    tpl_id = conn.execute(text(SELECT_ID_SQL), {"name": name, "type": type_}).scalar()
    if tpl_id:
        conn.execute(text(UPDATE_SQL), {"id": tpl_id, "fields_json": json.dumps(fields)})
        return False, True
    else:
        conn.execute(text(INSERT_SQL), {"name": name, "type": type_, "fields_json": json.dumps(fields)})
        return True, False


# ---------- FIELD SCHEMAS (per your list) ----------

# 1) Phenology (E–L / BBCH): block/row, EL code, % stage split if mixed, notes, photos.
FIELDS_PHENOLOGY = scope_fields(include_row=True) + [
    {"name": "scale", "label": "Scale", "type": "select",
     "options": [{"value": "EL", "label": "E–L"}, {"value": "BBCH", "label": "BBCH"}], "required": True, "default": "EL"},
    {"name": "el_stage", "label": "E–L Stage", "type": "select", "required": False,
     "options_source": {"catalog": "el_stage"}, "show_guide": True, "visible_if": {"scale": "EL"}},
    {"name": "bbch_code", "label": "BBCH code", "type": "text", "required": False, "visible_if": {"scale": "BBCH"}},
    # mixed stage split, e.g., [{"stage":"EL-27","percent":60},{"stage":"EL-31","percent":40}]
    {"name": "stage_split", "label": "Stage split (%)", "type": "json",
     "help_text": "Array of {stage, percent}. Should sum to ~100."},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 2) Bud counts (post-pruning QC): buds/vine (n), target, variance, notes.
FIELDS_BUD_COUNT = scope_fields(include_row=True) + [
    {"name": "vines_sampled", "label": "Vines sampled (n)", "type": "integer", "min": 1, "required": True},
    {"name": "buds_per_vine", "label": "Buds per vine", "type": "number", "min": 0, "required": True},
    {"name": "target_buds_per_vine", "label": "Target buds per vine", "type": "number", "min": 0},
    {"name": "variance", "label": "Variance", "type": "number", "min": 0, "computed": True},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 3) Flower counts / fruit set
FIELDS_FLOWER_SET = scope_fields(include_row=True) + [
    {"name": "shoots_sampled", "label": "Shoots sampled (n)", "type": "integer", "min": 1, "required": True},
    {"name": "inflorescences_per_shoot", "label": "Inflorescences per shoot", "type": "number", "min": 0, "required": True},
    {"name": "flowers_per_inflorescence", "label": "Flowers per inflorescence", "type": "number", "min": 0, "required": True},
    {"name": "set_percent", "label": "Set (%)", "type": "number", "min": 0, "max": 100},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 4) Pre-veraison yield estimation
FIELDS_YIELD_PRE = scope_fields(include_row=True) + [
    {"name": "bunches_per_vine", "label": "Bunches per vine", "type": "number", "min": 0, "required": True},
    {"name": "bunch_weight_g", "label": "Avg bunch weight (g)", "type": "number", "min": 0, "required": True},
    {"name": "vines_sampled", "label": "Vines sampled (n)", "type": "integer", "min": 1, "required": True},
    {"name": "calc_t_per_ha", "label": "Calculated t/ha", "type": "number", "min": 0, "computed": True},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 5) Maturity sampling
FIELDS_MATURITY = scope_fields(include_row=True) + [
    {"name": "brix", "label": "Brix (°Bx)", "type": "number", "min": 0, "required": True},
    {"name": "ph", "label": "pH", "type": "number", "min": 0, "required": True},
    {"name": "ta_gpl", "label": "TA (g/L)", "type": "number", "min": 0, "required": True},
    {"name": "yan", "label": "YAN (mg N/L)", "type": "number", "min": 0},
    {"name": "berry_weight_100g", "label": "100-berry weight (g)", "type": "number", "min": 0},
    {"name": "replicates_n", "label": "Replicates (n)", "type": "integer", "min": 1},
    {"name": "sample_method", "label": "Sample method", "type": "select",
     "options": [{"value":"random","label":"Random"},{"value":"systematic","label":"Systematic"},
                 {"value":"targeted","label":"Targeted"}]},
    {"name": "lab_ref", "label": "Lab reference", "type": "text"},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 6) Post-veraison yield estimation
FIELDS_YIELD_POST = scope_fields(include_row=True) + [
    {"name": "bunch_weight_g", "label": "Avg bunch weight (g)", "type": "number", "min": 0, "required": True},
    {"name": "bunches_per_vine", "label": "Bunches per vine", "type": "number", "min": 0, "required": True},
    {"name": "sample_size", "label": "Sample size (vines)", "type": "integer", "min": 1, "required": True},
    {"name": "calc_t_per_ha", "label": "Updated t/ha", "type": "number", "min": 0, "computed": True},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 7) Growth / canopy
FIELDS_GROWTH = scope_fields(include_row=True) + [
    {"name": "shoot_length_class", "label": "Shoot length class", "type": "select",
     "options": [{"value":"<10cm","label":"<10 cm"},{"value":"10-30cm","label":"10–30 cm"},
                 {"value":"30-60cm","label":"30–60 cm"},{"value":">60cm","label":">60 cm"}]},
    {"name": "internode_count", "label": "Internode count", "type": "integer", "min": 0},
    {"name": "leaf_layer_number", "label": "Leaf layer number (LLN)", "type": "number", "min": 0},
    {"name": "exposure_rating", "label": "Exposure rating", "type": "select",
     "options": [{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"}]},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 8) Soil & groundcover
FIELDS_SOIL = scope_fields(include_row=True) + [
    {"name": "moisture_class", "label": "Moisture class", "type": "select",
     "options": [{"value":"dry","label":"Dry"},{"value":"moderate","label":"Moderate"},{"value":"wet","label":"Wet"}]},
    {"name": "texture", "label": "Texture", "type": "select",
     "options": [{"value":"sand","label":"Sand"},{"value":"loam","label":"Loam"},{"value":"clay","label":"Clay"},
                 {"value":"silt","label":"Silt"},{"value":"other","label":"Other"}], "allow_free": True},
    {"name": "compaction_score", "label": "Compaction score", "type": "number", "min": 0},
    {"name": "cover_percent", "label": "Ground cover (%)", "type": "number", "min": 0, "max": 100},
    {"name": "weed_species", "label": "Weed species", "type": "select",
     "options_source": {"catalog": "weed_species"}, "allow_free": True, "multiselect": True},
    {"name": "details", "label": "Details (JSON)", "type": "json"},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 9) Nutrient deficiency / vine health
FIELDS_NUTRIENT = scope_fields(include_row=True) + [
    {"name": "symptom", "label": "Symptom", "type": "text", "required": True},
    {"name": "severity_0_5", "label": "Severity (0–5)", "type": "number", "min": 0, "max": 5, "required": True},
    {"name": "distribution", "label": "Distribution", "type": "select",
     "options": [{"value":"isolated","label":"Isolated"},{"value":"clustered","label":"Clustered"},
                 {"value":"block-wide","label":"Block-wide"}]},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 10) Disease scouting
FIELDS_DISEASE = scope_fields(include_row=True, include_hotspot=True) + [
    {"name": "disease", "label": "Disease", "type": "select",
     "options_source": {"catalog": "disease"}, "allow_free": True, "required": True},
    {"name": "incidence_percent", "label": "Incidence (% vines)", "type": "number", "min": 0, "max": 100, "required": True},
    {"name": "severity_0_5", "label": "Severity (0–5)", "type": "number", "min": 0, "max": 5, "required": True},
    {"name": "stage", "label": "Stage", "type": "text"},
    {"name": "ml_labels", "label": "ML labels (JSON)", "type": "json"},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 11) Pest scouting
FIELDS_PEST = scope_fields(include_row=True, include_hotspot=True) + [
    {"name": "pest", "label": "Pest", "type": "select",
     "options_source": {"catalog": "pest"}, "allow_free": True, "required": True},
    {"name": "count", "label": "Trap/visual count", "type": "integer", "min": 0, "required": True},
    {"name": "severity_0_5", "label": "Severity (0–5)", "type": "number", "min": 0, "max": 5},
    {"name": "life_stage", "label": "Life stage", "type": "text"},
    {"name": "ml_labels", "label": "ML labels (JSON)", "type": "json"},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 12) Beneficials
FIELDS_BENEFICIALS = scope_fields(include_row=True) + [
    {"name": "species", "label": "Species", "type": "text", "required": True},
    {"name": "count", "label": "Count", "type": "integer", "min": 0, "required": True},
    {"name": "habitat_notes", "label": "Habitat notes", "type": "textarea"},
]

# 13) Biosecurity
FIELDS_BIOSECURITY = scope_fields(include_row=True) + [
    {"name": "organism_or_weed", "label": "Organism/weed", "type": "select",
     "options_source": {"catalog": "biosecurity_agent"}, "allow_free": True},
    {"name": "pathway_source", "label": "Pathway/source", "type": "text"},
    {"name": "containment_taken", "label": "Containment taken", "type": "textarea"},
    {"name": "notify_regulator", "label": "Notify regulator", "type": "boolean"},
]

# 14) Compliance
FIELDS_COMPLIANCE = scope_fields(include_row=False) + [
    {"name": "rei_signage_ok", "label": "REI signage check", "type": "boolean"},
    {"name": "chemical_store_ok", "label": "Chemical store audit", "type": "boolean"},
    {"name": "ppe_available", "label": "PPE availability", "type": "boolean"},
    {"name": "issues", "label": "Issues flagged", "type": "textarea"},
]

# 15) H&S / hazard
FIELDS_HS_HAZARD = scope_fields(include_row=True, include_hotspot=True) + [
    {"name": "hazard_type", "label": "Hazard type", "type": "select",
     "options_source": {"catalog": "hazard_type"}, "allow_free": True, "required": True},
    {"name": "likelihood", "label": "Likelihood", "type": "select",
     "options": [{"value":"very_unlikely","label":"Very Unlikely"},{"value":"unlikely","label":"Unlikely"},
                 {"value":"possible","label":"Possible"},{"value":"likely","label":"Likely"},
                 {"value":"very_likely","label":"Very Likely"}]},
    {"name": "consequence", "label": "Consequence", "type": "select",
     "options": [{"value":"minimal","label":"Minimal"},{"value":"minor","label":"Minor"},
                {"value":"moderate","label":"Moderate"},{"value":"major","label":"Major"},
                {"value":"catastrophic","label":"Catastrophic"}]},
    {"name": "risk_rating", "label": "Risk rating", "type": "select",
     "options": [{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"}, {"value":"critical","label":"Critical"}],
     "computed": True},
]

# 16) Maintenance sighting
FIELDS_MAINTENANCE_OBS = scope_fields(include_row=True) + [
    {"name": "asset_id", "label": "Asset", "type": "entity_ref", "entity": "asset"},
    {"name": "issue_type", "label": "Issue type", "type": "select",
     "options": [{"value":"wire_break","label":"Wire break"},{"value":"post_damage","label":"Post damage"},
                 {"value":"irrigation_leak","label":"Irrigation leak"},{"value":"gate_fence","label":"Gate/Fence"},
                 {"value":"other","label":"Other"}],
     "allow_free": True},
    {"name": "severity_1_5", "label": "Severity (1–5)", "type": "integer", "min": 1, "max": 5},
    {"name": "create_task", "label": "Create task?", "type": "boolean",
     "help_text": "If true, spawn maintenance task and link to this sighting"},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 17) Land management
FIELDS_LAND_MGMT = scope_fields(include_row=True) + [
    {"name": "erosion", "label": "Erosion observed", "type": "boolean"},
    {"name": "drainage_issue", "label": "Drainage issue", "type": "boolean"},
    {"name": "compaction", "label": "Compaction present", "type": "boolean"},
    {"name": "buffer_breach", "label": "Buffer breach", "type": "boolean"},
    {"name": "details", "label": "Details (JSON)", "type": "json"},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 18) Irrigation check
FIELDS_IRRIGATION = scope_fields(include_row=True) + [
    {"name": "valve_or_zone", "label": "Valve/Zone", "type": "text"},
    {"name": "start_time", "label": "Start time (UTC)", "type": "datetime"},
    {"name": "stop_time", "label": "Stop time (UTC)", "type": "datetime"},
    {"name": "run_minutes", "label": "Run minutes", "type": "number", "min": 0},
    {"name": "pressure_start_kpa", "label": "Pressure start (kPa)", "type": "number", "min": 0},
    {"name": "pressure_end_kpa", "label": "Pressure end (kPa)", "type": "number", "min": 0},
    {"name": "flow_lpm", "label": "Flow (L/min)", "type": "number", "min": 0},
    {"name": "anomaly", "label": "Anomaly observed?", "type": "boolean"},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 19) Frost event
FIELDS_FROST = scope_fields(include_row=True) + [
    {"name": "min_temp_c", "label": "Min temperature (°C)", "type": "number"},
    {"name": "fan_on", "label": "Fan ON time (UTC)", "type": "datetime"},
    {"name": "fan_off", "label": "Fan OFF time (UTC)", "type": "datetime"},
    {"name": "fuel_level_percent", "label": "Fuel level (%)", "type": "number", "min": 0, "max": 100},
    {"name": "affected_area_notes", "label": "Affected area (notes)", "type": "textarea"},
    {"name": "notes", "label": "Notes", "type": "textarea"},
]

# 20) Weather observation
FIELDS_WEATHER = scope_fields(include_row=False) + [
    {"name": "rain_gauge_mm", "label": "Rain gauge (mm)", "type": "number", "min": 0},
    {"name": "wind_ms", "label": "Wind (m/s)", "type": "number", "min": 0},
    {"name": "temp_min_c", "label": "Temp min (°C)", "type": "number"},
    {"name": "temp_max_c", "label": "Temp max (°C)", "type": "number"},
    {"name": "station_reading", "label": "Station reading (JSON)", "type": "json",
     "help_text": "Attach external station data if available"},
    {"name": "comments", "label": "Comments", "type": "textarea"},
]

TEMPLATES: List[Dict[str, Any]] = [
    {"name": "Phenology (E–L / BBCH)", "type": "phenology", "fields": FIELDS_PHENOLOGY},
    {"name": "Bud Count (Post-pruning QC)", "type": "bud_count", "fields": FIELDS_BUD_COUNT},
    {"name": "Flower Count / Fruit Set", "type": "flower_set", "fields": FIELDS_FLOWER_SET},
    {"name": "Yield Estimation (Pre-veraison)", "type": "pre_veraison_yield", "fields": FIELDS_YIELD_PRE},
    {"name": "Maturity Sampling", "type": "maturity_sampling", "fields": FIELDS_MATURITY},
    {"name": "Yield Estimation (Post-veraison)", "type": "post_veraison_yield", "fields": FIELDS_YIELD_POST},
    {"name": "Growth / Canopy", "type": "growth", "fields": FIELDS_GROWTH},
    {"name": "Soil & Groundcover", "type": "soil_groundcover", "fields": FIELDS_SOIL},
    {"name": "Nutrient / Vine Health", "type": "nutrient_health", "fields": FIELDS_NUTRIENT},
    {"name": "Disease Scouting", "type": "disease", "fields": FIELDS_DISEASE},
    {"name": "Pest Scouting", "type": "pest", "fields": FIELDS_PEST},
    {"name": "Beneficials", "type": "beneficials", "fields": FIELDS_BENEFICIALS},
    {"name": "Biosecurity", "type": "biosecurity", "fields": FIELDS_BIOSECURITY},
    {"name": "Compliance", "type": "compliance", "fields": FIELDS_COMPLIANCE},
    {"name": "H&S / Hazard", "type": "hazard", "fields": FIELDS_HS_HAZARD},
    {"name": "Maintenance Sighting", "type": "maintenance", "fields": FIELDS_MAINTENANCE_OBS},
    {"name": "Land Management", "type": "land_management", "fields": FIELDS_LAND_MGMT},
    {"name": "Irrigation Check", "type": "irrigation_check", "fields": FIELDS_IRRIGATION},
    {"name": "Frost Event", "type": "frost_event", "fields": FIELDS_FROST},
    {"name": "Weather Observation", "type": "weather", "fields": FIELDS_WEATHER},
]

def main():
    created = updated = 0
    with engine.begin() as conn:
        for t in TEMPLATES:
            c, u = upsert_template(conn, t["name"], t["type"], t["fields"])
            created += int(c); updated += int(u)
    print(f"Templates seeded. created={created} updated={updated}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
