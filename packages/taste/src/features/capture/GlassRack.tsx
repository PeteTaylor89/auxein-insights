import { Plus, Wine as WineIcon } from 'lucide-react';
import { wineLabel } from '../wines/wineLabel';
import type { Glass } from './glass';
import { GLASS_COLOR_HEX } from './glass';

interface Props {
  glasses: Glass[];
  activeId: string;
  blind: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onCycleColor: (id: string) => void;
}

// The flight rack: a horizontal row of glasses you switch between freely. Tap a
// glass to taste it; tap its colour dot to cycle red/white/rosé/sparkling.
export function GlassRack({ glasses, activeId, blind, onSelect, onAdd, onCycleColor }: Props) {
  return (
    <div className="rack" role="tablist" aria-label="Glasses">
      {glasses.map((g, i) => {
        const hex = g.glassColor ? GLASS_COLOR_HEX[g.glassColor] : null;
        const identified = g.wine.producer.trim() || g.wine.label.trim();
        const label = identified ? wineLabel(g.wine) : blind ? 'Hidden' : '—';
        const active = g.id === activeId;
        return (
          <div className={active ? 'rack-item rack-item--active' : 'rack-item'} key={g.id}>
            <button
              className="rack-glass"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(g.id)}
              title={`Glass ${i + 1}`}
            >
              <WineIcon size={26} strokeWidth={1.75} color={hex ?? 'var(--muted)'} fill={hex ? `${hex}44` : 'none'} aria-hidden />
              <span className="rack-num">{i + 1}</span>
            </button>
            <button
              className="rack-dot"
              style={{ background: hex ?? 'transparent', borderColor: hex ?? 'var(--border)' }}
              onClick={() => onCycleColor(g.id)}
              aria-label={`Glass ${i + 1} colour`}
              title="Tap to set colour"
            />
            <span className={identified ? 'rack-label' : 'rack-label rack-label--muted'}>{label}</span>
          </div>
        );
      })}
      <button className="rack-add" onClick={onAdd} aria-label="Add a glass" title="Add a glass">
        <Plus size={20} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
