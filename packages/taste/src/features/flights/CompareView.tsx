import { useMemo, useState } from 'react';
import type { Note, Wine } from '@/db';
import type { ReconciledValue } from '@/reconcile';
import type { TemplateField } from '@/templates/types';
import { noteWineLabel } from '../wines/wineLabel';

// Compare and contrast.
//
// The aide-mémoire makes this its own question type ("Refer equally to the number
// of wines involved"), and the guidelines name the specific way candidates throw
// marks away: "In questions dealing with pairs of wine, candidates frequently
// lose marks by failing to clearly state which wine in the pair was of the higher
// quality."
//
// So this screen does two things and resists doing more:
//   1. puts the structural crosses side by side and HIGHLIGHTS THE ROWS THAT
//      DIFFER — the differences are the answer, everything else is noise;
//   2. states plainly which wine you scored highest.
//
// Capped at three. The exam works in pairs and threes (S1PAMS sets three), and a
// fourth column is unreadable at phone width — which would defeat the point.
const MAX_COMPARE = 3;

// How far apart two canonical positions must be before it is worth remarking on.
// Both are 0..1 over the same 5-band scale, so 0.125 is half a band: below that
// the "difference" is inside the noise of your own calibration.
const NOTABLE = 0.125;

export interface CompareRow {
  key: string;
  label: string;
  cells: { raw: string; position: number | null }[];
  spread: number;
}

/** A note, reduced to what a comparison needs. Keeps the builder testable. */
export interface ComparableNote {
  values?: Record<string, ReconciledValue> | null;
  template_snapshot?: { sections: { fields: TemplateField[] }[] } | null;
}

/**
 * Build the comparison rows for a set of notes. Pure.
 *
 * Only ordinal fields compare meaningfully — prose and free text are not
 * commensurable, and a side-by-side of two paragraphs is just two paragraphs.
 * Field order follows the first note's pinned snapshot so the grid reads in the
 * order you tasted; later notes contribute any fields the first one lacked
 * (templates can differ across a flight).
 */
export function buildCompareRows(notes: ComparableNote[]): CompareRow[] {
  if (notes.length < 2) return [];
  const seen = new Set<string>();
  const fields: TemplateField[] = [];
  for (const note of notes) {
    for (const section of note.template_snapshot?.sections ?? []) {
      for (const f of section.fields) {
        if (f.reconciliation_type !== 'ordinal' || seen.has(f.key)) continue;
        seen.add(f.key);
        fields.push(f);
      }
    }
  }

  return fields
    .map((f) => {
      const cells = notes.map((n) => {
        const val = n.values?.[f.key];
        return { raw: rawText(val), position: positionOf(val) };
      });
      const known = cells.map((c) => c.position).filter((p): p is number => p != null);
      const spread = known.length > 1 ? Math.max(...known) - Math.min(...known) : 0;
      return { key: f.key, label: f.label, cells, spread };
    })
    // A row nobody answered tells you nothing.
    .filter((r) => r.cells.some((c) => c.raw !== '—'));
}

function positionOf(val: ReconciledValue | undefined): number | null {
  const c = val?.canonical as { position?: number } | undefined;
  return typeof c?.position === 'number' ? c.position : null;
}

function rawText(val: ReconciledValue | undefined): string {
  const raw = val?.raw;
  if (raw === undefined || raw === null || raw === '') return '—';
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  return String(raw);
}

export function CompareView({
  notes,
  wines,
  onBack,
}: {
  notes: Note[];
  wines: Record<string, Wine>;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(() => notes.slice(0, 2).map((n) => n.id));

  const chosen = notes.filter((n) => picked.includes(n.id));

  const toggle = (id: string) => {
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id],
    );
  };

  const rows: CompareRow[] = useMemo(
    () => buildCompareRows(chosen as unknown as ComparableNote[]),
    [chosen],
  );

  const differing = rows.filter((r) => r.spread >= NOTABLE);

  // "State which wine was of the higher quality" — the mark candidates lose.
  const best = useMemo(() => {
    const scored = chosen
      .map((n, i) => ({ i, score: n.score })) // score is the note's extracted value
      .filter((x): x is { i: number; score: number } => typeof x.score === 'number');
    if (scored.length < 2) return null;
    const top = scored.reduce((a, b) => (b.score > a.score ? b : a));
    const tie = scored.filter((s) => s.score === top.score).length > 1;
    return tie ? null : top;
  }, [chosen]);

  const label = (n: Note) => noteWineLabel(n, wines[n.wine_id], notes.indexOf(n));

  return (
    <section className="screen">
      <div className="builder-head">
        <button className="btn btn--ghost" onClick={onBack}>‹ Flight</button>
      </div>

      <h1 className="screen-title">Compare &amp; contrast</h1>
      <p className="screen-blurb">
        Pick two or three. Rows that differ by half a band or more are marked — those are
        what an answer should turn on.
      </p>

      <div className="chip-row">
        {notes.map((n, i) => (
          <button
            key={n.id}
            type="button"
            className={picked.includes(n.id) ? 'chip chip--active' : 'chip'}
            disabled={!picked.includes(n.id) && picked.length >= MAX_COMPARE}
            onClick={() => toggle(n.id)}
          >
            {i + 1}. {label(n)}
          </button>
        ))}
      </div>

      {chosen.length < 2 && <p className="form-help">Select at least two wines.</p>}

      {chosen.length >= 2 && (
        <>
          <div className="cmp" style={{ ['--cols' as string]: chosen.length }}>
            <div className="cmp-row cmp-row--head">
              <div className="cmp-label" />
              {chosen.map((n) => (
                <div className="cmp-cell cmp-wine" key={n.id}>{label(n)}</div>
              ))}
            </div>

            {rows.map((r) => (
              <div className={r.spread >= NOTABLE ? 'cmp-row cmp-row--differs' : 'cmp-row'} key={r.key}>
                <div className="cmp-label">{r.label}</div>
                {r.cells.map((c, i) => (
                  <div className="cmp-cell" key={i}>
                    <span className="cmp-bar">
                      <span
                        className="cmp-bar-fill"
                        style={{ width: `${Math.round((c.position ?? 0) * 100)}%` }}
                      />
                    </span>
                    <span className="cmp-val">{c.raw}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <h2 className="screen-subtitle">What to write about</h2>
          {differing.length === 0 ? (
            <p className="form-help">
              These read alike structurally. That is itself the answer — say so, and turn the
              contrast onto quality, maturity or origin instead.
            </p>
          ) : (
            <p className="form-help">
              {differing.map((d) => d.label.toLowerCase()).join(', ')} —{' '}
              {differing.length} of {rows.length} elements differ.
            </p>
          )}

          <h2 className="screen-subtitle">Relative quality</h2>
          <p className="form-help">
            {best
              ? `You scored ${label(chosen[best.i])} highest (${best.score}). Say so explicitly — marks are lost by leaving it implied.`
              : 'Score the wines to rank them. An answer should state which is the better wine, and why.'}
          </p>

          <p className="form-help cmp-connectives">
            in contrast · in comparison · however · whereas
          </p>
        </>
      )}
    </section>
  );
}
