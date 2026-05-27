// maps-v2/components/management/PropertiesPanel.jsx — Properties sidebar panel (admin only)
import { useState, useMemo } from 'react';
import { MapPinned, ChevronDown, ChevronRight, Navigation, Pentagon, Pencil } from 'lucide-react';

export default function PropertiesPanel({ properties, blocksData, onFlyTo, onDrawBoundary, onEditBoundary }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedPropertyId, setExpandedPropertyId] = useState(null);

  // Count blocks per property + unassigned
  const { propertyBlockMap, unassignedCount } = useMemo(() => {
    const map = {};
    let unassigned = 0;
    const features = blocksData?.features || [];

    for (const f of features) {
      const pid = f.properties?.property_id;
      if (pid) {
        map[pid] = (map[pid] || 0) + 1;
      } else {
        unassigned++;
      }
    }
    return { propertyBlockMap: map, unassignedCount: unassigned };
  }, [blocksData]);

  // Get blocks for a specific property
  const getPropertyBlocks = (propertyId) => {
    const features = blocksData?.features || [];
    return features.filter((f) => f.properties?.property_id === propertyId);
  };

  // Hand the whole property to the parent so it can decide between fitting
  // the boundary polygon's bbox or falling back to a block-centroid average.
  const handleFlyToProperty = (prop) => {
    if (!prop || !onFlyTo) return;
    onFlyTo(prop);
  };

  return (
    <div className="v2-panel">
      <div className="v2-panel-header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <h3 className="v2-panel-title">
          <MapPinned size={14} style={{ marginRight: 4 }} />
          Properties
          <span className="v2-panel-count">{properties.length}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </h3>
      </div>

      {expanded && (
        <div style={{ padding: '0 var(--space-md) var(--space-md)' }}>
          {unassignedCount > 0 && (
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-terracotta)',
              marginBottom: 'var(--space-sm)',
              fontWeight: 500,
            }}>
              {unassignedCount} unassigned block{unassignedCount !== 1 ? 's' : ''}
            </div>
          )}

          {properties.length === 0 ? (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              No properties yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {properties.map((prop) => {
                const blockCount = propertyBlockMap[prop.id] || 0;
                const isExpanded = expandedPropertyId === prop.id;
                const blocks = isExpanded ? getPropertyBlocks(prop.id) : [];
                const hasBoundary = !!prop.geometry;

                return (
                  <div key={prop.id}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 8px',
                        borderRadius: 6,
                        background: isExpanded ? 'var(--color-warm-sand)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-sm)',
                        transition: 'background 0.15s',
                      }}
                      onClick={() => setExpandedPropertyId(isExpanded ? null : prop.id)}
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span style={{ flex: 1, fontWeight: 500 }}>{prop.name}</span>
                      <span style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                        background: 'var(--color-warm-sand)',
                        padding: '1px 6px',
                        borderRadius: 10,
                      }}>
                        {blockCount}
                      </span>
                      {(onDrawBoundary || onEditBoundary) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasBoundary && onEditBoundary) onEditBoundary(prop);
                            else if (!hasBoundary && onDrawBoundary) onDrawBoundary(prop);
                          }}
                          title={hasBoundary ? 'Edit property boundary' : 'Draw property boundary'}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: hasBoundary ? 'var(--color-olive)' : 'var(--color-terracotta)',
                            padding: 2,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {hasBoundary ? <Pencil size={12} /> : <Pentagon size={12} />}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFlyToProperty(prop);
                        }}
                        title="Fly to property"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-olive)',
                          padding: 2,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Navigation size={12} />
                      </button>
                    </div>

                    {isExpanded && blocks.length > 0 && (
                      <div style={{ paddingLeft: 24, paddingTop: 2 }}>
                        {blocks.map((f) => (
                          <div
                            key={f.properties?.id}
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-muted)',
                              padding: '2px 0',
                            }}
                          >
                            {f.properties?.block_name || `Block #${f.properties?.id}`}
                            {f.properties?.variety && (
                              <span style={{ marginLeft: 4, opacity: 0.7 }}>({f.properties.variety})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
