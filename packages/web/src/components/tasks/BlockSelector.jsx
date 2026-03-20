// components/tasks/BlockSelector.jsx — reusable block picker with large tap targets
import { MapPin } from 'lucide-react';
import './TaskComponents.css';

function BlockSelector({ blocks, onSelect, loading, selectedId }) {
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
