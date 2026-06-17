import { useState } from 'react';
import { newBase } from '@/db';
import type { Wine } from '@/db';
import { GeoPicker } from './GeoPicker';
import type { GeoValue } from './GeoPicker';

export function emptyWine(): Wine {
  return {
    ...newBase(),
    producer: '',
    label: '',
    vintage: null,
    variety: [],
    geo_country: '',
    geo_region: '',
    geo_subregion_appellation: '',
    geo_vineyard: '',
    geo_ref_id: null,
    price: null,
    source: '',
    abv: null,
  };
}

// Common varieties — quick-pick chips; free entry always allowed.
const VARIETIES = [
  'Sauvignon Blanc', 'Chardonnay', 'Pinot Noir', 'Pinot Gris', 'Riesling',
  'Syrah', 'Cabernet Sauvignon', 'Merlot', 'Malbec', 'Grenache',
  'Tempranillo', 'Nebbiolo', 'Sangiovese', 'Chenin Blanc', 'Gamay',
];

interface Props {
  wine: Wine;
  onChange: (next: Wine) => void;
  // Hide the secondary detail block (price/abv/source) for a tighter inline form.
  compact?: boolean;
}

// Controlled wine-identity editor, shared by WineForm (full screen) and Capture
// (inline). No chrome / save — the parent owns persistence.
export function WineFields({ wine, onChange, compact = false }: Props) {
  const [varietyDraft, setVarietyDraft] = useState('');
  const set = <K extends keyof Wine>(key: K, value: Wine[K]) => onChange({ ...wine, [key]: value });

  const geoValue: GeoValue = {
    geo_country: wine.geo_country,
    geo_region: wine.geo_region,
    geo_subregion_appellation: wine.geo_subregion_appellation,
    geo_vineyard: wine.geo_vineyard,
    geo_ref_id: wine.geo_ref_id,
  };

  const toggleVariety = (v: string) =>
    set('variety', wine.variety.includes(v) ? wine.variety.filter((x) => x !== v) : [...wine.variety, v]);

  const addVariety = () => {
    const v = varietyDraft.trim();
    if (v && !wine.variety.includes(v)) set('variety', [...wine.variety, v]);
    setVarietyDraft('');
  };

  return (
    <div className="wine-fields">
      <input className="form-input" placeholder="Producer" value={wine.producer} onChange={(e) => set('producer', e.target.value)} />
      <div className="capture-wine-row">
        <input className="form-input" placeholder="Label / cuvée" value={wine.label} onChange={(e) => set('label', e.target.value)} />
        <input
          className="form-input"
          type="number"
          inputMode="numeric"
          placeholder="Vintage"
          value={wine.vintage ?? ''}
          onChange={(e) => set('vintage', e.target.value ? Number(e.target.value) : null)}
        />
      </div>

      <details className="sub-disclosure">
        <summary>Variety {wine.variety.length > 0 && <span className="badge">{wine.variety.length}</span>}</summary>
        <div className="chip-row">
          {VARIETIES.map((v) => (
            <button key={v} type="button" className={wine.variety.includes(v) ? 'chip chip--active' : 'chip'} onClick={() => toggleVariety(v)}>
              {v}
            </button>
          ))}
          {wine.variety.filter((v) => !VARIETIES.includes(v)).map((v) => (
            <button key={v} type="button" className="chip chip--active" onClick={() => toggleVariety(v)}>
              {v}
            </button>
          ))}
        </div>
        <div className="capture-wine-row">
          <input
            className="form-input"
            placeholder="Add variety…"
            value={varietyDraft}
            onChange={(e) => setVarietyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addVariety();
              }
            }}
          />
          <button className="btn btn--ghost" onClick={addVariety}>Add</button>
        </div>
      </details>

      <details className="sub-disclosure">
        <summary>Origin {wine.geo_ref_id && <span className="badge">linked</span>}</summary>
        <GeoPicker value={geoValue} onChange={(g) => onChange({ ...wine, ...g })} />
      </details>

      {!compact && (
        <details className="sub-disclosure">
          <summary>Detail</summary>
          <div className="capture-wine-row">
            <input className="form-input" type="number" placeholder="Price" value={wine.price ?? ''} onChange={(e) => set('price', e.target.value ? Number(e.target.value) : null)} />
            <input className="form-input" type="number" step="0.1" placeholder="ABV %" value={wine.abv ?? ''} onChange={(e) => set('abv', e.target.value ? Number(e.target.value) : null)} />
          </div>
          <input className="form-input" style={{ marginTop: 8 }} placeholder="Source / provenance" value={wine.source} onChange={(e) => set('source', e.target.value)} />
        </details>
      )}
    </div>
  );
}
