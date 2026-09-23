# Auxein Taste — Creator Publishing & Subscriptions Brief (Substack-style layer)

**Owner:** Pete Taylor / Auxein
**Status:** Proposal, 2026-09-21. **Nothing in this brief is built.** Not a V2.0 deliverable.
**Relationship to the dev plan:** Adds a new component on top of `TASTE_DEV_PLAN.md` §11.
The public release is unchanged: Taste ships first as a **free content and study
collaboration platform** (V1.0 Tasting → V1.5 Foundations → V2.0 Maps + Content + Social).
This brief does two things:

1. Defines the **creator layer** (CR-phases) as a later release, **V2.5 Creators**.
2. Lists the **seams to leave in F, K and S phases now**, so V2.5 is an addition rather than
   a rewrite. This is the only part of the brief that affects current work.

---

## 1. Decision summary

- **The core platform stays free.** Tasting, maps, content, groups and the syllabus
  taxonomy are never paywalled. Paid access applies only to **creator publications**.
- **Creators earn and Auxein takes a cut**, Substack-style. Readers pay creators directly;
  the platform takes a percentage (proposed 10%, see §9).
- **Advertising remains the platform-level revenue stream once critical mass is reached.**
  Creator revenue does not need critical mass. A handful of creators with existing audiences
  can make it work from the first month, and they bring users with them.
- **Billing is web-only.** Taste is a PWA, so subscriptions never go through Apple or Google.
  App-store fees of 15–30% would absorb the whole margin.
- **Paid bodies never reach an unentitled client.** The paywall is enforced server-side, in
  the same access layer as F2. It is never a CSS blur or a client-side truncation.

---

## 2. What "Substack-style" means for Taste

| Substack concept | Taste equivalent |
|---|---|
| Publication | `taste.publication`: a creator's branded space (e.g. an MW's weekly theory breakdown) |
| Post | A K1 content entry with `publication_id` set and an access tier |
| Free subscriber | Follows the publication; receives free posts in-app and by email |
| Paid subscriber | Monthly or annual plan; unlocks paid posts plus the paid-only community |
| Paywall line | A `paywall` node in the TipTap document; server truncates at it |
| Newsletter | Email delivery of a post to subscribers (requires the mailer; see §5) |
| Comments/chat | K5 comments and S1 groups, gated to subscribers where the creator chooses |

**What Taste has that Substack doesn't**, and why creators would publish here: posts can
embed and link to **map layers, tasting notes, flights and syllabus nodes** through the K1
`link` table. An MW can publish "Northern Rhône in six glasses" with the layer, the blind
flight and the structured notes attached, and readers can fork the layer or taste along.
That is the product case, and the reason the creator layer depends on Maps, Content and
Social being built first.

---

## 3. Release placement

| Release | Scope | Creator-layer involvement |
|---|---|---|
| **V1.0 Tasting** | T6, C1.1–C1.4 | None |
| **V1.5 Foundations** | F1–F5 | **Seams only (§4).** The mailer moves into scope here. |
| **V2.0 Platform** | M, K, S phases | **Seams only (§4).** Ships as the free content + study collab platform. |
| **V2.5 Creators** | CR1–CR6 | This brief |
| **V3.0+ Services** | CR7–CR9 | Cohorts and marking, institutional spaces, marketplace |

**Gate for starting V2.5: creators, not MAU.** Proposed trigger: at least ~20 users
publishing public content each month on V2.0, and **3–5 committed pilot creators** (MWs,
MSs, Diploma educators) who have agreed to launch a publication. Without pilots, a paid
layer launches empty.

---

## 4. Seams to leave now (F, K and S phases)

These are small and cheap if done in the phase that owns them, and expensive to retrofit.
**None of them is user-visible, and none of them adds a payment dependency to V2.0.**

| Phase | Seam | Why |
|---|---|---|
| **F1** | **Build the mailer** (already the largest open gap in F1). Use one transport (SES is the natural fit, as Auxein is already on AWS) behind a `services/mailer.py` interface, with a sending subdomain carrying SPF/DKIM/DMARC. | Verification and password reset need it now. Newsletters need the same pipe plus a bulk path. Building it once avoids two mail systems. |
| **F1** | Store **email preferences** as a structured object in `users.prefs` (per-category opt-in, global unsubscribe), not booleans on the row. | Newsletters need per-publication consent and one-click unsubscribe; retrofitting consent state onto existing users is a legal problem, not a code one. |
| **F2** | Keep every content read going through `core/access.py`, including public and link reads, via **one server-side serializer** for entries. | Paid access is then one more branch in `access_role`, and truncation happens in one place. Any route that serialises an entry directly becomes a paywall bypass later. |
| **F2** | Leave room for a **`paid` visibility value**. The column is already VARCHAR + CHECK, so this is a CHECK change, not an enum migration. Do **not** add it yet. | Adding a value that no code resolves is the same mistake the plan already avoids for `group`. |
| **F4** | Include **`exam_content`** and **`copyright`** in the `report.reason` list from day one. | Exam-confidentiality and copyright complaints are the two predictable report types on a study platform, paid or not. |
| **K1** | Give content entries nullable **`published_at`** and keep entry ownership as a single `owner_user_id` (co-authors via F2 `edit` grants). | Publications, scheduling and email sends all key off a publish timestamp. |
| **K3** | Reserve a **`paywall` node type** in the TipTap server-side allowlist (accepted and stored, rendered as a divider, no truncation logic yet). | Creators can structure posts correctly before paid tiers exist, and old posts don't need editing when they do. |
| **S1/S4** | Model **"follow a person"** so it can later be expressed as a free subscription to that person's publication, instead of a second parallel concept. | Substack's growth loop is follow → free subscriber → paid. Two separate tables for follow and subscribe fragment that funnel. |

---

## 5. Component CR — phases

### CR1 — Publications and creator profiles

- `taste.publication`: `id`, `owner_user_id`, `slug` (unique, reserved-word checked like
  handles), `name`, `tagline`, `about` (TipTap JSON), `avatar_s3_key`, `cover_s3_key`,
  `status` (`draft` / `live` / `suspended`), `created_at`, `updated_at`.
- **One publication per user at V2.5.** Multi-publication and co-owned publications can come
  later; one keeps the admin, billing and moderation model simple.
- Content entries gain `publication_id` (nullable) and `access_tier` (`free` / `paid`).
  Entries without a publication behave exactly as in V2.0.
- Publication home page: public route (`api/public.py` pattern, `get_optional_user`),
  listing posts with free previews.
- **No payments in CR1.** Publications can launch free-only, which lets pilot creators
  start before billing exists.

### CR2 — Free subscriptions and newsletter delivery

- `taste.subscription`: `id`, `subscriber_user_id`, `publication_id`, `tier`
  (`free` / `paid`), `status` (`active` / `past_due` / `cancelled` / `expired`),
  `current_period_end`, `email_enabled`, `source` (follow / checkout / comp / import),
  `created_at`. Unique on (subscriber, publication).
- **Publish-and-send**: on publish, the post is queued for email to subscribers with
  `email_enabled`. Sending is a background job, never inside the request. Store
  `email_sent_at` on the entry and a per-recipient send log for bounces and complaints.
- **Every email carries one-click unsubscribe** (`List-Unsubscribe` header plus a signed
  link) and the sender's physical contact details, as required by anti-spam law in NZ and
  the main export markets. Consent is recorded at subscribe time with source and timestamp.
- **Bounce and complaint handling** feeds back into `email_enabled`. Repeatedly mailing
  dead addresses damages the sending domain for verification emails too, which is the
  argument for handling this properly from the first send.
- **Subscriber import** (creators bringing an existing list) requires the creator to
  confirm consent, and imported addresses get a confirmation email before any post is sent.

### CR3 — Paid subscriptions (Stripe Connect)

- **Stripe Connect with Express accounts.** Stripe handles creator onboarding, identity
  checks and payouts; Auxein never holds creator bank details.
- Creator sets **monthly and annual prices**, and optionally a founding-member tier. Stripe
  Checkout for purchase, Stripe Billing for renewals, platform fee via
  `application_fee_percent`.
- `taste.creator_account`: `user_id`, `stripe_account_id`, `charges_enabled`,
  `payouts_enabled`, `country`, `default_currency`. Kept off `taste.users` so the billing
  surface can be isolated and audited separately.
- `taste.stripe_event`: webhook idempotency log (event id unique). **Subscription state is
  written only by webhook handlers**, never by the checkout redirect, because the redirect
  can be lost or replayed.
- Secrets are `TASTE_STRIPE_*`, separate from anything the main API holds, consistent with
  the F1 isolation rule. Webhook signature verification is mandatory; the endpoint is its
  own route with no user auth.
- Comp subscriptions (creator gifts access) and free trials are supported from the start;
  both are cheap in Stripe and creators expect them.

### CR4 — Paywall enforcement

- Add `paid` to the visibility CHECK and a branch in `core/access.py`: a caller gets `view`
  on a `paid` entry if they own it, hold an `edit` grant, or hold an **active paid
  subscription** to its publication (`status = active`, or `past_due` within a grace window).
- The shared entry serializer **truncates the TipTap JSON at the first `paywall` node** for
  unentitled callers and returns a `truncated: true` flag. Truncation happens at node
  boundaries, which is one of the reasons the plan stores JSON rather than HTML.
- Attached objects follow the post: a map layer, flight or document linked from a paid
  post inherits the post's gate **unless the object is itself public**. Resolve this in the
  link layer, not per component.
- **Emails respect the same rule.** Free subscribers receive the preview plus a link, never
  the paid body.
- Tests must include the bypasses that matter: direct entry fetch by id, link/slug routes,
  search results and excerpts, feed cards, email rendering, export, and the `link` table
  resolving a paid entry's attachments. Mutation-check them the way F2's tests were.

### CR5 — Creator dashboard and analytics

- Subscribers (free and paid, growth over time), revenue and upcoming payouts (read from
  Stripe, not recomputed), post views and email opens/clicks.
- **Open tracking is opt-in per creator and disclosed to readers.** Pixel tracking on a
  study platform is a trust cost; aggregate counts are enough for most creators.
- Export of the creator's own subscriber list (email + tier + consent source). **Creators
  own their audience.** This is Substack's core promise and the main reason creators would
  trust a new platform.

### CR6 — Discovery, moderation and admin

- Publications surface in S4 discovery with syllabus tagging (K2) so a WSET Diploma
  candidate can find Diploma-relevant creators. Ranking must not be purchasable.
- F4 extended: reports on paid posts, publication suspension (which pauses billing through
  Stripe rather than silently continuing to charge), refund handling, and a takedown
  process for copyright and exam-content complaints.
- F5 admin gains a creator view: publication status, Stripe account state, report history
  and payout holds.

---

## 6. Later services (V3.0+)

These came out of the same revenue discussion. They build on CR3's payment rails and are
listed so the data model does not preclude them. None is scoped yet.

| Phase | Stream | Builds on |
|---|---|---|
| **CR7** | **Cohorts and marking.** Paid study cohorts, theory-essay marking and mock tasting papers led by MWs/MSs. Submissions are a content entry (essay) or a flight (tasting); feedback uses K5 comments. One-off Stripe payments with platform commission. | K1, K5, S1, CR3 |
| **CR8** | **Institutional spaces.** Course providers (WSET approved providers, CMS prep courses) pay for private cohort spaces with tutor dashboards. Seat-based billing on a group of type `organisation`. **Likely the most reliable stream and does not depend on MAU.** | S1, F2, CR3 |
| **CR9** | **Marketplace.** Premium map layers, flashcard decks and tasting templates sold by users. Interacts directly with the fork licence (§11.4 of the dev plan): a paid layer cannot be freely forkable, so the licence model needs a commercial tier. | M3.5, CR3 |

Affiliate income (tasting kits, books, glassware) and ticketed live tastings need no
platform build beyond links and CR3 payments, and can run alongside any phase.

---

## 7. Content, legal and trust rules

- **Creators own their content.** Auxein holds a licence to host, display and distribute it
  on the platform. Creator content is **not** used for data licensing or model training
  unless the creator opts in explicitly. This matters because aggregated data licensing is
  part of the wider Auxein model, and a creator platform that quietly monetises creators'
  work will not keep creators.
- **Exam confidentiality clause** in the creator terms: no reproduction of live or recent
  IMW, CMS or WSET exam papers or tasting line-ups. Breach is a takedown and suspension
  ground. The relationships with those bodies matter more than any single creator.
- **Syllabus references** follow whatever the K2 licensing answer is. Creators tag against
  the taxonomy; they do not republish syllabus documents.
- **Paid and editorial content are labelled.** Creator posts are one person's view; Auxein
  neutral reference content (regions, canonical wines, base articles) is never sponsored and
  never paywalled.
- **Sponsored creator posts** (a producer paying a creator) must be labelled as sponsored.
  Put this in the terms at CR1 rather than after the first dispute.
- **Tax and merchant-of-record** is an open decision (§9). Get accounting advice on GST
  treatment of the platform fee and on overseas creators and readers before CR3 goes live.

---

## 8. Dependencies

| CR phase | Hard dependencies |
|---|---|
| CR1 | F1 (identity, handles), F2 (visibility), K1 (entries), K3 (TipTap) |
| CR2 | CR1, F1 mailer, F4 (abuse handling before sending mail at scale) |
| CR3 | CR2, F5 (admin surface for payout holds and disputes) |
| CR4 | CR3, F2 access layer + shared serializer, K1 `link` table |
| CR5 | CR3 |
| CR6 | CR4, S4, F4, F5 |

**CR1 and CR2 can ship without payments**, which lets pilot creators start building free
audiences while billing is built.

---

## 9. Open decisions

1. **Platform fee.** Proposal: 10% of subscription revenue, Stripe fees borne by the
   creator (the Substack model). A lower founding rate for pilot creators is worth
   considering.
2. **Merchant of record.** Connect direct charges (creator is the seller) vs destination
   charges (platform is the seller) change GST obligations, refunds and chargeback
   liability. Needs accounting advice before CR3.
3. **Who can publish paid content?** Open to all verified users, or application-only at
   launch (e.g. MWs, MSs, Diploma holders, recognised educators)? Application-only protects
   quality and the brand early; open is the long-term Substack model.
4. **Credential verification.** Should "MW" or "MS" on a creator profile be verified? It is
   the main trust signal on this platform, and an unverified title is a reputational risk.
5. **Email provider and volume.** SES is cheapest and already in the AWS estate; a dedicated
   provider (e.g. Postmark) gives better deliverability tooling. Decide at F1, since the
   same pipe serves both.
6. **Grace period** for `past_due` subscribers before access is removed.
7. **Refund policy** and who bears it (creator, platform, or split).
8. **Currencies.** NZD base with Stripe presentment currencies, or creator-chosen currency?

---

## 10. Suggested insertion into `TASTE_DEV_PLAN.md`

Add as **§11.10** (after 11.9) and add one row to the §11.8 release table.

> ### 11.10 Component 5 — Creator publishing and subscriptions (CR-phases; proposal)
>
> A Substack-style layer: creators run publications with free and paid subscribers, and
> Auxein takes a platform fee. **Not part of V2.0.** V2.0 ships as the free content and study
> collaboration platform. Full brief: **[`TASTE_CREATOR_BRIEF.md`](./TASTE_CREATOR_BRIEF.md)**.
>
> **Affects current work only through seams (brief §4):** the F1 mailer and structured email
> preferences; one shared entry serializer behind `core/access.py` (F2); `exam_content` and
> `copyright` report reasons (F4); `published_at` on entries (K1); a reserved `paywall`
> TipTap node (K3); and a follow model that can become a free subscription (S1/S4).
>
> Phases CR1–CR6 (publications → free subscriptions + newsletter → Stripe Connect paid tiers
> → server-side paywall → creator dashboard → discovery/moderation). CR7–CR9 (cohorts and
> marking, institutional spaces, marketplace) are V3.0+. Start gate: 3–5 committed pilot
> creators, not an MAU number.

**§11.8 row to add:**

| Release | Phases | Why the line is there |
|---|---|---|
| **V2.5 Creators** | CR1–CR6 | Needs content, maps and social live first, since embedded layers and flights are the reason creators would publish here rather than on Substack. CR1–CR2 are payment-free and can pilot early. |
