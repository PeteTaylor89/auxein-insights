import { useMemo, useState } from 'react';
import type { Template } from '@/db';
import { SCORE_SYSTEMS, type ReconciliationType, type ScoreSystem } from '@/reconcile';
import type { TemplateField } from '@/templates/types';
import { SCORE_SYSTEM_OPTIONS, fieldReconError, newSection, slugify } from '@/templates/factory';
import { FIELD_BANK, SECTION_SUGGESTIONS, instantiateField } from '@/templates/fieldBank';

interface Props {
  draft: Template;
  onSave: (t: Template) => void | Promise<void>;
  onCancel: () => void;
}

const RECON_BADGE: Record<ReconciliationType, string> = { ordinal: 'Ordinal', score: 'Score', none: 'Raw' };

// Custom-grid editor. Fields are NOT free-typed — they're added from the field
// bank (the reconcilable CMS canon). Users adjust only constrained params (score
// system, numeric scale) that still reconcile; everything else is fixed by the bank.
export function TemplateBuilder({ draft: initial, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Template>(initial);
  const [error, setError] = useState('');
  const [pickingFor, setPickingFor] = useState<number | null>(null); // section index

  // Keys already in the draft — used to grey out already-added bank fields.
  const usedKeys = useMemo(
    () => new Set(draft.sections.flatMap((s) => s.fields).map((f) => f.key)),
    [draft],
  );

  const patchSection = (si: number, patch: Partial<(typeof draft.sections)[number]>) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)) }));

  const patchField = (si: number, fi: number, patch: Partial<TemplateField>) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i === si ? { ...s, fields: s.fields.map((f, j) => (j === fi ? { ...f, ...patch } : f)) } : s,
      ),
    }));

  const addSection = () => setDraft((d) => ({ ...d, sections: [...d.sections, newSection()] }));
  const removeSection = (si: number) => setDraft((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }));
  const moveSection = (si: number, dir: -1 | 1) =>
    setDraft((d) => {
      const next = [...d.sections];
      const t = si + dir;
      if (t < 0 || t >= next.length) return d;
      [next[si], next[t]] = [next[t], next[si]];
      return { ...d, sections: next };
    });

  const addFieldFromBank = (si: number, field: TemplateField) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === si ? { ...s, fields: [...s.fields, instantiateField(field)] } : s)),
    }));
  const removeField = (si: number, fi: number) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === si ? { ...s, fields: s.fields.filter((_, j) => j !== fi) } : s)),
    }));
  const moveField = (si: number, fi: number, dir: -1 | 1) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => {
        if (i !== si) return s;
        const fields = [...s.fields];
        const t = fi + dir;
        if (t < 0 || t >= fields.length) return s;
        [fields[fi], fields[t]] = [fields[t], fields[fi]];
        return { ...s, fields };
      }),
    }));

  // Constrained param: pick a score system → sync min/max + slider scale (stays valid).
  const changeScoreSystem = (si: number, fi: number, system: string) => {
    const current = draft.sections[si].fields[fi];
    if (system === 'custom') {
      const min = current.scale?.min ?? 0;
      const max = current.scale?.max ?? 100;
      patchField(si, fi, { score_system: { system: 'custom', min, max } });
      return;
    }
    const def = SCORE_SYSTEMS[system];
    const next: ScoreSystem = { system, min: def.min, max: def.max };
    patchField(si, fi, { score_system: next, scale: { min: def.min, max: def.max, step: current.scale?.step ?? 1 } });
  };

  const setScaleNum = (si: number, fi: number, key: 'min' | 'max' | 'step', value: number) => {
    const current = draft.sections[si].fields[fi];
    const scale = current.scale ?? { min: 1, max: 5, step: 1 };
    patchField(si, fi, { scale: { ...scale, [key]: value } });
  };

  // Fill machine keys (unique) before saving. Labels/options come from the bank.
  const prepare = (): Template => {
    const used = new Set<string>();
    return {
      ...draft,
      name: draft.name.trim(),
      sections: draft.sections.map((s) => ({
        ...s,
        label: s.label.trim(),
        fields: s.fields.map((f, idx) => {
          let key = f.key || slugify(f.label) || `field_${idx + 1}`;
          while (used.has(key)) key = `${key}_${idx + 1}`;
          used.add(key);
          return { ...f, key };
        }),
      })),
    };
  };

  const handleSave = () => {
    if (!draft.name.trim()) return setError('Give the grid a name.');
    if (draft.sections.length === 0) return setError('Add at least one section.');
    if (draft.sections.every((s) => s.fields.length === 0)) return setError('Add at least one field from the bank.');
    const prepared = prepare();
    for (const section of prepared.sections) {
      for (const field of section.fields) {
        const err = fieldReconError(field);
        if (err) return setError(err);
      }
    }
    void onSave(prepared);
  };

  // ---- Bank picker overlay -------------------------------------------------
  if (pickingFor !== null) {
    const si = pickingFor;
    return (
      <section className="screen">
        <div className="builder-head">
          <button className="btn btn--ghost" onClick={() => setPickingFor(null)}>‹ Done</button>
          <span className="builder-pick-title">Add fields</span>
        </div>
        <p className="screen-blurb">Every field reconciles to the common standard. Tap to add.</p>
        {FIELD_BANK.map((cat) => (
          <div className="bank-cat" key={cat.label}>
            <h3 className="bank-cat-label">{cat.label}</h3>
            <div className="bank-grid">
              {cat.fields.map((f) => {
                const added = usedKeys.has(f.key);
                return (
                  <button
                    key={f.key}
                    className={added ? 'bank-chip bank-chip--added' : 'bank-chip'}
                    disabled={added}
                    onClick={() => addFieldFromBank(si, f)}
                  >
                    <span className="bank-chip-label">{f.label}</span>
                    <span className="bank-chip-recon">{added ? 'Added' : RECON_BADGE[f.reconciliation_type]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    );
  }

  // ---- Main editor ---------------------------------------------------------
  return (
    <section className="screen">
      <div className="builder-head">
        <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" onClick={handleSave}>Save grid</button>
      </div>

      <input
        className="form-input form-input--title"
        placeholder="Grid name"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
      />
      {error && <p className="form-error">{error}</p>}

      <datalist id="section-suggestions">
        {SECTION_SUGGESTIONS.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      {draft.sections.map((section, si) => (
        <div className="builder-section" key={section.id}>
          <div className="builder-section-head">
            <input
              className="form-input"
              list="section-suggestions"
              placeholder="Section name (e.g. Nose)"
              value={section.label}
              onChange={(e) => patchSection(si, { label: e.target.value })}
            />
            <div className="builder-section-tools">
              <button className="icon-btn" onClick={() => moveSection(si, -1)} aria-label="Move up">↑</button>
              <button className="icon-btn" onClick={() => moveSection(si, 1)} aria-label="Move down">↓</button>
              <button className="icon-btn icon-btn--danger" onClick={() => removeSection(si)} aria-label="Remove section">✕</button>
            </div>
          </div>

          {section.fields.map((field, fi) => (
            <div className="bank-field" key={field.id}>
              <div className="bank-field-head">
                <span className="bank-field-label">{field.label}</span>
                <span className={`recon-tag recon-tag--${field.reconciliation_type}`}>{RECON_BADGE[field.reconciliation_type]}</span>
                <div className="bank-field-tools">
                  <button className="icon-btn" onClick={() => moveField(si, fi, -1)} aria-label="Move up">↑</button>
                  <button className="icon-btn" onClick={() => moveField(si, fi, 1)} aria-label="Move down">↓</button>
                  <button className="icon-btn icon-btn--danger" onClick={() => removeField(si, fi)} aria-label="Remove field">✕</button>
                </div>
              </div>

              {/* Constrained, reconciliation-safe params only. */}
              {field.reconciliation_type === 'score' && (
                <label className="bank-field-param">
                  <span>Score system</span>
                  <select
                    className="form-input form-select"
                    value={field.score_system?.system ?? 'parker'}
                    onChange={(e) => changeScoreSystem(si, fi, e.target.value)}
                  >
                    {SCORE_SYSTEM_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {field.type === 'scale' && field.scale && (
                <div className="scale-row">
                  <label>min<input className="form-input" type="number" value={field.scale.min}
                    onChange={(e) => setScaleNum(si, fi, 'min', Number(e.target.value))} /></label>
                  <label>max<input className="form-input" type="number" value={field.scale.max}
                    onChange={(e) => setScaleNum(si, fi, 'max', Number(e.target.value))} /></label>
                  <label>step<input className="form-input" type="number" value={field.scale.step ?? 1}
                    onChange={(e) => setScaleNum(si, fi, 'step', Number(e.target.value))} /></label>
                </div>
              )}

              <label className="field-required">
                <input
                  type="checkbox"
                  checked={!!field.required}
                  onChange={(e) => patchField(si, fi, { required: e.target.checked })}
                />
                Required
              </label>
            </div>
          ))}

          <button className="btn btn--ghost btn--block" onClick={() => setPickingFor(si)}>
            + Add fields
          </button>
        </div>
      ))}

      <button className="btn btn--ghost btn--block" onClick={addSection}>+ Section</button>
    </section>
  );
}
