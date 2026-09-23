import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { TemplateField, TemplateSection } from '@/templates/types';
import { banksFor, insertTerm } from '@/templates/lexicon';
import { vocab } from '@/db/repo';
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
  layout,
}: {
  fields: TemplateField[];
  values: Values;
  onChange: (key: string, value: unknown) => void;
  onAddOption?: AddOption;
  layout?: TemplateSection['layout'];
}) {
  // The MW structural cross is a two-column grid of mini-sliders so all eleven
  // elements sit in roughly one screen. Help text is dropped in this mode —
  // it is what makes the stacked list tall, and the labels carry themselves.
  const cross = layout === 'cross';
  const body = (
    <>
      {fields.map((field) => (
        <div className={cross ? 'grid-field grid-field--cross' : 'grid-field'} key={field.id}>
          <div className="grid-field-label">
            {field.label}
            {field.required && <span className="req">*</span>}
          </div>
          {field.help && !cross && <div className="grid-field-help">{field.help}</div>}
          <FieldWidget
            field={field}
            value={values[field.key]}
            values={values}
            onChange={(v) => onChange(field.key, v)}
            onChangeKey={onChange}
            onAddOption={onAddOption}
          />
        </div>
      ))}
    </>
  );
  return cross ? <div className="cross-grid">{body}</div> : body;
}

// Renders a template (or pinned snapshot) as a flat grid. Pure: parent owns values.
export function GridRenderer({ sections, values, onChange, onAddOption }: Props) {
  return (
    <>
      {sections.map((section) => (
        <div className="grid-section" key={section.id}>
          <h2 className="grid-section-label">{section.label}</h2>
          <SectionFields
            fields={section.fields}
            values={values}
            onChange={onChange}
            onAddOption={onAddOption}
            layout={section.layout}
          />
        </div>
      ))}
    </>
  );
}

function FieldWidget({
  field,
  value,
  values,
  onChange,
  onChangeKey,
  onAddOption,
}: {
  field: TemplateField;
  value: unknown;
  values: Values;
  onChange: (v: unknown) => void;
  onChangeKey: (key: string, value: unknown) => void;
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
      return (
        <ProseField
          field={field}
          value={(value as string) ?? ''}
          onChange={onChange}
          checked={(values[`${field.key}__checklist`] as string[]) ?? []}
          onCheck={(next) => onChangeKey(`${field.key}__checklist`, next)}
        />
      );
    case 'text_short':
      if (field.funnel) {
        return (
          <FunnelField
            value={(value as string) ?? ''}
            onChange={onChange}
            alts={(values[`${field.key}__alts`] as string[]) ?? []}
            onAlts={(next) => onChangeKey(`${field.key}__alts`, next)}
          />
        );
      }
      return <input className="form-input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input className="form-input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

// The funnel (MW exam technique).
//
// The guidelines are specific and this widget enforces exactly those two rules:
//   "The list of possible alternatives should be limited to three or four at most"
//   "a funnelled answer should always end with a POSITIVE reason for the
//    identification, rather than just being an elimination of the alternatives"
//
// So: add candidates (capped at 4), then commit one. The committed call is the
// field's value — a plain string, which is what blind grading reads. The
// rejected alternatives persist under `<key>__alts`, which is not a template
// field and therefore never enters blind_conclusions.
const FUNNEL_MAX = 4;

function FunnelField({
  value,
  onChange,
  alts,
  onAlts,
}: {
  value: string;
  onChange: (v: unknown) => void;
  alts: string[];
  onAlts: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const all = value && !alts.includes(value) ? [value, ...alts] : alts;
  const full = all.length >= FUNNEL_MAX;

  const add = () => {
    const t = draft.trim();
    if (!t || full) return;
    if (!all.some((a) => a.toLowerCase() === t.toLowerCase())) onAlts([...alts, t]);
    setDraft('');
  };

  const commit = (candidate: string) => {
    // Re-tapping the call un-commits it, so you can change your mind without
    // losing the shortlist.
    if (value === candidate) {
      onChange('');
      if (!alts.includes(candidate)) onAlts([...alts, candidate]);
      return;
    }
    onChange(candidate);
    onAlts(all.filter((a) => a !== candidate));
  };

  return (
    <div className="funnel">
      <div className="funnel-add">
        <input
          className="form-input"
          value={draft}
          placeholder={full ? 'Four is the limit — commit to one' : 'Add a candidate…'}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn--ghost" disabled={full || !draft.trim()} onClick={add}>
          Add
        </button>
      </div>

      {all.length > 0 && (
        <div className="chip-row funnel-candidates">
          {all.map((c) => (
            <button
              key={c}
              type="button"
              className={value === c ? 'chip chip--active' : 'chip'}
              onClick={() => commit(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="funnel-hint">
        {value
          ? `Committed: ${value} — now give the positive reason.`
          : all.length
            ? 'Tap one to commit.'
            : 'Funnel to three or four, then commit.'}
      </div>
    </div>
  );
}

// Prose field with the IMW lexicon underneath as tap-to-insert rails.
//
// This is the core of the MW redesign: the exam deliverable is a written
// argument, so the vocabulary has to be reachable WHILE writing, not behind a
// modal. Each bank is its own labelled, horizontally-scrolling rail — two short
// rails read faster than one long one, and it costs no extra interaction.
//
// Insert semantics matter more than they look. A term goes in at the caret, not
// appended, and the caret lands after it so you keep typing. Spacing is repaired
// on both sides so tapping mid-sentence never produces "ripe,tropical".
function ProseField({
  field,
  value,
  onChange,
  checked,
  onCheck,
}: {
  field: TemplateField;
  value: string;
  onChange: (v: unknown) => void;
  checked: string[];
  onCheck: (v: string[]) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const banks = banksFor(field.lexicon_dimension);
  const dims = Array.isArray(field.lexicon_dimension)
    ? field.lexicon_dimension
    : field.lexicon_dimension
      ? [field.lexicon_dimension]
      : [];

  const insert = (term: string) => {
    const el = ref.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const { text, caret } = insertTerm(value, start, end, term);
    onChange(text);
    // Restore the caret after React re-renders with the new value.
    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="prose-field">
      <textarea
        ref={ref}
        className="form-input"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      {/* Self-check only (BLICC). The guidelines say the acronym itself must
          never appear in an answer — so these are prompts beside the prose,
          stored separately, never injected into it. */}
      {field.checklist && field.checklist.length > 0 && (
        <div className="lex-rail">
          <span className="lex-rail-label">Cover</span>
          <div className="lex-rail-terms">
            {field.checklist.map((item) => {
              const on = checked.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  tabIndex={-1}
                  className={on ? 'lex-chip lex-chip--on' : 'lex-chip'}
                  aria-pressed={on}
                  onClick={() => onCheck(on ? checked.filter((c) => c !== item) : [...checked, item])}
                >
                  {on ? '✓ ' : ''}{item}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {banks.map((bank, i) => {
        // The taster's own terms for this dimension sit alongside the IMW ones.
        // rows() is a synchronous cache read; CaptureScreen primes it on mount.
        const mine = dims[i] ? vocab.rows(dims[i]).map((v) => v.term) : [];
        const seen = new Set(bank.terms.map((t) => t.toLowerCase()));
        const extra = mine.filter((t) => !seen.has(t.toLowerCase()));
        return (
          <div className="lex-rail" key={bank.key}>
            <span className="lex-rail-label">{bank.label}</span>
            <div className="lex-rail-terms">
              {[...bank.terms, ...extra].map((term) => (
                <button
                  key={term}
                  type="button"
                  className="lex-chip"
                  tabIndex={-1}
                  onClick={() => insert(term)}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
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
