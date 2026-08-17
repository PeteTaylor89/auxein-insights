# Test plan — 2026-08-18

Park point for 2026-08-17. Ordered by risk, not by effort: §1 is live and affects customers,
§2 is a day's work that keeps slipping, §3-4 are not deployed so nothing is at stake yet.

**Nothing was committed today.** Everything below is working-tree state. The backend, however,
**IS deployed** — `eb deploy` ships the working directory, so prod is running code that exists
nowhere in git.

---

## 1. Verify prod — do this first, it is live

The blockchain removal is deployed and the four tables are gone. Route-level checks already pass
(`/api/blocks/{id}/blockchain-status` → 404, `/api/map-features/geojson` → 401, no 5xx across a
broad sample). What is **not** verified is the authenticated write paths, which is exactly what
was broken between the table drop and the deploy.

- [ ] **Assign a block to a company** → succeeds and **persists** after a refresh.
      This is the one that was 500ing. It failed because the dropped-table query poisoned the
      transaction before `db.commit()`.
- [ ] **Create a block** → still works, and the response no longer carries `blockchain_created`
      or `blockchain_info`.
- [ ] **Split a block** → both halves persist.
- [ ] **Transfer management of a property** (`/api/v1/properties` → transfer) → the relationship
      changes and every block's `company_id` follows.
- [ ] Spot-check the EB environment is Green, not Green-after-a-failed-rollback.

> If any of these still fail, it is **not** the blockchain removal — that code is gone from the
> deployed image. Look at the transaction handling in the surrounding endpoint instead.

### Also now live, whether or not it was intended
The same deploy shipped the **Insights surfaces work** and the **map-features API** from the
working directory. Worth a glance at `/api/surfaces/*` behaviour if the Insights session was
mid-change when the deploy went out.

---

## 2. Mobile — the six fixes. Still never run.

Planned for 2026-08-17, displaced by the blockchain and maps work. **Unchanged and still
uncommitted.** Full sheet: `docs/plans/MOBILE_TEST_2026-08-17.md` — use that as the checklist,
it is still accurate.

Setup, unchanged:
```
npm run dev:backend
npm run dev:mobile -- --clear
```
Open the **Auxein dev client**, not Expo Go. **Point at the local backend** —
`API_URL=http://192.168.1.144:8000/api` in `packages/mobile/.env`.

> **The prod-backend caveat has changed for the better.** The roll-up endpoints are now deployed,
> so prod no longer 404s them. But the local backend is still the right call: it is the only way
> to see the failure, and prod RDS is live data either way.

Order matters — **A3 before A4**:
1. **A1** roll-up children render (`SubTaskPanel`) — the headline fix
2. **A2** issue titles lead with location
3. **A3** observations work offline
4. **A4** photos — five checks, **never once run**, they were blocked by A3

Then §C store-compliance items, which need the EAS build, not Metro.

---

## 3. Web — POIs and map printing. Built today, never opened in a browser.

**Not deployed.** Run it locally: `npm run dev:web` (port 5173).
Full checklists in `docs/plans/MAP_POI_AND_PRINT.md`.

### 3a. POIs — the two that matter most
- [ ] **Add POI** → click the map → **a dot appears**.
      If nothing appears, it is the MapboxDraw point-style trap — a custom `styles` array replaces
      the defaults wholesale, and a missing point style renders nothing while the draw itself
      succeeds. The styles are added; this confirms it.
- [ ] **On a real tablet**, tap a POI → popup opens. MapboxDraw suppresses tap→click; the bridge is
      generic and should just work, but a desktop touch emulator will not tell you.
- [ ] Then the rest: sidebar count + fly-to, eye toggle, edit, soft delete, cancel-mid-draw leaves
      no orphan, second company sees nothing of the first's.

### 3b. Printing — the two that matter most
- [ ] Export **A4 landscape PNG @150 dpi** → **is not blank.**
      Blank means the `preserveDrawingBuffer` path regressed.
- [ ] **Markers appear in the exported image.** Marker images live outside the style JSON, so if
      `registerMapIcons` on the cloned style ever breaks, the basemap and polygons print fine and
      every icon silently vanishes. This is the subtle one.
- [ ] Untick a layer in the dialog → absent from the file, **still on screen**.
- [ ] Rotate the map, export → north arrow points north, not up the page.
- [ ] Scale bar reads a sane distance — check against a block of known width.
- [ ] Attribution present bottom-right.
- [ ] **A0 @ 300 dpi** → clamp warning appears and names the effective dpi (175).
- [ ] **Export PDF** → opens at the right paper size, image fills the page.
      A sample PDF from the same writer was validated with pypdf and sent yesterday — if that one
      opened, the format is sound and any failure is in the canvas→JPEG step.
- [ ] Nothing from an active draw appears on a print (no dashed draft, no vertex handles).

### 3c. Insights tab removal
- [ ] The **BlockChain** pill is gone from `/insights`, and no dead help topic remains.

---

## 4. Marketing copy — read before deploying, it is public positioning

Not deployed. Four files changed; the wording is yours to overrule.
- [ ] `grow/page.tsx` — the feature card is now **Compliance & Audit Trail** (replaced rather than
      deleted, to keep the grid at 6). Hero paragraph and benefits line reworded.
- [ ] `about/page.tsx` — timeline entry.
- [ ] `solutionsData.ts` — description + feature bullet.
- [ ] `Growfeaturesdata.ts` — "Blockchain Provenance" deleted outright; the **Audit Trail** entry
      below it already states the real capability.

> **Same mismatch still live, different feature:** the site sells "GPS-tracked spray tasks" and
> "spray efficiency heatmaps". Both are mothballed. Not touched — out of scope, but it is the next
> copy-vs-product gap.

---

## 5. Known-broken / open, not for tomorrow unless you want it

- **`backend/db/base.py` is broken and was before any of this** — line 17 imports the non-existent
  `db.models.observation`, so anything importing `db.base` raises `ModuleNotFoundError`. The app
  boots only because it goes via `db.models`. Decide whether it is dead or quietly meant to work.
- **89 blockchain chains + 89 genesis nodes are gone, no `pg_dump` was taken.** Near-zero
  operational value (genesis only, nothing ever appended), but the record of *which* 89 blocks had
  chains is unrecoverable.
- **iOS dev build** still fails at credentials — `nz.co.auxein.grow.dev` needs a provisioning
  profile. Apple-account work.
- `eas.json` iOS submit placeholders, crash reporting, Play reviewer account.
- **Sub-block sections** and **GrapeLink** are scoped, not built. Both have open questions for you
  in their docs (`SUB_BLOCK_SECTIONS.md` §12.6, `GRAPELINK_INTEGRATION.md` §6).

---

## 6. Committing — the tree holds three unrelated workstreams

`git add -A` would bundle Grow, Maps and the parallel Insights session together. Stage by path.

**Blockchain removal** (one self-contained commit — `git revert` is then the restore path):
```
backend/main.py backend/db/base.py backend/db/models/__init__.py
backend/db/models/block.py backend/api/v1/blocks.py backend/services/management_service.py
backend/db/models/blockchain.py backend/schemas/blockchain.py backend/api/v1/blockchain.py
backend/services/blockchain_service.py backend/services/block_service.py   (deletions)
packages/web/src/pages/Insights.jsx packages/web/src/help/helpContent.jsx
packages/auxein-marketing/src/{app/about,app/grow}/page.tsx
packages/auxein-marketing/src/components/solutions/{solutionsData,Growfeaturesdata}.ts
alembic/versions/drop_blockchain_tables.py docs/plans/BLOCKCHAIN_REMOVAL.md
```

**Maps (POIs + printing):**
```
backend/db/models/map_feature.py backend/schemas/map_feature.py backend/api/v1/map_features.py
alembic/versions/{add_map_features,drop_dup_geom_index}.py
packages/shared/src/api/{mapFeaturesService.js,index.js}
packages/web/src/pages/maps-v2/**  docs/plans/MAP_POI_AND_PRINT.md
```
(`main.py` and `db/models/__init__.py` are touched by **both** — commit blockchain first, then maps.)

**Mobile (the six fixes)** — path list in `MOBILE_TEST_2026-08-17.md` §5.

**Not yours:** `packages/insights/**`, `backend/scripts/interpolation/**`,
`backend/{api/v1/surfaces.py,services/surface_store.py}`, `alembic/versions/zone_*.py`,
`backend/scripts/{aggregate_zone_*,build_zone_mask,sense_check_zone_mask}.py`,
`docs/plans/CLIMATE_ZONE_MASK_AND_SEASONS_2026-08-17.md` — parallel Insights session.

There is also a stray zero-byte file literally named `-` in the repo root. Safe to delete.

---

## Prod state at park-up
- Alembic head: **`drop_dup_geom_index`** (applied)
- Blockchain: code gone, tables gone, routes gone — **complete**
- `map_features`: live, 2 rows
- Backend: **deployed** (from working directory — not in git)
- Web + marketing: **not deployed**
- Mobile: not rebuilt
