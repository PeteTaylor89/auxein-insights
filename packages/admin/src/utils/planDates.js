// src/utils/planDates.js — calendar dates as plain 'YYYY-MM-DD' strings.
//
// THE RULE: a due date never becomes a Date object with a time component.
//
// `new Date('2026-09-16')` parses as UTC MIDNIGHT, and every timezone behind
// UTC then renders it as the 15th. New Zealand is ahead, so the bug hides here
// and appears for anyone west of us — but the same trap catches the local
// machine the moment the browser is in UTC-anything, and it is the exact
// failure this repo keeps hitting on the server side.
//
// So the calendar's unit is the string. Comparison is string comparison, which
// is correct for ISO dates. Only the grid's structure needs real Date objects,
// and those are built with the local-time constructor `new Date(y, m, d)`,
// which never crosses a day boundary.

/** 'YYYY-MM-DD' for a local Date. */
export function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A local Date at midnight from 'YYYY-MM-DD'. Never `new Date(str)`. */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Today, as a key. */
export function todayKey() {
  return toKey(new Date());
}

/** First of the month containing `key`. */
export function monthStart(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** Shift a month view by n months, returning the new anchor key. */
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  return toKey(new Date(y, m - 1 + n, 1));
}

/** Shift a day key by n days. */
export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/**
 * The six-week grid covering a month, Monday-first.
 *
 * Always six rows. A fixed height means the grid does not jump between a
 * 5-row and 6-row month, which is a surprisingly large visual jolt when you
 * are paging through months looking for a date.
 */
export function monthGrid(anchorKey) {
  const first = monthStart(anchorKey);
  // getDay() is 0=Sunday. Monday-first means Sunday must count as 6.
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);

  const weeks = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      week.push({
        key: toKey(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === first.getMonth(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Inclusive bounds of the grid, for the API window. */
export function gridRange(anchorKey) {
  const weeks = monthGrid(anchorKey);
  return { start: weeks[0][0].key, end: weeks[5][6].key };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** 'Wed 16 Sep' — short, unambiguous, no year unless it differs from now. */
export function dayLabel(key) {
  const d = fromKey(key);
  const base = d.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  return d.getFullYear() === new Date().getFullYear()
    ? base
    : `${base} ${d.getFullYear()}`;
}

/**
 * Days from today to `key`. Negative is in the past.
 * Computed on the grid, not on milliseconds, so a DST transition inside the
 * span cannot round it to the wrong number of days.
 */
export function daysFromToday(key) {
  const a = fromKey(todayKey());
  const b = fromKey(key);
  return Math.round((b - a) / 86400000);
}

/** Bucket a due date for the agenda view. */
export function dueBucket(key) {
  if (!key) return 'undated';
  const n = daysFromToday(key);
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 7) return 'week';
  return 'later';
}

/** 'Overdue by 3 days', 'Today', 'In 2 days'. */
export function duePhrase(key) {
  if (!key) return 'No date';
  const n = daysFromToday(key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${Math.abs(n)} days ago`;
  return `In ${n} days`;
}

/** 90 -> '1h 30m'. Minutes are the stored unit; this is display only. */
export function formatMinutes(mins) {
  if (!mins) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}
