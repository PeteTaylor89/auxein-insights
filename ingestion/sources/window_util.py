"""Shared incremental-window logic for the ingestion sources.

Every source runs the same shape of forward fetch: look up the newest stored point for a
series, fetch from there to now. Two failure modes bracket that, and the fix for one used
to cause the other.

**The runaway.** A source whose record is gappy or truncated reports a last-timestamp
years old. Fetching from there at sub-hourly resolution is a backfill, not an incremental
— it is what wedged the hourly cron in July 2026 and ran it into GitHub's 6-hour cap. So
every source grew a `MAX_INCREMENTAL_DAYS` clamp: never start further back than 30 days.

**The permanent hole, which the clamp created.** The clamp starts the fetch at the floor,
so anything between the last stored point and that floor is never requested — not by the
cron, which starts at the floor, and not by the backfill, which has already finished. The
gap does not heal; it is baked in until somebody notices and runs a manual backfill.

That is not hypothetical. On 2026-08-13 BoP's backfill handed over to the cron and left a
**9-hour hole across all 65 stations on 2026-07-14**. The backfill's cutoff is
`now - 30d` computed per station *as the driver walks the list*, so it drifts later
through the run (64 stations covered at 00:00Z, tapering to 5 by 07:00Z). The first cron
run happened after the daily deploy and floored at ~17:00Z. Neither covered the middle,
and a per-DAY row-count audit showed the date as fully populated — only an hourly
breakdown exposed it.

The clamp was conflating two different situations. This module separates them:

    gap within reach   -> fetch from the last stored point; a few extra days is nothing
    gap beyond reach   -> clamp to the floor and say LOUDLY that the gap stays open

The worst-case window is `MAX_INCREMENTAL_DAYS + MAX_GAP_CLOSE_DAYS`, still bounded, and
any catch-up is one-off — the next run finds the series up to date.

**When a backfill hands over to a cron, audit the seam HOURLY, not daily.**
"""

from datetime import timedelta

# Never start an incremental fetch further back than this under normal conditions.
MAX_INCREMENTAL_DAYS = 30

# How much further back the incremental may reach solely to close a gap. Sized to absorb
# a handover slip (a deploy landing hours or days after a backfill finished) without ever
# approaching the multi-year fetch the clamp exists to prevent.
MAX_GAP_CLOSE_DAYS = 7


def incremental_start(last, now, overlap_hours=0,
                      clamp_days=MAX_INCREMENTAL_DAYS,
                      gap_close_days=MAX_GAP_CLOSE_DAYS):
    """Where an incremental run should begin fetching one series.

    Returns `(start, note)`. `note` is None when nothing needs saying, otherwise a line
    worth printing — the caller owns the prefix and formatting.

    `last` is the newest stored timestamp, or None if nothing is stored yet (the Hilltop
    sources never pass None; their `get_last_timestamp` already defaults). `overlap_hours`
    re-fetches a little before `last` so late-arriving or revised points still land; it
    defaults to 0 because most sources deliberately do not overlap.

    Pure and total, so the boundaries can be tested without a database or a network.
    Naive/aware datetimes are the caller's business — this only ever compares and offsets
    values it was given, and returns one of them.
    """
    floor = now - timedelta(days=clamp_days)
    if last is None:
        return (floor, None)                       # nothing stored: take the window

    overlapped = last - timedelta(hours=overlap_hours)

    if last >= floor:                              # steady state, the normal path
        return (max(overlapped, floor), None)

    if last >= floor - timedelta(days=gap_close_days):
        gap = now - last
        return (overlapped,
                f'gap of {gap.days}d {gap.seconds // 3600}h since the last point — '
                f'reaching past the {clamp_days}-day clamp to close it')

    return (floor,
            f'last point is {(now - last).days}d old, beyond the '
            f'{clamp_days}+{gap_close_days}-day reach — clamping to the floor, so the '
            f'gap before it STAYS OPEN and needs a deliberate backfill')


def incremental_days(days_since, clamp_days=MAX_INCREMENTAL_DAYS,
                     gap_close_days=MAX_GAP_CLOSE_DAYS, minimum=2):
    """Same policy, for a source whose API takes a look-back LENGTH, not a start time.

    Environment Southland's `data.ashx?i={days}` is the case: the window is always
    anchored at now, so a stale series just needs a longer one. Returns `(days, note)`.
    """
    if days_since <= clamp_days:
        return (max(minimum, days_since), None)
    if days_since <= clamp_days + gap_close_days:
        return (days_since,
                f'gap of {days_since}d since the last point — reaching past the '
                f'{clamp_days}-day clamp to close it')
    return (clamp_days,
            f'last point is {days_since}d old, beyond the '
            f'{clamp_days}+{gap_close_days}-day reach — clamping the look-back, so the '
            f'gap before it STAYS OPEN and needs a deliberate backfill')
