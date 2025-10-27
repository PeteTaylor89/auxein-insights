// src/pages/TaskTemplateEditor.jsx
// Enhanced with dropdown selects for equipment and consumables

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, Save, X, Plus, Trash2, Info, Settings, 
  Wrench, Package, Palette
} from 'lucide-react';
import { tasksService, assetService } from '@vineyard/shared';

function TaskTemplateEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;

  // Form state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Asset data
  const [equipmentAssets, setEquipmentAssets] = useState([]);
  const [consumableAssets, setConsumableAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Template data
  const [formData, setFormData] = useState({
    name: '',
    task_category: 'vineyard',
    task_subcategory: '',
    description: '',
    icon: '📋',
    color: '#3b82f6',
    default_priority: 'medium',
    default_duration_hours: '',
    requires_gps_tracking: false,
    allow_partial_completion: true,
    quick_create_enabled: false,
    is_active: true,
    required_equipment_ids: [],
    optional_equipment_ids: [],
    required_consumables: []
  });

  // Dropdown selections
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [selectedOptionalEquipment, setSelectedOptionalEquipment] = useState('');
  const [selectedConsumableForIndex, setSelectedConsumableForIndex] = useState({});

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, []);

  // Load template if editing
  useEffect(() => {
    if (isEditMode) {
      loadTemplate();
    }
  }, [id]);

  const loadAssets = async () => {
    setLoadingAssets(true);
    try {
      // Load equipment assets
      const equipment = await assetService.listAssets({
        category: 'equipment',
        status: 'active',
        limit: 500
      });
      setEquipmentAssets(Array.isArray(equipment) ? equipment : equipment?.items || []);

      // Load consumable assets
      const consumables = await assetService.listAssets({
        asset_type: 'consumable',
        status: 'active',
        limit: 500
      });
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
      const template = await tasksService.getTemplate(id);
      setFormData({
        name: template.name || '',
        task_category: template.task_category || 'vineyard',
        task_subcategory: template.task_subcategory || '',
        description: template.description || '',
        icon: template.icon || '📋',
        color: template.color || '#3b82f6',
        default_priority: template.default_priority || 'medium',
        default_duration_hours: template.default_duration_hours || '',
        requires_gps_tracking: template.requires_gps_tracking || false,
        allow_partial_completion: template.allow_partial_completion !== false,
        quick_create_enabled: template.quick_create_enabled || false,
        is_active: template.is_active !== false,
        required_equipment_ids: template.required_equipment_ids || [],
        optional_equipment_ids: template.optional_equipment_ids || [],
        required_consumables: template.required_consumables || []
      });
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Equipment handlers
  const handleAddEquipment = () => {
    if (selectedEquipment && !formData.required_equipment_ids.includes(parseInt(selectedEquipment))) {
      setFormData(prev => ({
        ...prev,
        required_equipment_ids: [...prev.required_equipment_ids, parseInt(selectedEquipment)]
      }));
      setSelectedEquipment('');
    }
  };

  const handleRemoveEquipment = (equipId) => {
    setFormData(prev => ({
      ...prev,
      required_equipment_ids: prev.required_equipment_ids.filter(id => id !== equipId)
    }));
  };

  const handleAddOptionalEquipment = () => {
    if (selectedOptionalEquipment && !formData.optional_equipment_ids.includes(parseInt(selectedOptionalEquipment))) {
      setFormData(prev => ({
        ...prev,
        optional_equipment_ids: [...prev.optional_equipment_ids, parseInt(selectedOptionalEquipment)]
      }));
      setSelectedOptionalEquipment('');
    }
  };

  const handleRemoveOptionalEquipment = (equipId) => {
    setFormData(prev => ({
      ...prev,
      optional_equipment_ids: prev.optional_equipment_ids.filter(id => id !== equipId)
    }));
  };

  // Consumable handlers
  const handleAddConsumable = () => {
    setFormData(prev => ({
      ...prev,
      required_consumables: [
        ...prev.required_consumables,
        { asset_id: null, rate_per_hectare: '', unit: 'L' }
      ]
    }));
  };

  const handleSelectConsumable = (index, assetId) => {
    handleUpdateConsumable(index, 'asset_id', assetId ? parseInt(assetId) : null);
  };

  const handleUpdateConsumable = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      required_consumables: prev.required_consumables.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      )
    }));
  };

  const handleRemoveConsumable = (index) => {
    setFormData(prev => ({
      ...prev,
      required_consumables: prev.required_consumables.filter((_, i) => i !== index)
    }));
  };

  // Get asset name by ID
  const getAssetName = (assetId) => {
    const asset = [...equipmentAssets, ...consumableAssets].find(a => a.id === assetId);
    return asset ? asset.name : `Asset #${assetId}`;
  };

  // Get available equipment (not already selected)
  const getAvailableEquipment = () => {
    return equipmentAssets.filter(asset => 
      !formData.required_equipment_ids.includes(asset.id)
    );
  };

  const getAvailableOptionalEquipment = () => {
    return equipmentAssets.filter(asset => 
      !formData.optional_equipment_ids.includes(asset.id)
    );
  };

  const getAvailableConsumables = (currentAssetId = null) => {
    const usedIds = formData.required_consumables
      .map(c => c.asset_id)
      .filter(id => id !== null && id !== currentAssetId);
    return consumableAssets.filter(asset => 
      !usedIds.includes(asset.id)
    );
  };

  const handleSave = async () => {
    // Validation
    if (!formData.name.trim()) {
      setError('Template name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Prepare payload
      const payload = {
        ...formData,
        default_duration_hours: formData.default_duration_hours 
          ? parseFloat(formData.default_duration_hours) 
          : null,
        required_consumables: formData.required_consumables
          .filter(c => c.asset_id && c.rate_per_hectare)
          .map(c => ({
            asset_id: parseInt(c.asset_id, 10),
            rate_per_hectare: parseFloat(c.rate_per_hectare),
            unit: c.unit
          }))
      };

      if (isEditMode) {
        await tasksService.updateTemplate(id, payload);
      } else {
        await tasksService.createTemplate(payload);
      }

      navigate('/dashboard?tab=task-templates');
    } catch (err) {
      console.error('Failed to save template:', err);
      setError(err.response?.data?.detail || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
      navigate('/dashboard?tab=task-templates');
    }
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <div>Loading template...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: '2rem' }}>
      {/* Header */}
      <div style={{ 
        background: 'white', 
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto', 
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={handleCancel}
              style={backButtonStyle}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>
                {isEditMode ? 'Edit Template' : 'Create Task Template'}
              </h1>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                {isEditMode ? 'Update template details' : 'Create a reusable task template'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleCancel}
              disabled={saving}
              style={cancelButtonStyle(saving)}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.background = 'white')}
            >
              <X size={16} /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={saveButtonStyle(saving)}
            >
              <Save size={16} /> {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{ maxWidth: '1200px', margin: '1rem auto', padding: '0 1.5rem' }}>
          <div style={errorAlertStyle}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={errorCloseStyle}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Form Content */}
      <div style={formContainerStyle}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Basic Information */}
          <FormSection title="Basic Information" icon={<Info size={18} />}>
            <FormField label="Template Name" required>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Winter Pruning"
                style={inputStyle}
              />
            </FormField>

            <FormField label="Category" required>
              <select
                value={formData.task_category}
                onChange={(e) => handleInputChange('task_category', e.target.value)}
                style={inputStyle}
              >
                <option value="vineyard">🍇 Vineyard</option>
                <option value="land_management">🌱 Land Management</option>
                <option value="asset_management">🔧 Asset Management</option>
                <option value="compliance">📋 Compliance</option>
                <option value="general">📌 General</option>
              </select>
            </FormField>

            <FormField label="Subcategory">
              <input
                type="text"
                value={formData.task_subcategory}
                onChange={(e) => handleInputChange('task_subcategory', e.target.value)}
                placeholder="e.g., Pruning, Spraying"
                style={inputStyle}
              />
            </FormField>

            <FormField label="Description">
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe this task template..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </FormField>
          </FormSection>

          {/* Display Settings */}
          <FormSection title="Display Settings" icon={<Palette size={18} />}>
            <FormField label="Icon (Emoji)">
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => handleInputChange('icon', e.target.value)}
                placeholder="📋"
                maxLength={2}
                style={{ ...inputStyle, fontSize: '1.5rem', textAlign: 'center' }}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                Use an emoji to represent this template
              </p>
            </FormField>

            <FormField label="Color">
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => handleInputChange('color', e.target.value)}
                  style={{ 
                    width: '60px', 
                    height: '38px', 
                    border: '1px solid #d1d5db', 
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                />
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => handleInputChange('color', e.target.value)}
                  placeholder="#3b82f6"
                  style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                />
              </div>
            </FormField>
          </FormSection>

          {/* Default Settings */}
          <FormSection title="Default Settings" icon={<Settings size={18} />}>
            <FormField label="Default Priority">
              <select
                value={formData.default_priority}
                onChange={(e) => handleInputChange('default_priority', e.target.value)}
                style={inputStyle}
              >
                <option value="low">⬇️ Low</option>
                <option value="medium">➡️ Medium</option>
                <option value="high">⬆️ High</option>
                <option value="urgent">🚨 Urgent</option>
              </select>
            </FormField>

            <FormField label="Estimated Duration (hours)">
              <input
                type="number"
                value={formData.default_duration_hours}
                onChange={(e) => handleInputChange('default_duration_hours', e.target.value)}
                placeholder="8"
                min="0"
                step="0.5"
                style={inputStyle}
              />
            </FormField>

            <FormField label="Options">
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={formData.requires_gps_tracking}
                  onChange={(e) => handleInputChange('requires_gps_tracking', e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>📍 Require GPS tracking</span>
              </label>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={formData.allow_partial_completion}
                  onChange={(e) => handleInputChange('allow_partial_completion', e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>✓ Allow partial completion</span>
              </label>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={formData.quick_create_enabled}
                  onChange={(e) => handleInputChange('quick_create_enabled', e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>⚡ Enable for quick create (field mode)</span>
              </label>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>✅ Template is active</span>
              </label>
            </FormField>
          </FormSection>
        </div>

        {/* Right Column - WITH DROPDOWNS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Required Equipment with Dropdown */}
          <FormSection title="Required Equipment" icon={<Wrench size={18} />}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <select
                value={selectedEquipment}
                onChange={(e) => setSelectedEquipment(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                disabled={loadingAssets || getAvailableEquipment().length === 0}
              >
                <option value="">
                  {loadingAssets 
                    ? 'Loading equipment...' 
                    : getAvailableEquipment().length === 0
                    ? 'No equipment available'
                    : 'Select equipment...'}
                </option>
                {getAvailableEquipment().map(asset => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} ({asset.asset_code})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddEquipment}
                disabled={!selectedEquipment}
                style={{
                  ...buttonStyle,
                  background: selectedEquipment ? '#3b82f6' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  cursor: selectedEquipment ? 'pointer' : 'not-allowed'
                }}
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Selected Equipment */}
            {formData.required_equipment_ids.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {formData.required_equipment_ids.map((equipId) => (
                  <div key={equipId} style={selectedItemStyle}>
                    <span style={{ fontSize: '0.875rem' }}>{getAssetName(equipId)}</span>
                    <button
                      onClick={() => handleRemoveEquipment(equipId)}
                      style={removeButtonStyle}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={emptyStateStyle}>No required equipment</p>
            )}
          </FormSection>

          {/* Optional Equipment with Dropdown */}
          <FormSection title="Optional Equipment" icon={<Wrench size={18} />}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <select
                value={selectedOptionalEquipment}
                onChange={(e) => setSelectedOptionalEquipment(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                disabled={loadingAssets || getAvailableOptionalEquipment().length === 0}
              >
                <option value="">
                  {loadingAssets 
                    ? 'Loading equipment...' 
                    : getAvailableOptionalEquipment().length === 0
                    ? 'No equipment available'
                    : 'Select equipment...'}
                </option>
                {getAvailableOptionalEquipment().map(asset => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} ({asset.asset_code})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddOptionalEquipment}
                disabled={!selectedOptionalEquipment}
                style={{
                  ...buttonStyle,
                  background: selectedOptionalEquipment ? '#3b82f6' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  cursor: selectedOptionalEquipment ? 'pointer' : 'not-allowed'
                }}
              >
                <Plus size={16} />
              </button>
            </div>

            {formData.optional_equipment_ids.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {formData.optional_equipment_ids.map((equipId) => (
                  <div key={equipId} style={{ ...selectedItemStyle, opacity: 0.7 }}>
                    <span style={{ fontSize: '0.875rem' }}>{getAssetName(equipId)}</span>
                    <button
                      onClick={() => handleRemoveOptionalEquipment(equipId)}
                      style={removeButtonStyle}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={emptyStateStyle}>No optional equipment</p>
            )}
          </FormSection>

          {/* Required Consumables with Dropdown */}
          <FormSection title="Required Consumables" icon={<Package size={18} />}>
            <button
              onClick={handleAddConsumable}
              style={addButtonStyle}
            >
              <Plus size={16} /> Add Consumable
            </button>

            {formData.required_consumables.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                {formData.required_consumables.map((consumable, index) => (
                  <div key={index} style={consumableCardStyle}>
                    {/* Consumable Selector */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <select
                        value={consumable.asset_id || ''}
                        onChange={(e) => handleSelectConsumable(index, e.target.value)}
                        style={{ ...inputStyle, flex: 1, fontSize: '0.875rem' }}
                        disabled={loadingAssets}
                      >
                        <option value="">
                          {loadingAssets ? 'Loading...' : 'Select consumable...'}
                        </option>
                        {getAvailableConsumables(consumable.asset_id).map(asset => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name} ({asset.asset_code})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemoveConsumable(index)}
                        style={removeButtonStyle}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Rate and Unit */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="number"
                        value={consumable.rate_per_hectare}
                        onChange={(e) => handleUpdateConsumable(index, 'rate_per_hectare', e.target.value)}
                        placeholder="Rate"
                        step="0.1"
                        style={{ ...inputStyle, flex: 1, fontSize: '0.875rem' }}
                      />
                      <select
                        value={consumable.unit}
                        onChange={(e) => handleUpdateConsumable(index, 'unit', e.target.value)}
                        style={{ ...inputStyle, flex: 1, fontSize: '0.875rem' }}
                      >
                        <option value="L">L (Liters)</option>
                        <option value="kg">kg (Kilograms)</option>
                        <option value="g">g (Grams)</option>
                        <option value="mL">mL (Milliliters)</option>
                        <option value="units">Units</option>
                      </select>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                      per hectare
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ ...emptyStateStyle, marginTop: '0.75rem' }}>No consumables required</p>
            )}
          </FormSection>
        </div>
      </div>
    </div>
  );
}

// Reusable Components
function FormSection({ title, icon, children }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '1.25rem'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <span style={{ color: '#6b7280' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{
        display: 'block',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: '#374151',
        marginBottom: '0.5rem'
      }}>
        {label}
        {required && <span style={{ color: '#dc2626', marginLeft: '0.25rem' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// Styles
const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.875rem',
  background: 'white',
  boxSizing: 'border-box'
};

const buttonStyle = {
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.875rem',
  fontWeight: '500'
};

const backButtonStyle = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '0.5rem',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  color: '#6b7280'
};

const cancelButtonStyle = (saving) => ({
  padding: '0.625rem 1.25rem',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  background: 'white',
  color: '#374151',
  fontSize: '0.875rem',
  fontWeight: '500',
  cursor: saving ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  opacity: saving ? 0.6 : 1
});

const saveButtonStyle = (saving) => ({
  padding: '0.625rem 1.25rem',
  borderRadius: '6px',
  border: 'none',
  background: saving ? '#93c5fd' : '#3b82f6',
  color: 'white',
  fontSize: '0.875rem',
  fontWeight: '500',
  cursor: saving ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem'
});

const errorAlertStyle = {
  background: '#fee2e2',
  border: '1px solid #fca5a5',
  borderRadius: '6px',
  padding: '1rem',
  color: '#dc2626',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const errorCloseStyle = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '0.25rem'
};

const formContainerStyle = {
  maxWidth: '1200px',
  margin: '2rem auto',
  padding: '0 1.5rem',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1.5rem'
};

const checkboxLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '0.5rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  userSelect: 'none'
};

const selectedItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.5rem 0.75rem',
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px'
};

const removeButtonStyle = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '0.25rem',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#dc2626'
};

const emptyStateStyle = {
  fontSize: '0.875rem',
  color: '#6b7280',
  fontStyle: 'italic',
  margin: 0
};

const addButtonStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  background: '#f3f4f6',
  color: '#374151',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  fontSize: '0.875rem',
  fontWeight: '500'
};

const consumableCardStyle = {
  padding: '0.75rem',
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px'
};

export default TaskTemplateEditor;