// utils/timesheetStatus.js — when a timesheet day may be edited, for mobile.
//
// Mirrors packages/shared/src/utils/timesheetStatus.js — mobile doesn't depend
// on @vineyard/shared (metro.config.js blocks it). Keep the two in sync if you
// tweak one. See packages/mobile/src/utils/taskStatus.js for the same pattern.
//
// The rule: DRAFT AND REJECTED ONLY. Mobile already had it right; web and the
// backend each had a different one, which is F6 in
// docs/Bugs/Current/TIMESHEET_WORKFLOW_2026-08-28.md. The backend mirror is
// `_ensure_editable` in backend/api/v1/timesheets.py.

export const TIMESHEET_DAY_EDITABLE = ['draft', 'rejected'];

const statusOf = (dayOrStatus) => {
  const raw = dayOrStatus && typeof dayOrStatus === 'object' ? dayOrStatus.status : dayOrStatus;
  return String(raw || '').toLowerCase();
};

/** Editable when the day is a draft or has been rejected back to the worker. */
export function isDayEditable(dayOrStatus) {
  return TIMESHEET_DAY_EDITABLE.includes(statusOf(dayOrStatus));
}

/** Submit needs an editable day that exists and has hours — zero is a 400. */
export function canSubmitDay(day) {
  if (!day || !day.id) return false;
  if (!isDayEditable(day)) return false;
  return Number(day.effective_total_hours || 0) > 0;
}

/** Why the day is locked, in the worker's words. Null when editable. */
export function dayLockReason(dayOrStatus) {
  const status = statusOf(dayOrStatus);
  if (isDayEditable(status)) return null;
  if (status === 'submitted') return 'Submitted — waiting on manager approval.';
  if (status === 'approved') return 'Approved and locked. Ask a manager to release it to make changes.';
  return 'This day is locked.';
}

/**
 * The rejection reason, appended to the day's notes as `[Rejected: ...]` by the
 * backend. Returns the LAST one — a day can be rejected more than once.
 */
export function rejectionReason(notes) {
  const text = String(notes || '');
  const open = text.lastIndexOf('[Rejected:');
  if (open === -1) return null;
  const close = text.indexOf(']', open);
  const reason = text.slice(open + '[Rejected:'.length, close === -1 ? undefined : close).trim();
  return reason || null;
}
