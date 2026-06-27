import { useMemo, useState } from 'react';
import { ChevronLeft, Plus, Search, X } from 'lucide-react';
import type { TemplateField } from '@/templates/types';
import { aromaEmoji } from './icons';

interface Props {
  field: TemplateField;
  value: string[];
  onChange: (v: string[]) => void;
  onAdd?: (group: string | null, term: string) => void;
  onClose: () => void;
}

// Full-screen aroma picker: colour-coded category tiles → drill into terms.
// Replaces the long inline descriptor lists. Selected terms shown as removable
// pills; a search spans every category.
export function AromaModal({ field, value, onChange, onAdd, onClose }: Props) {
  const groups = useMemo(() => field.groups ?? [], [field.groups]);
  const [cat, setCat] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState('');

  const toggle = (term: string) =>
    onChange(value.includes(term) ? value.filter((t) => t !== term) : [...value, term]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? groups.flatMap((g) => g.options.filter((o) => o.toLowerCase().includes(q)).map((o) => ({ term: o, group: g.label }))).slice(0, 60)
        : [],
    [q, groups],
  );

  const commitAdd = (groupLabel: string | null) => {
    const t = adding.trim();
    if (t && onAdd) {
      onAdd(groupLabel, t);
      if (!value.includes(t)) onChange([...value, t]);
    }
    setAdding('');
  };

  return (
    <div className="aroma-backdrop" onClick={onClose}>
      <div className="aroma-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aroma-modal-head">
          {cat !== null && !q ? (
            <button className="icon-btn" onClick={() => setCat(null)} aria-label="Back"><ChevronLeft size={18} /></button>
          ) : (
            <span className="aroma-modal-title">{field.label}</span>
          )}
          {cat !== null && !q && <span className="aroma-modal-title">{groups[cat].label}</span>}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {value.length > 0 && (
          <div className="aroma-selected chip-row">
            {value.map((term) => (
              <button key={term} className="chip chip--active" onClick={() => toggle(term)}>{term} ✕</button>
            ))}
          </div>
        )}

        <div className="aroma-search">
          <Search size={15} className="aroma-search-icon" />
          <input className="form-input" placeholder="Search aromas…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="aroma-body">
          {q ? (
            <div className="chip-row">
              {matches.map((m) => (
                <button key={`${m.group}:${m.term}`} className={value.includes(m.term) ? 'chip chip--active' : 'chip'} onClick={() => toggle(m.term)}>{m.term}</button>
              ))}
              {matches.length === 0 && (
                onAdd ? (
                  <div className="aroma-add">
                    <input className="form-input" autoFocus placeholder={`Add "${query}"`} value={adding || query} onChange={(e) => setAdding(e.target.value)} />
                    <button className="btn" onClick={() => { setAdding(query); commitAdd(null); setQuery(''); }}><Plus size={16} /> Add</button>
                  </div>
                ) : <p className="screen-blurb">No match.</p>
              )}
            </div>
          ) : cat === null ? (
            <div className="aroma-cats">
              {groups.map((g, i) => {
                const count = g.options.filter((o) => value.includes(o)).length;
                return (
                  <button className="aroma-tile" key={g.label} onClick={() => setCat(i)}>
                    <span className="aroma-tile-emoji">{aromaEmoji(g.label)}</span>
                    <span className="aroma-tile-label">{g.label}</span>
                    {count > 0 && <span className="aroma-tile-count">{count}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="chip-row">
              {groups[cat].options.map((opt) => (
                <button key={opt} className={value.includes(opt) ? 'chip chip--active' : 'chip'} onClick={() => toggle(opt)}>{opt}</button>
              ))}
              {onAdd && (
                <div className="aroma-add">
                  <input className="form-input" placeholder="Add your own…" value={adding} onChange={(e) => setAdding(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(groups[cat].label); }} />
                  <button className="btn" onClick={() => commitAdd(groups[cat].label)}><Plus size={16} /></button>
                </div>
              )}
            </div>
          )}
        </div>

        <button className="btn btn--block aroma-done" onClick={onClose}>Done{value.length > 0 ? ` · ${value.length}` : ''}</button>
      </div>
    </div>
  );
}
