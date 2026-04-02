// components/tasks/BlockSelector.jsx — reusable block picker with multi-select support
import { MapPin, Check } from 'lucide-react';
import './TaskComponents.css';

function BlockSelector({ blocks, onSelect, loading, selectedId, multiSelect = false, selectedIds = [], onToggle }) {
  if (loading) {
    return <div className="block-selector-loading">Loading blocks...</div>;
  }

  if (!blocks || blocks.length === 0) {
    return (
      <div className="block-selector-empty">
        <MapPin size={32} strokeWidth={1.5} />
        <p>No vineyard blocks found</p>
      </div>
    );
  }

  if (multiSelect) {
    return (
      <div>
        <div className="block-grid">
          {blocks.map((b) => {
            const isSelected = selectedIds.includes(b.id);
            return (
              <button
                key={b.id}
                className={`block-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onToggle(b)}
              >
                {isSelected && <Check size={16} style={{ position: 'absolute', top: 8, right: 8, color: 'var(--color-primary)' }} />}
                <MapPin size={20} />
                <div className="block-card-content">
                  <h3 className="block-card-title">{b.block_name}</h3>
                  {b.variety && <span className="block-card-variety">{b.variety}</span>}
                  {b.area_hectares && (
                    <span className="block-card-area">{b.area_hectares} ha</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {selectedIds.length > 0 && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {selectedIds.length} block{selectedIds.length !== 1 ? 's' : ''} selected
            {selectedIds.length > 1 && ' — one task per block'}
          </div>
        )}
      </div>
    );
  }

  // Single select (original behavior)
  return (
    <div className="block-grid">
      {blocks.map((b) => (
        <button
          key={b.id}
          className={`block-card ${selectedId === b.id ? 'selected' : ''}`}
          onClick={() => onSelect(b)}
        >
          <MapPin size={20} />
          <div className="block-card-content">
            <h3 className="block-card-title">{b.block_name}</h3>
            {b.variety && <span className="block-card-variety">{b.variety}</span>}
            {b.area_hectares && (
              <span className="block-card-area">{b.area_hectares} ha</span>
            )}
          </div>
        </button>
      ))}
      <button
        className={`block-card block-card--skip ${selectedId === null ? 'selected' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span>Skip — no specific block</span>
      </button>
    </div>
  );
}

export default BlockSelector;
