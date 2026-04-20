# Visitor Register — Scoping

**Created:** 2026-04-19
**Status:** Not started — scoping doc for next product conversation

## Why this doc

User saw Onside's "Who's on site" view and liked it. Before building, we need product clarity — the "visitor register" concept overlaps existing infrastructure in ways that will determine scope.

## Existing infrastructure

- `db/models/contractor.py` — contractors (long-lived entities with training, inductions, permissions)
- `db/models/contractor_movement.py` — check-in/out events for contractors
- `api/v1/visitors.py` — already exists (scope unclear — needs audit)
- `db/models/notification.py` — has `NotificationType.visitor` already defined

So there is **some** visitor infra already. Before scoping new work, audit `api/v1/visitors.py` to confirm what's built and what's missing.

## Three possible scopes

### A) Contractor check-in polish only
- Extend `contractor_movement` check-ins to be surfaced mobile-side
- Onside-style "Who's on site" list fed from active contractor movements
- No new visitor concept — just better UX on existing data
- **Effort:** small, 1 day

### B) Casual visitor sign-in (new model)
- Walk-up visitor: name, phone, company, purpose, host, arrival/departure
- Pre-stored inductions/acknowledgements on arrival (e.g. "Forklifts operating" acknowledge per Onside screenshot)
- Notification to host when visitor arrives
- GPS stamp on check-in
- QR code at gate for self-check-in (stretch)
- **Effort:** medium, 2-3 days

### C) Unified "Who's on site" dashboard
- Combines (a) and (b)
- Mobile home tile + dedicated screen
- Filter pills: All / Checked in / Arrived / Contractors / Visitors
- Avatar row, status badge (Inducted / Not inducted / Arrived), per-person popover
- Hazard acknowledgements broadcast to everyone on site
- **Effort:** large, 4-5 days + data model decisions

## Product questions to answer before coding

1. **Who is the audience?** Property owner who wants to know who's on their land? Or site manager policing health-and-safety compliance?
2. **Is this a compliance artefact?** If yes, need audit trail, probably time-stamped entries with server-side validation (no edit-after-the-fact).
3. **What counts as a "visitor"?** Vineyard contractors/scouts are already in `contractors`. Is a visitor (a) someone with no contractor record, (b) a family/friend/random inbound, (c) both?
4. **How do they check in?**
   - Self-check-in via QR scan? (needs per-property code)
   - Host check-in for the visitor? (simpler, no public endpoint)
   - Geo-fenced auto check-in? (privacy issue)
5. **How do they check out?** Manual / timer / geo-fence exit?
6. **Integration with inductions?** On arrival, show active site hazards; visitor taps "Acknowledge"?
7. **Notifications — who gets pinged?** Property owner on arrival, host on arrival, everyone on site when hazard posted?

## Recommended next step

1. **Audit** `backend/api/v1/visitors.py` + any existing schemas/models → know what's already built
2. **20-min product convo** with user to answer the 7 questions above
3. Pick scope A / B / C based on answers
4. Write build plan as its own doc, create phases

## Onside patterns worth copying

From `docs/screenshots/`:
- Dark-green property context header (already doing this on HomeScreen)
- "Who's on site" with tabs (All / Checked-in / Arrived)
- Avatar row + status pill per person
- "X high risk jobs" badge at top of the list
- Per-person popover with reminder send + status override
- Hazard acknowledgement card that surfaces automatically
