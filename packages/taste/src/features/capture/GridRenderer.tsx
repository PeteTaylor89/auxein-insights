import { useMemo, useState } from 'react';
import type { TemplateField, TemplateSection } from '@/templates/types';

type Values = Record<string, unknown>;
interface Props {
  sections: TemplateSection[];
  values: Values;
  onChange: (key: string, value: unknown) => void;
  // Persist a new option/descriptor back to the template (null group = flat field).
  onAddOption?: (fieldKey: string, groupLabel: string | null, term: string) => void;
}

type AddOption = Props['onAddOption'];

// Renders all the fields of one section. Shared by GridRenderer (flat) and
// SectionWalk (one section at a time, guided forward walk).
export function SectionFields({
  fields,
  values,
  onChange,
  onAddOption,
}: {
  fields: TemplateField[];
  values: Values;
  onChange: (key: string, value: unknown) => void;
  onAddOption?: AddOption;
}) {
  return (
    <>
      {fields.map((field) => (
        <div className="grid-field" key={field.id}>
          <div className="grid-field-label">
            {field.label}
            {field.required && <span className="req">*</span>}
          </div>
          {field.help && <div className="grid-field-help">{field.help}</div>}
          <FieldWidget field={field} value={values[field.key]} onChange={(v) => onChange(field.key, v)} onAddOption={onAddOption} />
        </div>
      ))}
    </>
  );
}

// Renders a template (or pinned snapshot) as a flat grid. Pure: parent owns values.
export function GridRenderer({ sections, values, onChange, onAddOption }: Props) {
  return (
    <>
      {sections.map((section) => (
        <div className="grid-section" key={section.id}>
          <h2 className="grid-section-label">{section.label}</h2>
          <SectionFields fields={section.fields} values={values} onChange={onChange} onAddOption={onAddOption} />
        </div>
      ))}
    </>
  );
}

function FieldWidget({
  field,
  value,
  onChange,
  onAddOption,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
  onAddOption?: AddOption;
}) {
  switch (field.type) {
    case 'single_select': {
      const opts = field.options ?? [];
      // Short ordered scales (Low→High etc.) read better as a segmented rotator;
      // long lists (hue, colour) stay as wrapping chips.
      const segmented = opts.length >= 2 && opts.length <= 6 && opts.every((o) => o.length <= 12);
      return segmented ? (
        <Segmented options={opts} value={value as string | undefined} onChange={onChange} />
      ) : (
        <SingleSelect options={opts} value={value as string | undefined} onChange={onChange} />
      );
    }
    case 'multi_select':
      return <MultiSelect options={field.options ?? []} value={(value as string[]) ?? []} onChange={onChange} />;
    case 'tag_structured':
      return (
        <DescriptorPicker
          field={field}
          value={(value as string[]) ?? []}
          onChange={onChange}
          onAdd={onAddOption ? (group, term) => onAddOption(field.key, group, term) : undefined}
        />
      );
    case 'boolean':
      return <Segmented options={['Yes', 'No']} value={value === true ? 'Yes' : value === false ? 'No' : undefined} onChange={(v) => onChange(v === 'Yes' ? true : v === 'No' ? false : undefined)} />;
    case 'scale':
    case 'score':
      return <ScaleInput field={field} value={value as number | undefined} onChange={onChange} />;
    case 'number':
      return (
        <input
          className="form-input"
          type="number"
          inputMode="decimal"
          value={value === undefined || value === null ? '' : (value as number)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'text_long':
      return <textarea className="form-input" rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'text_short':
    default:
      return <input className="form-input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

// Connected segmented bar (the "rotator" for ordered scales).
function Segmented({ options, value, onChange }: { options: string[]; value?: string; onChange: (v: unknown) => void }) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={value === opt ? 'segmented-item segmented-item--active' : 'segmented-item'}
          onClick={() => onChange(value === opt ? undefined : opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// Inline "+ add" that expands into a text field, commits on Enter / blur.
function AddChip({ onAdd }: { onAdd: (term: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const commit = () => {
    const t = text.trim();
    if (t) onAdd(t);
    setText('');
    setOpen(false);
  };
  if (!open) {
    return (
      <button className="chip chip--add" onClick={() => setOpen(true)}>
        + Add
      </button>
    );
  }
  return (
    <input
      className="chip-add-input"
      autoFocus
      value={text}
      placeholder="New…"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setText('');
          setOpen(false);
        }
      }}
    />
  );
}

function SingleSelect({ options, value, onChange }: { options: string[]; value?: string; onChange: (v: unknown) => void }) {
  return (
    <div className="chip-row">
      {options.map((opt) => (
        <button key={opt} className={value === opt ? 'chip chip--active' : 'chip'} onClick={() => onChange(value === opt ? undefined : opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function MultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: unknown) => void }) {
  const toggle = (opt: string) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  return (
    <div className="chip-row">
      {options.map((opt) => (
        <button key={opt} className={value.includes(opt) ? 'chip chip--active' : 'chip'} onClick={() => toggle(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// Grouped descriptor chips + a type-ahead that searches every group at once.
// Values are flat term strings. Searching is the fast path; groups are the browse path.
function DescriptorPicker({
  field,
  value,
  onChange,
  onAdd,
}: {
  field: TemplateField;
  value: string[];
  onChange: (v: unknown) => void;
  onAdd?: (group: string | null, term: string) => void;
}) {
  const [query, setQuery] = useState('');
  const toggle = (term: string) => onChange(value.includes(term) ? value.filter((v) => v !== term) : [...value, term]);

  // Flat index of {term, group} across all groups, for the type-ahead.
  const index = useMemo(
    () => (field.groups ?? []).flatMap((g) => g.options.map((term) => ({ term, group: g.label }))),
    [field.groups],
  );
  const q = query.trim().toLowerCase();
  const matches = q ? index.filter((x) => x.term.toLowerCase().includes(q)).slice(0, 30) : [];

  return (
    <div className="descriptor-picker">
      {value.length > 0 && (
        <div className="chip-row chip-row--selected">
          {value.map((term) => (
            <button key={term} className="chip chip--active" onClick={() => toggle(term)}>
              {term} ✕
            </button>
          ))}
        </div>
      )}

      <input
        className="form-input"
        placeholder="Search descriptors…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {q ? (
        <div className="chip-row">
          {matches.map((m) => (
            <button key={`${m.group}:${m.term}`} className={value.includes(m.term) ? 'chip chip--active' : 'chip'} onClick={() => toggle(m.term)}>
              {m.term}
            </button>
          ))}
          {matches.length === 0 && onAdd && (
            <AddChip
              onAdd={(term) => {
                onAdd(null, term); // ungrouped add when nothing matched the search
                if (!value.includes(term)) onChange([...value, term]);
                setQuery('');
              }}
            />
          )}
          {matches.length === 0 && !onAdd && <span className="grid-field-help">No match</span>}
        </div>
      ) : (
        <div className="tag-groups">
          {(field.groups ?? []).map((group) => {
            const count = group.options.filter((o) => value.includes(o)).length;
            return (
              <details className="tag-group" key={group.label} open={count > 0}>
                <summary className="tag-group-summary">
                  {group.label}
                  {count > 0 && <span className="badge">{count}</span>}
                </summary>
                <div className="chip-row">
                  {group.options.map((opt) => (
                    <button key={opt} className={value.includes(opt) ? 'chip chip--active' : 'chip'} onClick={() => toggle(opt)}>
                      {opt}
                    </button>
                  ))}
                  {onAdd && (
                    <AddChip
                      onAdd={(term) => {
                        onAdd(group.label, term);
                        if (!value.includes(term)) onChange([...value, term]);
                      }}
                    />
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScaleInput({ field, value, onChange }: { field: TemplateField; value?: number; onChange: (v: unknown) => void }) {
  const scale = field.scale ?? { min: 1, max: 5, step: 1 };
  const set = value ?? scale.min;
  return (
    <div className="scale-input">
      <input type="range" min={scale.min} max={scale.max} step={scale.step ?? 1} value={set} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="scale-value">{value === undefined ? '—' : value}</span>
    </div>
  );
}
