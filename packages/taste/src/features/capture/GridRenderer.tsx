import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { TemplateField, TemplateSection } from '@/templates/types';
import { AromaModal } from './AromaModal';

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
      // Ordinal scales (acid/tannin/body…) read as a slider; categorical picks (clarity,
      // colour…) as uniform pills. One consistent language, no segmented bars.
      if (field.reconciliation_type === 'ordinal' && opts.length >= 2) {
        return <OrdinalSlider options={opts} value={value as string | undefined} onChange={onChange} />;
      }
      return <SinglePills options={opts} value={value as string | undefined} onChange={onChange} />;
    }
    case 'multi_select':
      return <MultiPills options={field.options ?? []} value={(value as string[]) ?? []} onChange={onChange} />;
    case 'tag_structured':
      return <AromaField field={field} value={(value as string[]) ?? []} onChange={onChange} onAddOption={onAddOption} />;
    case 'boolean':
      return <BoolPills value={value as boolean | undefined} onChange={onChange} />;
    case 'scale':
    case 'score':
      return <NumberSlider field={field} value={value as number | undefined} onChange={onChange} />;
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

// Uniform single-choice pills (clears on re-tap).
function SinglePills({ options, value, onChange }: { options: string[]; value?: string; onChange: (v: unknown) => void }) {
  return (
    <div className="chip-row">
      {options.map((opt) => (
        <button key={opt} className={value === opt ? 'chip chip--active' : 'chip'} onClick={() => onChange(value === opt ? undefined : opt)}>{opt}</button>
      ))}
    </div>
  );
}

function MultiPills({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: unknown) => void }) {
  const toggle = (opt: string) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  return (
    <div className="chip-row">
      {options.map((opt) => (
        <button key={opt} className={value.includes(opt) ? 'chip chip--active' : 'chip'} onClick={() => toggle(opt)}>{opt}</button>
      ))}
    </div>
  );
}

function BoolPills({ value, onChange }: { value?: boolean; onChange: (v: unknown) => void }) {
  return (
    <div className="chip-row">
      <button className={value === true ? 'chip chip--active' : 'chip'} onClick={() => onChange(value === true ? undefined : true)}>Yes</button>
      <button className={value === false ? 'chip chip--active' : 'chip'} onClick={() => onChange(value === false ? undefined : false)}>No</button>
    </div>
  );
}

// Discrete labelled slider for ordinal scales — the signature taste slider.
function OrdinalSlider({ options, value, onChange }: { options: string[]; value?: string; onChange: (v: unknown) => void }) {
  const n = options.length;
  const idx = value ? options.indexOf(value) : -1;
  const pos = idx >= 0 ? idx : Math.floor((n - 1) / 2);
  const fill = n > 1 ? (pos / (n - 1)) * 100 : 0;
  return (
    <div className={idx >= 0 ? 'oslider oslider--set' : 'oslider'}>
      <div className="oslider-current">{idx >= 0 ? options[idx] : 'Not set'}</div>
      <input
        className="oslider-range"
        type="range"
        min={0}
        max={n - 1}
        step={1}
        value={pos}
        onChange={(e) => onChange(options[Number(e.target.value)])}
        style={{ ['--fill' as string]: `${fill}%` }}
      />
      <div className="oslider-ends">
        <span>{options[0]}</span>
        <span>{options[n - 1]}</span>
      </div>
    </div>
  );
}

function NumberSlider({ field, value, onChange }: { field: TemplateField; value?: number; onChange: (v: unknown) => void }) {
  const scale = field.scale ?? { min: 1, max: 5, step: 1 };
  const set = value ?? scale.min;
  const fill = scale.max > scale.min ? ((set - scale.min) / (scale.max - scale.min)) * 100 : 0;
  return (
    <div className="oslider oslider--set">
      <div className="oslider-current">{value === undefined ? '—' : value}</div>
      <input
        className="oslider-range"
        type="range"
        min={scale.min}
        max={scale.max}
        step={scale.step ?? 1}
        value={set}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
      />
      <div className="oslider-ends">
        <span>{scale.min}</span>
        <span>{scale.max}</span>
      </div>
    </div>
  );
}

// Descriptor field: selected aromas as pills + a button that opens the wheel modal.
function AromaField({
  field,
  value,
  onChange,
  onAddOption,
}: {
  field: TemplateField;
  value: string[];
  onChange: (v: unknown) => void;
  onAddOption?: AddOption;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="aroma-field">
      {value.length > 0 && (
        <div className="chip-row">
          {value.map((term) => (
            <button key={term} className="chip chip--active" onClick={() => onChange(value.filter((v) => v !== term))}>{term} ✕</button>
          ))}
        </div>
      )}
      <button className="btn btn--ghost aroma-open" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add aromas
      </button>
      {open && (
        <AromaModal
          field={field}
          value={value}
          onChange={onChange}
          onAdd={onAddOption ? (g, t) => onAddOption(field.key, g, t) : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
