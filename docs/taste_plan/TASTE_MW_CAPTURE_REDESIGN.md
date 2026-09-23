# Auxein Taste — MW capture redesign + CSS overhaul

**Status:** PLAN — approved in principle 2026-09-18, nothing built yet.
**Supersedes:** the CMS-deductive-as-default assumption in `TASTE_DEV_PLAN.md` §8 (D1)
and `TASTE_BUILD_SPEC.md` Epic 2. The CMS grid is **not** deleted — it is demoted
from default to selectable.

---

## 1. The problem, quantified

Pete's words, 2026-09-18: *"the overall feel of the app is clunky … it takes up too
much energy at a tasting."*

Measured against the code as it stands (all verified 2026-09-18):

| Fact | Value |
|---|---|
| Builtin template | CMS Deductive **v5** |
| Fields per wine | **42** |
| Accordion sections to walk | **7** (forward-only Back/Next in `SectionWalk`) |
| `tag_structured` aroma fields | **8** — each opens a **full-screen modal** |
| Terms behind those modals | 22–58 per field, across 2–10 groups |
| Dark mode | **none** — zero `prefers-color-scheme` rules in 1,739 lines of CSS |
| Timer | **none** |
| Dictation | **none** |
| Compare-and-contrast view | **none** |
| CSS tuning passes already spent | **four** (sub-pass 1, 2, 2b, 2c) |

Four rounds of shrinking pills have not fixed it, because **the problem is the number
of interactions, not their size**. Up to eight modal round-trips per wine before a
single sentence is written.

## 2. What the new IMW docs actually demand

Source material dropped into `docs/taste_plan/Update_Sept 2027/` on 2026-09-18:
`IMW-Tasting-Lexicons.pdf`, `MW files/An-aide-memoire-.pdf`,
`MW files/MW-practical-exam-guidelines.pdf`, `MW files/S1PAMS_1-7.docx`.
(`Students-contact-list-2025-26-NEW.pdf` is a roster of real people — not build input,
and it should arguably not be in the repo at all.)

The operative instruction, from the S1PAMS assignment brief:

> "for each wine, make observations (**a tasting grid/cross/tasting notes**) of what the
> wine might look, smell and taste like. **Use your tasting grid/cross/notes … as
> evidence to support the argument** that you are making when answering the question."

And the budget: **12–15 minutes per wine** for parts a–c, +8 min for the supplementary.
That is the whole thing — grid *and* written argument.

Three consequences, and they are the heart of this redesign:

1. **The grid is scratch evidence, not the deliverable.** The deliverable is prose.
   The app currently treats the grid as the deliverable and offers prose as an
   afterthought (`general_notes`, one box).
2. **The IMW lexicon is prose vocabulary, not a checkbox taxonomy.** Its 11 dimensions
   (Colour, Fruit, Acidity, Tannin, Alcohol, Texture, Structure, Quality, Maturity,
   Oak, Nose) are *words to write with*. The CMS descriptor sheet is a *set of boxes to
   tick*. Modelling the first as the second is precisely the category error that makes
   capture feel like data entry.
3. **Speed and triage are examinable skills.** "First impressions count most."
   "Don't overtaste." "Have a plan on timing and stick to it." An app that costs energy
   is actively training the wrong habit.

Supporting structure from the aide-mémoire and guidelines:

- **11 KEY STRUCTURAL ELEMENTS:** Colour · Acidity · Alcohol · Tannin · Oak ·
  Residual sugar · Texture · Fruit · Concentration/intensity · Length · Balance.
- **Five question types:** Variety · Origin · Quality · Maturity · Style
  (+ Method of Production, Commercial Appeal, Compare & Contrast).
- **Funnelling** — list 3–4 candidate answers at most, *"always end with a positive
  reason for the identification, rather than just an elimination."*
- **BLICC / BLICCA** — Balance, Length, Integration, Complexity, Concentration
  (+Ageability) as the quality checklist. Guidelines are explicit that *"the acronym
  itself should not be used in the answer; it is only a reminder."* So it is a
  **prompt in the UI, never a label in the output.**
- **Units** — alcohol stated specifically (±0.5%); RS as dry/off-dry/medium-sweet/
  fully-sweet unless asked; *"hedging can go too far."*

## 3. The redesign

**One line: prose-first with tappable vocabulary, not grid-first with modals.**

### 3.1 New builtin template — "MW Practical"

A second builtin alongside CMS Deductive, and the **new default**. Three sections,
~16 fields (vs 42):

**Section 1 — Structural cross (11 fields, one screen, no scrolling)**
The 11 key structural elements, every one a discrete labelled slider
(`single_select` rendered as `.oslider`, `reconciliation_type: 'ordinal'`). This is
the existing widget — it is already the best thing in the app and it reconciles for
free. Sliders are thumb-reachable and need no modal.

**Section 2 — Observations (prose)**
`text_long` fields for Nose and Palate, each with a **lexicon chip bank** (see §3.2).
`reconciliation_type: 'none'`.

**Section 3 — Conclusions (funnel)**
Variety · Origin · Quality · Maturity · Style. Each is a prose field with a
**candidate funnel** control above it: add up to 4 candidates, mark one as the call,
and a required "positive reason" line. `quality_level` keeps its ordinal band and
`score` its score axis, so blind accuracy and the stats dashboard keep working
unchanged.

> **Constraint to respect:** `TemplateField.reconciliation_type` is **required** and
> `fieldReconError` gates template save. Every new field must classify as
> `ordinal` | `score` | `none`. Prose fields are `none` — that is valid and
> non-lossy; the value envelope just carries `{raw}` with no `canonical`.

### 3.2 The lexicon chip bank — reuse, don't rebuild

The IMW lexicon's 11 dimensions map **1:1** onto the `dimension` column of the
`taste.vocab` table that already shipped (migration `0004_vocab`, live in prod).

Proposed: add one optional property to `TemplateField`:

```ts
lexicon_dimension?: string;  // e.g. 'acidity' | 'tannin' | 'quality'
```

When set on a `text_long` field, `GridRenderer` renders a horizontal chip rail
beneath the textarea. Tapping a chip **inserts the word into the prose** at the
cursor. That is the whole mechanic. It replaces eight modal round-trips with
zero-navigation inline taps, and it teaches the examinable vocabulary by putting it
in front of you while you write.

~~Seed the IMW lexicon as `user_id IS NULL` global vocab rows — the same
read-only-builtin pattern `templates` already uses.~~

**CORRECTED 2026-09-18 during T3 — that isn't possible without a migration.**
`templates.user_id` is `nullable=True` (which is why global builtin templates
work), but `vocab.user_id` comes from `SyncMixin` and is **`nullable=False`**, and
`list_vocab` filters strictly on `Vocab.user_id == user_id`. Global rows would
need both a migration and an API change, for data that is fixed, public and ~250
terms.

So the lexicon ships as a **frontend constant** (`src/templates/lexicon.ts`), and
`taste.vocab` keeps doing its actual job — the terms *this* taster adds. Both
merge into one rail at render time, so the behaviour is identical from the user's
side and the existing `addOption`→`vocab` path is untouched.

**Why not a new field type:** adding a 10th `FieldType` ripples into the builder, the
field bank, reconciliation and the export mapping. A property on `text_long` costs
one renderer branch.

### 3.3 Flow changes

- **Timer.** Per-wine elapsed, target 12–15 min, visible but not nagging. Flight-level
  total. This is the single highest-value addition for exam training.
- **Flight-first.** MW papers are 12 wines. `GlassRack` already exists and holds the
  glass-switching model; make flight the default entry from Home rather than "Quick
  taste."
- **Collapse setup.** `CaptureScreen` currently gates on a `'setup'` phase before you
  can record anything. Invert it: start tasting immediately, attach wine/event/flight
  detail after or on reveal. This matches blind practice anyway.
- **Compare & contrast view.** Side-by-side structural crosses for 2–3 wines in a
  flight, since the exam asks across wines. New, nothing to reuse.

### 3.4 CSS — token reset, not a fifth tuning pass

- Rebuild `:root` tokens; strip nested cards to a **single column**; remove accordion
  chrome.
- **Dark mode as a first-class theme** — `@media (prefers-color-scheme: dark)` plus a
  manual override. Tasting rooms and cellars are dim; a cream-paper app at full
  brightness is genuinely unpleasant there.
- **One-thumb reach**: primary controls in the bottom third.
- Fewer, larger targets — the opposite of sub-pass 2c's direction, which optimised
  for density when the actual constraint is fatigue.
- Keep claret/cream as the light palette. This is a structural reset, not a rebrand.

## 4. Phasing

Each phase builds complete, then pauses for Pete to test.

| Phase | Deliverable | Layers touched |
|---|---|---|
| **T1** | ✅ **BUILT 2026-09-18** CSS token reset + dark mode + single-column layout. Two-layer tokens, all 26 hardcoded colours replaced, `src/theme.ts` + Settings toggle. Found and fixed a real AA failure: light `--muted` was 3.52:1. tsc clean, **not opened in a browser**. | frontend only |
| **T2** | ✅ **BUILT 2026-09-18** `mw-seed.json` (3 sections / 26 fields) + `layout: 'cross'` two-column slider grid + MW as default in `CaptureScreen`. Seed script generalised to both builtins, **dry-run by default**. Blind-grading resolution verified against all 5 dimensions; 36/36 unit tests green. **Seed NOT yet run against any DB.** | seed script (backend) + frontend |
| **T3** | ✅ **BUILT 2026-09-18** `src/templates/lexicon.ts` (15 IMW banks incl. the suggests/proves argument connectives) + tap-to-insert rails under every prose field + `insertTerm` caret/spacing logic (12 unit tests). `lexicon_dimension` widened to `string \| string[]`; mw-seed → **v2** with 8 prose fields wired. 48/48 tests green. **Frontend-only — no migration, no API change** (see the correction in §3.2). Needs the template seed re-run for v2. | frontend + template re-seed |
| **T4** | ✅ **BUILT 2026-09-18** Funnel control on the three identification answers (capped at 4 candidates, commit one), BLICC self-check under the quality prose, per-wine `PaceTimer` (12/15 min thresholds). mw-seed → **v3**. Companion-key pattern (`__alts` / `__checklist`) keeps the graded value a plain string. 48/48 green. **Needs the template re-seed.** | frontend + template re-seed |
| **T5** | ✅ **BUILT 2026-09-18** `CompareView` on a flight: 2-3 wines side by side, ordinal rows only, rows differing by ≥half a band highlighted, plus an explicit "which is higher quality" line. `buildCompareRows` extracted as pure + 8 unit tests. 56/56 green. Frontend only, **no re-seed needed**. | frontend only |

**T1-T5 complete.** Nothing in this table has been opened in a browser; every phase is
tsc-clean and unit-tested only. The outstanding gates are the template re-seed (v3) and
Pete's device testing.

**Deploy checklist per phase** (Pete's step, per the standing workflow):
- Frontend: `npm run build:taste` → `s3 sync` to `auxein-taste-web` → CloudFront
  invalidation on `E1EIEGH40S0ECX`.
- Backend (T2/T3 only, for the seed): `cd backend_taste && eb deploy auxein-taste-prod`,
  then run the seed script. **No migration is required** for T1–T5 as drafted — T3
  reuses the existing `vocab` table.

## 5. Risks / things that will bite

- **Old notes must keep rendering.** Notes pin `template_id` + `version` +
  `template_snapshot`. Changing the *default* template does not touch existing notes —
  but the CSS reset **will** restyle `WineReview`'s snapshot rendering, including the
  `.rslider` ordinal read-out. Check a pre-existing note renders after T1.
- **`seed_taste_templates.py` writes global (`user_id IS NULL`) rows.** Per
  `project_seed_system_templates_drift` on the Grow side, a bare re-run of a seed
  script in this repo has previously created duplicates. Make the MW template seed
  **idempotent and dry-run-by-default** before pointing it at prod.
- **Blind accuracy grades five D6 dimensions** (variety, country, region, vintage,
  age-range) against `blind_conclusions`. **Corrected 2026-09-18 after reading the
  code:** it does *not* key off literal `ic_*`/`fc_*` names. `resolveGuess` regex-matches
  `"<key> <label>"` against `DIMENSION_PATTERNS` (`/variet|grape/i`, `/countr/i`,
  `/region|appellation|subregion/i`, `/vintage|year/i`, and `/(?<![a-z])age/i` — the
  lookbehind stops "vint**age**" hijacking the age dimension). The `fc_`/`ic_` prefixes
  only set *precedence* via `keyRank` (fc=0, ic=1, anything else=2).
  Two practical consequences:
  1. Only fields in a `blind_only` section reach `blind_conclusions` at all.
  2. A prose field like "Why — variety evidence" **also matches** the variety pattern,
     so the field you actually want graded must outrank it — name it `fc_variety`.
  The age field's options must equal `AGE_BUCKETS` verbatim
  (`1-3 yrs` / `3-5 yrs` / `5-10 yrs` / `10 yrs+`) or `ageBucket` can never match.
- **Prose is not gradable.** Stats currently work because everything reconciles. Moving
  to prose-first means the dashboard sees less structured data per note. The 11
  structural sliders are what keep the stats alive — do not let them become optional.

## 6. Out of scope here

- Maps / map layers — see `TASTE_MAPS_SCOPE.md`.
- Epic 4 Knowledge Centre (articles, tags, links, comments) — still entirely unbuilt.
- Dictation. Worth wanting, but Web Speech API support in an iOS standalone PWA is
  unreliable enough to need its own spike rather than a line in this plan.
