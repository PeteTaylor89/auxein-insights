// maps-v2/components/drawing/BlockCreateForm.jsx — New block creation form
import { useState } from 'react';
import { X, Save, Loader } from 'lucide-react';
import { blocksService } from '@vineyard/shared';
import { useAuth } from '@vineyard/shared';

const VARIETY_OPTIONS = [
  'Sauvignon Blanc', 'Pinot Noir', 'Chardonnay', 'Pinot Gris',
  'Riesling', 'Merlot', 'Syrah', 'Gewürztraminer', 'Cabernet Sauvignon',
  'Malbec', 'Viognier', 'Tempranillo', 'Albariño', 'Grüner Veltliner',
  'Chenin Blanc', 'Semillon', 'Verdelho', 'Mourvèdre', 'Grenache',
  'Cabernet Franc', 'Other',
];

const TRAINING_SYSTEMS = [
  'VSP', 'Scott Henry', 'Lyre', 'Geneva Double Curtain',
  'Pergola', 'Gobelet', 'Cordon', 'Cane Pruned', 'Other',
];

/**
 * Slide-in form for creating a new block after drawing a polygon.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Object} props.geometry - the drawn polygon geometry
 * @param {number} props.area - calculated area in hectares
 * @param {number[]} props.centroid - [lng, lat]
 * @param {Function} props.onSubmit - called after successful creation
 * @param {Function} props.onCancel - cancel creation
 */
export default function BlockCreateForm({
  isOpen,
  geometry,
  area,
  centroid,
  onSubmit,
  onCancel,
  properties = [],
}) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    block_name: '',
    variety: '',
    clone: '',
    rootstock: '',
    training_system: '',
    planted_date: '',
    row_spacing: '',
    vine_spacing: '',
    property_id: '',
  });

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!geometry) return;

    if (!form.block_name.trim()) {
      setError('Block name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const blockData = {
        block_name: form.block_name.trim(),
        variety: form.variety || null,
        clone: form.clone || null,
        rootstock: form.rootstock || null,
        training_system: form.training_system || null,
        planted_date: form.planted_date || null,
        row_spacing: form.row_spacing ? parseFloat(form.row_spacing) : null,
        vine_spacing: form.vine_spacing ? parseFloat(form.vine_spacing) : null,
        area: area || null,
        centroid_longitude: centroid?.[0] || null,
        centroid_latitude: centroid?.[1] || null,
        company_id: user?.company_id,
        property_id: form.property_id ? parseInt(form.property_id) : null,
        geometry: {
          type: geometry.type,
          coordinates: geometry.coordinates,
        },
      };

      await blocksService.createBlock(blockData);
      onSubmit?.();
    } catch (err) {
      console.error('Block creation failed:', err);
      setError(err.message || 'Failed to create block');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="v2-form-panel">
      <div className="v2-form-header">
        <h3 className="v2-form-title">Create New Block</h3>
        <button className="v2-form-close" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="v2-form-body">
        {error && <div className="v2-form-error">{error}</div>}

        {area > 0 && (
          <div className="v2-form-info">
            Area: <strong>{area.toFixed(2)} ha</strong>
          </div>
        )}

        {properties.length > 0 && (
          <div className="v2-form-group">
            <label className="v2-form-label">Property</label>
            <select
              className="v2-form-select"
              value={form.property_id}
              onChange={handleChange('property_id')}
            >
              <option value="">Unassigned</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="v2-form-group">
          <label className="v2-form-label">Block Name *</label>
          <input
            className="v2-form-input"
            type="text"
            value={form.block_name}
            onChange={handleChange('block_name')}
            placeholder="e.g. Block A1"
            autoFocus
          />
        </div>

        <div className="v2-form-group">
          <label className="v2-form-label">Variety</label>
          <input
            className="v2-form-input"
            type="text"
            list="variety-options-create"
            value={form.variety}
            onChange={handleChange('variety')}
            placeholder="Type or select variety..."
          />
          <datalist id="variety-options-create">
            {VARIETY_OPTIONS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>

        <div className="v2-form-row">
          <div className="v2-form-group">
            <label className="v2-form-label">Clone</label>
            <input
              className="v2-form-input"
              type="text"
              value={form.clone}
              onChange={handleChange('clone')}
              placeholder="e.g. MS"
            />
          </div>
          <div className="v2-form-group">
            <label className="v2-form-label">Rootstock</label>
            <input
              className="v2-form-input"
              type="text"
              value={form.rootstock}
              onChange={handleChange('rootstock')}
              placeholder="e.g. 3309"
            />
          </div>
        </div>

        <div className="v2-form-group">
          <label className="v2-form-label">Training System</label>
          <select
            className="v2-form-select"
            value={form.training_system}
            onChange={handleChange('training_system')}
          >
            <option value="">Select system...</option>
            {TRAINING_SYSTEMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="v2-form-group">
          <label className="v2-form-label">Planted Date</label>
          <input
            className="v2-form-input"
            type="date"
            value={form.planted_date}
            onChange={handleChange('planted_date')}
          />
        </div>

        <div className="v2-form-row">
          <div className="v2-form-group">
            <label className="v2-form-label">Row Spacing (m)</label>
            <input
              className="v2-form-input"
              type="number"
              step="0.1"
              value={form.row_spacing}
              onChange={handleChange('row_spacing')}
              placeholder="e.g. 2.4"
            />
          </div>
          <div className="v2-form-group">
            <label className="v2-form-label">Vine Spacing (m)</label>
            <input
              className="v2-form-input"
              type="number"
              step="0.1"
              value={form.vine_spacing}
              onChange={handleChange('vine_spacing')}
              placeholder="e.g. 1.8"
            />
          </div>
        </div>

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
              <><Save size={14} /> Create Block</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
