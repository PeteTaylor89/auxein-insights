// utils/timesheetStatus.js — the ONE definition of when a timesheet day may be
// edited, and by whom.
//
// This rule was implemented three times and disagreed three ways, which is F6
// in docs/Bugs/Current/TIMESHEET_WORKFLOW_2026-08-28.md:
//
//                              draft  submitted  approved  rejected
//   backend _ensure_editable    yes      yes        no        yes
//   mobile  isEditable          yes      no         no        yes
//   web     !isRejected         yes      yes        yes       no
//
// Web's was the inverse of mobile's, so an approved day showed live controls
// that every one of them 409'd (F6), a rejected day was a dead end with no
// Submit button (F3), and a submitted day could still be changed underneath the
// manager about to approve it (F4).
//
// The agreed rule is the middle row: DRAFT AND REJECTED ONLY. Rejected is
// editable on purpose — that is the whole point of rejecting, and the backend's
// submit endpoint accepts it back. The backend mirror of this file is
// `_ensure_editable` in backend/api/v1/timesheets.py; the mobile mirror is
// packages/mobile/src/utils/timesheetStatus.js (mobile cannot import
// @vineyard/shared — metro.config.js blocks it). Change one, change all three.

export const TIMESHEET_STATUS_META = {
  draft:     { label: 'Draft',     tone: 'muted'   },
  submitted: { label: 'Submitted', tone: 'info'    },
  approved:  { label: 'Approved',  tone: 'success' },
  rejected:  { label: 'Rejected',  tone: 'danger'  },
};

export const TIMESHEET_STATUS_VALUES = Object.keys(TIMESHEET_STATUS_META);

/** The only two statuses a worker may write to. */
export const TIMESHEET_DAY_EDITABLE = ['draft', 'rejected'];

/** Read a status off either a day object or a bare status string. */
const statusOf = (dayOrStatus) => {
  const raw = dayOrStatus && typeof dayOrStatus === 'object' ? dayOrStatus.status : dayOrStatus;
  return String(raw || '').toLowerCase();
};

/**
 * Editable when the day is a draft or has been rejected back to the worker.
 *
 * A day we cannot classify — null while loading, an unknown status from a
 * newer backend — is NOT editable. The controls stay disabled and the API is
 * the one that decides, rather than the UI offering a write it cannot know
 * will be accepted.
 */
export function isDayEditable(dayOrStatus) {
  return TIMESHEET_DAY_EDITABLE.includes(statusOf(dayOrStatus));
}

/**
 * Submit needs an editable day that actually exists server-side and has hours
 * on it — the backend refuses a zero-hour submission with a 400.
 */
export function canSubmitDay(day) {
  if (!day || !day.id) return false;
  if (!isDayEditable(day)) return false;
  return Number(day.effective_total_hours || 0) > 0;
}

/**
 * Why a day is locked, in the worker's words. Null when it is editable, so a
 * caller can render it unconditionally.
 */
export function dayLockReason(dayOrStatus) {
  const status = statusOf(dayOrStatus);
  if (isDayEditable(status)) return null;
  if (status === 'submitted') return 'Submitted — waiting on manager approval.';
  if (status === 'approved') return 'Approved and locked. Ask a manager to release it to make changes.';
  return 'This day is locked.';
}

/**
 * The rejection reason, which `reject_timesheet_day` appends to the day's notes
 * as `[Rejected: ...]`. Without this the worker is told the day came back and
 * never told why — the reason was written, just never displayed.
 *
 * Parsed by hand rather than by regex so the marker characters do not have to
 * survive an escape round trip. Returns the LAST reason: a day can be rejected
 * more than once and the newest is the one being acted on.
 */
export function rejectionReason(notes) {
  const text = String(notes || '');
  const open = text.lastIndexOf('[Rejected:');
  if (open === -1) return null;
  const close = text.indexOf(']', open);
  const reason = text.slice(open + '[Rejected:'.length, close === -1 ? undefined : close).trim();
  return reason || null;
}
