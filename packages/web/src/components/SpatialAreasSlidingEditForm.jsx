import React, { useState, useEffect } from 'react';
import { AlertCircle, Info } from 'lucide-react';

const SpatialAreaSlidingEditForm = ({ 
  isOpen, 
  onClose,
  spatialAreaData,
  onSubmit,
  availableParentAreas = []
}) => {
  const [formData, setFormData] = useState({
    // Core fields
    name: '',
    description: '',
    area_type: '',
    parent_area_id: '',
    area_hectares: '',
    is_active: true,
    // Metadata will be populated based on area type
    area_metadata: {}
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const areaTypes = [
    { value: 'paddock', label: 'Paddock' },
    { value: 'orchard', label: 'Orchard' },
    { value: 'plantation_forestry', label: 'Plantation Forestry' },
    { value: 'native_forest', label: 'Native Forest' },
    { value: 'infrastructure_zone', label: 'Infrastructure Zone' },
    { value: 'waterway', label: 'Waterway' },
    { value: 'wetland', label: 'Wetland' },
    { value: 'conservation_area', label: 'Conservation Area' },
    { value: 'waste_management', label: 'Waste Management' }
  ];

  // Load spatial area data when opened
  useEffect(() => {
    if (isOpen && spatialAreaData) {
      setError('');
      setFormData({
        name: spatialAreaData.name || '',
        description: spatialAreaData.description || '',
        area_type: spatialAreaData.area_type || '',
        parent_area_id: spatialAreaData.parent_area_id || '',
        area_hectares: spatialAreaData.area_hectares || '',
        is_active: spatialAreaData.is_active !== undefined ? spatialAreaData.is_active : true,
        area_metadata: spatialAreaData.area_metadata || {}
      });
    }
  }, [isOpen, spatialAreaData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleMetadataChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      area_metadata: {
        ...prev.area_metadata,
        [field]: value
      }
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.area_type) {
      setError('Name and Area Type are required');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const updateData = {
        name: formData.name,
        description: formData.description || null,
        area_type: formData.area_type,
        parent_area_id: formData.parent_area_id ? parseInt(formData.parent_area_id) : null,
        area_hectares: formData.area_hectares ? parseFloat(formData.area_hectares) : null,
        is_active: formData.is_active,
        area_metadata: formData.area_metadata
      };

      await onSubmit(spatialAreaData.id, updateData);
      onClose();
    } catch (err) {
      console.error('Error updating spatial area:', err);
      setError(err.response?.data?.detail || 'Failed to update spatial area');
    } finally {
      setLoading(false);
    }
  };

  const renderTypeSpecificFields = () => {
    const metadata = formData.area_metadata || {};
    
    switch (formData.area_type) {
      case 'paddock':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Paddock Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Pasture Type
                </label>
                <input
                  type="text"
                  value={metadata.pasture_type || ''}
                  onChange={(e) => handleMetadataChange('pasture_type', e.target.value)}
                  placeholder="e.g., Ryegrass/Clover"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Stocking Rate (animals/ha)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={metadata.stocking_rate || ''}
                  onChange={(e) => handleMetadataChange('stocking_rate', e.target.value)}
                  placeholder="e.g., 12.5"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Grazing System
                </label>
                <select
                  value={metadata.grazing_system || ''}
                  onChange={(e) => handleMetadataChange('grazing_system', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select system</option>
                  <option value="rotational">Rotational</option>
                  <option value="continuous">Continuous</option>
                  <option value="strip">Strip Grazing</option>
                  <option value="cell">Cell Grazing</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Soil Type
                </label>
                <input
                  type="text"
                  value={metadata.soil_type || ''}
                  onChange={(e) => handleMetadataChange('soil_type', e.target.value)}
                  placeholder="e.g., Clay loam"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Water Source
                </label>
                <input
                  type="text"
                  value={metadata.water_source || ''}
                  onChange={(e) => handleMetadataChange('water_source', e.target.value)}
                  placeholder="e.g., Bore, Stream, Trough"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Last Renovation
                </label>
                <input
                  type="date"
                  value={metadata.last_renovation || ''}
                  onChange={(e) => handleMetadataChange('last_renovation', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>
        );

      case 'orchard':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Orchard Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Crop Type
                </label>
                <input
                  type="text"
                  value={metadata.crop_type || ''}
                  onChange={(e) => handleMetadataChange('crop_type', e.target.value)}
                  placeholder="e.g., Apples, Citrus, Stone fruit"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Varieties
                </label>
                <input
                  type="text"
                  value={metadata.varieties || ''}
                  onChange={(e) => handleMetadataChange('varieties', e.target.value)}
                  placeholder="e.g., Gala, Braeburn"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Planting Density (trees/ha)
                </label>
                <input
                  type="number"
                  value={metadata.planting_density || ''}
                  onChange={(e) => handleMetadataChange('planting_density', e.target.value)}
                  placeholder="e.g., 1200"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Training System
                </label>
                <input
                  type="text"
                  value={metadata.training_system || ''}
                  onChange={(e) => handleMetadataChange('training_system', e.target.value)}
                  placeholder="e.g., Trellis, Central leader"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Planted Date
                </label>
                <input
                  type="date"
                  value={metadata.planted_date || ''}
                  onChange={(e) => handleMetadataChange('planted_date', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Irrigation System
                </label>
                <select
                  value={metadata.irrigation_system || ''}
                  onChange={(e) => handleMetadataChange('irrigation_system', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select system</option>
                  <option value="drip">Drip</option>
                  <option value="sprinkler">Sprinkler</option>
                  <option value="micro_spray">Micro Spray</option>
                  <option value="flood">Flood</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 'plantation_forestry':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Plantation Forestry Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Tree Species
                </label>
                <input
                  type="text"
                  value={metadata.tree_species || ''}
                  onChange={(e) => handleMetadataChange('tree_species', e.target.value)}
                  placeholder="e.g., Pinus radiata, Eucalyptus"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Planting Density (stems/ha)
                </label>
                <input
                  type="number"
                  value={metadata.planting_density || ''}
                  onChange={(e) => handleMetadataChange('planting_density', e.target.value)}
                  placeholder="e.g., 1000"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Planted Date
                </label>
                <input
                  type="date"
                  value={metadata.planted_date || ''}
                  onChange={(e) => handleMetadataChange('planted_date', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Expected Harvest Date
                </label>
                <input
                  type="date"
                  value={metadata.expected_harvest || ''}
                  onChange={(e) => handleMetadataChange('expected_harvest', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                Management Regime
              </label>
              <textarea
                value={metadata.management_regime || ''}
                onChange={(e) => handleMetadataChange('management_regime', e.target.value)}
                placeholder="Pruning schedule, thinning operations, etc."
                rows={3}
                style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
          </div>
        );

      case 'native_forest':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Native Forest Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Dominant Species
                </label>
                <input
                  type="text"
                  value={metadata.dominant_species || ''}
                  onChange={(e) => handleMetadataChange('dominant_species', e.target.value)}
                  placeholder="e.g., Kauri, Beech, Podocarp"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Forest Type
                </label>
                <select
                  value={metadata.forest_type || ''}
                  onChange={(e) => handleMetadataChange('forest_type', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select type</option>
                  <option value="podocarp">Podocarp</option>
                  <option value="beech">Beech</option>
                  <option value="kauri">Kauri</option>
                  <option value="mixed_broadleaf">Mixed Broadleaf</option>
                  <option value="regenerating">Regenerating</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Conservation Status
                </label>
                <select
                  value={metadata.conservation_status || ''}
                  onChange={(e) => handleMetadataChange('conservation_status', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select status</option>
                  <option value="protected">Protected</option>
                  <option value="significant">Significant</option>
                  <option value="restoration">Under Restoration</option>
                  <option value="production">Production</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: '#374151', marginTop: '1.5rem' }}>
                  <input
                    type="checkbox"
                    checked={metadata.public_access || false}
                    onChange={(e) => handleMetadataChange('public_access', e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 500 }}>Public Access Allowed</span>
                </label>
              </div>
            </div>
          </div>
        );

      case 'infrastructure_zone':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Infrastructure Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Infrastructure Type
                </label>
                <select
                  value={metadata.infrastructure_type || ''}
                  onChange={(e) => handleMetadataChange('infrastructure_type', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select type</option>
                  <option value="buildings">Buildings</option>
                  <option value="roads">Roads</option>
                  <option value="utilities">Utilities</option>
                  <option value="storage">Storage</option>
                  <option value="processing">Processing</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Capacity/Specifications
                </label>
                <input
                  type="text"
                  value={metadata.capacity || ''}
                  onChange={(e) => handleMetadataChange('capacity', e.target.value)}
                  placeholder="e.g., 500 tonnes, 20kW"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                Safety Requirements
              </label>
              <textarea
                value={metadata.safety_requirements || ''}
                onChange={(e) => handleMetadataChange('safety_requirements', e.target.value)}
                placeholder="Safety protocols, access restrictions, etc."
                rows={3}
                style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
          </div>
        );

      case 'waterway':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Waterway Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Water Type
                </label>
                <select
                  value={metadata.water_type || ''}
                  onChange={(e) => handleMetadataChange('water_type', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select type</option>
                  <option value="stream">Stream</option>
                  <option value="river">River</option>
                  <option value="pond">Pond</option>
                  <option value="dam">Dam</option>
                  <option value="creek">Creek</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Flow Rate (L/s)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={metadata.flow_rate || ''}
                  onChange={(e) => handleMetadataChange('flow_rate', e.target.value)}
                  placeholder="e.g., 15.5"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Water Quality Status
                </label>
                <select
                  value={metadata.water_quality || ''}
                  onChange={(e) => handleMetadataChange('water_quality', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select quality</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Fish Species Present
                </label>
                <input
                  type="text"
                  value={metadata.fish_species || ''}
                  onChange={(e) => handleMetadataChange('fish_species', e.target.value)}
                  placeholder="e.g., Trout, Native galaxias"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>
        );

      case 'wetland':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Wetland Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Wetland Type
                </label>
                <select
                  value={metadata.wetland_type || ''}
                  onChange={(e) => handleMetadataChange('wetland_type', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select type</option>
                  <option value="natural">Natural</option>
                  <option value="constructed">Constructed</option>
                  <option value="restored">Restored</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Dominant Vegetation
                </label>
                <input
                  type="text"
                  value={metadata.dominant_vegetation || ''}
                  onChange={(e) => handleMetadataChange('dominant_vegetation', e.target.value)}
                  placeholder="e.g., Raupo, Flax, Sedges"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Water Source
                </label>
                <input
                  type="text"
                  value={metadata.water_source || ''}
                  onChange={(e) => handleMetadataChange('water_source', e.target.value)}
                  placeholder="e.g., Spring fed, Rainfall"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Wildlife Species
                </label>
                <input
                  type="text"
                  value={metadata.wildlife_species || ''}
                  onChange={(e) => handleMetadataChange('wildlife_species', e.target.value)}
                  placeholder="e.g., Pukeko, Ducks, Native fish"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>
        );

      case 'conservation_area':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Conservation Area Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Conservation Purpose
                </label>
                <input
                  type="text"
                  value={metadata.conservation_purpose || ''}
                  onChange={(e) => handleMetadataChange('conservation_purpose', e.target.value)}
                  placeholder="e.g., Native bird habitat"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Protected Species
                </label>
                <input
                  type="text"
                  value={metadata.protected_species || ''}
                  onChange={(e) => handleMetadataChange('protected_species', e.target.value)}
                  placeholder="e.g., Kiwi, Kakapo, Native orchids"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Legal Protection Status
                </label>
                <select
                  value={metadata.protection_status || ''}
                  onChange={(e) => handleMetadataChange('protection_status', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select status</option>
                  <option value="covenant">Conservation Covenant</option>
                  <option value="reserve">Nature Reserve</option>
                  <option value="scenic_reserve">Scenic Reserve</option>
                  <option value="voluntary">Voluntary Protection</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: '#374151', marginTop: '1.5rem' }}>
                  <input
                    type="checkbox"
                    checked={metadata.access_restricted || false}
                    onChange={(e) => handleMetadataChange('access_restricted', e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 500 }}>Access Restricted</span>
                </label>
              </div>
            </div>
          </div>
        );

      case 'waste_management':
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
              Waste Management Details
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Waste Type
                </label>
                <select
                  value={metadata.waste_type || ''}
                  onChange={(e) => handleMetadataChange('waste_type', e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select type</option>
                  <option value="organic">Organic Waste</option>
                  <option value="general">General Waste</option>
                  <option value="hazardous">Hazardous Materials</option>
                  <option value="recycling">Recycling</option>
                  <option value="composting">Composting</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                  Capacity
                </label>
                <input
                  type="text"
                  value={metadata.capacity || ''}
                  onChange={(e) => handleMetadataChange('capacity', e.target.value)}
                  placeholder="e.g., 50 tonnes, 1000L"
                  style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>
                Treatment Method
              </label>
              <input
                type="text"
                value={metadata.treatment_method || ''}
                onChange={(e) => handleMetadataChange('treatment_method', e.target.value)}
                placeholder="e.g., Composting, Incineration, Landfill"
                style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!spatialAreaData) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`backdrop ${isOpen ? 'active' : ''}`}
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isOpen ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0)',
          visibility: isOpen ? 'visible' : 'hidden',
          transition: 'all 0.3s ease',
          zIndex: 999
        }}
      />
      
      {/* Sliding Panel */}
      <div 
        className={`sliding-panel ${isOpen ? 'open' : ''}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '800px',
          backgroundColor: 'white',
          boxShadow: '2px 0 20px rgba(0, 0, 0, 0.15)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
          zIndex: 1000,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem 1.25rem 1rem',
          borderBottom: '1px solid #f3f4f6',
          position: 'sticky',
          top: 0,
          backgroundColor: 'white',
          zIndex: 10
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
            Edit Management Area - {formData.name}
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '0.25rem',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>
        
        {/* Area info header */}
        <div style={{
          backgroundColor: '#f3f4f6',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <strong>Area ID:</strong> {spatialAreaData.id}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <strong>Area:</strong> {spatialAreaData.area_hectares?.toFixed(2)} ha
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <strong>Company ID:</strong> {spatialAreaData.company_id}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            <Info size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
            <strong>Note:</strong> Type-specific fields are stored in metadata and will change based on the selected area type.
          </div>
        </div>
        
        <div style={{ padding: '1.25rem', paddingBottom: '2rem' }}>
          {error && (
            <div style={{
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          
          {/* Core Fields */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              color: '#374151'
            }}>
              Area Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter area name"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1.25rem'
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                Area Type *
              </label>
              <select
                name="area_type"
                value={formData.area_type}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">Select area type</option>
                {areaTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                Parent Area
              </label>
              <select
                name="parent_area_id"
                value={formData.parent_area_id}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">No parent area</option>
                {availableParentAreas.map(area => (
                  <option key={area.id} value={area.id}>
                    {area.name} ({area.area_type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1.25rem'
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                Area (hectares)
              </label>
              <input
                type="number"
                name="area_hectares"
                value={formData.area_hectares}
                onChange={handleChange}
                step="0.01"
                placeholder="Calculated from geometry"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#374151',
                marginTop: '1.5rem'
              }}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  style={{
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontWeight: 500 }}>Active</span>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              color: '#374151'
            }}>
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Enter area description"
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Type-specific fields */}
          {formData.area_type && (
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.25rem'
            }}>
              {renderTypeSpecificFields()}
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'flex-end',
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #f3f4f6'
          }}>
            <button 
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                backgroundColor: '#f3f4f6',
                color: '#4b5563',
                opacity: loading ? 0.6 : 1
              }}
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={loading || !formData.name || !formData.area_type}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: loading || !formData.name || !formData.area_type ? 'not-allowed' : 'pointer',
                backgroundColor: '#446145',
                color: 'white',
                opacity: loading || !formData.name || !formData.area_type ? 0.6 : 1
              }}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SpatialAreaSlidingEditForm;