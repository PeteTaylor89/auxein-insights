# CompanyAdmin → Billing tab — scoping (V1)

**Created:** 2026-05-21
**Status:** Scoping only. Not in active build.
**Related:**
- Phase 5 (`Profile.jsx` rebuild, 2026-05-21) — removed the Subscription & Pricing block from Profile. This doc covers where that surface lands instead.
- `GROW_COMMERCIAL_RELEASE_PLAN.md` Phase 6/7 — Profile/CompanyAdmin polish

**Key V1 constraint (Pete, 2026-05-21):** Billing + payments are handled in **Xero**, not in-app. The Billing tab is purely *informational* — a window onto the plan + trial state. No payment-status surfacing, no past-due banners, no Stripe webhooks. If a customer needs to act on an invoice, they do it in Xero or by emailing us.

---

## Why this doc

The user-facing pricing/plan info used to live on `/profile`, but Profile is a *personal* page and a Grow company has one billing relationship across all its users. Phase 5 stripped Subscription & Pricing out of Profile entirely. The billing surface needs a home — `CompanyAdmin` is the obvious one (company-scoped, already gated to `company_admin`/`auxein_admin`), but no tab existed.

This doc scopes the **V1 Billing tab** for CompanyAdmin. V1 is read-only — just surface what's in the DB. Self-service plan changes, payment-method edits, invoice downloads etc. are explicitly deferred.

---

## State of play (verified 2026-05-21)

### Backend — already in place
- `db/models/company.py` carries: `subscription_id`, `subscription_status` (`active|trialing|past_due|cancelled|...`), `is_trial`, `trial_start`, `trial_end`, `currency`, `total_hectares`.
- `db/models/subscription.py` has the catalog: `name`, `display_name`, `description`, `base_price_monthly`, `price_per_ha_monthly`, `price_per_ha_yearly`, `trial_days`, `trial_enabled`, plus feature config.
- `api/v1/subscriptions.py` exposes the read endpoints we need:
  - `GET /subscriptions/current/subscription` — current company's plan object
  - `GET /subscriptions/current/pricing` — plan + calculated monthly/yearly prices based on hectares
  - `GET /subscriptions/{id}` — plan detail by id
  - `GET /subscriptions/public/pricing?hectares=X` — preview-pricing for plan comparison (no auth)
- `api/v1/companies.py:getCurrentCompanyBilling` aggregates company + subscription in one call (already used by `companiesService.getCurrentCompanyBilling`).

### Frontend — already in place
- `subscriptionService` has `getCurrentSubscriptionPricing`, `getCurrentSubscription`, `getAllSubscriptions`, `calculatePricing`, plus formatting helpers (`formatCurrency`, `calculateSavingsPercentage`).
- `companiesService.getCurrentCompanyBilling` exists.
- `CompanyAdmin.jsx` already has the tab framework — adding a `billing` tab is a 2-line change in the `TABS` array + a `<BillingTab />` render branch.

### Frontend — NOT in place
- No `BillingTab` component.
- No "Billing" tab in `CompanyAdmin.jsx TABS` array.

### Gaps in the data model

**Not in the model — and we don't need them in V1 (Xero owns this surface):**
- `next_billing_date` / `current_period_end` — invoicing is run from Xero. The closest in-app signal is `trial_end` for trial accounts.
- Payment method (card last4, brand, expiry) — Xero.
- Invoice history — Xero.

**Not in the model — and we DO need it for V1 pricing display (see Pricing model below):**
- `Subscription.setup_fee` (Numeric) — one-off charge for year 1 only.
- `Company.billing_term` (`monthly_rolling` | `annual_commit`) — which commitment term the customer is on. Drives which rate the Billing tab presents as "your rate" vs "save by switching".
- Mechanism to know whether a company is currently in year 1. For V1 a simple `company.created_at < now - 365d` check is enough; we don't need a separate `setup_fee_invoiced_at` column because Xero is the source of truth for *whether* it was paid — we only need to render "(first year only)" and let the customer see for themselves what's on their Xero invoice.

If we ever decide to mirror Xero state into the app (read-only sync of "last invoice issued / paid"), that's a separate epic and lands in its own tables.

---

## Pricing model (V1 — confirmed 2026-05-21)

Single Grow plan, NZ$. Two **commitment terms** the customer picks at sign-up. Billing cadence is independent — a 12-month commitment can still be invoiced monthly (Xero handles the schedule).

| Term | Per-hectare rate | Notes |
|---|---|---|
| Rolling monthly | NZ$8.50 / ha / month | No commitment, cancel anytime |
| 12-month commitment | NZ$85 / ha / year (≈ NZ$7.08 / ha / month) | Discounted rate; **payment cadence is still the customer's choice — monthly or annual** |
| Setup fee | NZ$250 flat per company | **Year 1 only**, regardless of term |

The 12-month commitment effectively saves `(8.50 × 12) − 85 = $17/ha/year` (≈16.7%) vs rolling monthly.

**Example — 50 ha vineyard:**

| Term | Year 1 cost | Year 2+ cost |
|---|---|---|
| Rolling monthly (NZ$8.50/ha/mo) | NZ$250 setup + NZ$425/mo × 12 = **NZ$5,350** | NZ$425/mo × 12 = **NZ$5,100** |
| 12-month commitment (NZ$85/ha/yr) | NZ$250 setup + NZ$4,250 = **NZ$4,500** | **NZ$4,250** |
| Save by committing | NZ$850 | NZ$850 |

A 12-month-commit customer paying monthly is invoiced ~NZ$354/mo (`4,250 / 12`) by Xero — the in-app Billing tab shows the *rate* and *annual total*; Xero shows the *invoice schedule*.

Maps onto the existing `Subscription` catalog as:
- `base_price_monthly = 0` (recurring base is zero — the $250 is setup, not a monthly fee)
- `price_per_ha_monthly = 8.50` (rolling rate)
- `price_per_ha_yearly = 85.00` (committed rate)
- `setup_fee = 250.00` ← **new field, alembic migration needed**
- `currency = "NZD"`

**Plus a new field on `companies` to record which term the customer is on:**
- `billing_term ENUM('monthly_rolling', 'annual_commit')`, default `'monthly_rolling'` ← **new column, alembic migration needed**

The tab renders the rate that matches `company.billing_term` as the customer's *current* rate, and shows the alternative as a "save by switching" comparison. Switching terms is a "Contact us" action in V1 — Xero handles the actual cutover.

---

## V1 — what the Billing tab shows

A single read-only summary card. No edits, no payment status. A single primary CTA opens a "Contact us about billing" modal (same pattern as the Home Submit Feedback modal — Pete, 2026-05-21).

**Example mockup — company on rolling-monthly:**

```
┌─ Billing ──────────────────────────────────────────────────────┐
│                                                                │
│  Current plan                                                  │
│  ─────────────                                                 │
│  Plan:           Grow                                [Active]  │
│  Term:           Rolling monthly                               │
│  Hectares:       50 ha                                         │
│                                                                │
│  Your rate                                                     │
│  ─────────                                                     │
│  NZ$8.50 / ha / month  →  NZ$425 / month  (NZ$5,100 / year)    │
│                                                                │
│  Save NZ$850 / year by committing to 12 months                 │
│  (NZ$85 / ha / year — same flexible billing cadence)           │
│  [ Contact us to switch ]                                      │
│                                                                │
│  Setup fee                                  (year 1 only)      │
│  ─────────                                                     │
│  Onboarding:        NZ$250  (one-off, charged in your first    │
│                     year — not on subsequent renewals)         │
│                                                                │
│  Trial                                  (only if is_trial)     │
│  ─────                                                         │
│  Trial ends:        8 June 2026                                │
│                                                                │
│  Invoices and payment cadence are managed in Xero.             │
│  For plan changes or billing questions:                        │
│  [ Contact us about billing ]                                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Example mockup — company on 12-month commit:**

```
┌─ Billing ──────────────────────────────────────────────────────┐
│  Plan:           Grow                                [Active]  │
│  Term:           12-month commitment                           │
│  Hectares:       50 ha                                         │
│                                                                │
│  Your rate                                                     │
│  ─────────                                                     │
│  NZ$85 / ha / year  →  NZ$4,250 / year                         │
│  (~NZ$354 / month if billed monthly)                           │
│  You're saving NZ$850 / year vs the rolling rate.              │
│  ...                                                           │
└────────────────────────────────────────────────────────────────┘
```

The Setup fee block renders only while `company.created_at` is within 365 days. After year 1, drop the block entirely — no need to show "$0 setup" or similar.

### Field map → source

| Display label | DB source | Notes |
|---|---|---|
| Plan name | `subscriptions.display_name \|\| name` | from `getCurrentSubscription` |
| Status badge | `companies.subscription_status` | render only `active` and `trialing` in V1; suppress `past_due` / `cancelled` per the Xero constraint |
| Term | `companies.billing_term` | NEW. `monthly_rolling` → "Rolling monthly", `annual_commit` → "12-month commitment" |
| Hectares | `companies.total_hectares` | top of card, drives all pricing calcs |
| Your rate (monthly_rolling) | `price_per_ha_monthly × ha` | per month → also show × 12 = per year total |
| Your rate (annual_commit) | `price_per_ha_yearly × ha` | per year → also show /12 as a "if billed monthly" hint |
| Savings comparison | `(price_per_ha_monthly × 12 − price_per_ha_yearly) × ha` | on monthly_rolling: "save by committing"; on annual_commit: "you're saving vs rolling" |
| Setup fee | `subscriptions.setup_fee` | render the block only while `company.created_at >= now - 365d` |
| Currency | `companies.currency` (default `NZD`) | format as `NZ$` prefix (custom formatter, not `Intl` default) |
| Trial ends | `companies.trial_end` | render only when `is_trial` AND `trial_end` is in the future. Format `DD MMMM YYYY` — date only, no countdown (per Pete) |

**Important:** never use the word "yearly billing" in copy. Always frame it as commitment term (rolling vs 12-month). Billing cadence (the invoice schedule) is independent and lives in Xero.

### Status pill colours (reuse existing tokens)
- `active` → `--color-success` (olive)
- `trialing` → `--color-warning` (amber)

`past_due` / `cancelled` etc. are deliberately suppressed in V1. If those states arise, they're handled in Xero / by support — not surfaced here.

---

## CompanyAdmin tab wiring

```jsx
// CompanyAdmin.jsx (lines 6 + 14–27)
import { ..., Wallet } from 'lucide-react';

const TABS = [
  { key: 'users', label: 'Team', icon: Users },
  { key: 'invite', label: 'Invite', icon: UserPlus },
  { key: 'properties', label: 'Properties', icon: MapPinned },
  { key: 'blocks', label: 'Blocks', icon: Grid3x3 },
  { key: 'relationships', label: 'Relationships', icon: Handshake },
  { key: 'timesheets', label: 'Timesheets', icon: Clock },
  { key: 'billing', label: 'Billing', icon: Wallet },        // NEW
  { key: 'training', label: 'Training', icon: GraduationCap },
  { key: 'aliases', label: 'Aliases', icon: Link2 },
  ...
];
```

Render branch:
```jsx
{activeTab === 'billing' && <BillingTab />}
```

`BillingTab` lives in the same file as the other tabs (matches the existing convention — `TimesheetsTab`, `TrainingTab`, etc. are all colocated).

---

## Permissions

- **Visible to:** `auxein_admin`, `company_admin` only.
- **NOT visible to:** `company_manager`, `company_user`, `contractor`.

This is already enforced upstream — the entire `/admin/company` route gates on `userTypeRole !== 'company_admin' && userTypeRole !== 'auxein_admin'` (see `CompanyAdmin.jsx:33`). No additional checks needed unless we later want to grant *read* but not *manage* billing to managers.

---

## Contact-us modal (the primary action)

Mirror the existing `FeedbackModal` pattern (Home Quick Actions, 2026-05-20). Reuse the dropzone/textarea/cancel-submit shape; the only differences are wording, category set, and recipient.

- **Trigger:** `[ Contact us about billing ]` button at the bottom of the Billing card.
- **Topics (single-select pills):** Plan change · Add hectares / users · Invoice query · Cancel · Other
- **Body:** subject (≤140) + message (≤5000), optional. Pre-fill subject from the topic.
- **Recipient:** routes through the existing `/api/feedback` endpoint with `category="billing"`, OR a dedicated `/api/billing-contact` endpoint if we want a different inbox. Recommend reusing `/api/feedback` for V1 with the new category; the email service can branch on category to send to `billing@auxein.co.nz` (configurable via `BILLING_INBOX` env var, default `grow@auxein.co.nz`).
- **Attachments:** drop the dropzone — billing queries don't need screenshots.
- **Success state:** "Thanks, we'll be in touch within 1 business day."

Implementation note: extracting the modal-shell from `FeedbackModal` into a shared `ContactModal` component would be cleaner than copy-paste — both surfaces want the same layout (header / topic pills / subject / message / submit).

---

## Out of scope for V1 — deferred

1. **Plan switching from the UI** — managed in Xero. V1 says "contact us".
2. **Payment-method management** — Xero.
3. **Invoice download / history** — Xero.
4. **Prorated upgrade preview** — `subscriptionService.calculatePricing(hectares)` does the math, but with no upgrade action there's nowhere to show it.
5. **Usage display** (active users vs `max_users`, storage vs `max_storage_gb`) — only meaningful when over-quota gating exists. Defer until enforcement is real.
6. **Cancel subscription** — Xero.
7. **Billing contact / billing email** — no `billing_email` column on company. The Contact-us modal covers V1 needs; add the column when we want self-serve billing-email management.
8. **Past-due / payment-failed UX** — Xero owns this state; we don't surface it. Pete, 2026-05-21.
9. **AU$ pricing** — defer ~2 months until first AU customer is real. When it lands, currency formatter branches on `companies.currency` (`NZD` → `NZ$`, `AUD` → `AU$`). The whole formatter change is ~10 lines.

---

## Effort estimate

- **Alembic migration** `add_billing_term_and_setup`: ~20 min. Two changes in one migration — slug 26 chars, fits VARCHAR(32):
  - Adds nullable `Numeric(10,2) setup_fee` on `subscriptions`, seed the existing Grow plan row with `250.00`.
  - Adds `billing_term VARCHAR(20)` on `companies`, default `'monthly_rolling'`, plus a CHECK constraint limiting it to the two allowed values.
- **`Subscription` + `Company` models + schemas**: ~15 min — add the new fields, surface them through `SubscriptionResponse` / `CompanyResponse` / `getCurrentSubscriptionPricing`.
- **Currency formatter** (`NZ$` prefix, custom helper): ~10 lines, reusable across the app.
- **`BillingTab` component**: ~0.5 day — single component, two service calls (`getCurrentSubscriptionPricing`, `getCurrentCompany` for trial + created_at + billing_term), term-aware rendering, year-1 setup-fee gating.
- **`BillingContactModal`** (or extract `ContactModal` shared with FeedbackModal): ~0.5 day if extracted cleanly, ~0.25 day if copy-pasted from FeedbackModal.
- **CompanyAdmin tab wiring**: ~10 min — TABS entry + render branch + Wallet icon import.
- **Backend `/api/feedback` category branch** for billing routing: ~15 min.
- **Total: ~1–1.5 days** end-to-end once this scope is signed off.

---

## Open questions — resolved 2026-05-21 (Pete)

1. **Currency default** → **NZ$ first, AU$ deferred ~2 months.** Default `companies.currency` stays as-is; format as `NZ$` prefix. AU branch lands when first AU customer is onboarded.
2. **Trial countdown** → **Just show the end date** (`DD MMMM YYYY`). No countdown.
3. **"Contact us" CTA** → **Small modal**, modelled on the Home Submit Feedback modal pattern. See "Contact-us modal" section above.
4. **Past-due / payment-failed UX** → **Out of scope.** Billing and payments are handled in Xero, not in-app. The Billing tab doesn't surface payment-failure state — Xero / customer-success own that conversation.

---

## Build trigger

This doc sits in `docs/plans/` until product decides to wire payments. When that happens:
1. Re-read this doc against the then-current state of the codebase (data model may have evolved).
2. Pick up the Payments epic plan (separate doc, not yet written) and execute the Billing tab as part of phase 1.
3. Iterate on the tab as invoice/payment-method data lands.
