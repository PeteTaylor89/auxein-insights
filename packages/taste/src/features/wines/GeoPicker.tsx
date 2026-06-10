import { useEffect, useRef, useState } from 'react';
import { geo } from '@/db';
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
// ("New Zealand › Marlborough › Wairau Valley" → country/region/subregion by depth).
function fromNode(node: GeoRegion): GeoValue {
  const seg = node.path.split(' › ');
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
      {value.geo_ref_id && <p className="geo-linked">✓ Linked to known region</p>}
    </div>
  );
}
