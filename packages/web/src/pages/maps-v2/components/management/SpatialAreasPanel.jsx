// maps-v2/components/management/SpatialAreasPanel.jsx — Spatial areas list with fly-to + edit
import { useMemo } from 'react';
import { Loader2, MapPin, Pencil } from 'lucide-react';
import { byNatural } from '@vineyard/shared';

const AREA_TYPE_LABELS = {
  paddock: 'Paddock',
  orchard: 'Orchard',
  forestry: 'Forestry',
  wetland: 'Wetland',
  riparian: 'Riparian',
  native_bush: 'Native Bush',
  building: 'Building',
  dam: 'Dam',
  other: 'Other',
};

export default function SpatialAreasPanel({
  spatialData,
  loading,
  error,
  visible,
  onFlyTo,
  onEditArea,
  contentOnly,
}) {
  const areas = useMemo(() => {
    const features = spatialData?.features || [];
    return [...features].sort((a, b) =>
      byNatural((f) => f?.properties?.name)(a, b),
    );
  }, [spatialData]);

  const content = (
    <>
      {loading && (
        <div className="v2-panel-loading">
          <Loader2 size={16} className="v2-spin" /> Loading spatial areas...
        </div>
      )}
      {error && <div className="v2-panel-error">{error}</div>}
      {visible && !loading && (
        <ul className="v2-block-list">
          {areas.map((feature) => {
            const p = feature.properties || {};
            return (
              <li key={p.id || feature.id} className="v2-block-item">
                <div
                  className="v2-block-name"
                  onClick={() => onFlyTo?.(feature)}
                  style={{ cursor: onFlyTo ? 'pointer' : 'default', flex: 1 }}
                >
                  {p.name || 'Unnamed'}
                </div>
                <div className="v2-block-meta">
                  {p.area_type && (
                    <span>{AREA_TYPE_LABELS[p.area_type] || p.area_type}</span>
                  )}
                  {p.area_hectares != null && (
                    <span>{Number(p.area_hectares).toFixed(2)} ha</span>
                  )}
                </div>
                {onFlyTo && (
                  <MapPin
                    size={14}
                    className="v2-block-flyto"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFlyTo(feature);
                    }}
                    title="Fly to area"
                  />
                )}
                {onEditArea && p.id && (
                  <Pencil
                    size={14}
                    className="v2-block-flyto"
                    style={{ marginLeft: 6, color: 'var(--color-primary, #5B6830)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditArea(p.id);
                    }}
                    title="Edit area"
                  />
                )}
              </li>
            );
          })}
          {!loading && areas.length === 0 && (
            <li className="v2-block-empty">No spatial areas drawn yet</li>
          )}
        </ul>
      )}
    </>
  );

  if (contentOnly) return content;
  return <div className="v2-panel">{content}</div>;
}
