// src/pages/TaskTemplateEditor.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, X, Plus, Trash2, Info, Settings,
  Wrench, Package, Palette
} from 'lucide-react';
import { tasksService, assetService } from '@vineyard/shared';
import './TaskTemplateEditor.css';

function TaskTemplateEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [equipmentAssets, setEquipmentAssets] = useState([]);
  const [consumableAssets, setConsumableAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    task_category: 'vineyard',
    task_subcategory: '',
    description: '',
    icon: '',
    color: '#5B6830',
    default_priority: 'medium',
    default_duration_hours: '',
    requires_gps_tracking: false,
    allow_partial_completion: true,
    quick_create_enabled: true,
    is_active: true,
    required_equipment_ids: [],
    optional_equipment_ids: [],
    required_consumables: [],
  });

  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [selectedOptionalEquipment, setSelectedOptionalEquipment] = useState('');

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    if (isEditMode) loadTemplate();
  }, [id]);

  const loadAssets = async () => {
    setLoadingAssets(true);
    try {
      const equipment = await assetService.listAssets({ category: 'equipment', status: 'active', limit: 500 });
      setEquipmentAssets(Array.isArray(equipment) ? equipment : equipment?.items || []);
      const consumables = await assetService.listAssets({ asset_type: 'consumable', status: 'active', limit: 500 });
      setConsumableAssets(Array.isArray(consumables) ? consumables : consumables?.items || []);
    } catch (err) {
      console.error('Failed to load assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const loadTemplate = async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await tasksService.getTemplate(id);
      setFormData({
        name: t.name || '',
        task_category: t.task_category || 'vineyard',
        task_subcategory: t.task_subcategory || '',
        description: t.description || '',
        icon: t.icon || '',
        color: t.color || '#5B6830',
        default_priority: t.default_priority || 'medium',
        default_duration_hours: t.default_duration_hours || '',
        requires_gps_tracking: t.requires_gps_tracking || false,
        allow_partial_completion: t.allow_partial_completion !== false,
        quick_create_enabled: t.quick_create_enabled !== false,
        is_active: t.is_active !== false,
        required_equipment_ids: t.required_equipment_ids || [],
        optional_equipment_ids: t.optional_equipment_ids || [],
        required_consumables: t.required_consumables || [],
      });
    } catch {
      setError('Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  // Equipment handlers
  const addEquipment = () => {
    if (selectedEquipment && !formData.required_equipment_ids.includes(parseInt(selectedEquipment))) {
      set('required_equipment_ids', [...formData.required_equipment_ids, parseInt(selectedEquipment)]);
      setSelectedEquipment('');
    }
  };
  const removeEquipment = (eid) => set('required_equipment_ids', formData.required_equipment_ids.filter((x) => x !== eid));

  const addOptionalEquipment = () => {
    if (selectedOptionalEquipment && !formData.optional_equipment_ids.includes(parseInt(selectedOptionalEquipment))) {
      set('optional_equipment_ids', [...formData.optional_equipment_ids, parseInt(selectedOptionalEquipment)]);
      setSelectedOptionalEquipment('');
    }
  };
  const removeOptionalEquipment = (eid) => set('optional_equipment_ids', formData.optional_equipment_ids.filter((x) => x !== eid));

  // Consumable handlers
  const addConsumable = () => set('required_consumables', [...formData.required_consumables, { asset_id: null, rate_per_hectare: '', unit: 'L' }]);
  const updateConsumable = (i, field, value) =>
    set('required_consumables', formData.required_consumables.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  const removeConsumable = (i) => set('required_consumables', formData.required_consumables.filter((_, idx) => idx !== i));

  const getAssetName = (assetId) => {
    const a = [...equipmentAssets, ...consumableAssets].find((x) => x.id === assetId);
    return a ? a.name : `Asset #${assetId}`;
  };
  const availableEquipment = () => equipmentAssets.filter((a) => !formData.required_equipment_ids.includes(a.id));
  const availableOptionalEquipment = () => equipmentAssets.filter((a) => !formData.optional_equipment_ids.includes(a.id));
  const availableConsumables = (currentId = null) => {
    const used = formData.required_consumables.map((c) => c.asset_id).filter((x) => x != null && x !== currentId);
    return consumableAssets.filter((a) => !used.includes(a.id));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { setError('Template name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        default_duration_hours: formData.default_duration_hours ? parseFloat(formData.default_duration_hours) : null,
        required_consumables: formData.required_consumables
          .filter((c) => c.asset_id && c.rate_per_hectare)
          .map((c) => ({ asset_id: parseInt(c.asset_id), rate_per_hectare: parseFloat(c.rate_per_hectare), unit: c.unit })),
      };
      if (isEditMode) await tasksService.updateTemplate(id, payload);
      else await tasksService.createTemplate(payload);
      navigate(-1);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => navigate(-1);

  if (loading) {
    return <div className="template-editor-loading">Loading template...</div>;
  }

  return (
    <div className="template-editor">
      {/* Header */}
      <div className="template-editor-header">
        <div className="template-editor-header-inner">
          <div className="template-editor-header-left">
            <button className="template-editor-back" onClick={handleCancel}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1>{isEditMode ? 'Edit Template' : 'Create Task Template'}</h1>
              <p>{isEditMode ? 'Update template details' : 'Create a reusable task template'}</p>
            </div>
          </div>
          <div className="template-editor-actions">
            <button className="btn-ghost" onClick={handleCancel} disabled={saving}>
              <X size={16} /> Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="template-editor-error">
          <div className="template-editor-error-alert">
            <span>{error}</span>
            <button className="template-editor-error-close" onClick={() => setError(null)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="template-editor-form">
        {/* Left column */}
        <div className="template-editor-column">
          {/* Basic Info */}
          <div className="te-section">
            <div className="te-section-header"><Info size={18} /><h3>Basic Information</h3></div>

            <div className="te-field">
              <label className="te-field-label">Template Name<span className="te-required">*</span></label>
              <input className="te-input" value={formData.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g., Winter Pruning" />
            </div>

            <div className="te-field">
              <label className="te-field-label">Category<span className="te-required">*</span></label>
              <select className="te-select" value={formData.task_category} onChange={(e) => set('task_category', e.target.value)}>
                <option value="vineyard">Vineyard</option>
                <option value="land_management">Land Management</option>
                <option value="compliance">Compliance</option>
                <option value="general">General</option>
              </select>
            </div>

            <div className="te-field">
              <label className="te-field-label">Subcategory</label>
              <input className="te-input" value={formData.task_subcategory} onChange={(e) => set('task_subcategory', e.target.value)} placeholder="e.g., Pruning, Spraying" />
            </div>

            <div className="te-field">
              <label className="te-field-label">Description</label>
              <textarea className="te-textarea" rows={4} value={formData.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe this task template..." />
            </div>
          </div>

          {/* Display */}
          <div className="te-section">
            <div className="te-section-header"><Palette size={18} /><h3>Display Settings</h3></div>

            <div className="te-field">
              <label className="te-field-label">Icon (Emoji)</label>
              <input className="te-input" value={formData.icon} onChange={(e) => set('icon', e.target.value)} placeholder="e.g. leaf, tractor" maxLength={30} />
              <p className="te-hint">A short label or emoji to represent this template</p>
            </div>

            <div className="te-field">
              <label className="te-field-label">Colour</label>
              <div className="te-color-row">
                <input type="color" className="te-color-swatch" value={formData.color} onChange={(e) => set('color', e.target.value)} />
                <input className="te-input" value={formData.color} onChange={(e) => set('color', e.target.value)} placeholder="#5B6830" style={{ fontFamily: 'monospace' }} />
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="te-section">
            <div className="te-section-header"><Settings size={18} /><h3>Default Settings</h3></div>

            <div className="te-field">
              <label className="te-field-label">Default Priority</label>
              <select className="te-select" value={formData.default_priority} onChange={(e) => set('default_priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="te-field">
              <label className="te-field-label">Estimated Duration (hours)</label>
              <input className="te-input" type="number" value={formData.default_duration_hours} onChange={(e) => set('default_duration_hours', e.target.value)} placeholder="8" min="0" step="0.5" />
            </div>

            <div className="te-field">
              <label className="te-field-label">Options</label>
              <div className="te-checkbox-group">
                <label className="te-checkbox">
                  <input type="checkbox" checked={formData.quick_create_enabled} onChange={(e) => set('quick_create_enabled', e.target.checked)} />
                  Enable for quick create (field mode)
                </label>
                <label className="te-checkbox">
                  <input type="checkbox" checked={formData.requires_gps_tracking} onChange={(e) => set('requires_gps_tracking', e.target.checked)} />
                  Require GPS tracking
                </label>
                <label className="te-checkbox">
                  <input type="checkbox" checked={formData.allow_partial_completion} onChange={(e) => set('allow_partial_completion', e.target.checked)} />
                  Allow partial completion
                </label>
                <label className="te-checkbox">
                  <input type="checkbox" checked={formData.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                  Template is active
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="template-editor-column">
          {/* Required Equipment */}
          <div className="te-section">
            <div className="te-section-header"><Wrench size={18} /><h3>Required Equipment</h3></div>
            <div className="te-add-row">
              <select className="te-select" value={selectedEquipment} onChange={(e) => setSelectedEquipment(e.target.value)} disabled={loadingAssets || availableEquipment().length === 0} style={{ flex: 1 }}>
                <option value="">{loadingAssets ? 'Loading...' : availableEquipment().length === 0 ? 'No equipment available' : 'Select equipment...'}</option>
                {availableEquipment().map((a) => <option key={a.id} value={a.id}>{a.name}{a.asset_code ? ` (${a.asset_code})` : ''}</option>)}
              </select>
              <button className="te-add-btn te-add-btn--primary" onClick={addEquipment} disabled={!selectedEquipment}><Plus size={16} /></button>
            </div>
            {formData.required_equipment_ids.length > 0 ? (
              <div className="te-item-list">
                {formData.required_equipment_ids.map((eid) => (
                  <div key={eid} className="te-selected-item">
                    <span>{getAssetName(eid)}</span>
                    <button className="te-remove-btn" onClick={() => removeEquipment(eid)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="te-empty">No required equipment</p>}
          </div>

          {/* Optional Equipment */}
          <div className="te-section">
            <div className="te-section-header"><Wrench size={18} /><h3>Optional Equipment</h3></div>
            <div className="te-add-row">
              <select className="te-select" value={selectedOptionalEquipment} onChange={(e) => setSelectedOptionalEquipment(e.target.value)} disabled={loadingAssets || availableOptionalEquipment().length === 0} style={{ flex: 1 }}>
                <option value="">{loadingAssets ? 'Loading...' : availableOptionalEquipment().length === 0 ? 'No equipment available' : 'Select equipment...'}</option>
                {availableOptionalEquipment().map((a) => <option key={a.id} value={a.id}>{a.name}{a.asset_code ? ` (${a.asset_code})` : ''}</option>)}
              </select>
              <button className="te-add-btn te-add-btn--primary" onClick={addOptionalEquipment} disabled={!selectedOptionalEquipment}><Plus size={16} /></button>
            </div>
            {formData.optional_equipment_ids.length > 0 ? (
              <div className="te-item-list">
                {formData.optional_equipment_ids.map((eid) => (
                  <div key={eid} className="te-selected-item" style={{ opacity: 0.75 }}>
                    <span>{getAssetName(eid)}</span>
                    <button className="te-remove-btn" onClick={() => removeOptionalEquipment(eid)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="te-empty">No optional equipment</p>}
          </div>

          {/* Required Consumables */}
          <div className="te-section">
            <div className="te-section-header"><Package size={18} /><h3>Required Consumables</h3></div>
            <button className="te-add-full" onClick={addConsumable}><Plus size={16} /> Add Consumable</button>
            {formData.required_consumables.length > 0 ? (
              <div className="te-item-list" style={{ marginTop: 'var(--space-md)' }}>
                {formData.required_consumables.map((c, i) => (
                  <div key={i} className="te-consumable-card">
                    <div className="te-consumable-row">
                      <select className="te-select" value={c.asset_id || ''} onChange={(e) => updateConsumable(i, 'asset_id', e.target.value ? parseInt(e.target.value) : null)} disabled={loadingAssets} style={{ flex: 1 }}>
                        <option value="">{loadingAssets ? 'Loading...' : 'Select consumable...'}</option>
                        {availableConsumables(c.asset_id).map((a) => <option key={a.id} value={a.id}>{a.name}{a.asset_code ? ` (${a.asset_code})` : ''}</option>)}
                      </select>
                      <button className="te-remove-btn" onClick={() => removeConsumable(i)}><Trash2 size={14} /></button>
                    </div>
                    <div className="te-consumable-row">
                      <input className="te-input" type="number" value={c.rate_per_hectare} onChange={(e) => updateConsumable(i, 'rate_per_hectare', e.target.value)} placeholder="Rate" step="0.1" style={{ flex: 1 }} />
                      <select className="te-select" value={c.unit} onChange={(e) => updateConsumable(i, 'unit', e.target.value)} style={{ flex: 1 }}>
                        <option value="L">L (Litres)</option>
                        <option value="kg">kg (Kilograms)</option>
                        <option value="g">g (Grams)</option>
                        <option value="mL">mL (Millilitres)</option>
                        <option value="units">Units</option>
                      </select>
                    </div>
                    <p className="te-hint">per hectare</p>
                  </div>
                ))}
              </div>
            ) : <p className="te-empty" style={{ marginTop: 'var(--space-md)' }}>No consumables required</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskTemplateEditor;
