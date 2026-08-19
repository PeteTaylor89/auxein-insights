// maps-v2/components/drawing/MapFeatureForm.jsx — Create/edit a map feature (POI)
//
// The type list is no longer the static MAP_FEATURE_TYPES array: it is the
// company's own vocabulary, loaded through useMapFeatureTypes. A manager can
// add a type without leaving this form — naming a thing you are already
// pinning should not mean abandoning the pin.
import { useState, useEffect } from 'react';
import { X, Save, Loader, Trash2, Settings2 } from 'lucide-react';
import { mapFeaturesService } from '@vineyard/shared';
import MapFeatureTypeManager from '../MapFeatureTypeManager';
import { PoiMarkerPreview } from '../PoiIconPicker';

const GEOMETRY_LABEL = {
  Point: 'point',
  LineString: 'line',
  Polygon: 'area',
};

/**
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Object|null} props.existingFeature - if editing, the feature record
 * @param {Object|null} props.geometry - drawn geometry (for new features)
 * @param {Array} props.properties - [{id, name}] for the optional property picker
 * @param {Function} props.onSubmit - called after a successful save/delete
 * @param {Function} props.onCancel
 */
export default function MapFeatureForm({
  isOpen,
  existingFeature = null,
  geometry,
  properties = [],
  vocabulary,
  canManageTypes = false,
  onSubmit,
  onCancel,
}) {
  const isEditing = !!existingFeature;
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    feature_type: '',
    property_id: '',
    is_active: true,
  });

  useEffect(() => {
    if (existingFeature) {
      setForm({
        name: existingFeature.name || '',
        description: existingFeature.description || '',
        feature_type: existingFeature.feature_type || '',
        property_id: existingFeature.property_id ?? '',
        is_active: existingFeature.is_active !== false,
      });
    } else {
      setForm({
        name: '',
        description: '',
        feature_type: '',
        property_id: '',
        is_active: true,
      });
    }
    setConfirmDelete(false);
    setError(null);
  }, [existingFeature, isOpen]);

  const handleChange = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!form.feature_type) {
      setError('Type is required.');
      return;
    }

    setSaving(true);
    setError(null);

    // Empty string from the <select> means "no property" — send null, not ''.
    // The API would 422 on '' because property_id is Optional[int].
    const propertyId = form.property_id === '' ? null : Number(form.property_id);

    try {
      if (isEditing) {
        await mapFeaturesService.updateMapFeature(existingFeature.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          feature_type: form.feature_type,
          property_id: propertyId,
          is_active: form.is_active,
        });
      } else {
        if (!geometry) {
          setError('Nothing drawn — place a point on the map first.');
          setSaving(false);
          return;
        }
        await mapFeaturesService.createMapFeature({
          name: form.name.trim(),
          description: form.description.trim() || null,
          feature_type: form.feature_type,
          property_id: propertyId,
          geometry: { type: geometry.type, coordinates: geometry.coordinates },
        });
      }
      onSubmit?.();
    } catch (err) {
      console.error('Map feature save failed:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditing) return;
    setDeleting(true);
    setError(null);
    try {
      // Soft delete — recoverable, matches the API default.
      await mapFeaturesService.deleteMapFeature(existingFeature.id);
      onSubmit?.();
    } catch (err) {
      console.error('Map feature delete failed:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to delete');
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  if (showTypeManager) {
    return (
      <MapFeatureTypeManager
        isOpen
        vocabulary={vocabulary}
        canManage={canManageTypes}
        seedLabel={form.name.trim() || null}
        onCreated={(row) => {
          // Select what was just created — that is why they opened it.
          setForm((prev) => ({ ...prev, feature_type: row.slug }));
          setShowTypeManager(false);
        }}
        onClose={() => setShowTypeManager(false)}
      />
    );
  }

  const drawnKind = geometry?.type ? GEOMETRY_LABEL[geometry.type] : null;
  const selectableTypes = vocabulary?.selectableTypes || [];
  const selectedType = vocabulary?.typeBySlug?.[form.feature_type] || null;
  const busy = saving || deleting;

  // A feature can outlive its type — retired, or created before this company
  // trimmed its list. Keep showing it as the current value rather than silently
  // resetting the select to "Select type...", which reads as data loss.
  const orphanedType =
    form.feature_type && !selectableTypes.some((t) => t.slug === form.feature_type)
      ? form.feature_type
      : null;

  return (
    <div className="v2-form-panel">
      <div className="v2-form-header">
        <h3 className="v2-form-title">
          {isEditing ? 'Edit Map Feature' : 'New Map Feature'}
        </h3>
        <button className="v2-form-close" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="v2-form-body">
        {error && <div className="v2-form-error">{error}</div>}

        {drawnKind && !isEditing && (
          <div className="v2-form-info">
            Placed a <strong>{drawnKind}</strong> on the map.
          </div>
        )}

        <div className="v2-form-group">
          <label className="v2-form-label">Name *</label>
          <input
            className="v2-form-input"
            type="text"
            value={form.name}
            onChange={handleChange('name')}
            placeholder="e.g. North gate"
            maxLength={120}
            autoFocus
          />
        </div>

        <div className="v2-form-group">
          <div className="v2-form-label-row">
            <label className="v2-form-label">Type *</label>
            {canManageTypes && (
              <button
                type="button"
                className="v2-form-linkbtn"
                onClick={() => setShowTypeManager(true)}
              >
                <Settings2 size={12} /> Manage types
              </button>
            )}
          </div>

          <div className="v2-form-typerow">
            {selectedType && (
              <PoiMarkerPreview
                icon={selectedType.icon}
                colour={selectedType.colour}
                size={30}
              />
            )}
            <select
              className="v2-form-select"
              value={form.feature_type}
              onChange={(e) => {
                // The sentinel is not a type — it opens the manager with the
                // name already typed, so a new type takes one detour, not two.
                if (e.target.value === '__new__') {
                  setShowTypeManager(true);
                  return;
                }
                handleChange('feature_type')(e);
              }}
            >
              <option value="">Select type...</option>
              {orphanedType && (
                <option value={orphanedType}>{orphanedType} (retired)</option>
              )}
              {selectableTypes.map((t) => (
                <option key={t.slug} value={t.slug}>{t.label}</option>
              ))}
              {canManageTypes && <option value="__new__">+ New type…</option>}
            </select>
          </div>

          {orphanedType && (
            <div className="v2-form-hint">
              This type has been retired. The feature keeps it until you pick another.
            </div>
          )}
          {vocabulary?.usedFallback && (
            <div className="v2-form-hint">
              Showing the built-in types only — the type list could not be loaded.
            </div>
          )}
        </div>

        {/* Only shown when there is an actual choice to make. MapsPage fetches
            `properties` for admins only, so a plain manager would otherwise get
            a dropdown whose sole option is "company-wide" — which reads like a
            broken control rather than a deliberate default. Their features are
            created company-wide, which is the sane default anyway. */}
        {properties.length > 0 && (
          <div className="v2-form-group">
            <label className="v2-form-label">Property</label>
            <select
              className="v2-form-select"
              value={form.property_id}
              onChange={handleChange('property_id')}
            >
              <option value="">All properties (company-wide)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="v2-form-hint">
              Leave unset to show this feature to everyone in the company.
            </div>
          </div>
        )}

        <div className="v2-form-group">
          <label className="v2-form-label">Description</label>
          <textarea
            className="v2-form-textarea"
            value={form.description}
            onChange={handleChange('description')}
            placeholder="Optional notes — access code, condition, who to call..."
            rows={3}
          />
        </div>

        {isEditing && (
          <div className="v2-form-group v2-form-checkbox-group">
            <label className="v2-form-checkbox-label">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={handleChange('is_active')}
              />
              Active
            </label>
          </div>
        )}

        <div className="v2-form-actions">
          {isEditing && !confirmDelete && (
            <button
              type="button"
              className="v2-form-btn v2-form-btn--ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              title="Remove this feature"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          {isEditing && confirmDelete && (
            <button
              type="button"
              className="v2-form-btn v2-form-btn--danger"
              onClick={handleDelete}
              disabled={busy}
            >
              {deleting ? <><Loader size={14} className="v2-spin" /> Deleting...</> : 'Confirm delete'}
            </button>
          )}
          <button
            type="button"
            className="v2-form-btn v2-form-btn--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="v2-form-btn v2-form-btn--primary"
            disabled={busy}
          >
            {saving ? (
              <><Loader size={14} className="v2-spin" /> Saving...</>
            ) : (
              <><Save size={14} /> {isEditing ? 'Update' : 'Create'}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
