// maps-v2/components/drawing/BlockEditForm.jsx — Edit block metadata + geometry
import { useState, useEffect } from 'react';
import { X, Save, Loader, Pencil, MapPin } from 'lucide-react';
import { blocksService, BLOCK_STATUS_OPTIONS, BLOCK_STATUS_DEFAULT } from '@vineyard/shared';

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
 * Slide-in form for editing an existing block's metadata and geometry.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Object|null} props.blockData - full block data from API
 * @param {boolean} props.isEditingGeometry - whether geometry editing is active
 * @param {Function} props.onStartGeometryEdit - start editing the block's geometry on map
 * @param {Function} props.onSaveGeometry - save the edited geometry
 * @param {Function} props.onCancelGeometryEdit - cancel geometry edit
 * @param {Function} props.onSubmit - called after successful metadata save
 * @param {Function} props.onDelete - called to delete the block
 * @param {Function} props.onCancel - close form
 * @param {Array} props.properties - list of {id, name} for property assignment
 */
export default function BlockEditForm({
  isOpen,
  blockData,
  isEditingGeometry = false,
  onStartGeometryEdit,
  onSaveGeometry,
  onCancelGeometryEdit,
  onSubmit,
  onDelete,
  onCancel,
  properties = [],
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    block_name: '',
    status: BLOCK_STATUS_DEFAULT,
    variety: '',
    clone: '',
    rootstock: '',
    training_system: '',
    planted_date: '',
    removed_date: '',
    row_spacing: '',
    vine_spacing: '',
    area: '',
    notes: '',
    swnz: false,
    organic: false,
    biodynamic: false,
    regenerative: false,
    property_id: '',
  });

  useEffect(() => {
    if (blockData) {
      setForm({
        block_name: blockData.block_name || '',
        status: blockData.status || BLOCK_STATUS_DEFAULT,
        variety: blockData.variety || '',
        clone: blockData.clone || '',
        rootstock: blockData.rootstock || '',
        training_system: blockData.training_system || '',
        planted_date: blockData.planted_date?.slice(0, 10) || '',
        removed_date: blockData.removed_date?.slice(0, 10) || '',
        row_spacing: blockData.row_spacing || '',
        vine_spacing: blockData.vine_spacing || '',
        area: blockData.area ?? '',
        notes: blockData.notes || '',
        swnz: !!blockData.swnz,
        organic: !!blockData.organic,
        biodynamic: !!blockData.biodynamic,
        regenerative: !!blockData.regenerative,
        property_id: blockData.property_id ?? '',
      });
      setError(null);
    }
  }, [blockData]);

  const handleChange = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!blockData?.id) return;

    if (!form.block_name.trim()) {
      setError('Block name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updateData = {
        block_name: form.block_name.trim(),
        status: form.status || BLOCK_STATUS_DEFAULT,
        variety: form.variety || null,
        clone: form.clone || null,
        rootstock: form.rootstock || null,
        training_system: form.training_system || null,
        planted_date: form.planted_date || null,
        removed_date: form.removed_date || null,
        row_spacing: form.row_spacing ? parseFloat(form.row_spacing) : null,
        vine_spacing: form.vine_spacing ? parseFloat(form.vine_spacing) : null,
        area: form.area === '' ? null : parseFloat(form.area),
        notes: form.notes.trim() || null,
        swnz: form.swnz,
        organic: form.organic,
        biodynamic: form.biodynamic,
        regenerative: form.regenerative,
        property_id: form.property_id ? parseInt(form.property_id) : null,
      };

      await blocksService.updateBlock(blockData.id, updateData);
      onSubmit?.();
    } catch (err) {
      console.error('Block update failed:', err);
      setError(err.message || 'Failed to update block');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !blockData) return null;

  return (
    <div className="v2-form-panel">
      <div className="v2-form-header">
        <h3 className="v2-form-title">Edit Block</h3>
        <button className="v2-form-close" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>

      <div className="v2-form-body">
        {error && <div className="v2-form-error">{error}</div>}

        {/* Geometry edit section */}
        <div className="v2-form-section">
          <div className="v2-form-section-header">
            <MapPin size={14} />
            <span>Geometry</span>
          </div>
          {!isEditingGeometry ? (
            <button
              type="button"
              className="v2-form-btn v2-form-btn--outline"
              onClick={onStartGeometryEdit}
            >
              <Pencil size={14} />
              Edit Block Shape
            </button>
          ) : (
            <div className="v2-form-geometry-actions">
              <p className="v2-form-hint">
                Drag vertices to reshape the block. Click midpoints to add vertices.
              </p>
              <div className="v2-form-actions">
                <button
                  type="button"
                  className="v2-form-btn v2-form-btn--ghost"
                  onClick={onCancelGeometryEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="v2-form-btn v2-form-btn--accent"
                  onClick={onSaveGeometry}
                >
                  <Save size={14} /> Save Shape
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Property assignment */}
        {properties.length > 0 && (
          <div className="v2-form-section">
            <div className="v2-form-section-header">
              <MapPin size={14} />
              <span>Property Assignment</span>
            </div>
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
          </div>
        )}

        {/* Metadata form */}
        <form onSubmit={handleSubmit}>
          <div className="v2-form-section">
            <div className="v2-form-section-header">
              <Pencil size={14} />
              <span>Details</span>
            </div>

            <div className="v2-form-group">
              <label className="v2-form-label">Block Name *</label>
              <input
                className="v2-form-input"
                type="text"
                value={form.block_name}
                onChange={handleChange('block_name')}
              />
            </div>

            <div className="v2-form-group">
              <label className="v2-form-label">Status</label>
              <select
                className="v2-form-select"
                value={form.status}
                onChange={handleChange('status')}
              >
                {BLOCK_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="v2-form-group">
              <label className="v2-form-label">Variety</label>
              <input
                className="v2-form-input"
                type="text"
                list="variety-options"
                value={form.variety}
                onChange={handleChange('variety')}
                placeholder="Type or select variety..."
              />
              <datalist id="variety-options">
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
                />
              </div>
              <div className="v2-form-group">
                <label className="v2-form-label">Rootstock</label>
                <input
                  className="v2-form-input"
                  type="text"
                  value={form.rootstock}
                  onChange={handleChange('rootstock')}
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

            <div className="v2-form-row">
              <div className="v2-form-group">
                <label className="v2-form-label">Planted Date</label>
                <input
                  className="v2-form-input"
                  type="date"
                  value={form.planted_date}
                  onChange={handleChange('planted_date')}
                />
              </div>
              <div className="v2-form-group">
                <label className="v2-form-label">Removed Date</label>
                <input
                  className="v2-form-input"
                  type="date"
                  value={form.removed_date}
                  onChange={handleChange('removed_date')}
                />
              </div>
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
                />
              </div>
            </div>

            <div className="v2-form-group">
              <label className="v2-form-label">Area (ha)</label>
              <input
                className="v2-form-input"
                type="number"
                step="0.01"
                min="0"
                value={form.area}
                onChange={handleChange('area')}
                placeholder="e.g. 2.40"
              />
              <p className="v2-form-hint">
                Type a surveyed figure here if the drawn shape under-reads. Editing the
                block shape recalculates this from the polygon and replaces what you enter.
              </p>
            </div>

            <div className="v2-form-group">
              <label className="v2-form-label">Notes</label>
              <textarea
                className="v2-form-textarea"
                value={form.notes}
                onChange={handleChange('notes')}
                placeholder="Anything that doesn't fit the fields above — access, history, quirks..."
                rows={3}
              />
            </div>
          </div>

          <div className="v2-form-section">
            <div className="v2-form-section-header">
              <span>Certifications</span>
            </div>
            <div className="v2-form-checkbox-grid">
              {['swnz', 'organic', 'biodynamic', 'regenerative'].map((cert) => (
                <label key={cert} className="v2-form-checkbox-label">
                  <input
                    type="checkbox"
                    checked={form[cert]}
                    onChange={handleChange(cert)}
                  />
                  {cert.charAt(0).toUpperCase() + cert.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className="v2-form-actions">
            <div style={{ flex: 1 }} />
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
                <><Save size={14} /> Save Changes</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
