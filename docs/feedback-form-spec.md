# Auxein Insights — Feedback Form Build Spec

A spec for Claude Code to build a simple, public feedback form on the Auxein Insights platform. Responses are emailed directly to `insights@auxein.co.nz` via the existing mail service — **no database, no persistence, no admin UI**.

---

## 1. Context

Auxein Insights is a free, login-gated climate intelligence platform for NZ winegrowers, covering all 21 wine regions. The platform is heading into a development push and we need structured feedback from subscribers on (a) which metrics matter, (b) usability gaps, and (c) what they'd want beyond climate data.

This form is the destination for an email campaign going out to all subscribers. The form must be reachable without logging in.

---

## 2. Goal

A single-page React form on `insights.auxein.co.nz/feedback` that:

- Renders the question set in section 5 below
- Validates lightly on submit (required fields only)
- POSTs to a new backend endpoint that emails the response to `insights@auxein.co.nz` using the **existing mail service already used by Insights**
- Shows a clear success state and a clear error state
- Persists nothing — no DB rows, no logs of response content, no analytics on field values

---

## 3. Tech & placement

**Monorepo:** `auxein-insights-V0.1`

**Frontend**
- React, follow existing Insights page conventions (look at the existing `/about` or similar simple static page as a template)
- Route: `/feedback` — public, no auth required
- Component: `apps/web/src/pages/Feedback/FeedbackForm.tsx` (mirror existing folder pattern; adjust if conventions differ)
- Use existing form primitives if any exist in `apps/web/src/components/`; do not add a new form library
- No emojis anywhere in the UI

**Backend**
- FastAPI, add new endpoint: `POST /api/v1/feedback`
- Locate the existing mail service before implementing — search for `smtp`, `mail`, `email`, `ses`, or similar in `apps/api/`. Reuse it. Do not introduce a new mail library or new SMTP credentials.
- Endpoint accepts the payload shape in section 6, formats it into a plain-text + simple HTML email body, sends to `insights@auxein.co.nz`, returns `{ "status": "ok" }` on success
- No database model, no Alembic migration, no ORM touches
- Add a simple in-memory rate limiter (e.g. 5 submissions per IP per hour) to deter abuse. If a rate-limiting middleware already exists in the API, use that.

---

## 4. Brand & styling

Match existing Insights styling. Brand palette for reference:

- Olive Green `#5B6830` — primary actions, accents
- Warm Sand `#FDF6E3` — background
- Terracotta Orange `#D1583B` — secondary accent, error states
- Charcoal Black `#2F2F2F` — body text

No emojis. No icons unless already used elsewhere on Insights pages.

---

## 5. Form specification

The form has **13 questions** across four sections. Section headings render as visible `<h2>`-style labels. Every field is **optional** *except* where marked required — we want to maximise completion rates.

### Section A: About you

**Q1. Which region(s) do you grow in or work with?** *(required)*
- Type: multi-select checkbox list
- Options:
  - Northland
  - Auckland
  - Waikato / Bay of Plenty
  - Gisborne
  - Hawke's Bay
  - Wairarapa
  - Nelson
  - Marlborough
  - North Canterbury / Waipara
  - Canterbury
  - Central Otago
  - Otago (other)
  - Other / multiple
  - Not a grower

**Q2. How often do you use Auxein Insights?**
- Type: single-select radio
- Options:
  - Weekly or more
  - Monthly
  - A few times a season
  - Signed up but rarely use it

### Section B: The metrics that matter

**Q3. Which of the new metrics will you actually use?**
- Type: multi-select checkbox list
- Options:
  - Date of last frost
  - Early-season frost count
  - 1-day extreme rainfall events
  - Very hot days (>30°C)
  - Not sure yet

**Q4. What metric or data is missing that you'd reach for during the season?**
- Type: textarea (multi-line, ~500 char soft limit, no hard cap enforced)

### Section C: How it feels to use

**Q5. How easy is it to find what you need on Insights?**
- Type: 1–5 scale (radio buttons or segmented control)
- Labels: 1 = Hard to navigate, 5 = Effortless

**Q6. What's the one thing that slows you down or confuses you?**
- Type: textarea

**Q7. Where do you mostly use Insights?**
- Type: single-select radio
- Options: Desktop, Mobile, Both about equally

### Section D: Beyond climate — where next?

**Q8. Outside of climate and weather, where do you lose the most time or make the least confident decisions in a season?**
- Type: textarea

**Q9. If Auxein built one tool beyond climate insights, what would make it worth paying for?**
- Type: textarea

**Q10. We're exploring a few directions — which sound useful to you?**
- Type: multi-select checkbox list
- Options:
  - Vineyard task and team management
  - Fermentation and winemaking data
  - Sensory and tasting training tools
  - Sustainability and compliance reporting
  - Market and pricing intelligence
  - None of these — I'd want something else (please describe below)

**Q11. How comfortable would you be if Auxein connected to your own vineyard or winery data?**
- Type: 1–5 scale
- Labels: 1 = Not comfortable, 5 = Very comfortable

### Section E: Close

**Q12. Anything else we should know?**
- Type: textarea

**Q13. Email (optional, only if you'd like a reply)**
- Type: email input, optional, light format validation only

---

## 6. Submission payload

Frontend POSTs JSON to `/api/v1/feedback`:

```json
{
  "regions": ["Marlborough", "Hawke's Bay"],
  "usageFrequency": "Monthly",
  "newMetricsUseful": ["Date of last frost", "Very hot days (>30°C)"],
  "missingMetric": "Soil moisture at root zone depth.",
  "easeOfUseScore": 4,
  "frictionPoint": "Switching between regions takes too many clicks.",
  "device": "Both about equally",
  "painBeyondClimate": "Spray timing decisions.",
  "worthPayingFor": "Something that integrates spray records with weather.",
  "explorationDirections": ["Vineyard task and team management"],
  "dataSharingComfort": 3,
  "anythingElse": "",
  "replyEmail": "grower@example.co.nz"
}
```

All fields optional in the schema except `regions` (required, min length 1). Empty strings and empty arrays are valid and should render as `—` in the email body, not be omitted.

---

## 7. Email format

Send a single plain-text + HTML multipart email to `insights@auxein.co.nz`:

- **From:** the existing Insights system address (whatever the mail service already uses)
- **Reply-To:** `replyEmail` if provided, otherwise the system address
- **Subject:** `New Insights feedback — {region(s) joined with comma}`
- **Body:** sectioned by the four form sections (A, B, C, D + close), with each question as a bolded label and the answer underneath. Empty answers render as `—`.

Example plain-text body skeleton:

```
New Auxein Insights feedback received.

— ABOUT YOU —
Region(s): Marlborough, Hawke's Bay
Usage frequency: Monthly

— METRICS —
New metrics they'll use: Date of last frost, Very hot days (>30°C)
Missing metric:
Soil moisture at root zone depth.

— USABILITY —
Ease of use (1–5): 4
Friction point:
Switching between regions takes too many clicks.
Device: Both about equally

— BEYOND CLIMATE —
Biggest pain outside climate:
Spray timing decisions.
Worth paying for:
Something that integrates spray records with weather.
Exploration directions: Vineyard task and team management
Comfort with data sharing (1–5): 3

— CLOSE —
Anything else: —
Reply email: grower@example.co.nz
```

HTML version: same content, lightly styled with the brand palette, section headings in olive green, body in charcoal.

---

## 8. UX requirements

- Single page, no multi-step wizard
- Section headings visible as the user scrolls
- Submit button is olive green, full-width on mobile, anchored at the bottom of the form
- Disable submit while request is in flight; show a spinner inside the button
- On success: replace the form with a calm confirmation card — "Thank you. Your feedback has gone straight to Pete." — with a single link back to `insights.auxein.co.nz`
- On error: show a terracotta-coloured inline error above the submit button: "Something went wrong sending your feedback. Please try again, or email insights@auxein.co.nz directly." Do not clear the form.
- Required-field validation: only Q1 (regions) is required. If empty, highlight that field and scroll to it.
- Mobile-first layout; test at 375px width

---

## 9. Acceptance criteria

- [ ] `/feedback` route renders without auth
- [ ] All 13 questions present, in order, with the exact wording in section 5
- [ ] Submitting with only Q1 filled succeeds; submitting with Q1 empty shows validation error
- [ ] Successful submission delivers an email to `insights@auxein.co.nz` with the format in section 7
- [ ] `Reply-To` header is set to the user's email when provided
- [ ] No database row is created, no Alembic migration added
- [ ] Existing mail service is reused — no new mail library introduced
- [ ] Rate limiter rejects the 6th submission from the same IP within an hour with a 429
- [ ] Brand palette applied, no emojis present
- [ ] Form is usable at 375px width
- [ ] No PII is logged in application logs (response body is not logged)

---

## 10. Out of scope

- Admin dashboard or response viewer
- Database persistence of any kind
- Response analytics or aggregation
- Multi-language support
- File uploads
- Anonymous submission tracking beyond the rate limiter
