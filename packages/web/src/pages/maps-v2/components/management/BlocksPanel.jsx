// maps-v2/components/management/BlocksPanel.jsx — Block list with search + fly-to
import { useState, useMemo } from 'react';
import { Search, MapPin, Grape, Loader2 } from 'lucide-react';
import { byNatural } from '@vineyard/shared';

export default function BlocksPanel({ blocksData, blockCount, loading, error, flyToBlock, headerless }) {
  const [search, setSearch] = useState('');

  const blocks = useMemo(() => {
    const features = blocksData?.features || [];
    let list = features;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = features.filter((f) => {
        const p = f.properties || {};
        return (p.block_name || '').toLowerCase().includes(q) || (p.variety || '').toLowerCase().includes(q);
      });
    }
    // Natural sort on the GeoJSON feature's properties.block_name —
    // "Block 2" < "Block 10" instead of lex order.
    return [...list].sort((a, b) =>
      byNatural((f) => f?.properties?.block_name)(a, b),
    );
  }, [blocksData, search]);

  const content = (
    <>
      <div className="v2-search-wrap">
        <Search size={14} className="v2-search-icon" />
        <input type="text" className="v2-search-input" placeholder="Search blocks..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading && <div className="v2-panel-loading"><Loader2 size={16} className="v2-spin" /> Loading blocks...</div>}
      {error && <div className="v2-panel-error">{error}</div>}
      <ul className="v2-block-list">
        {blocks.map((feature) => {
          const p = feature.properties || {};
          return (
            <li key={p.id || feature.id} className="v2-block-item" onClick={() => flyToBlock(feature)}>
              <div className="v2-block-name">{p.block_name || 'Unnamed'}</div>
              <div className="v2-block-meta">
                {p.variety && <span>{p.variety}</span>}
                {p.area && <span>{Number(p.area).toFixed(2)} ha</span>}
              </div>
              <MapPin size={14} className="v2-block-flyto" />
            </li>
          );
        })}
        {!loading && blocks.length === 0 && <li className="v2-block-empty">{search ? 'No blocks match your search' : 'No blocks found'}</li>}
      </ul>
    </>
  );

  if (headerless) return content;

  return (
    <div className="v2-panel">
      <div className="v2-panel-header">
        <h3 className="v2-panel-title"><Grape size={16} /> Vineyard Blocks <span className="v2-panel-count">{blockCount}</span></h3>
      </div>
      {content}
    </div>
  );
}
