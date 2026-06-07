import { useState } from 'react';
import type { Template } from '@/db';
import type { FieldType, TemplateField, TemplateOptionGroup } from '@/templates/types';
import { FIELD_TYPES, hasGroups, hasOptions, hasScale, newField, newSection, slugify } from '@/templates/factory';

interface Props {
  draft: Template;
  onSave: (t: Template) => void | Promise<void>;
  onCancel: () => void;
}

// Custom-template editor: section → field → type → options/scale (spec §3).
export function TemplateBuilder({ draft: initial, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Template>(initial);
  const [error, setError] = useState('');

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
  const removeSection = (si: number) =>
    setDraft((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }));
  const moveSection = (si: number, dir: -1 | 1) =>
    setDraft((d) => {
      const next = [...d.sections];
      const t = si + dir;
      if (t < 0 || t >= next.length) return d;
      [next[si], next[t]] = [next[t], next[si]];
      return { ...d, sections: next };
    });

  const addField = (si: number) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === si ? { ...s, fields: [...s.fields, newField()] } : s)),
    }));
  const removeField = (si: number, fi: number) =>
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i === si ? { ...s, fields: s.fields.filter((_, j) => j !== fi) } : s,
      ),
    }));

  const changeType = (si: number, fi: number, type: FieldType) => {
    const current = draft.sections[si].fields[fi];
    const patch: Partial<TemplateField> = { type };
    patch.options = hasOptions(type) ? (current.options ?? []) : undefined;
    patch.groups = hasGroups(type) ? (current.groups ?? []) : undefined;
    patch.scale = hasScale(type)
      ? (current.scale ?? (type === 'score' ? { min: 50, max: 100, step: 1 } : { min: 1, max: 5, step: 1 }))
      : undefined;
    patchField(si, fi, patch);
  };

  // Group editing for tag_structured fields.
  const patchGroups = (si: number, fi: number, groups: TemplateOptionGroup[]) => patchField(si, fi, { groups });
  const addGroup = (si: number, fi: number) =>
    patchGroups(si, fi, [...(draft.sections[si].fields[fi].groups ?? []), { label: '', options: [] }]);
  const patchGroup = (si: number, fi: number, gi: number, patch: Partial<TemplateOptionGroup>) =>
    patchGroups(si, fi, (draft.sections[si].fields[fi].groups ?? []).map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const removeGroup = (si: number, fi: number, gi: number) =>
    patchGroups(si, fi, (draft.sections[si].fields[fi].groups ?? []).filter((_, i) => i !== gi));

  // Fill machine keys (unique) + drop empty option strings before saving.
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
          return {
            ...f,
            key,
            label: f.label.trim() || key,
            options: f.options ? f.options.map((o) => o.trim()).filter(Boolean) : f.options,
            groups: f.groups
              ? f.groups
                  .map((g) => ({ label: g.label.trim(), options: g.options.map((o) => o.trim()).filter(Boolean) }))
                  .filter((g) => g.label || g.options.length)
              : f.groups,
          };
        }),
      })),
    };
  };

  const handleSave = () => {
    if (!draft.name.trim()) {
      setError('Give the grid a name.');
      return;
    }
    if (draft.sections.length === 0) {
      setError('Add at least one section.');
      return;
    }
    void onSave(prepare());
  };

  return (
    <section className="screen">
      <div className="builder-head">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn" onClick={handleSave}>
          Save grid
        </button>
      </div>

      <input
        className="form-input form-input--title"
        placeholder="Grid name"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
      />
      {error && <p className="form-error">{error}</p>}

      {draft.sections.map((section, si) => (
        <div className="builder-section" key={section.id}>
          <div className="builder-section-head">
            <input
              className="form-input"
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
            <div className="field-card" key={field.id}>
              <div className="field-row">
                <input
                  className="form-input"
                  placeholder="Field label"
                  value={field.label}
                  onChange={(e) => patchField(si, fi, { label: e.target.value })}
                />
                <select
                  className="form-input form-select"
                  value={field.type}
                  onChange={(e) => changeType(si, fi, e.target.value as FieldType)}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button className="icon-btn icon-btn--danger" onClick={() => removeField(si, fi)} aria-label="Remove field">✕</button>
              </div>

              {hasOptions(field.type) && (
                <input
                  className="form-input"
                  placeholder="Options, comma separated"
                  value={(field.options ?? []).join(', ')}
                  onChange={(e) => patchField(si, fi, { options: e.target.value.split(',') })}
                />
              )}

              {hasScale(field.type) && field.scale && (
                <div className="scale-row">
                  <label>min<input className="form-input" type="number" value={field.scale.min}
                    onChange={(e) => patchField(si, fi, { scale: { ...field.scale!, min: Number(e.target.value) } })} /></label>
                  <label>max<input className="form-input" type="number" value={field.scale.max}
                    onChange={(e) => patchField(si, fi, { scale: { ...field.scale!, max: Number(e.target.value) } })} /></label>
                  <label>step<input className="form-input" type="number" value={field.scale.step ?? 1}
                    onChange={(e) => patchField(si, fi, { scale: { ...field.scale!, step: Number(e.target.value) } })} /></label>
                </div>
              )}

              {hasGroups(field.type) && (
                <div className="group-editor">
                  {(field.groups ?? []).map((group, gi) => (
                    <div className="group-row" key={gi}>
                      <div className="field-row">
                        <input
                          className="form-input"
                          placeholder="Group (e.g. Citrus)"
                          value={group.label}
                          onChange={(e) => patchGroup(si, fi, gi, { label: e.target.value })}
                        />
                        <button className="icon-btn icon-btn--danger" onClick={() => removeGroup(si, fi, gi)} aria-label="Remove group">✕</button>
                      </div>
                      <input
                        className="form-input"
                        placeholder="Terms, comma separated"
                        value={group.options.join(', ')}
                        onChange={(e) => patchGroup(si, fi, gi, { options: e.target.value.split(',') })}
                      />
                    </div>
                  ))}
                  <button className="btn btn--ghost btn--block" onClick={() => addGroup(si, fi)}>
                    + Group
                  </button>
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

          <button className="btn btn--ghost btn--block" onClick={() => addField(si)}>
            + Field
          </button>
        </div>
      ))}

      <button className="btn btn--ghost btn--block" onClick={addSection}>
        + Section
      </button>
    </section>
  );
}
