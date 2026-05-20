// maps-v2/components/builder/MapBuilder.jsx — Builder mode: layer catalog + active layers
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Layers } from 'lucide-react';
import { getAvailableLayers, getLayerDef, getCategories } from './layerRegistry';
import { getLayerModule } from './layers/index';
import LayerCard from './LayerCard';
import BuilderBetaModal from './BuilderBetaModal';

/**
 * Main builder panel shown in the sidebar when mode === 'builder'.
 *
 * @param {Object} props
 * @param {mapboxgl.Map|null} props.map
 * @param {boolean} props.mapReady
 * @param {boolean} props.isAdmin
 * @param {Object} props.builderState - from useBuilderState hook
 */
export default function MapBuilder({ map, mapReady, isAdmin, builderState }) {
  const {
    activeLayers, isLayerActive, toggleLayer,
    getLayerOpacity, setLayerOpacity, moveLayer,
  } = builderState;

  const [search, setSearch] = useState('');
  const [layerErrors, setLayerErrors] = useState({});
  const [layerLoading, setLayerLoading] = useState({});
  // Show every time the user enters builder mode — MapBuilder unmounts on tab
  // switch, so a fresh `true` here re-opens the modal each entry.
  const [showBetaModal, setShowBetaModal] = useState(true);
  const mountedLayersRef = useRef(new Set());

  const allLayers = getAvailableLayers(isAdmin);
  const categories = getCategories();

  // Filter layers by search
  const filteredLayers = search.trim()
    ? allLayers.filter((l) =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.description.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  // Add/remove layers on the map when activeLayers changes
  useEffect(() => {
    if (!map || !mapReady) return;

    const currentActive = new Set(activeLayers);
    const currentMounted = mountedLayersRef.current;

    // Remove layers that are no longer active
    currentMounted.forEach((layerId) => {
      if (!currentActive.has(layerId)) {
        const mod = getLayerModule(layerId);
        if (mod) {
          try { mod.removeFromMap(map); } catch (e) { console.warn('Remove layer error:', e); }
        }
        currentMounted.delete(layerId);
      }
    });

    // Add layers that are newly active
    activeLayers.forEach((layerId) => {
      if (!currentMounted.has(layerId)) {
        const mod = getLayerModule(layerId);
        if (!mod) return; // placeholder

        setLayerLoading((prev) => ({ ...prev, [layerId]: true }));
        setLayerErrors((prev) => ({ ...prev, [layerId]: null }));

        const opacity = getLayerOpacity(layerId);
        const promise = mod.addToMap(map, opacity);

        if (promise && typeof promise.then === 'function') {
          promise
            .then(() => {
              currentMounted.add(layerId);
              setLayerLoading((prev) => ({ ...prev, [layerId]: false }));
            })
            .catch((err) => {
              console.error(`Failed to add layer ${layerId}:`, err);
              setLayerErrors((prev) => ({ ...prev, [layerId]: err.message || 'Failed to load' }));
              setLayerLoading((prev) => ({ ...prev, [layerId]: false }));
            });
        } else {
          currentMounted.add(layerId);
          setLayerLoading((prev) => ({ ...prev, [layerId]: false }));
        }
      }
    });
  }, [map, mapReady, activeLayers, getLayerOpacity]);

  // Cleanup all builder layers on unmount
  useEffect(() => {
    return () => {
      if (!map) return;
      mountedLayersRef.current.forEach((layerId) => {
        const mod = getLayerModule(layerId);
        if (mod) {
          try { mod.removeFromMap(map); } catch { /* */ }
        }
      });
      mountedLayersRef.current.clear();
    };
  }, [map]);

  // Handle opacity changes
  const handleOpacityChange = useCallback((layerId, opacity) => {
    setLayerOpacity(layerId, opacity);
    if (map && mountedLayersRef.current.has(layerId)) {
      const mod = getLayerModule(layerId);
      if (mod?.setOpacity) {
        try { mod.setOpacity(map, opacity); } catch { /* */ }
      }
    }
  }, [map, setLayerOpacity]);

  // Handle toggle
  const handleToggle = useCallback((layerId) => {
    const def = getLayerDef(layerId);
    if (def?.status === 'placeholder') return;
    toggleLayer(layerId);
  }, [toggleLayer]);

  // Active layers list (in z-order)
  const activeLayerDefs = activeLayers
    .map((id) => getLayerDef(id))
    .filter(Boolean);

  return (
    <div className="v2-builder">
      <BuilderBetaModal open={showBetaModal} onClose={() => setShowBetaModal(false)} />

      {/* Active layers */}
      {activeLayerDefs.length > 0 && (
        <div className="v2-builder-section">
          <h4 className="v2-builder-section-title">
            <Layers size={14} />
            Active Layers ({activeLayerDefs.length})
          </h4>
          <div className="v2-builder-active-list">
            {activeLayerDefs.map((layer, idx) => (
              <LayerCard
                key={layer.id}
                layer={layer}
                active={true}
                opacity={getLayerOpacity(layer.id)}
                onToggle={() => handleToggle(layer.id)}
                onOpacityChange={(val) => handleOpacityChange(layer.id, val)}
                onMoveUp={() => moveLayer(layer.id, 'up')}
                onMoveDown={() => moveLayer(layer.id, 'down')}
                canMoveUp={idx < activeLayerDefs.length - 1}
                canMoveDown={idx > 0}
                loading={layerLoading[layer.id]}
                error={layerErrors[layer.id]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="v2-search-wrap">
        <Search size={14} className="v2-search-icon" />
        <input
          className="v2-search-input"
          type="text"
          placeholder="Search layers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Layer catalog */}
      {filteredLayers ? (
        <div className="v2-builder-section">
          <h4 className="v2-builder-section-title">Results</h4>
          {filteredLayers.map((layer) => (
            <LayerCard
              key={layer.id}
              layer={layer}
              active={isLayerActive(layer.id)}
              opacity={getLayerOpacity(layer.id)}
              onToggle={() => handleToggle(layer.id)}
              onOpacityChange={(val) => handleOpacityChange(layer.id, val)}
              onMoveUp={() => moveLayer(layer.id, 'up')}
              onMoveDown={() => moveLayer(layer.id, 'down')}
              loading={layerLoading[layer.id]}
              error={layerErrors[layer.id]}
            />
          ))}
          {filteredLayers.length === 0 && (
            <div className="v2-block-empty">No layers match "{search}"</div>
          )}
        </div>
      ) : (
        Array.from(categories.entries()).map(([category, layers]) => {
          const visibleLayers = layers.filter((l) => {
            if (l.status === 'admin' && !isAdmin) return false;
            return !isLayerActive(l.id); // hide active layers from catalog
          });
          if (visibleLayers.length === 0) return null;

          return (
            <div key={category} className="v2-builder-section">
              <h4 className="v2-builder-section-title">{category}</h4>
              {visibleLayers.map((layer) => (
                <LayerCard
                  key={layer.id}
                  layer={layer}
                  active={false}
                  opacity={getLayerOpacity(layer.id)}
                  onToggle={() => handleToggle(layer.id)}
                  onOpacityChange={(val) => handleOpacityChange(layer.id, val)}
                  loading={layerLoading[layer.id]}
                  error={layerErrors[layer.id]}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
