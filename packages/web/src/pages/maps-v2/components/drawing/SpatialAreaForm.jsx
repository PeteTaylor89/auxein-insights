// maps-v2/components/drawing/SpatialAreaForm.jsx — Create/edit spatial areas
import { useState, useEffect } from 'react';
import { X, Save, Loader } from 'lucide-react';
import { spatialAreasService } from '@vineyard/shared';

// Values must match backend `AreaType` enum in schemas/spatial_area.py.
const AREA_TYPES = [
  { value: 'paddock', label: 'Paddock' },
  { value: 'orchard', label: 'Orchard' },
  { value: 'plantation_forestry', label: 'Plantation Forestry' },
  { value: 'native_forest', label: 'Native Forest' },
  { value: 'wetland', label: 'Wetland' },
  { value: 'waterway', label: 'Waterway' },
  { value: 'conservation_area', label: 'Conservation Area' },
  { value: 'infrastructure_zone', label: 'Infrastructure / Building' },
  { value: 'waste_management', label: 'Waste Management' },
];

/**
 * Form for creating or editing a spatial area.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Object|null} props.existingArea - if editing, the spatial area data
 * @param {Object|null} props.geometry - drawn polygon geometry (for new areas)
 * @param {number} props.area - calculated area in hectares
 * @param {Function} props.onSubmit - called after successful save
 * @param {Function} props.onCancel
 */
export default function SpatialAreaForm({
  isOpen,
  existingArea = null,
  geometry,
  area,
  onSubmit,
  onCancel,
}) {
  const isEditing = !!existingArea;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    area_type: '',
    area_hectares: '',
    is_active: true,
  });

  // Populate form when editing
  useEffect(() => {
    if (existingArea) {
      setForm({
        name: existingArea.name || '',
        description: existingArea.description || '',
        area_type: existingArea.area_type || '',
        area_hectares: existingArea.area_hectares || '',
        is_active: existingArea.is_active !== false,
      });
    } else {
      setForm({
        name: '',
        description: '',
        area_type: '',
        area_hectares: area ? area.toFixed(2) : '',
        is_active: true,
      });
    }
  }, [existingArea, area]);

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
    if (!form.area_type) {
      setError('Area type is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditing) {
        await spatialAreasService.updateSpatialArea(existingArea.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          area_type: form.area_type,
          area_hectares: form.area_hectares ? parseFloat(form.area_hectares) : null,
          is_active: form.is_active,
        });
      } else {
        if (!geometry) {
          setError('No geometry drawn.');
          setSaving(false);
          return;
        }

        await spatialAreasService.createSpatialArea({
          name: form.name.trim(),
          description: form.description.trim(),
          area_type: form.area_type,
          area_hectares: form.area_hectares ? parseFloat(form.area_hectares) : null,
          is_active: form.is_active,
          geometry: {
            type: geometry.type,
            coordinates: geometry.coordinates,
          },
        });
      }

      onSubmit?.();
    } catch (err) {
      console.error('Spatial area save failed:', err);
      setError(err.message || 'Failed to save spatial area');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="v2-form-panel">
      <div className="v2-form-header">
        <h3 className="v2-form-title">
          {isEditing ? 'Edit Spatial Area' : 'Create Spatial Area'}
        </h3>
        <button className="v2-form-close" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="v2-form-body">
        {error && <div className="v2-form-error">{error}</div>}

        {area > 0 && !isEditing && (
          <div className="v2-form-info">
            Drawn area: <strong>{area.toFixed(2)} ha</strong>
          </div>
        )}

        <div className="v2-form-group">
          <label className="v2-form-label">Name *</label>
          <input
            className="v2-form-input"
            type="text"
            value={form.name}
            onChange={handleChange('name')}
            placeholder="e.g. North Paddock"
            autoFocus
          />
        </div>

        <div className="v2-form-group">
          <label className="v2-form-label">Type *</label>
          <select
            className="v2-form-select"
            value={form.area_type}
            onChange={handleChange('area_type')}
          >
            <option value="">Select type...</option>
            {AREA_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="v2-form-group">
          <label className="v2-form-label">Description</label>
          <textarea
            className="v2-form-textarea"
            value={form.description}
            onChange={handleChange('description')}
            placeholder="Optional description..."
            rows={3}
          />
        </div>

        <div className="v2-form-group">
          <label className="v2-form-label">Area (ha)</label>
          <input
            className="v2-form-input"
            type="number"
            step="0.01"
            value={form.area_hectares}
            onChange={handleChange('area_hectares')}
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
          <button
            type="button"
            className="v2-form-btn v2-form-btn--ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="v2-form-btn v2-form-btn--primary"
            disabled={saving}
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
