// components/pro/BaselineNote.jsx — why this page's normals end in 2005.
//
// Written once and rendered once per page. The projections panel will want the
// same sentence, which is why it is a component rather than a paragraph inside
// SiteDashboard.
//
// The period is NEVER hardcoded here. It arrives from the payload, which gets it
// from `PRO_BASELINE`, which is derived from the baseline service. A literal in
// this file would be the one place the page could disagree with the numbers it
// is describing.
import { Info } from 'lucide-react';
import './BaselineNote.css';

/**
 * @param {string} baseline  e.g. "1986-2005", from any Pro payload's meta.
 * @param {boolean} compact  drop the reason, keep the period. For panels that
 *   sit below one that has already explained it.
 */
function BaselineNote({ baseline, compact = false }) {
  if (!baseline) return null;

  return (
    <p className={`baseline-note${compact ? ' baseline-note--compact' : ''}`}>
      <Info size={14} aria-hidden="true" />
      <span>
        Normals on this page are the <strong>{baseline}</strong> average.
        {!compact && (
          <>
            {' '}It is the period the climate projections are measured from and the
            only one with a daily record, so every panel here compares against the
            same thing. Against a period ending in 2005, a warming site reads
            warmer than it would against 1991–2020.
          </>
        )}
      </span>
    </p>
  );
}

export default BaselineNote;
