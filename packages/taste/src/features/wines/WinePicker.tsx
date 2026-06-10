import { useEffect, useState } from 'react';
import { repo } from '@/db';
import type { Wine } from '@/db';
import { wineLabel, wineOrigin } from './wineLabel';

interface Props {
  selected: Wine | null;
  onSelect: (wine: Wine) => void; // an existing wine was chosen
  onCreate: () => void; // user wants to build a new wine (parent renders WineForm)
  onClear: () => void;
}

// Pick an existing wine for a note, or hand off to the parent to create one.
// Keeps the wine entity as the system of record — capture no longer mints wines inline.
export function WinePicker({ selected, onSelect, onCreate, onClear }: Props) {
  const [query, setQuery] = useState('');
  const [wines, setWines] = useState<Wine[]>([]);

  useEffect(() => {
    void repo.wines.list().then((all) => {
      all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      setWines(all);
    });
  }, []);

  if (selected) {
    return (
      <div className="wine-selected">
        <div>
          <div className="template-card-title">{wineLabel(selected)}</div>
          <div className="template-card-meta">{wineOrigin(selected) || 'Selected wine'}</div>
        </div>
        <button className="btn btn--ghost" onClick={onClear}>Change</button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? wines.filter((w) => `${w.producer} ${w.label}`.toLowerCase().includes(q))
    : wines.slice(0, 6);

  return (
    <div className="wine-picker">
      <div className="capture-wine-row">
        <input
          className="form-input"
          placeholder="Find a saved wine…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn--ghost" onClick={onCreate}>+ New</button>
      </div>
      <div className="wine-picker-list">
        {matches.map((w) => (
          <button key={w.id} type="button" className="wine-picker-row" onClick={() => onSelect(w)}>
            <span className="template-card-title">{wineLabel(w)}</span>
            <span className="template-card-meta">{wineOrigin(w)}</span>
          </button>
        ))}
        {wines.length === 0 && <p className="screen-blurb">No saved wines yet — tap “+ New”.</p>}
      </div>
    </div>
  );
}
