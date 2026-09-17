# Auxein Partner Data API — draft specification

Date: 2026-09-16 · Status: **draft, nothing built** · Companion to `integration_plan.md`

**Commercial in confidence. Indicative, and subject to agreement.**

---

## 0. Read this first — the commitment discipline

Everything in a document sent to Mirjam becomes a thing we are held to. She will
build against it, and the first number that does not match the spec is a support
ticket with our name on it. Three rules govern this draft:

1. **Every resource carries a status.** `LIVE` = the data exists and is being
   written today. `DERIVED` = the data exists, the endpoint shape does not.
   `NOT BUILT` = neither. Nothing in this document is `NOT BUILT` without saying
   so in the same line. There is no way to un-send an implied capability.
2. **Field lists are conservative.** Where a field's unit or semantics have not
   been nailed down internally, it is marked `[confirm]` rather than guessed. A
   `[confirm]` costs one email; a wrong unit costs the relationship.
3. **The versioning policy is part of the contract** (§9). It is what lets us
   evolve without breaching. Send it *with* the schemas, not after.

What to strip before this goes out: the `Status` column values other than LIVE,
and §10. Mirjam gets the shape and the honesty; she does not need our build plan.

---

## 1. Conventions

These apply to every response and belong at the top of anything we send.

| Convention | Rule |
|---|---|
| Base URL | `https://api.auxein.co.nz/api/v1/partner` |
| Auth | OAuth2 client credentials → bearer token. See §8 |
| Format | JSON, UTF-8. `Accept: application/json` |
| Timestamps | ISO 8601. Instants in **UTC with explicit offset**. Dates (`date`) are **local calendar dates, Pacific/Auckland** |
| Nulls | `null` means *absent*. **It never means zero.** An absent rainfall day and a dry day are different facts |
| Units | Stated per field below, and echoed in `meta.units`. Never inferred |
| Paging | Cursor: `?limit=&cursor=`. Response carries `paging.next_cursor` (null at the end) |
| Incremental pull | `?updated_since=` on every time-series resource, plus the change feed (§6) |
| Provenance | Every modelled value carries `model_version`. Every extracted value carries `extracted_at` |
| Vintage | Growing season **Sep–Apr**, labelled by the harvest year. *Phenology vintage rolls 1 July* — a different rule, deliberately, and stated on the field |
| Rounding | We return full precision. Rounding is the consumer's decision |
| Errors | `application/problem+json`, stable `code` string (§8.6) |

### 1.1 Canonical units

| Quantity | Unit |
|---|---|
| Temperature, dewpoint | °C |
| Rainfall, ET, water balance | mm |
| Relative humidity | % |
| Wind speed | m/s |
| Solar radiation | MJ/m²/day |
| GDD | °C·day (base stated in the field name) |
| Distance to station | km |

### 1.2 Response envelope

```json
{
  "data": [ ],
  "meta": {
    "resource": "site.daily",
    "units": { "temp_mean": "C", "rainfall_mm": "mm", "gdd10_cumulative": "C.day" },
    "model_version": "daily-v2.3",
    "generated_at": "2026-09-16T04:12:07Z"
  },
  "paging": { "limit": 1000, "next_cursor": "eyJkIjoiMjAyNi0wNC0zMCJ9" }
}
```

---

## 2. Endpoint catalogue

Five families. Regional, site, raster, services (phenology + disease), and
platform (meta, changes, exports).

### 2.1 Metadata / catalogue

| Endpoint | Returns | Status |
|---|---|---|
| `GET /meta/variables` | Variable codes, units, value type, rollup method | LIVE (`measurement_catalog`) |
| `GET /meta/availability` | Per variable × granularity: first date, last date, gaps | LIVE (`/surfaces/available`) |
| `GET /meta/models` | Model names, versions, citations, known limits | DERIVED — assembled, not stored |
| `GET /meta/varieties` | Varieties with phenology thresholds, and which stages are calibrated | LIVE (`phenology_thresholds`) |
| `GET /meta/entitlements` | What *this* client is entitled to. Self-describing access | NOT BUILT (§8) |

`/meta/models` is worth more than it looks. It is where Bacchus is declared an
inference, where botrytis severity is distinguished from cumulative, and where
frost is declared withheld. Publishing limits as an endpoint means the consumer
can surface them, and means we said it once, in a versioned place.

### 2.2 Regional — zones and sub-regions

| Endpoint | Returns | Status |
|---|---|---|
| `GET /regions` | Wine regions | LIVE |
| `GET /zones` | Climate zones, with `parent_zone_id` / `zone_level` so the sub-regional hierarchy is walkable | LIVE |
| `GET /zones/{slug}` | Zone detail: area, centroid, parent, boundary (GeoJSON, optional) | LIVE |
| `GET /zones/{slug}/daily` | Zone daily record + station coverage + confidence | LIVE (`climate_zone_daily`) |
| `GET /zones/{slug}/monthly` | Monthly history from 1986, mean and SD | LIVE (`climate_history_monthly_surface`) |
| `GET /zones/{slug}/seasons` | Per-vintage season metrics, with zone spread (min/max/p10/p90/coverage) | LIVE |
| `GET /zones/{slug}/baseline` | 1986–2005 baseline, daily or monthly | LIVE |
| `GET /zones/{slug}/projections` | SSP × period × season, delta and absolute | LIVE |

**Zone spread is a genuine differentiator and should be in the spec.** A zone
figure carries `min`, `max`, `p10`, `p90` and `coverage` because it describes
real vineyard cells across a region — not a single number pretending to be one.
`coverage` matters: a metric covering 30% of a zone's planted cells is a
different claim from one covering all of it.

#### Draft: `GET /zones/{slug}/daily`

```json
{
  "data": [
    {
      "zone_slug": "marlborough-wairau-valley",
      "date": "2026-09-14",
      "vintage_year": 2027,
      "temp_min": 2.4, "temp_max": 14.8, "temp_mean": 8.6,
      "humidity_mean": 81.2,
      "rainfall_mm": 0.0,
      "solar_radiation": 11.4,
      "gdd_daily": 8.6, "gdd_cumulative": 122.7,
      "station_count": 9,
      "stations_with_temp": 9,
      "stations_with_humidity": 4,
      "stations_with_rain": 7,
      "confidence": "high",
      "processing_method": "idw"
    }
  ]
}
```

Note `rainfall_mm: 0.0` is a **measured dry day**. A day with no rain
observation returns `null`. This distinction should be called out in the spec
prose, not left to the convention table.

### 2.3 Site — the "my site" family

The strongest part of the offer. A site is one 500 m grid cell, so it carries a
value, not a distribution — the opposite of a zone.

| Endpoint | Returns | Status |
|---|---|---|
| `GET /sites` | Entitled sites: location, resolved cell, zone, variety, status | LIVE |
| `POST /sites` | Register a site (lat/lon, label, external_ref, variety) | LIVE (202 — population is async) |
| `PATCH /sites/{id}` | Move or relabel | LIVE |
| `GET /sites/{id}` | One site | LIVE |
| `GET /sites/{id}/daily` | Interpolated daily record, incl. GDD and water balance | LIVE |
| `GET /sites/{id}/hourly` | Hourly with per-variable provenance | LIVE |
| `GET /sites/{id}/monthly` | Long-run monthly at the cell | LIVE |
| `GET /sites/{id}/seasons` | Per-vintage season metrics, with named baseline | LIVE |
| `GET /sites/{id}/projections` | Projected, baseline, and stored delta | LIVE |
| `GET /sites/{id}/phenology` | §2.5 | LIVE |
| `GET /sites/{id}/disease` | §2.6 | LIVE |
| `GET /portfolio` | One row per site: season-to-date vs its own baseline to the same day, next stage, disease headline | LIVE (`/accounts/{slug}/portfolio`) |

**`POST /sites` is the integration's hinge.** Their platform is the system of
record for what a vineyard is; `external_ref` carries their identifier so
nothing matches on our label. Placement is asynchronous (`status: populating` →
`ready`), because extracting 40 years at a new cell is not a request-time
operation. The spec must say so, or their first integration test reads an empty
site and looks broken.

#### Draft: `GET /sites/{id}/daily`

| Field | Type | Unit | Notes |
|---|---|---|---|
| `date` | date | — | Local calendar date |
| `temp_min` / `temp_max` / `temp_mean` | float\|null | °C | |
| `rainfall_mm` | float\|null | mm | |
| `gdd_daily` / `gdd_cumulative` | float\|null | °C·day | **Base 0.** Accumulation from 1 September |
| `gdd10_daily` / `gdd10_cumulative` | float\|null | °C·day | **Base 10.** Both bases are supplied; they are not interchangeable |
| `eto_mm` | float\|null | mm | Reference ET — **an estimate, not a measurement** |
| `etc_mm` | float\|null | mm | Crop ET |
| `water_balance_mm` | float\|null | mm | Running balance |
| `eto_method` | string\|null | — | e.g. `hargreaves-samani`. Stated, never assumed |
| `model_version` | string\|null | — | Which surface era this day came from |

Two things the spec must state plainly:

- **There is no measured ET on this platform.** `eto_mm` is Hargreaves-Samani
  from temperature. Naming the method in every row is how a consumer can tell.
- **Recent days change.** The engine re-fits a trailing window, so days near the
  present are revised. Consumers must upsert on `(site_id, date)`, not
  insert-once. This is exactly the kind of thing that silently corrupts a
  partner's copy — it belongs in bold in anything we send.

#### Draft: `GET /sites/{id}/hourly`

The provenance columns are the product here. Carry them.

```json
{
  "data": [
    {
      "timestamp_utc": "2026-09-14T21:00:00Z",
      "timestamp_local": "2026-09-15T09:00:00",
      "vintage_year": 2027,
      "temp_mean": 11.3, "rh_mean": 88.0, "dewpoint": 9.4,
      "precipitation": 0.2, "wind_mean": 2.1,
      "is_wet_hour": true,
      "wetness_probability": 0.86,
      "wetness_source": "modelled",
      "hours_since_rain": 0,
      "temp_station_count": 4, "temp_nearest_km": 6.2,
      "rh_station_count": 2,  "rh_nearest_km": 18.7,
      "rain_station_count": 3, "rain_nearest_km": 5.1,
      "wind_station_count": 2,
      "confidence": "medium"
    }
  ]
}
```

`rh_station_count: 0` with `temp_station_count: 4` is the real failure mode
worth naming: a hygrometer-free neighbourhood silently zeroed RH on this
platform once already. Exposing the counts is what lets a partner distrust the
right rows rather than all of them.

### 2.4 Rasters — and a commercial warning

| Endpoint | Returns | Status |
|---|---|---|
| `GET /rasters/catalogue` | One row per published raster object: variable, granularity, statistic, `valid_at`, resolution, `model_version`, `cv_rmse` + `cv_units`, station counts, status | LIVE (`surface_run`) |
| `POST /rasters/sample` | Batch point sample: N coordinates × a date range → values. The scalable way to serve "what is it at these 400 vineyards" | DERIVED (`/surfaces/point` is single-point) |
| `GET /rasters/tiles/{variable}/{granularity}/{valid_at}/{z}/{x}/{y}.png` | Rendered PNG tiles for display | LIVE |
| `GET /rasters/{id}/object` | Signed URL to the GeoTIFF | NOT BUILT — **and should stay that way under this agreement** |

**The recommendation: sell sampling and tiles, not objects.** The rasters *are*
the asset. A partner holding the GeoTIFF archive can answer every question in
§2.2 and §2.3 forever without us, which converts an annual licence into a
one-off sale we did not price. Point sampling and display tiles give their
platform everything a user sees, and leave the asset where it is.

Two further notes for the spec: the archive is stored **unclipped** (values
exist beyond the coast and the land mask — `null` with a `reason` is the correct
read at those cells), and `cv_units` must be honoured — **rainfall is fitted in
ratio space, so its `cv_rmse` is dimensionless (~0.0025) and must never be
rendered as millimetres.**

#### Draft: `POST /rasters/sample`

```json
{
  "points": [ {"ref": "BLK-114", "lat": -41.512, "lon": 173.861} ],
  "variable": "temp_min",
  "granularity": "daily",
  "from": "2026-09-01", "to": "2026-09-15"
}
```

```json
{
  "data": [
    {
      "ref": "BLK-114",
      "series": [ {"valid_at": "2026-09-01", "value": 3.7} ],
      "cell": {"grid_key": "nz500-v3", "row": 1841, "col": 903},
      "meta": {"model_version": "daily-v2.3", "cv_rmse": 0.91, "cv_units": "C"}
    }
  ]
}
```

### 2.5 Service — phenology, including budburst

| Endpoint | Returns | Status |
|---|---|---|
| `GET /sites/{id}/phenology?vintage=` | Site phenology with the zone's figure stored alongside | LIVE |
| `GET /zones/{slug}/phenology?vintage=` | Zone-level estimates | LIVE |

```json
{
  "data": [
    {
      "site_id": 412,
      "variety_code": "SB",
      "variety_is_assumed": false,
      "vintage_year": 2027,
      "estimate_date": "2026-09-15",

      "budburst": {
        "date": "2026-09-22",
        "is_actual": false,
        "endodormancy_date": "2026-07-28",
        "chill_units": 1043.5,
        "forcing_units": 118.2,
        "forcing_target": 190.0,
        "model": "chilling-forcing (APSIM Grapevine)"
      },

      "gdd_accumulated": 122.7,
      "gdd_from_oct1": null,
      "avg_daily_gdd": 8.2,
      "current_stage": "dormant",

      "flowering_date": "2026-12-04", "flowering_is_actual": false,
      "veraison_date": "2027-02-01",  "veraison_is_actual": false,
      "harvest_200_date": "2027-03-28",

      "vs_baseline": {
        "days": -3,
        "gdd": 14.2,
        "baseline_source": "site-1986-2005"
      },

      "zone": {
        "zone_slug": "marlborough-wairau-valley",
        "gdd_accumulated": 118.1,
        "flowering_date": "2026-12-06",
        "veraison_date": "2027-02-03",
        "harvest_210_date": "2027-04-02"
      },

      "confidence": "medium"
    }
  ]
}
```

Five things the spec must carry, because each is a wrong number waiting to
happen in someone else's platform:

1. **Budburst runs a different model from everything below it** — chilling then
   forcing, triggered by a photoperiod that moves with latitude, not by a fixed
   1 September start. `endodormancy_date` is not decoration: a budburst date is
   unreadable without it.
2. **`forcing_units: null` means dormancy has not released** — no forcing has
   been accumulated. That is not the same as having accumulated none.
3. **Two GDD accumulations, deliberately.** `gdd_accumulated` runs from 1
   September; `gdd_from_oct1` is what the harvest thresholds are calibrated
   against. One accumulation cannot serve both.
4. **The zone block is stored, not joined.** Both halves carry the same estimate
   date, so "am I ahead of the district" is a like-for-like comparison rather
   than today's site against whenever the zone model last ran.
5. **`variety_is_assumed: true` is a warning.** Where a site records no variety
   we substitute one, and the substitution is worth 5–20 days against a model
   RMSE of 4.9 days. A variety we hold no thresholds for (Pinot gris today)
   returns no phenology at all — not a silent default.

And the phenology **vintage rolls 1 July**, while the accumulation starts 1
September. Two different rules, both load-bearing, both must be in the spec.

### 2.6 Service — disease pressure, including Bacchus

| Endpoint | Returns | Status |
|---|---|---|
| `GET /sites/{id}/disease?from=&to=` | Daily indices at the site's cell | LIVE |
| `GET /zones/{slug}/disease?from=&to=` | Zone-level daily indices, **including Bacchus** | LIVE (zone Bacchus added 2026-09-16, scored from 1 Sept) |

Zone and site both carry all four models. They will **disagree**, and should: the
zone averages the stations assigned to it, the point runs IDW with measured
refusal distances against the same model. Same model, different spatial source —
a stated property in `/meta/models`, not a discrepancy to reconcile.

```json
{
  "data": [
    {
      "site_id": 412,
      "date": "2026-09-14",
      "vintage_year": 2027,
      "growth_stage": "dormant",

      "powdery_mildew": {
        "risk": "low",
        "daily_index": 0.0,
        "cumulative_index": 0.0,
        "favorable_hours": 0,
        "lethal_hours": 0,
        "model": "uc-davis-gubler-1999",
        "scale": "0-100 cumulative; <30 low, 30-50 moderate, 50-60 high, >60 extreme"
      },

      "botrytis": {
        "risk": "low",
        "severity": 0.0,
        "cumulative": 0.0,
        "wet_hours": 4,
        "sporulation_index": 0.0,
        "model": "gonzalez-dominguez-2015",
        "note": "severity and cumulative are different quantities on different scales"
      },

      "bacchus": {
        "index": 0.1832,
        "peak": 0.2140,
        "infection": false,
        "wet_hours": 4,
        "dry_run": 6,
        "model": "bacchus (Balasubramaniam & Edwards)",
        "caveat": "assembly of the 1/I terms is an Auxein inference, not a published specification"
      },

      "downy_mildew": {
        "risk": "low",
        "primary_met": false,
        "primary_score": 0.0,
        "goidanich_index": 0.0,
        "model": "3-10 rule + goidanich"
      },

      "humidity_available": true,
      "hours_used": 24
    }
  ]
}
```

Four commitments in that payload, each deliberate:

1. **Bacchus is five numbers, not one.** The model is scoped to a *wet period*
   and this table is scoped to a *day*, so a wet period running 22:00 to 06:00
   is one infection event across two rows. `index` is the state carried out of
   the day; `peak` is the highest reached during it and is what to display;
   `infection` is the event. A partner charting `index` as the day's risk will
   under-report, because a reset can wipe a period that got most of the way to
   1.0. **Say this in the spec.**
2. **Bacchus precision is four decimal places** and must survive the round trip.
   The index sums terms of order 0.01–0.07 against a threshold of exactly 1.0;
   two places would lose a fifth of a wet hour per hour and the accumulated
   error would decide infections.
3. **Botrytis severity ≠ botrytis cumulative.** Different quantities, different
   bands. Drawing one under the other's bands is a wrong chart with our name on
   it — it has already happened once on our own screens.
4. **`humidity_available: false` and `hours_used < 24` are load-bearing.** They
   are how a consumer knows a low risk score means "low risk" rather than "we
   could not see".

**No forward forecast.** These indices run to D-1 from observed data. Any
forecast framing must be out of the spec until §4.1/§4.2 of `integration_plan.md`
is resolved.

### 2.7 Platform

| Endpoint | Returns | Status |
|---|---|---|
| `GET /changes?since=` | Change feed: resource, id, key, `updated_at`. Includes revisions to already-delivered days | NOT BUILT |
| `POST /exports` | Request a bulk extract (Parquet/CSV) → job id | NOT BUILT |
| `GET /exports/{job_id}` | Status + signed download URL when ready | NOT BUILT |
| `GET /health` | Freshness per pipeline, judged by **output freshness, not exit status** | DERIVED (`/admin/jobs`) |

The change feed is the single highest-value thing we can offer a partner
maintaining a copy, precisely because our recent days are revised. Without it
their only correct strategy is to re-pull a trailing window forever and hope the
window is long enough.

`/health` as a partner-visible resource is unusual and worth doing. It converts
"your data is stale" from an email into a status they can read — and it is
honest about a D-1 chain, where one source lands ~5 hours behind the rest.

---

## 3. What a first integration actually looks like

Worth putting in the spec so Mirjam can size it:

1. `POST /sites` for each vineyard on their platform, carrying their
   `external_ref`. Async; poll `GET /sites` for `status: ready`.
2. One bulk export per site family for the historical backfill.
3. Nightly: `GET /changes?since=<last>` → pull the changed keys → upsert.
4. In-season daily: phenology and disease for the current vintage.

Steps 2 and 3 are the two things that do not exist yet. They are also the two
things that make the difference between a partner who is happy at month six and
one who is re-pulling 40 years every night.

---

## 4. Third-party API authentication — the plan

There is no machine-to-machine auth in the backend today. Every public endpoint
authenticates a `public_users` JWT, and the nearest analogue — the
server-verified embed grant for article widgets — is purpose-built and not
generalisable. This is net-new, and it is the prerequisite for every endpoint
above.

### 4.1 Mechanism: OAuth2 client credentials

Chosen because it is what an integrations engineer expects, needs no interactive
flow, and every HTTP client already implements it.

```
POST /api/v1/partner/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=auxp_live_7f3a…
&client_secret=…
&scope=regional:read site:read phenology:read
```

```json
{
  "access_token": "eyJhbGciOi…",
  "token_type": "Bearer",
  "expires_in": 1800,
  "scope": "regional:read site:read phenology:read"
}
```

- **Short-lived access token (30 min), no refresh token.** Re-present the
  credentials. A refresh token is a second long-lived secret to protect for no
  benefit in a server-to-server integration.
- **JWT signed with the existing key infrastructure**, but with `aud:
  "partner"` and `sub: "partner_client:<id>"`.
- **The partner token and the `public_users` token must be mutually
  unacceptable.** Partner deps reject anything without `aud: partner`; public
  deps reject anything with it. This is the one part that must not be casual:
  our public dependency reads `user_id` from the claims, so a token carrying a
  well-chosen claim set is exactly the kind of thing that ends up authenticating
  somewhere nobody intended. One test asserting each direction is rejected.

### 4.2 Tables

| Table | Purpose |
|---|---|
| `partner_client` | The organisation. Status, contract start/end, contact, environment (`live` \| `sandbox`) |
| `partner_credential` | Hashed secret (argon2), visible prefix + last 4 for support, `created_at`, `last_used_at`, `revoked_at`. **Multiple active rows per client** so rotation is overlapping, never a cutover |
| `partner_entitlement` | client × resource × scope. **This is the commercial model as data** |
| `partner_request_log` | Timestamp, client, route, entitlement decision, row count, latency, status |

Entitlement dimensions — each one is a dial the contract can turn without code:

- **Resources**: which of the families in §2
- **Geography**: which zones; which sites (by account or explicit list)
- **Variables**: which measurement codes
- **History depth**: earliest date readable. The main §8-decision dial in
  `integration_plan.md`
- **Granularity**: hourly yes/no. Hourly is 24× the rows and drives the disease
  models — it is a separate grant from daily
- **Raster tier**: `sample` / `tile` / `object` (§2.4)

`GET /meta/entitlements` returns this to the client. A partner who can read
their own entitlement stops guessing why a 403 happened, and it makes upsell a
visible boundary rather than an argument.

### 4.3 Scopes

`regional:read` · `site:read` · `site:write` (register/move) · `phenology:read`
· `disease:read` · `raster:sample` · `raster:tile` · `raster:object` ·
`export:read`

Scope is checked first (does the token claim it), entitlement second (is the
client granted it, for *this* zone/site/date). Both, always — a scope is what
the caller asked for, an entitlement is what we sold.

### 4.4 Rate limiting and quotas

Per-client, and both dimensions matter:

- **Requests/minute** — protects the box
- **Rows/day** — protects the asset, and is the number that matters when the
  API is priced flat

`429` with `Retry-After`, and `X-RateLimit-Remaining` on every response so a
well-behaved client can pace itself. Bulk export exists precisely so nobody
needs to hammer the paged endpoints; the quota is what makes that the path of
least resistance.

### 4.5 Operational

- **Secret rotation**: two active credentials during a rotation window; revoke
  the old one after their cutover. `last_used_at` tells us when it is safe.
- **IP allowlist**: optional per client, off by default. Offer it; some
  security reviews require it and it costs one column.
- **Sandbox**: a separate `partner_client` with a fixed synthetic dataset and
  its own credentials. Mirjam can build the whole integration before a contract
  is signed, which is a sales asset, not a cost.
- **Request log retention**: needed for support, abuse, and the renewal
  conversation ("you pulled 40 M rows this year"). It does not store payloads.
- **Deprecation notice**: `Sunset` and `Deprecation` headers on any endpoint
  scheduled for removal, so their logs warn them before we do.

### 4.6 Errors

`application/problem+json`, with a stable `code` a consumer can branch on.

```json
{
  "type": "https://api.auxein.co.nz/errors/entitlement",
  "title": "Not entitled",
  "status": 403,
  "code": "entitlement.history_depth",
  "detail": "History before 2006-01-01 is not included in this agreement.",
  "instance": "/api/v1/partner/sites/412/daily?from=1990-01-01"
}
```

Codes worth defining on day one: `auth.invalid_client`,
`auth.token_expired`, `auth.scope_missing`, `entitlement.resource`,
`entitlement.geography`, `entitlement.history_depth`, `entitlement.granularity`,
`quota.rate_limited`, `quota.rows_exhausted`, `site.not_ready`,
`data.unavailable`.

`site.not_ready` and `data.unavailable` are the two that stop a partner
misreading absence as zero — the first says "come back", the second says "there
is genuinely nothing here".

---

## 5. Versioning — how we stay able to change things

The answer to "what we send, we have to adhere to". Publish this policy *with*
the schemas and the commitment becomes bounded rather than permanent.

- **Additive is always allowed.** New fields and new endpoints may appear in
  `v1` at any time. Consumers must ignore unknown fields — state this as a
  requirement on them, in the spec.
- **Breaking changes require a new version path** (`/api/v2/partner`) and 6
  months' notice, with both versions live through the window. Breaking =
  removing or renaming a field, changing a type or unit, or changing the
  meaning of an existing value.
- **Model version changes are announced, not silent.** A new `model_version`
  may change values for dates already delivered. Notice period (30 days
  suggested) plus an entry in `/meta/changelog`, and the change feed carries the
  affected keys so a partner can re-pull exactly what moved.
- **Revision of recent days is normal and is not a breaking change** — but it
  must be documented up front (§2.3), because a partner who inserts once will
  silently diverge from us and blame us when they notice.
- **Freshness is stated as a target, not a guarantee**, until an SLA is
  separately agreed. Today's honest statement: daily data is D-1, with one
  source landing ~5 h behind the others.

---

## 6. Build order and rough size

| Phase | Work | Size |
|---|---|---|
| 1 | `partner_*` tables, token endpoint, auth dep, scope + entitlement checks, rate limit, request log | M |
| 2 | Regional + site read endpoints (mostly re-shapes of existing queries) | M |
| 3 | Phenology + disease endpoints | S |
| 4 | Raster catalogue + batch sample + tile access | M |
| 5 | Change feed + bulk export jobs | M |
| 6 | Published OpenAPI, sandbox client, partner docs | S |

Phases 2 and 3 are small because the data and most of the SQL already exist —
the work is shaping, entitlement filtering, and paging. Phase 1 is the real
build, and it is reusable for every client after this one.

---

## 7. Open questions before this is sent

1. **Raster tier** — confirm objects (GeoTIFFs) are excluded, per §2.4.
2. **History depth** — what does the licence include? Drives §4.2.
3. **Site cap** — flat rate against an unbounded site count is unbounded cost.
4. **Hourly** — included, or a separate grant? It is 24× the rows and it is what
   makes the disease models reproducible on their side.
5. **Wind unit** — canonical is m/s; confirm nothing downstream converts to km/h
   before it reaches a partner payload.
6. **Forecast** — stays out, per `integration_plan.md` §4.1.
7. **SLA** — target or commitment, and what happens when the D-1 chain slips.
