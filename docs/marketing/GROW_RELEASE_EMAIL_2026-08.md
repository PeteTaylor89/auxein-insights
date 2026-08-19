# Grow release email — August 2026

**Audience:** Grow customers (vineyard managers, web + mobile).
**Send:** AFTER the Grow web deploy. Written in the present tense throughout, so
sending it early would announce things a customer cannot use. Grow web has not
shipped since **23 June 2026**, so this covers roughly eight weeks, not two.

**Open questions before sending — see the notes at the bottom.**

---

## Subject line options

1. What's new in Auxein Grow
2. Auxein Grow: maps you can print, ten reports, and a mobile app that works offline
3. Eight weeks of Grow updates

---

## Body

Hi {{first_name}},

We've put out the biggest Grow update since launch. Here's what's changed.

**Your map, on paper**

Mark up your property with points of interest — gates, tanks, pumps, troughs,
water races, slips, frost pockets. Drop a point, draw a line, or shade an area.
Build your own types from a library of fifty icons and eight colours, so a
cattle stop looks like a cattle stop and everyone reads the same map.

Then print it. Any A-size sheet, PNG or PDF, with a title block, a key, a scale
bar and a north arrow. The printed key matches the screen exactly, so what you
pin up in the shed is what your crew sees on their phones.

**Ten reports, and they export**

There's a Reports tab on Insights now. Vineyard census, work by block,
outstanding tasks, health and safety, site access, contractor hours, assets,
observations, timesheets and task summaries. Every one of them exports to CSV
and PDF, so they go straight to your auditor, your accountant or your board.

**Tasks that group the way work actually groups**

Roll related jobs up under one parent task — a repair, a block, a run. Drag a
task onto a roll-up to add it, or select a dozen at once and assign, reschedule,
re-status or group them in a single action. Group and sort the list by block,
type or template. Everything destructive now has an undo.

**The mobile app works without signal**

This is the big one. Observations, tasks, issues and photos all capture in the
paddock whether or not you have coverage, and upload themselves when you come
back into range. Photos are held safely on the phone until the server confirms
it has them. A banner tells you what's still waiting and confirms when it has
landed.

Roll-up children now show on the phone too, so a crew can work down a list of
issues in the block instead of on a laptop that evening. Issues are titled by
where they are — "Block 4, Row 18 — Broken wire" — so they read at a glance.

**Timesheets that add themselves up**

Complete a task with hours and they go onto the day automatically. The day total
follows on its own — the only thing you enter by hand is time that wasn't
against a task. No more rolling anything up.

**Who's on site**

Your visitor register is a tap from the home screen, and signing someone out
takes one more. Contractors and visitors appear in the same list.

**Fixes worth knowing about**

Work logged in the morning was being recorded against the previous day — our
servers run on UTC and New Zealand is twelve hours ahead. Timesheet hours, task
due dates, overdue flags, calibration reminders, training expiry and the visitor
register are now all on New Zealand dates. If anything looked a day out, that
was why, and it isn't any more.

Larger photos upload without failing, and creating a risk without a review date
no longer errors.

**Two things we've retired**

GPS tracking of tractor tasks, and the spray coverage heatmap built from it. In
the field, phone GPS simply wasn't accurate enough to record a tractor pass
worth acting on, and we'd rather remove a feature than have you rely on one that
can mislead. Spray records themselves are unchanged — product, rate, block,
operator and the diary they feed.

Blockchain traceability has been replaced by a straightforward timestamped audit
trail. Every spray, observation, incident and induction is still recorded against
its block and property, and still exports for organics, SWNZ and export market
audits. Same evidence, less machinery.

As always, tell us what's missing.

— The Auxein team

---

## Notes for Pete before this goes out

1. **The mobile section assumes a new app release.** Everything described under
   "works without signal", roll-up children, the visitor shortcut and the
   timesheet change is in the app build, not the server. If the store release
   hasn't gone out, cut those three sections or the email promises something
   customers can't get. This is the single thing most likely to make the email
   wrong.

2. **The two retirements are in on purpose.** A marketing email would normally
   leave them out, but anyone who used GPS tracking or looked for the BlockChain
   tab will notice they're gone, and finding out by absence is worse than being
   told. The wording gives a reason rather than an apology. Cut them if you'd
   rather handle it one-to-one with the few who used it.

3. **The timezone paragraph is a judgement call.** It admits a real bug that
   affected recorded hours. Customers who noticed will be reassured; customers
   who didn't may now go looking at their timesheets. I'd keep it — hours are
   money, and this is the kind of thing that erodes trust if found later — but
   it's your call, and it's the one paragraph I'd expect you to want to reword.

4. **Reports live on the Insights tab** inside Grow, which reads oddly next to
   the separate Insights product. Worth a different label before this ships.

5. Numbers are deliberately absent. No "40% faster", no counts of anything —
   nothing here has been measured that way and invented figures are the fastest
   way to lose a technical audience.
