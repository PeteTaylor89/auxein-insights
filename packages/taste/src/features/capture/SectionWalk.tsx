import { useState } from 'react';
import type { TemplateSection } from '@/templates/types';
import { SectionFields } from './GridRenderer';
import { sectionIcon } from './icons';

type Values = Record<string, unknown>;

interface Props {
  sections: TemplateSection[]; // already filtered (blind-only handled by caller)
  values: Values;
  onChange: (key: string, value: unknown) => void;
  onAddOption?: (fieldKey: string, groupLabel: string | null, term: string) => void;
}

const answered = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

// Guided forward walk: one section open at a time. Next advances + collapses;
// tapping any header jumps to it. Keeps the long CMS grid to one screenful.
export function SectionWalk({ sections, values, onChange, onAddOption }: Props) {
  const [open, setOpen] = useState(0);

  return (
    <div className="walk">
      {sections.map((section, i) => {
        const count = section.fields.filter((f) => answered(values[f.key])).length;
        const isOpen = i === open;
        return (
          <div className={isOpen ? 'walk-section walk-section--open' : 'walk-section'} key={section.id}>
            <button className="walk-header" onClick={() => setOpen(isOpen ? -1 : i)}>
              <span className="walk-header-label">
                <span className="walk-header-icon">{sectionIcon(section.label)}</span>
                {section.label}
              </span>
              <span className="walk-header-meta">
                {count > 0 && <span className="badge">{count}</span>}
                <span className="walk-chevron">{isOpen ? '▾' : '▸'}</span>
              </span>
            </button>

            {isOpen && (
              <div className="walk-body">
                <SectionFields fields={section.fields} values={values} onChange={onChange} onAddOption={onAddOption} />
                <div className="walk-nav">
                  <span className="walk-progress">{i + 1} / {sections.length}</span>
                  <div className="walk-nav-btns">
                    {i > 0 && <button className="btn btn--ghost" onClick={() => setOpen(i - 1)}>‹ Back</button>}
                    {i < sections.length - 1 && <button className="btn" onClick={() => setOpen(i + 1)}>Next ›</button>}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
