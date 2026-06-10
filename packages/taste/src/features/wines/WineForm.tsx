import { useState } from 'react';
import { newBase } from '@/db';
import type { Wine } from '@/db';
import { GeoPicker } from './GeoPicker';
import type { GeoValue } from './GeoPicker';

// Common varieties — quick-pick chips; free entry always allowed.
const VARIETIES = [
  'Sauvignon Blanc', 'Chardonnay', 'Pinot Noir', 'Pinot Gris', 'Riesling',
  'Syrah', 'Cabernet Sauvignon', 'Merlot', 'Malbec', 'Grenache',
  'Tempranillo', 'Nebbiolo', 'Sangiovese', 'Chenin Blanc', 'Gamay',
];

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

interface Props {
  draft: Wine;
  onSave: (wine: Wine) => void | Promise<void>;
  onCancel: () => void;
}

export function WineForm({ draft, onSave, onCancel }: Props) {
  const [wine, setWine] = useState<Wine>(draft);
  const [varietyDraft, setVarietyDraft] = useState('');
  const [error, setError] = useState('');

  const set = <K extends keyof Wine>(key: K, value: Wine[K]) => setWine((w) => ({ ...w, [key]: value }));

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

  const submit = () => {
    if (!wine.label.trim() && !wine.producer.trim()) {
      setError('Add a producer or label first.');
      return;
    }
    void onSave({ ...wine, producer: wine.producer.trim(), label: wine.label.trim(), source: wine.source.trim() });
  };

  return (
    <section className="screen">
      <div className="builder-head">
        <h1 className="screen-title">{draft.version > 0 ? 'Edit wine' : 'New wine'}</h1>
        <div className="template-card-tools">
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={submit}>Save</button>
        </div>
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Wine</h2>
        <input className="form-input" placeholder="Producer" value={wine.producer} onChange={(e) => set('producer', e.target.value)} />
        <div className="capture-wine-row">
          <input className="form-input" placeholder="Label / cuvée" value={wine.label} onChange={(e) => set('label', e.target.value)} />
          <input
            className="form-input"
            type="number"
            placeholder="Vintage"
            value={wine.vintage ?? ''}
            onChange={(e) => set('vintage', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Variety</h2>
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
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Origin</h2>
        <GeoPicker
          value={geoValue}
          onChange={(g) => setWine((w) => ({ ...w, ...g }))}
        />
      </div>

      <div className="grid-section">
        <h2 className="grid-section-label">Detail</h2>
        <div className="capture-wine-row">
          <input
            className="form-input"
            type="number"
            placeholder="Price"
            value={wine.price ?? ''}
            onChange={(e) => set('price', e.target.value ? Number(e.target.value) : null)}
          />
          <input
            className="form-input"
            type="number"
            step="0.1"
            placeholder="ABV %"
            value={wine.abv ?? ''}
            onChange={(e) => set('abv', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <input className="form-input" placeholder="Source / provenance" value={wine.source} onChange={(e) => set('source', e.target.value)} />
      </div>

      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
