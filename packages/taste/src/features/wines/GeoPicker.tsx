import { useEffect, useRef, useState } from 'react';
import { geo, vocab } from '@/db';
import type { GeoRegion } from '@/db';

// The discrete geo block on a Wine (dev-plan §4.5). Free entry always works;
// picking a node from the typeahead also stamps geo_ref_id (the canonical link).
export interface GeoValue {
  geo_country: string;
  geo_region: string;
  geo_subregion_appellation: string;
  geo_vineyard: string;
  geo_ref_id: string | null;
}

interface Props {
  value: GeoValue;
  onChange: (next: GeoValue) => void;
}

// Map a picked node to the four discrete fields via its materialised path
// ("New Zealand > Marlborough > Wairau Valley" → country/region/subregion by depth).
// Split on ">" tolerant of surrounding spaces — the seed writes " > " but we must
// not depend on the exact separator (a mismatch left geo_region empty, so bank
// picks vanished from the "By region" stats).
function fromNode(node: GeoRegion): GeoValue {
  const seg = node.path.split('>').map((s) => s.trim());
  return {
    geo_country: seg[0] ?? '',
    geo_region: seg[1] ?? '',
    geo_subregion_appellation: seg[2] ?? '',
    geo_vineyard: seg[3] ?? '',
    geo_ref_id: node.id,
  };
}

export function GeoPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GeoRegion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // The user's own saved regions (free-typed on past tastings) — quick-picks that
  // fill the Region field, so a region not in the bank still grows their vocab.
  const [savedRegions, setSavedRegions] = useState<string[]>([]);
  useEffect(() => {
    void vocab.list('region').then((rows) => setSavedRegions(rows.map((r) => r.term)));
  }, []);

  const saveRegion = () => {
    const r = value.geo_region.trim();
    if (!r || savedRegions.some((x) => x.toLowerCase() === r.toLowerCase())) return;
    setSavedRegions((s) => [...s, r]);
    void vocab.add('region', r);
  };
  const canSaveRegion = value.geo_region.trim() !== '' && !savedRegions.some((x) => x.toLowerCase() === value.geo_region.trim().toLowerCase());

  useEffect(() => {
    let live = true;
    void geo.search(query, 12).then((rows) => {
      if (live) setHits(rows);
    });
    return () => {
      live = false;
    };
  }, [query]);

  // Close the dropdown on outside tap.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (node: GeoRegion) => {
    onChange(fromNode(node));
    setQuery('');
    setOpen(false);
  };

  // Hand-editing a discrete field breaks the canonical link → clear geo_ref_id.
  const setField = (field: keyof GeoValue, v: string) =>
    onChange({ ...value, [field]: v, geo_ref_id: null });

  return (
    <div className="geo-picker" ref={boxRef}>
      <div className="geo-search">
        <input
          className="form-input"
          placeholder="Search region (e.g. Marlborough, Barolo)…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && query.trim() && (
          <ul className="geo-results">
            {hits.length === 0 && <li className="geo-result geo-result--empty">No match — type it in below</li>}
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="geo-result" onClick={() => pick(h)}>
                  <span className="geo-result-name">{h.name}</span>
                  <span className="geo-result-path">{h.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {savedRegions.length > 0 && (
        <div className="chip-row" style={{ marginTop: 8 }}>
          {savedRegions.map((r) => (
            <button key={r} type="button" className={value.geo_region === r ? 'chip chip--active' : 'chip'} onClick={() => setField('geo_region', r)}>
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="geo-fields">
        <input
          className="form-input"
          placeholder="Country"
          value={value.geo_country}
          onChange={(e) => setField('geo_country', e.target.value)}
        />
        <input
          className="form-input"
          placeholder="Region"
          value={value.geo_region}
          onChange={(e) => setField('geo_region', e.target.value)}
        />
        <input
          className="form-input"
          placeholder="Subregion / appellation"
          value={value.geo_subregion_appellation}
          onChange={(e) => setField('geo_subregion_appellation', e.target.value)}
        />
        <input
          className="form-input"
          placeholder="Vineyard"
          value={value.geo_vineyard}
          onChange={(e) => setField('geo_vineyard', e.target.value)}
        />
      </div>
      {canSaveRegion && (
        <button type="button" className="btn btn--ghost" style={{ marginTop: 8 }} onClick={saveRegion}>
          + Save region to my list
        </button>
      )}
      {value.geo_ref_id && <p className="geo-linked">✓ Linked to known region</p>}
    </div>
  );
}
