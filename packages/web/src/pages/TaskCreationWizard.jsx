// src/pages/TaskCreationWizard.jsx
// REVISED - Matches actual API schema

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@vineyard/shared';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, Save, X, Calendar, MapPin, Clock, Users,
  Wrench, Package, FileText, AlertCircle, Plus, Settings
} from 'lucide-react';
import { tasksService, assetService, blocksService, adminService, spatialAreasService } from '@vineyard/shared';
import RiskLocationMap from '../components/RiskLocationMap';

function TaskCreationWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [companyUsers, setCompanyUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const templateFromState = location.state?.template;
  const templateIdFromQuery = searchParams.get('template');
  const [multiMode, setMultiMode] = useState(false);
  const [blockRows, setBlockRows] = useState([]);

  // Form state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Asset data
  const [equipmentAssets, setEquipmentAssets] = useState([]);
  const [consumableAssets, setConsumableAssets] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [spatialAreas, setSpatialAreas] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [mapGeometry, setMapGeometry] = useState(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [requiredEquipment, setRequiredEquipment] = useState([]);
  const [taskCategory, setTaskCategory] = useState('general');

  // Task data - MATCHES ACTUAL API SCHEMA
  const [formData, setFormData] = useState({
    title: '',
    task_category: 'vineyard',
    task_subcategory: '',
    description: '',
    priority: 'medium',
    
    // Location - API uses singular block_id and spatial_area_id
    block_id: null,
    spatial_area_id: null,
    location_type: null,
    location_id: null,
    location_notes: '',
    
    // Scheduling - API uses different field names
    scheduled_start_date: '',
    scheduled_end_date: '',
    scheduled_start_time: null,
    estimated_hours: '',
    
    // Area tracking
    rows_total: '',
    area_total_hectares: '',
    
    // Options
    requires_gps_tracking: false,
    
    // Relations
    template_id: null,
    related_observation_run_id: null,
    related_maintenance_id: null,
    related_calibration_id: null,

    // Tags
    tags: []
  });

  // Task assets - SEPARATE from formData
  const [taskAssets, setTaskAssets] = useState({
    required_equipment: [],
    optional_equipment: [],
    required_consumables: []
  });

  // Task assignments - SEPARATE from formData
  const [taskAssignments, setTaskAssignments] = useState({
    assigned_users: [],
    assigned_teams: []
  });

  // UI state
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [selectedUser, setSelectedUser] = useState('');

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    if (templateFromState) {
      applyTemplate(templateFromState);
    } else if (templateIdFromQuery) {
      loadAndApplyTemplate(templateIdFromQuery);
    }
  }, [templateFromState, templateIdFromQuery]);

  useEffect(() => {
    (async () => {
      try {
        if (formData.task_category === 'vineyard') {
          const res = await blocksService.getCompanyBlocks?.() 
            ?? await blocksService.getAllBlocks?.();
          setBlocks(Array.isArray(res) ? res : (res.blocks || res.items || []));
          setSpatialAreas([]);
        } else if (formData.task_category === 'land_management') {
          const res = await spatialAreasService.getCompanySpatialAreas?.();
          setSpatialAreas(Array.isArray(res) ? res : (res.spatial_areas || res.items || []));
          setBlocks([]);
        } else {
          setBlocks([]);
          setSpatialAreas([]);
        }
      } catch (err) {
        console.error('Failed to load location options:', err);
        setBlocks([]);
        setSpatialAreas([]);
      }
    })();
  }, [formData.task_category]);

  useEffect(() => {
    if (!multiMode || formData.task_category !== 'vineyard') {
      setBlockRows([]);
      return;
    }
    // Make a row for each available block
    const rows = (blocks || []).map(b => ({
      block_id: b.id,
      selected: false,
      user_ids: [],          // per-row assignees
      start_date: formData.scheduled_start_date || '',
      end_date: formData.scheduled_end_date || ''
    }));
    setBlockRows(rows);
  }, [multiMode, formData.task_category, blocks, formData.scheduled_start_date, formData.scheduled_end_date]);

  const setRow = (blockId, patch) => {
    setBlockRows(prev => prev.map(r => r.block_id === blockId ? { ...r, ...patch } : r));
  };

  const toggleRow = (blockId) => setRow(blockId, { selected: !blockRows.find(r => r.block_id === blockId)?.selected });

  const setRowUsers = (blockId, userIds) => setRow(blockId, { user_ids: userIds });

  const setRowDate = (blockId, key, val) => setRow(blockId, { [key]: val });

  const loadAssets = async () => {
    setLoadingAssets(true);
    try {
      const [equipment, consumables] = await Promise.all([
        assetService.listAssets({ asset_type: 'physical', status: 'active', limit: 500 }),
        assetService.listAssets({ asset_type: 'consumable', status: 'active', limit: 500 })
      ]);
      
      setEquipmentAssets(Array.isArray(equipment) ? equipment : equipment?.items || []);
      setConsumableAssets(Array.isArray(consumables) ? consumables : consumables?.items || []);
    } catch (err) {
      console.error('Failed to load assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    const fetchCompanyUsers = async () => {
      try {
        setLoadingUsers(true);

        let usersData;

        // Preferred (but admin-only on backend):
        // GET /admin/companies/{company_id}/users
        // NOTE: This requires role=admin backend-side.
        try {
          usersData = await adminService.getCompanyUsers(user.company_id, { limit: 200 });
        } catch (e) {
          // If caller is not system admin, fall back to:
          // GET /admin/users?company_id=... (admin or manager allowed)
          usersData = await adminService.getAllUsers({
            company_id: user.company_id,
            status: 'active',
            limit: 200,
          });
        }

        // Normalize response formats
        let usersArray = [];
        if (Array.isArray(usersData)) {
          usersArray = usersData;
        } else if (usersData && Array.isArray(usersData.data)) {
          usersArray = usersData.data;
        } else if (usersData && Array.isArray(usersData.users)) {
          usersArray = usersData.users;
        }

        // Filter to active, non-suspended users
        const activeUsers = usersArray.filter(u => u.is_active && !u.is_suspended);

        setCompanyUsers(activeUsers);
        console.log('✅ Loaded company users for assignment:', activeUsers);
      } catch (error) {
        console.error('❌ Error fetching company users:', error);
        setCompanyUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    if (user?.company_id) {
      fetchCompanyUsers();
    }
  }, [user?.company_id]);


  const loadAndApplyTemplate = async (templateId) => {
    setLoading(true);
    try {
      const template = await tasksService.getTemplate(templateId);
      applyTemplate(template);
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (template) => {
    setFormData(prev => ({
      ...prev,
      title: template.name || prev.title,
      task_category: template.task_category || prev.task_category,
      task_subcategory: template.task_subcategory || prev.task_subcategory,
      description: template.description || prev.description,
      priority: template.default_priority || prev.priority,
      estimated_hours: template.default_duration_hours || prev.estimated_hours,
      requires_gps_tracking: template.requires_gps_tracking || prev.requires_gps_tracking,
      template_id: template.id || null
    }));

    // Apply template assets
    if (template.required_equipment_ids) {
      setTaskAssets(prev => ({
        ...prev,
        required_equipment: template.required_equipment_ids
      }));
    }

    if (template.optional_equipment_ids) {
      setTaskAssets(prev => ({
        ...prev,
        optional_equipment: template.optional_equipment_ids
      }));
    }

    if (template.required_consumables) {
      setTaskAssets(prev => ({
        ...prev,
        required_consumables: template.required_consumables
      }));
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Equipment handlers
  const handleAddEquipment = () => {
    if (selectedEquipment && !taskAssets.required_equipment.includes(parseInt(selectedEquipment))) {
      setTaskAssets(prev => ({
        ...prev,
        required_equipment: [...prev.required_equipment, parseInt(selectedEquipment)]
      }));
      setSelectedEquipment('');
    }
  };

  const handleRemoveEquipment = (equipId) => {
    setTaskAssets(prev => ({
      ...prev,
      required_equipment: prev.required_equipment.filter(id => id !== equipId)
    }));
  };


  // Consumable handlers
  const handleAddConsumable = () => {
    setTaskAssets(prev => ({
      ...prev,
      required_consumables: [
        ...prev.required_consumables,
        { asset_id: null, quantity: '', unit: 'L' }
      ]
    }));
  };

  const handleUpdateConsumable = (index, field, value) => {
    setTaskAssets(prev => ({
      ...prev,
      required_consumables: prev.required_consumables.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      )
    }));
  };

  const handleRemoveConsumable = (index) => {
    setTaskAssets(prev => ({
      ...prev,
      required_consumables: prev.required_consumables.filter((_, i) => i !== index)
    }));
  };

  // Assignment handlers
  const handleAddUser = () => {
    if (selectedUser && !taskAssignments.assigned_users.includes(parseInt(selectedUser))) {
      setTaskAssignments(prev => ({
        ...prev,
        assigned_users: [...prev.assigned_users, parseInt(selectedUser)]
      }));
      setSelectedUser('');
    }
  };

  const handleRemoveUser = (userId) => {
    setTaskAssignments(prev => ({
      ...prev,
      assigned_users: prev.assigned_users.filter(id => id !== userId)
    }));
  };

  // Helper functions
  const getAssetName = (assetId) => {
    const asset = [...equipmentAssets, ...consumableAssets].find(a => a.id === assetId);
    return asset ? asset.name : `Asset #${assetId}`;
  };

  const getBlockName = (blockId) => {
    // normalize id types (string/number)
    const block = blocks.find(b => String(b.id) === String(blockId));
    if (!block) return `Block #${blockId}`;
    const label = block.name || block.block_name || `Block #${block.id}`;
    const ha = typeof block.area_hectares === 'number' ? block.area_hectares : (block.area_hectares ? Number(block.area_hectares) : 0);
    return ha ? `${label} (${ha} ha)` : label;
  };

  const getUserName = (userId) => {
    const user = companyUsers.find(u => u.id === userId);
    return user
      ? user.full_name || user.name || user.email || `User #${userId}`
      : `User #${userId}`;
  };

  const getAvailableEquipment = () => {
    return equipmentAssets.filter(asset => 
      !taskAssets.required_equipment.includes(asset.id)
    );
  };

  const getAvailableConsumables = (currentAssetId = null) => {
    const usedIds = taskAssets.required_consumables
      .map(c => c.asset_id)
      .filter(id => id !== null && id !== currentAssetId);
    return consumableAssets.filter(asset => 
      !usedIds.includes(asset.id)
    );
  };

  const handleSave = async () => {
    // Validation common to both modes
    if (!formData.title.trim()) {
      setError('Task title is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // ----- MULTI MODE (one task per selected block) -----
      if (multiMode && formData.task_category === 'vineyard') {
        const rowsToCreate = blockRows.filter(r => r.selected);
        if (rowsToCreate.length === 0) {
          setError('Select at least one block in the table.');
          setSaving(false);
          return;
        }

        const created = [];
        for (const row of rowsToCreate) {
          // build payload per-row using row dates & block id
          const perTaskPayload = {
            ...formData,
            block_id: row.block_id,
            spatial_area_id: null,
            location_type: null,
            // per row schedule (allow empty end date)
            scheduled_start_date: row.start_date || formData.scheduled_start_date || '',
            scheduled_end_date: row.end_date || '',
            // type coercions
            estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
            rows_total: formData.rows_total ? parseInt(formData.rows_total) : null,
            area_total_hectares: formData.area_total_hectares ? parseFloat(formData.area_total_hectares) : null,
          };

          // Create
          const newTask = await tasksService.createTask(perTaskPayload);

          // Equipment (required)
          if (taskAssets.required_equipment.length > 0) {
            const eqPayloads = taskAssets.required_equipment.map((equipId) => ({
              task_id: newTask.id,
              asset_id: equipId,
              asset_type: 'equipment',
              is_required: true,
              quantity: 1
            }));
            await Promise.all(eqPayloads.map(p => tasksService.addTaskAsset(newTask.id, p)));
          }

          // Consumables
          if (taskAssets.required_consumables.length > 0) {
            const consPayloads = taskAssets.required_consumables
              .filter(c => c.asset_id && c.quantity)
              .map(cons => ({
                task_id: newTask.id,
                asset_id: parseInt(cons.asset_id),
                asset_type: 'consumable',
                is_required: true,
                quantity: parseFloat(cons.quantity),
                unit: cons.unit
              }));
            if (consPayloads.length) {
              await Promise.all(consPayloads.map(p => tasksService.addTaskAsset(newTask.id, p)));
            }
          }

          // Bulk assign per-row users (if any)
          if (row.user_ids.length > 0) {
            await tasksService.assignMultipleUsers(newTask.id, {
              user_ids: row.user_ids,
              role: 'assignee',
              estimated_hours: null,
              set_first_as_primary: true
            });
          }

          created.push(newTask);
        }

        // Navigate: if single created, go to it; if many, go to tasks tab
        if (created.length === 1) {
          navigate(`/tasks/${created[0].id}`);
        } else {
          navigate('/dashboard?tab=tasks');
        }

        setSaving(false);
        return;
      }

      // ----- SINGLE MODE (your existing path) -----
      // Prepare main task payload (same as you had, with category-driven location)
      const taskPayload = {
        ...formData,
        block_id: formData.task_category === 'vineyard'
          ? (formData.block_id ? parseInt(formData.block_id) : null)
          : null,
        spatial_area_id: formData.task_category === 'land_management'
          ? (formData.spatial_area_id ? parseInt(formData.spatial_area_id) : null)
          : null,
        location_type: formData.task_category === 'general' ? 'point' : null,
        location_notes: formData.task_category === 'general' && mapGeometry
          ? `${formData.location_notes || ''}\n\nPin: ${JSON.stringify(mapGeometry)}`
          : formData.location_notes,

        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        rows_total: formData.rows_total ? parseInt(formData.rows_total) : null,
        area_total_hectares: formData.area_total_hectares ? parseFloat(formData.area_total_hectares) : null,
      };

      // 1) Create the task
      const newTask = await tasksService.createTask(taskPayload);

      // 2) Required equipment
      if (taskAssets.required_equipment.length > 0) {
        const assetPayloads = taskAssets.required_equipment.map((equipId) => ({
          task_id: newTask.id,
          asset_id: equipId,
          asset_type: 'equipment',
          is_required: true,
          quantity: 1
        }));
        await Promise.all(assetPayloads.map(p => tasksService.addTaskAsset(newTask.id, p)));
      }

      // 3) Consumables
      if (taskAssets.required_consumables.length > 0) {
        const consumablePayloads = taskAssets.required_consumables
          .filter(c => c.asset_id && c.quantity)
          .map(consumable => ({
            task_id: newTask.id,
            asset_id: parseInt(consumable.asset_id),
            asset_type: 'consumable',
            is_required: true,
            quantity: parseFloat(consumable.quantity),
            unit: consumable.unit
          }));
        if (consumablePayloads.length) {
          await Promise.all(consumablePayloads.map(p => tasksService.addTaskAsset(newTask.id, p)));
        }
      }

      // 4) Bulk assign users (from right column, single mode)
      if (taskAssignments.assigned_users.length > 0) {
        await tasksService.assignMultipleUsers(newTask.id, {
          user_ids: taskAssignments.assigned_users,
          role: 'assignee',
          estimated_hours: null,
          set_first_as_primary: true
        });
      }

      // 5) Navigate to the new task
      navigate(`/tasks/${newTask.id}`);
    } catch (err) {
      console.error('Failed to create task:', err);
      setError(err.response?.data?.detail || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };


  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
      navigate('/dashboard?tab=tasks');
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
          <div>Loading...</div>
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
                Create New Task
              </h1>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                {templateFromState || templateIdFromQuery 
                  ? `Creating from template: ${formData.title || 'Template'}`
                  : 'Create a new task from scratch'}
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
              <Save size={16} /> {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{ maxWidth: '1200px', margin: '1rem auto', padding: '0 1.5rem' }}>
          <div style={errorAlertStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
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
          <FormSection title="Basic Information" icon={<FileText size={18} />}>
            <FormField label="Task Title" required>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Winter Pruning - Block A"
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

            {formData.task_category === 'vineyard' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <label style={{ ...checkboxLabelStyle, margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={multiMode}
                      onChange={(e) => setMultiMode(e.target.checked)}
                    />
                    <span>Apply to multiple blocks</span>
                  </label>
                </div>

                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={formData.requires_gps_tracking}
                    onChange={(e) => handleInputChange('requires_gps_tracking', e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>📍 Require GPS tracking</span>
                </label>
              </div>
            )}

            <FormField label="Subcategory">
              <input
                type="text"
                value={formData.task_subcategory}
                onChange={(e) => handleInputChange('task_subcategory', e.target.value)}
                placeholder="e.g., Pruning, Spraying"
                style={inputStyle}
              />
            </FormField>

            <FormField label="Priority" required>
              <select
                value={formData.priority}
                onChange={(e) => handleInputChange('priority', e.target.value)}
                style={inputStyle}
              >
                <option value="low">⬇️ Low</option>
                <option value="medium">➡️ Medium</option>
                <option value="high">⬆️ High</option>
                <option value="urgent">🚨 Urgent</option>
              </select>
            </FormField>

            <FormField label="Description">
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe this task..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </FormField>
          </FormSection>



          {/* Location */}
          {!multiMode && (
            <FormSection title="Location" icon={<MapPin size={18} />}>

              {/* Vineyard → Blocks */}
              {formData.task_category === 'vineyard' && (
                <FormField label="Block">
                  <select
                    value={formData.block_id || ''}
                    onChange={(e) => handleInputChange('block_id', e.target.value ? parseInt(e.target.value) : null)}
                    style={inputStyle}
                  >
                    <option value="">Select block...</option>
                    {blocks.map(block => (
                      <option key={block.id} value={block.id}>
                        {block.name || block.block_name || `Block #${block.id}`}
                        {block.area_hectares && ` (${block.area_hectares} ha)`}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}

              {/* Land Management → Spatial Areas */}
              {formData.task_category === 'land_management' && (
                <FormField label="Spatial Area">
                  <select
                    value={formData.spatial_area_id || ''}
                    onChange={(e) => handleInputChange('spatial_area_id', e.target.value ? parseInt(e.target.value) : null)}
                    style={inputStyle}
                  >
                    <option value="">Select spatial area...</option>
                    {spatialAreas.map(area => (
                      <option key={area.id} value={area.id}>
                        {area.name || `Area #${area.id}`}
                        {area.area_hectares && ` (${area.area_hectares} ha)`}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}

              {/* General → Drop a pin */}
              {formData.task_category === 'general' && (
                <FormField label="Map Pin">
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => setShowMap(true)} style={buttonStyle}>
                      <MapPin size={16} /> Drop a pin
                    </button>
                    {mapGeometry && <span style={{ fontSize: '0.875rem', color: '#16a34a' }}>Pin set ✓</span>}
                  </div>

                  {showMap && (
                    <RiskLocationMap
                      onClose={() => setShowMap(false)}
                      onLocationSet={(geom) => { setMapGeometry(geom); setShowMap(false); }}
                    />
                  )}
                </FormField>
              )}

              {/* Shared fields */}

              <FormField label="Location Notes">
                <textarea
                  value={formData.location_notes}
                  onChange={(e) => handleInputChange('location_notes', e.target.value)}
                  placeholder="Additional location details..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </FormField>
            </FormSection>
          )}

        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Assignments */}
          {!multiMode && (
            <FormSection title="Assign To" icon={<Users size={18} />}>
              {/* Users */}
              <FormField label="Assign Users">
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    disabled={companyUsers.length === 0}
                  >
                    <option value="">
                      {companyUsers.length === 0 ? 'No users available' : 'Select user...'}
                    </option>
                    {companyUsers
                      .filter(u => !taskAssignments.assigned_users.includes(u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.name || u.email}
                        </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddUser}
                    disabled={!selectedUser}
                    style={{
                      ...buttonStyle,
                      background: selectedUser ? '#3b82f6' : '#d1d5db',
                      color: 'white',
                      border: 'none',
                      cursor: selectedUser ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {taskAssignments.assigned_users.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {taskAssignments.assigned_users.map((userId) => (
                      <div key={userId} style={selectedItemStyle}>
                        <span style={{ fontSize: '0.875rem' }}>{getUserName(userId)}</span>
                        <button
                          onClick={() => handleRemoveUser(userId)}
                          style={removeButtonStyle}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={emptyStateStyle}>No users assigned</p>
                )}
              </FormField>

            </FormSection>
          )}
          {/* Required Equipment */}
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

            {taskAssets.required_equipment.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {taskAssets.required_equipment.map((equipId) => (
                  <div key={equipId} style={selectedItemStyle}>
                    <span style={{ fontSize: '0.875rem' }}>{getAssetName(equipId)}</span>
                    <button
                      onClick={() => handleRemoveEquipment(equipId)}
                      style={removeButtonStyle}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={emptyStateStyle}>No required equipment</p>
            )}
          </FormSection>

          {/* Required Consumables */}
          <FormSection title="Required Consumables" icon={<Package size={18} />}>
            <button
              onClick={handleAddConsumable}
              style={addButtonStyle}
            >
              <Plus size={16} /> Add Consumable
            </button>

            {taskAssets.required_consumables.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                {taskAssets.required_consumables.map((consumable, index) => (
                  <div key={index} style={consumableCardStyle}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <select
                        value={consumable.asset_id || ''}
                        onChange={(e) => handleUpdateConsumable(index, 'asset_id', e.target.value ? parseInt(e.target.value) : null)}
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
                        <X size={14} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="number"
                        value={consumable.quantity}
                        onChange={(e) => handleUpdateConsumable(index, 'quantity', e.target.value)}
                        placeholder="Quantity"
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
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ ...emptyStateStyle, marginTop: '0.75rem' }}>No consumables required</p>
            )}
          </FormSection>

                    {/* Scheduling */}
          {!multiMode && (
          <FormSection title="Scheduling" icon={<Calendar size={18} />}>
            <FormField label="Start Date" required>
              <input
                type="date"
                value={formData.scheduled_start_date}
                onChange={(e) => handleInputChange('scheduled_start_date', e.target.value)}
                style={inputStyle}
              />
            </FormField>

            <FormField label="End Date">
              <input
                type="date"
                value={formData.scheduled_end_date}
                onChange={(e) => handleInputChange('scheduled_end_date', e.target.value)}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Start Time">
              <input
                type="time"
                value={formData.scheduled_start_time || ''}
                onChange={(e) => handleInputChange('scheduled_start_time', e.target.value)}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Estimated Hours">
              <input
                type="number"
                value={formData.estimated_hours}
                onChange={(e) => handleInputChange('estimated_hours', e.target.value)}
                placeholder="8"
                min="0"
                step="0.5"
                style={inputStyle}
              />
            </FormField>
          </FormSection>
          )}
        </div>

        {formData.task_category === 'vineyard' && multiMode && (
          <div style={{ gridColumn: '1 / -1' }}>
            <FormSection title="Apply to Multiple Blocks" icon={<MapPin size={18} />}>
              <div style={{ width: '100%' }}>
                <div style={{
                  width: '100%',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'white'
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 2fr 1.5fr 1.5fr 2fr',
                    gap: 0,
                    background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    width: '100%'
                  }}>
                    <div style={{ padding: '0.625rem', fontWeight: 600 }}>✓</div>
                    <div style={{ padding: '0.625rem', fontWeight: 600 }}>Block</div>
                    <div style={{ padding: '0.625rem', fontWeight: 600 }}>Start Date</div>
                    <div style={{ padding: '0.625rem', fontWeight: 600 }}>End Date</div>
                    <div style={{ padding: '0.625rem', fontWeight: 600 }}>Assignees</div>
                  </div>

                  {blockRows.length === 0 ? (
                    <div style={{ padding: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
                      No blocks to show.
                    </div>
                  ) : blockRows.map(row => (
                    <div
                      key={row.block_id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '56px 2fr 1.5fr 1.5fr 2fr',
                        borderBottom: '1px solid #f3f4f6',
                        width: '100%'
                      }}
                    >
                      <div style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleRow(row.block_id)}
                        />
                      </div>
                      <div style={{ padding: '0.5rem', display: 'flex', alignItems: 'center' }}>
                        {getBlockName(row.block_id)}
                      </div>
                      <div style={{ padding: '0.5rem' }}>
                        <input
                          type="date"
                          value={row.start_date}
                          onChange={(e) => setRowDate(row.block_id, 'start_date', e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ padding: '0.5rem' }}>
                        <input
                          type="date"
                          value={row.end_date}
                          onChange={(e) => setRowDate(row.block_id, 'end_date', e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ padding: '0.5rem' }}>
                        <select
                          multiple
                          value={row.user_ids.map(String)}
                          onChange={(e) => {
                            const ids = Array.from(e.target.options)
                              .filter(o => o.selected)
                              .map(o => parseInt(o.value));
                            setRowUsers(row.block_id, ids);
                          }}
                          style={{ ...inputStyle, height: 96 }}
                          disabled={companyUsers.length === 0}
                        >
                          {companyUsers.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.full_name || u.name || u.email}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                  Selected rows will create one task per block with its own assignees and schedule.
                </p>
              </div>
            </FormSection>
          </div>
        )}

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
      {label && (
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
      )}
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

export default TaskCreationWizard;