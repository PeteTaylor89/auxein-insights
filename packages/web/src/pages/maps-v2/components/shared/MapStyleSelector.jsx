// maps-v2/components/shared/MapStyleSelector.jsx — Style toggle buttons
import { MAP_STYLES } from '../../utils/mapStyles';
import { Mountain } from 'lucide-react';

export default function MapStyleSelector({ activeStyleId, onStyleChange }) {
  return (
    <div className="v2-style-selector">
      {MAP_STYLES.map((style) => (
        <button
          key={style.id}
          className={`v2-style-btn ${activeStyleId === style.id ? 'active' : ''}`}
          onClick={() => onStyleChange(style.id)}
          title={style.name}
        >
          {style.name}
          {style.is3D && <Mountain size={12} style={{ marginLeft: 4 }} />}
        </button>
      ))}
    </div>
  );
}
