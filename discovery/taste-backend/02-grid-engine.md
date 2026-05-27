# 02 — Grid Schema Engine

The `grid_schemas.definition` JSONB contract, the versioning model, and the three launch grids as complete seed JSON.

The contract is intentionally minimal — just enough for one frontend renderer to render every grid we know about and the ones we have line-of-sight to (WSET L4, consumer Voices grid). If the capture app needs to branch on `grid.key` to render a section, the contract has failed; we extend the contract, not the app.

---

## 1. Contract shape — top level

A `definition` is a single JSON object:

```jsonc
{
  "schema_contract_version": 1,           // integer; the meta-contract version. Bumped only if the
                                          // *shape of this document itself* changes (sections key
                                          // renamed, new top-level keys added). Independent of any
                                          // particular grid's "version".
  "key": "mw_practical",                  // mirrors grid_schemas.key — useful for offline export.
  "version": 1,                           // mirrors grid_schemas.version.
  "label": "MW Practical Tasting Note",   // mirrors grid_schemas.label.
  "rendering": {                          // hints for the renderer; not gating.
    "primary_color": "#5e2750",           // optional brand colour for tabs/headers.
    "score_section_id": "assessment"      // optional — if set, the renderer treats this section's
                                          // numeric fields as the headline score.
  },
  "sections": [ /* ordered SectionDef */ ]
}
```

The `schema_contract_version` is a forward-compatibility lever. The capture app reads it and decides whether it knows how to render. Today it's `1`. If we later add a new field kind, we bump to `2` and stale capture-app installs can show "update required" without crashing.

---

## 2. Contract shape — sections, fields, allowed values, conditionals

### 2.1 `SectionDef`

```jsonc
{
  "id": "appearance",                     // stable slug. Used in the `values` map key as `section_id.field_id`.
  "label": "Appearance",
  "description": "Visual examination",    // optional. Rendered as subhead.
  "order": 1,                             // explicit order — array order is authoritative, this is
                                          // belt-and-braces for tolerant parsers.
  "fields": [ /* ordered FieldDef */ ]
}
```

### 2.2 `FieldDef`

```jsonc
{
  "id": "intensity",                      // stable slug within the section.
  "label": "Intensity",
  "kind": "chips_single",                 // one of the supported kinds — see §2.3.
  "required": false,                      // if true, save validation rejects missing values.
  "help": "Pale, medium, or deep",        // optional, shown beneath the field label.
  "allowed_values": [                     // required for chip / select kinds; absent for free text / numeric.
    { "value": "pale",   "label": "Pale" },
    { "value": "medium", "label": "Medium" },
    { "value": "deep",   "label": "Deep" }
  ],
  "min": 0,                               // numeric kinds only.
  "max": 20,                              // numeric kinds only.
  "step": 0.5,                            // numeric kinds only.
  "placeholder": "Aromatic descriptors…", // text kinds only.
  "visible_if": {                         // optional — see §2.4.
    "field": "palate.length",
    "operator": "in",
    "value": ["medium", "long"]
  }
}
```

### 2.3 Supported `kind` values (v1 contract)

| `kind` | Renders as | `values` map stores | Notes |
| --- | --- | --- | --- |
| `chips_single` | Toggleable chips, single-select | The selected `value` (string) or null | The default for graded structured fields (intensity, length, body, …). |
| `chips_multi` | Toggleable chips, multi-select | Array of `value` strings (deduped, order preserved) | E.g. aroma descriptor lists, BLIC reasoning categories. |
| `text_short` | Single-line input | String or null | E.g. variety guess in MS Final Conclusion. |
| `text_long` | Multi-line textarea | String or null | E.g. Freeform body, BLIC reasoning prose. |
| `number` | Numeric input with min/max/step | Number or null | E.g. ABV%, score out of 20 (MW). |
| `year` | Year picker | Integer (1800–2100) or null | E.g. vintage guess in MS Final Conclusion. |
| `boolean` | Toggle switch | true / false / null | E.g. "Faulty?" in MS Sight. |

These cover every field in the three launch grids and the line-of-sight WSET L4 / Voices grids. Adding a kind is a `schema_contract_version` bump.

### 2.4 Conditional logic — `visible_if`

The renderer hides the field when the condition is falsy. The condition references another field in the same `values` map (in `section.field` notation).

```jsonc
"visible_if": {
  "field": "sight.condition",     // section.field — required.
  "operator": "equals",           // one of: equals | not_equals | in | not_in | exists | not_exists
  "value": "faulty"               // value to compare against. Optional for exists / not_exists.
}
```

Only one condition per field in v1. If we need AND/OR composition later, bump `schema_contract_version` and add `visible_if_all` / `visible_if_any`. Single-condition is enough for MW/MS as designed.

**Important:** `visible_if` is a *render hint*, not a save guard. A field hidden by the renderer is *not* required even if `required: true` and is allowed to keep a stale value in the `values` map (the capture app SHOULD null it on hide; the backend MUST tolerate it staying around).

---

## 3. Versioning model — non-negotiable bits

Repeating spec §4.2 because this is the single most important integrity property of the engine:

- A `tasting_entry_details` row stores **both** `grid_schema_id` (convenience FK) **and** `grid_schema_key` + `grid_schema_version` (composite FK). The composite is the load-bearing identity — see `01-data-model.md` §2.3.
- **`grid_schemas` rows are immutable once any entry references them.** The application must enforce this — there's no DB-side trigger, but the API contract is: editing a grid (`PATCH /grids/{id}`) creates a new row with `version = max(version) + 1` for that `key`, sets the old row's `is_active = FALSE`, and returns the new row. Entries already captured against the old version stay pinned to it.
- A grid is identified externally by `key`. The frontend asks for "the active mw_practical" via `GET /grids?key=mw_practical&is_active=true` and gets exactly one row back. It then sends `grid_schema_id` (or equivalently `key` + `version`) when creating a tasting entry.
- "Active" means "users can pick it to start a new tasting." "Inactive" means "no new tastings against this version, but existing ones still render." Deletion is not a normal operation — `is_active = FALSE` is the soft retirement.

The `GET /grids/{id}` endpoint MUST return historical (inactive) versions too, so an old tasting note can render in the iPad app using its original grid.

---

## 4. The `values` map — payload shape

The capture app stores grid responses as a flat object keyed `section_id.field_id`:

```jsonc
{
  "appearance.intensity": "deep",
  "appearance.color": "ruby",
  "appearance.clarity": "clear",
  "nose.intensity": "medium_plus",
  "nose.aroma_characteristics": ["red fruit", "oak", "leather", "graphite"],
  "palate.sweetness": "dry",
  "palate.acidity": "high",
  "palate.tannin": "medium_plus",
  "palate.body": "full",
  "palate.alcohol": "medium",
  "palate.length": "long",
  "palate.flavor_characteristics": ["black fruit", "cedar", "vanilla"],
  "assessment.quality_level": "outstanding",
  "assessment.score_out_of_20": 18.5,
  "assessment.blic_reasoning": "Balance is exemplary — acidity supports the dense black fruit without thinning it…"
}
```

This is the *same shape* the capture app's `auxein.tasting.v1` export uses (per spec §3.3), so the API can accept it as-is into `tasting_entry_details.values`. No transformation needed at the backend boundary. The camelCase ↔ snake_case translation only applies to backend-defined fields (`is_blind`, `entry_date`, etc.) — *inside* the `values` map the keys are owned by the grid definition, and the seed grids below use snake_case throughout for consistency.

Validation at write time (in the `TastingEntryCreate` Pydantic model or a service-layer helper):

1. Look up `(grid_schema_key, grid_schema_version)` and load the `definition`.
2. For each `required` field whose `visible_if` evaluates true (or is absent), assert the corresponding `values["section.field"]` is present and non-null.
3. For each `chips_single` / `chips_multi` field, assert the value is in the field's `allowed_values`.
4. For numeric / year, assert range.
5. Unknown keys in `values` are accepted silently (forward compatibility — the app might be on a newer grid than the validator knows about).

In v1 the validator can be loose — only check (3) and (4). Required-field enforcement (2) can be Phase 2.5 once the capture app reliably sends everything.

---

## 5. Seed grids

These are the complete `definition` JSONs for the three launch grids. They go into the migration as `INSERT` statements in `add_taste_grids.py` (see `03-api-and-migration.md` §4).

Field choices reflect MW/MS conventions as the spec describes them (§4.2). They are starting points and should be reviewed against your MW course materials before Phase 2 — but the structure is the load-bearing part, and the structure is what we're committing to here.

### 5.1 `mw_practical` (version 1)

```json
{
  "schema_contract_version": 1,
  "key": "mw_practical",
  "version": 1,
  "label": "MW Practical Tasting Note",
  "rendering": {
    "score_section_id": "assessment"
  },
  "sections": [
    {
      "id": "appearance",
      "label": "Appearance",
      "order": 1,
      "fields": [
        {
          "id": "intensity",
          "label": "Intensity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "pale", "label": "Pale"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "deep", "label": "Deep"}
          ]
        },
        {
          "id": "color",
          "label": "Colour",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "lemon_green", "label": "Lemon-green"},
            {"value": "lemon", "label": "Lemon"},
            {"value": "gold", "label": "Gold"},
            {"value": "amber", "label": "Amber"},
            {"value": "brown", "label": "Brown"},
            {"value": "pink", "label": "Pink"},
            {"value": "salmon", "label": "Salmon"},
            {"value": "orange", "label": "Orange"},
            {"value": "purple", "label": "Purple"},
            {"value": "ruby", "label": "Ruby"},
            {"value": "garnet", "label": "Garnet"},
            {"value": "tawny", "label": "Tawny"}
          ]
        },
        {
          "id": "clarity",
          "label": "Clarity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "clear", "label": "Clear"},
            {"value": "hazy", "label": "Hazy"}
          ]
        },
        {
          "id": "other_observations",
          "label": "Other observations",
          "kind": "text_short",
          "placeholder": "Bubbles, deposit, viscosity…"
        }
      ]
    },
    {
      "id": "nose",
      "label": "Nose",
      "order": 2,
      "fields": [
        {
          "id": "condition",
          "label": "Condition",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "clean", "label": "Clean"},
            {"value": "unclean", "label": "Unclean (faulty)"}
          ]
        },
        {
          "id": "intensity",
          "label": "Intensity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "light", "label": "Light"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "pronounced", "label": "Pronounced"}
          ]
        },
        {
          "id": "development",
          "label": "Development",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "youthful", "label": "Youthful"},
            {"value": "developing", "label": "Developing"},
            {"value": "fully_developed", "label": "Fully developed"},
            {"value": "tired", "label": "Tired / past best"}
          ]
        },
        {
          "id": "aroma_characteristics",
          "label": "Aroma characteristics",
          "kind": "chips_multi",
          "help": "Pick descriptors that apply; add detail in the prose field below.",
          "allowed_values": [
            {"value": "primary_fruit", "label": "Primary fruit"},
            {"value": "floral", "label": "Floral"},
            {"value": "herbal", "label": "Herbal / vegetal"},
            {"value": "spice", "label": "Spice"},
            {"value": "earth", "label": "Earth / mineral"},
            {"value": "oak", "label": "Oak"},
            {"value": "lees", "label": "Lees / autolytic"},
            {"value": "malolactic", "label": "Malolactic"},
            {"value": "tertiary", "label": "Tertiary (development)"},
            {"value": "oxidative", "label": "Oxidative"},
            {"value": "reductive", "label": "Reductive"}
          ]
        },
        {
          "id": "notes",
          "label": "Detailed aroma notes",
          "kind": "text_long",
          "placeholder": "Specific descriptors, intensity within categories, integration…"
        }
      ]
    },
    {
      "id": "palate",
      "label": "Palate",
      "order": 3,
      "fields": [
        {
          "id": "sweetness",
          "label": "Sweetness",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "dry", "label": "Dry"},
            {"value": "off_dry", "label": "Off-dry"},
            {"value": "medium_dry", "label": "Medium-dry"},
            {"value": "medium_sweet", "label": "Medium-sweet"},
            {"value": "sweet", "label": "Sweet"},
            {"value": "luscious", "label": "Luscious"}
          ]
        },
        {
          "id": "acidity",
          "label": "Acidity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "low", "label": "Low"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "high", "label": "High"}
          ]
        },
        {
          "id": "tannin",
          "label": "Tannin",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "none", "label": "N/A"},
            {"value": "low", "label": "Low"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "high", "label": "High"}
          ]
        },
        {
          "id": "alcohol",
          "label": "Alcohol",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "low", "label": "Low"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "high", "label": "High"}
          ]
        },
        {
          "id": "body",
          "label": "Body",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "light", "label": "Light"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "full", "label": "Full"}
          ]
        },
        {
          "id": "flavor_intensity",
          "label": "Flavour intensity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "light", "label": "Light"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "pronounced", "label": "Pronounced"}
          ]
        },
        {
          "id": "finish",
          "label": "Finish (length)",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "short", "label": "Short"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "long", "label": "Long"}
          ]
        },
        {
          "id": "flavor_characteristics",
          "label": "Flavour characteristics",
          "kind": "chips_multi",
          "allowed_values": [
            {"value": "primary_fruit", "label": "Primary fruit"},
            {"value": "spice", "label": "Spice"},
            {"value": "earth", "label": "Earth / mineral"},
            {"value": "oak", "label": "Oak"},
            {"value": "lees", "label": "Lees / autolytic"},
            {"value": "malolactic", "label": "Malolactic"},
            {"value": "tertiary", "label": "Tertiary"}
          ]
        },
        {
          "id": "notes",
          "label": "Detailed palate notes",
          "kind": "text_long"
        }
      ]
    },
    {
      "id": "assessment",
      "label": "Assessment of Quality (BLIC)",
      "description": "Balance, Length, Intensity, Complexity — and conclusions.",
      "order": 4,
      "fields": [
        {
          "id": "quality_level",
          "label": "Quality level",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "faulty", "label": "Faulty"},
            {"value": "poor", "label": "Poor"},
            {"value": "acceptable", "label": "Acceptable"},
            {"value": "good", "label": "Good"},
            {"value": "very_good", "label": "Very good"},
            {"value": "outstanding", "label": "Outstanding"}
          ]
        },
        {
          "id": "score_out_of_20",
          "label": "Score / 20",
          "kind": "number",
          "min": 0,
          "max": 20,
          "step": 0.5
        },
        {
          "id": "blic_reasoning",
          "label": "BLIC reasoning",
          "kind": "text_long",
          "help": "Balance, length, intensity, complexity — make the case.",
          "placeholder": "Balance: …  Length: …  Intensity: …  Complexity: …"
        },
        {
          "id": "readiness",
          "label": "Readiness for drinking",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "too_young", "label": "Too young"},
            {"value": "drink_or_hold", "label": "Drink now or hold"},
            {"value": "drink_now", "label": "Drink now"},
            {"value": "past_best", "label": "Past best"}
          ]
        }
      ]
    },
    {
      "id": "origin",
      "label": "Origin, Variety & Maturity",
      "description": "Calling the wine. Used both for blind work and for documenting reasoning when known.",
      "order": 5,
      "fields": [
        {
          "id": "variety_call",
          "label": "Grape variety / blend",
          "kind": "text_short"
        },
        {
          "id": "region_call",
          "label": "Region / country",
          "kind": "text_short"
        },
        {
          "id": "vintage_call",
          "label": "Vintage estimate",
          "kind": "year"
        },
        {
          "id": "reasoning",
          "label": "Reasoning",
          "kind": "text_long",
          "placeholder": "What in the wine led to these conclusions?"
        }
      ]
    }
  ]
}
```

### 5.2 `ms_deductive` (version 1)

```json
{
  "schema_contract_version": 1,
  "key": "ms_deductive",
  "version": 1,
  "label": "Master Sommelier — Deductive Tasting",
  "sections": [
    {
      "id": "sight",
      "label": "Sight",
      "order": 1,
      "fields": [
        {
          "id": "clarity",
          "label": "Clarity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "clear", "label": "Clear"},
            {"value": "hazy", "label": "Hazy"},
            {"value": "turbid", "label": "Turbid"}
          ]
        },
        {
          "id": "concentration",
          "label": "Concentration",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "pale", "label": "Pale"},
            {"value": "medium", "label": "Medium"},
            {"value": "deep", "label": "Deep"}
          ]
        },
        {
          "id": "color",
          "label": "Colour",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "water_white", "label": "Water-white"},
            {"value": "straw", "label": "Straw"},
            {"value": "yellow", "label": "Yellow"},
            {"value": "gold", "label": "Gold"},
            {"value": "amber", "label": "Amber"},
            {"value": "copper", "label": "Copper"},
            {"value": "pink", "label": "Pink"},
            {"value": "salmon", "label": "Salmon"},
            {"value": "purple", "label": "Purple"},
            {"value": "ruby", "label": "Ruby"},
            {"value": "garnet", "label": "Garnet"},
            {"value": "tawny", "label": "Tawny"}
          ]
        },
        {
          "id": "rim_variation",
          "label": "Rim variation",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "none", "label": "None"},
            {"value": "slight", "label": "Slight"},
            {"value": "pronounced", "label": "Pronounced"}
          ]
        },
        {
          "id": "extract",
          "label": "Staining / extract",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "low", "label": "Low"},
            {"value": "medium", "label": "Medium"},
            {"value": "high", "label": "High"}
          ]
        },
        {
          "id": "viscosity",
          "label": "Viscosity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "low", "label": "Low"},
            {"value": "medium", "label": "Medium"},
            {"value": "high", "label": "High"}
          ]
        }
      ]
    },
    {
      "id": "nose",
      "label": "Nose",
      "order": 2,
      "fields": [
        {
          "id": "condition",
          "label": "Condition",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "clean", "label": "Clean"},
            {"value": "faulty", "label": "Faulty"}
          ]
        },
        {
          "id": "fault_descriptor",
          "label": "Fault descriptor",
          "kind": "text_short",
          "visible_if": {
            "field": "nose.condition",
            "operator": "equals",
            "value": "faulty"
          }
        },
        {
          "id": "intensity",
          "label": "Intensity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "delicate", "label": "Delicate"},
            {"value": "moderate", "label": "Moderate"},
            {"value": "powerful", "label": "Powerful"}
          ]
        },
        {
          "id": "age",
          "label": "Age assessment",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "youthful", "label": "Youthful"},
            {"value": "developing", "label": "Developing"},
            {"value": "vinous", "label": "Vinous"},
            {"value": "developed", "label": "Developed"},
            {"value": "tired", "label": "Tired"}
          ]
        },
        {
          "id": "fruit",
          "label": "Fruit characteristics",
          "kind": "chips_multi",
          "allowed_values": [
            {"value": "citrus", "label": "Citrus"},
            {"value": "apple_pear", "label": "Apple/pear"},
            {"value": "stone_fruit", "label": "Stone fruit"},
            {"value": "tropical", "label": "Tropical"},
            {"value": "red_fruit", "label": "Red fruit"},
            {"value": "black_fruit", "label": "Black fruit"},
            {"value": "dried_fruit", "label": "Dried fruit"}
          ]
        },
        {
          "id": "non_fruit",
          "label": "Non-fruit characteristics",
          "kind": "chips_multi",
          "allowed_values": [
            {"value": "floral", "label": "Floral"},
            {"value": "herbal", "label": "Herbal"},
            {"value": "vegetal", "label": "Vegetal"},
            {"value": "spice", "label": "Spice"},
            {"value": "earth", "label": "Earth / mineral"},
            {"value": "oak", "label": "Oak"},
            {"value": "lees", "label": "Lees / autolytic"},
            {"value": "barnyard", "label": "Barnyard / brett"},
            {"value": "petrol", "label": "Petrol"},
            {"value": "sweet_spice", "label": "Sweet spice"}
          ]
        },
        {
          "id": "notes",
          "label": "Notes",
          "kind": "text_long"
        }
      ]
    },
    {
      "id": "palate",
      "label": "Palate",
      "order": 3,
      "fields": [
        {
          "id": "sweetness",
          "label": "Sweetness",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "dry", "label": "Dry"},
            {"value": "off_dry", "label": "Off-dry"},
            {"value": "medium", "label": "Medium"},
            {"value": "sweet", "label": "Sweet"}
          ]
        },
        {
          "id": "acidity",
          "label": "Acidity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "low", "label": "Low"},
            {"value": "medium_minus", "label": "Medium−"},
            {"value": "medium", "label": "Medium"},
            {"value": "medium_plus", "label": "Medium+"},
            {"value": "high", "label": "High"}
          ]
        },
        {
          "id": "tannin",
          "label": "Tannin",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "none", "label": "N/A"},
            {"value": "low", "label": "Low"},
            {"value": "medium", "label": "Medium"},
            {"value": "high", "label": "High"}
          ]
        },
        {
          "id": "alcohol",
          "label": "Alcohol",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "low", "label": "Low"},
            {"value": "medium", "label": "Medium"},
            {"value": "high", "label": "High"}
          ]
        },
        {
          "id": "body",
          "label": "Body",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "light", "label": "Light"},
            {"value": "medium", "label": "Medium"},
            {"value": "full", "label": "Full"}
          ]
        },
        {
          "id": "texture",
          "label": "Texture",
          "kind": "text_short"
        },
        {
          "id": "flavor",
          "label": "Flavour profile",
          "kind": "text_long"
        },
        {
          "id": "complexity",
          "label": "Complexity",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "simple", "label": "Simple"},
            {"value": "moderate", "label": "Moderate"},
            {"value": "complex", "label": "Complex"}
          ]
        },
        {
          "id": "length",
          "label": "Length / finish",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "short", "label": "Short"},
            {"value": "medium", "label": "Medium"},
            {"value": "long", "label": "Long"}
          ]
        }
      ]
    },
    {
      "id": "initial_conclusion",
      "label": "Initial Conclusion",
      "order": 4,
      "fields": [
        {
          "id": "old_or_new_world",
          "label": "Old World or New World",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "old_world", "label": "Old World"},
            {"value": "new_world", "label": "New World"}
          ]
        },
        {
          "id": "climate",
          "label": "Climate",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "cool", "label": "Cool"},
            {"value": "moderate", "label": "Moderate"},
            {"value": "warm", "label": "Warm"},
            {"value": "hot", "label": "Hot"}
          ]
        },
        {
          "id": "possible_grapes",
          "label": "Possible grape varieties",
          "kind": "text_short"
        },
        {
          "id": "possible_regions",
          "label": "Possible regions",
          "kind": "text_short"
        },
        {
          "id": "approximate_age",
          "label": "Approximate age (years)",
          "kind": "number",
          "min": 0,
          "max": 100,
          "step": 1
        },
        {
          "id": "quality",
          "label": "Quality level",
          "kind": "chips_single",
          "allowed_values": [
            {"value": "faulty", "label": "Faulty"},
            {"value": "poor", "label": "Poor"},
            {"value": "acceptable", "label": "Acceptable"},
            {"value": "good", "label": "Good"},
            {"value": "very_good", "label": "Very good"},
            {"value": "outstanding", "label": "Outstanding"}
          ]
        }
      ]
    },
    {
      "id": "final_conclusion",
      "label": "Final Conclusion",
      "description": "The call: grape, region, vintage, quality.",
      "order": 5,
      "fields": [
        {
          "id": "grape",
          "label": "Grape variety",
          "kind": "text_short",
          "required": true
        },
        {
          "id": "country",
          "label": "Country",
          "kind": "text_short",
          "required": true
        },
        {
          "id": "region",
          "label": "Region / appellation",
          "kind": "text_short"
        },
        {
          "id": "vintage",
          "label": "Vintage",
          "kind": "year",
          "required": true
        },
        {
          "id": "quality_call",
          "label": "Quality / classification",
          "kind": "text_short"
        },
        {
          "id": "reasoning",
          "label": "Reasoning",
          "kind": "text_long"
        }
      ]
    }
  ]
}
```

### 5.3 `freeform` (version 1)

```json
{
  "schema_contract_version": 1,
  "key": "freeform",
  "version": 1,
  "label": "Freeform Note",
  "sections": [
    {
      "id": "note",
      "label": "Note",
      "order": 1,
      "fields": [
        {
          "id": "body",
          "label": "Tasting note",
          "kind": "text_long",
          "required": true,
          "placeholder": "Write whatever you want — no structure required."
        }
      ]
    }
  ]
}
```

---

## 6. What the engine deliberately doesn't do (yet)

- **No scoring math.** The grid declares fields; computing "MW score / 20" or "is this passing" lives in code, not in the JSON. The grid says "there's a numeric field called assessment.score_out_of_20"; the analytics layer reads it.
- **No cross-field arithmetic.** No "compute X from Y". Same reason.
- **No localisation.** Labels are English. When (if) we localise, add `labels: { "en-NZ": "...", "fr-FR": "..." }` to fields and bump `schema_contract_version`. Don't put localisation in a side table.
- **No allowed-value provenance.** "Where did the MW colour list come from?" lives in a code review note, not the grid. If grids end up being a public asset (an MW publishes their grid for others to use) we'll add `source_url` / `credits` fields then.
