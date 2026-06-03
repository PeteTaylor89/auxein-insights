// src/pages/TaskCreationWizard.jsx
// REVISED - Matches actual API schema

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@vineyard/shared';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Save, X, Calendar, MapPin, Clock, Users,
  Wrench, Package, FileText, AlertCircle, Plus, Settings, Star, Droplets, Check
} from 'lucide-react';
import { tasksService, assetService, blocksService, adminService, spatialAreasService, usersService, contractorManagementService, byNatural } from '@vineyard/shared';
import RiskLocationMap from '../components/RiskLocationMap';
import RiskHazardChips from '../components/risks/RiskHazardChips';
import './vineyard-pages.css';

function TaskCreationWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [companyUsers, setCompanyUsers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const templateFromState = location.state?.template;
  const templateIdFromQuery = searchParams.get('template');
  const [multiMode, setMultiMode] = useState(false);
  const [blockRows, setBlockRows] = useState([]);
  const [scheduleIsRange, setScheduleIsRange] = useState(false);

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
    assigned_contractors: [],
    assigned_teams: []
  });

  // UI state
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [equipmentRates, setEquipmentRates] = useState({});  // equipId -> target application rate (L/ha) string
  const [sprayCaps, setSprayCaps] = useState({});            // assetId -> server spray-capability result (or null on error)
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
          const list = Array.isArray(res) ? res : (res.blocks || res.items || []);
          // Natural sort — "Block 2" < "Block 10".
          setBlocks([...list].sort(byNatural('block_name')));
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
    const fetchAssignables = async () => {
      try {
        setLoadingUsers(true);
        const [users, rels] = await Promise.all([
          usersService.getCompanyUsers().catch(() => []),
          contractorManagementService.listRelationships().catch(() => []),
        ]);
        const activeUsers = (Array.isArray(users) ? users : [])
          .filter(u => u.is_active !== false && !u.is_suspended);
        setCompanyUsers(activeUsers);

        const activeContractors = (Array.isArray(rels) ? rels : [])
          .filter(r => r.status === 'active')
          .sort((a, b) => {
            const aPref = a.relationship_type === 'preferred_contractor' ? 0 : 1;
            const bPref = b.relationship_type === 'preferred_contractor' ? 0 : 1;
            if (aPref !== bPref) return aPref - bPref;
            return (a.contractor_name || '').localeCompare(b.contractor_name || '');
          });
        setContractors(activeContractors);
      } catch (error) {
        console.error('Failed to load assignable users/contractors:', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    if (user?.company_id) {
      fetchAssignables();
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

  const handleToggleContractor = (contractorId) => {
    setTaskAssignments(prev => {
      const already = prev.assigned_contractors.includes(contractorId);
      return {
        ...prev,
        assigned_contractors: already
          ? prev.assigned_contractors.filter(id => id !== contractorId)
          : [...prev.assigned_contractors, contractorId],
      };
    });
  };

  const getContractorName = (contractorId) => {
    const rel = contractors.find(c => c.contractor_id === contractorId);
    return rel ? rel.contractor_name : `Contractor #${contractorId}`;
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

  // Spray-coverage helpers — a "spray implement" is any equipment with a swath
  // width (the asset payload already carries swath_width_m).
  const getEquipAsset = (equipId) => equipmentAssets.find(a => a.id === equipId) || null;
  const isSprayImplement = (equipId) => {
    const a = getEquipAsset(equipId);
    return !!a && a.swath_width_m != null && Number(a.swath_width_m) > 0;
  };

  // Flow resolution is server-authoritative (latest calibration / inline spec), so
  // fetch capability for each selected swath-implement we haven't checked yet.
  useEffect(() => {
    const ids = taskAssets.required_equipment.filter(
      (id) => isSprayImplement(id) && sprayCaps[id] === undefined
    );
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(ids.map(async (id) => {
        try { return [id, await assetService.getSprayCapability(id)]; }
        catch { return [id, null]; }
      }));
      if (cancelled) return;
      setSprayCaps((prev) => {
        const next = { ...prev };
        for (const [id, cap] of results) next[id] = cap;
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskAssets.required_equipment, equipmentAssets]);

  // One checklist row for the spray-coverage readiness panel.
  const sprayCheckRow = (ok, label, hint) => (
    <div className="vp-flex-row" style={{ alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
      {ok
        ? <Check size={14} color="var(--color-success)" style={{ flexShrink: 0 }} />
        : <AlertCircle size={14} color="var(--color-warning)" style={{ flexShrink: 0 }} />}
      <span>{label}</span>
      {!ok && hint && <span style={{ color: 'var(--color-text-muted)' }}>— {hint}</span>}
    </div>
  );

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
          // End-date defaults to start-date when blank → single-day task. Empty
          // string would 422 the Pydantic date parser.
          const rowStart = row.start_date || formData.scheduled_start_date || null;
          const rowEnd = row.end_date || rowStart;
          const perTaskPayload = {
            ...formData,
            block_id: row.block_id,
            spatial_area_id: null,
            location_type: null,
            scheduled_start_date: rowStart,
            scheduled_end_date: rowEnd,
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
              quantity: 1,
              planned_rate: equipmentRates[equipId] != null && equipmentRates[equipId] !== ''
                ? parseFloat(equipmentRates[equipId]) : null,
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
      // Default end_date to start_date when the schedule isn't a range — a single-day
      // task. Empty string would 422 the Pydantic date parser.
      const startDate = formData.scheduled_start_date || null;
      const endDate = formData.scheduled_end_date || startDate;
      const taskPayload = {
        ...formData,
        scheduled_start_date: startDate,
        scheduled_end_date: endDate,
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
          quantity: 1,
          planned_rate: equipmentRates[equipId] != null && equipmentRates[equipId] !== ''
            ? parseFloat(equipmentRates[equipId]) : null,
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

      // 5) Assign contractors (one ContractorAssignment per pick)
      if (taskAssignments.assigned_contractors.length > 0) {
        for (const contractorId of taskAssignments.assigned_contractors) {
          try {
            await contractorManagementService.assignToTask(newTask.id, {
              contractor_id: contractorId,
              work_description: formData.title || 'Task assignment',
            });
          } catch (err) {
            console.error(`Failed to assign contractor ${contractorId}:`, err);
          }
        }
      }

      // 6) Navigate to the new task
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
      <div className="vp-page">
        <div className="vp-loading">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-base)' }}>⏳</div>
            <div>Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vp-page">
      {/* Header */}
      <div className="vp-header-bar">
        <div className="vp-header-bar-inner">
          <div className="vp-header-bar-left">
            <button onClick={handleCancel} className="vp-back-icon">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1>Create New Task</h1>
              <p>
                {templateFromState || templateIdFromQuery
                  ? `Creating from template: ${formData.title || 'Template'}`
                  : 'Create a new task from scratch'}
              </p>
            </div>
          </div>

          <div className="vp-actions">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="vp-btn-cancel"
            >
              <X size={16} /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="vp-btn-save"
            >
              <Save size={16} /> {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="vp-container">
          <div className="vp-error-alert">
            <div className="vp-flex-row" style={{ alignItems: 'center' }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="vp-error-close">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Form Content */}
      <div className="vp-form-grid">
        {/* Left Column */}
        <div className="vp-col">

          {/* Basic Information */}
          <FormSection title="Basic Information" icon={<FileText size={18} />}>
            <FormField label="Task Title" required>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Winter Pruning - Block A"
                className="vp-input"
              />
            </FormField>

            <FormField label="Category" required>
              <select
                value={formData.task_category}
                onChange={(e) => handleInputChange('task_category', e.target.value)}
                className="vp-select"
              >
                <option value="vineyard">🍇 Vineyard</option>
                <option value="land_management">🌱 Land Management</option>
                <option value="compliance">📋 Compliance</option>
                <option value="general">📌 General</option>
              </select>
            </FormField>

            {formData.task_category === 'vineyard' && (
              <div>
                <label className="vp-checkbox" style={{ marginBottom: 'var(--space-sm)' }}>
                  <input
                    type="checkbox"
                    checked={formData.requires_gps_tracking}
                    onChange={(e) => handleInputChange('requires_gps_tracking', e.target.checked)}
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
                className="vp-input"
              />
            </FormField>

            <FormField label="Priority" required>
              <select
                value={formData.priority}
                onChange={(e) => handleInputChange('priority', e.target.value)}
                className="vp-select"
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
                className="vp-textarea"
              />
            </FormField>
          </FormSection>



          {/* Location */}
          {(
            <FormSection title="Location" icon={<MapPin size={18} />}>

              {/* Vineyard → Blocks (multi-select checkboxes) */}
              {formData.task_category === 'vineyard' && (
                <FormField label="Blocks">
                  <div style={{
                    maxHeight: '200px', overflowY: 'auto',
                    border: '1px solid var(--color-border)', borderRadius: '6px',
                    padding: 'var(--space-xs)',
                  }}>
                    {blocks.length === 0 ? (
                      <div style={{ padding: 'var(--space-sm)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No blocks available</div>
                    ) : blocks.map(block => {
                      const checked = blockRows.some(r => r.block_id === block.id && r.selected)
                        || formData.block_id === block.id;
                      return (
                        <label key={block.id} className="vp-checkbox" style={{ display: 'flex', padding: '4px 8px', margin: 0, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (!multiMode) {
                                // First selection — set single block_id
                                if (formData.block_id === block.id) {
                                  handleInputChange('block_id', null);
                                } else if (formData.block_id && formData.block_id !== block.id) {
                                  // Second block selected — switch to multi-mode
                                  setMultiMode(true);
                                  // blockRows will be populated by the useEffect, then we toggle both
                                  setTimeout(() => {
                                    setBlockRows(prev => prev.map(r => ({
                                      ...r,
                                      selected: r.block_id === formData.block_id || r.block_id === block.id,
                                    })));
                                    handleInputChange('block_id', null);
                                  }, 50);
                                } else {
                                  handleInputChange('block_id', block.id);
                                }
                              } else {
                                // In multi-mode — toggle this row
                                const wasSelected = blockRows.find(r => r.block_id === block.id)?.selected;
                                toggleRow(block.id);
                                // If unchecking leaves ≤1 selected, revert to single mode
                                const remaining = blockRows.filter(r => r.selected && r.block_id !== block.id).length
                                  + (wasSelected ? 0 : 1);
                                if (remaining <= 1) {
                                  const singleId = blockRows.find(r => r.selected && r.block_id !== block.id)?.block_id
                                    || (!wasSelected ? block.id : null);
                                  setMultiMode(false);
                                  handleInputChange('block_id', singleId);
                                }
                              }
                            }}
                          />
                          <span style={{ fontSize: '0.875rem' }}>
                            {block.name || block.block_name || `Block #${block.id}`}
                            {block.area_hectares && ` (${block.area_hectares} ha)`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {multiMode && (
                    <div style={{ marginTop: 'var(--space-xs)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {blockRows.filter(r => r.selected).length} block{blockRows.filter(r => r.selected).length !== 1 ? 's' : ''} selected — one task will be created per block
                    </div>
                  )}
                </FormField>
              )}

              {/* Land Management → Spatial Areas */}
              {formData.task_category === 'land_management' && (
                <FormField label="Spatial Area">
                  <select
                    value={formData.spatial_area_id || ''}
                    onChange={(e) => handleInputChange('spatial_area_id', e.target.value ? parseInt(e.target.value) : null)}
                    className="vp-select"
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
                  <div className="vp-flex-row" style={{ alignItems: 'center' }}>
                    <button type="button" onClick={() => setShowMap(true)} className="vp-btn-pin">
                      <MapPin size={16} /> Drop a pin
                    </button>
                    {mapGeometry && <span className="vp-pin-status">Pin set ✓</span>}
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
                  className="vp-textarea"
                />
              </FormField>

              {(() => {
                const blockIds = multiMode
                  ? blockRows.filter((r) => r.selected).map((r) => r.block_id)
                  : (formData.block_id ? [formData.block_id] : []);
                const firstBlock = blocks.find((b) => b.id === blockIds[0]);
                const propertyId = firstBlock?.property_id ?? null;
                return (
                  <RiskHazardChips
                    blockIds={blockIds}
                    spatialAreaId={formData.spatial_area_id || null}
                    propertyId={propertyId}
                  />
                );
              })()}
            </FormSection>
          )}

        </div>

        {/* Right Column */}
        <div className="vp-col">

          {/* Assignments */}
          {!multiMode && (
            <FormSection title="Assign To" icon={<Users size={18} />}>
              {/* Users */}
              <FormField label="Assign Users">
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <select
                    value=""
                    onChange={(e) => {
                      const userId = parseInt(e.target.value);
                      if (userId && !taskAssignments.assigned_users.includes(userId)) {
                        setTaskAssignments(prev => ({
                          ...prev,
                          assigned_users: [...prev.assigned_users, userId]
                        }));
                      }
                    }}
                    className="vp-select"
                    style={{ width: '100%' }}
                    disabled={companyUsers.length === 0}
                  >
                    <option value="">
                      {companyUsers.length === 0 ? 'No users available' : 'Select user to assign...'}
                    </option>
                    {companyUsers
                      .filter(u => !taskAssignments.assigned_users.includes(u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.name || u.email}
                        </option>
                    ))}
                  </select>
                </div>

                {taskAssignments.assigned_users.length > 0 ? (
                  <div className="vp-flex-col">
                    {taskAssignments.assigned_users.map((userId) => (
                      <div key={userId} className="vp-selected-item">
                        <span>{getUserName(userId)}</span>
                        <button
                          onClick={() => handleRemoveUser(userId)}
                          className="vp-btn-remove"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="vp-empty-state">No users assigned</p>
                )}
              </FormField>

              <FormField label="Assign Contractors">
                {contractors.length === 0 ? (
                  <p className="vp-empty-state">
                    No active contractor relationships. Add one in Company → Relationships.
                  </p>
                ) : (
                  <div className="vp-flex-col" style={{ gap: 'var(--space-xs)' }}>
                    {contractors.map((c) => {
                      const checked = taskAssignments.assigned_contractors.includes(c.contractor_id);
                      const isPreferred = c.relationship_type === 'preferred_contractor';
                      return (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-sm)',
                            padding: 'var(--space-xs) var(--space-sm)',
                            borderRadius: 'var(--radius-sm)',
                            background: checked ? 'var(--color-surface-warm)' : 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleContractor(c.contractor_id)}
                          />
                          {isPreferred && <Star size={12} fill="#f59e0b" color="#f59e0b" />}
                          <span style={{ flex: 1 }}>{c.contractor_name}</span>
                          {c.contact_person && (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                              {c.contact_person}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </FormField>

            </FormSection>
          )}
          {/* Required Equipment */}
          <FormSection title="Required Equipment" icon={<Wrench size={18} />}>
            <div className="vp-flex-row" style={{ marginBottom: 'var(--space-md)' }}>
              <select
                value={selectedEquipment}
                onChange={(e) => setSelectedEquipment(e.target.value)}
                className="vp-select"
                style={{ flex: 1 }}
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
                className="vp-btn-add-inline"
              >
                <Plus size={16} />
              </button>
            </div>

            {taskAssets.required_equipment.length > 0 ? (
              <div className="vp-flex-col">
                {taskAssets.required_equipment.map((equipId) => {
                  const spray = isSprayImplement(equipId);
                  const cap = sprayCaps[equipId];
                  return (
                    <div key={equipId} className="vp-flex-col" style={{ gap: 6 }}>
                      <div className="vp-selected-item">
                        <span>
                          {getAssetName(equipId)}
                          {spray && (
                            <span className="badge badge--info" style={{ marginLeft: 8 }}>
                              <Droplets size={11} style={{ verticalAlign: -1 }} /> Sprayer
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => handleRemoveEquipment(equipId)}
                          className="vp-btn-remove"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {spray && (
                        <div className="vp-flex-row" style={{ gap: 8, alignItems: 'center', paddingLeft: 4 }}>
                          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Target rate</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={equipmentRates[equipId] ?? ''}
                            onChange={(e) => setEquipmentRates((prev) => ({ ...prev, [equipId]: e.target.value }))}
                            placeholder="L/ha (optional)"
                            className="vp-input"
                            style={{ maxWidth: 160 }}
                          />
                          {cap && !cap.has_flow && (
                            <span className="badge badge--warning">No L/s flow calibration</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="vp-empty-state">No required equipment</p>
            )}

            {(() => {
              const sprayIds = taskAssets.required_equipment.filter(isSprayImplement);
              if (sprayIds.length === 0) return null;
              const flowLoading = sprayIds.some((id) => sprayCaps[id] === undefined);
              const flowOk = sprayIds.some((id) => sprayCaps[id]?.has_flow);
              const blockChosen = !!formData.block_id || blockRows.some((r) => r.selected);
              const gpsOn = !!formData.requires_gps_tracking;
              const ready = flowOk && blockChosen && gpsOn;
              return (
                <div className="alert alert--info" style={{ marginTop: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <Droplets size={16} /> Spray coverage map
                  </div>
                  {sprayCheckRow(true, 'Spray implement attached (swath set)')}
                  {flowLoading
                    ? <div className="vp-flex-row" style={{ gap: 8, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>Checking flow calibration…</div>
                    : sprayCheckRow(flowOk, 'Flow calibration in L/s', 'record a flow calibration (L/s) on the asset')}
                  {sprayCheckRow(blockChosen, 'Block assigned', 'select a block for this task')}
                  {sprayCheckRow(gpsOn, 'GPS tracking enabled', 'enable GPS tracking for this task')}
                  <div style={{ marginTop: 6, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    {ready
                      ? 'A coverage map will be generated when this task is completed with a GPS track.'
                      : 'Resolve the items above so a coverage map can be generated on completion.'}
                  </div>
                </div>
              );
            })()}
          </FormSection>

          {/* Required Consumables */}
          <FormSection title="Required Consumables" icon={<Package size={18} />}>
            <button
              onClick={handleAddConsumable}
              className="vp-btn-add"
            >
              <Plus size={16} /> Add Consumable
            </button>

            {taskAssets.required_consumables.length > 0 ? (
              <div className="vp-flex-col" style={{ marginTop: 'var(--space-md)' }}>
                {taskAssets.required_consumables.map((consumable, index) => (
                  <div key={index} className="vp-consumable-card">
                    <div className="vp-flex-row" style={{ marginBottom: 'var(--space-sm)' }}>
                      <select
                        value={consumable.asset_id || ''}
                        onChange={(e) => handleUpdateConsumable(index, 'asset_id', e.target.value ? parseInt(e.target.value) : null)}
                        className="vp-select"
                        style={{ flex: 1 }}
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
                        className="vp-btn-remove"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="vp-flex-row">
                      <input
                        type="number"
                        value={consumable.quantity}
                        onChange={(e) => handleUpdateConsumable(index, 'quantity', e.target.value)}
                        placeholder="Quantity"
                        step="0.1"
                        className="vp-input"
                        style={{ flex: 1 }}
                      />
                      <select
                        value={consumable.unit}
                        onChange={(e) => handleUpdateConsumable(index, 'unit', e.target.value)}
                        className="vp-select"
                        style={{ flex: 1 }}
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
              <p className="vp-empty-state" style={{ marginTop: 'var(--space-md)' }}>No consumables required</p>
            )}
          </FormSection>

                    {/* Scheduling */}
          {!multiMode && (
          <FormSection title="Scheduling" icon={<Calendar size={18} />}>
            <FormField label="Schedule">
              <input
                type="date"
                value={formData.scheduled_start_date}
                onChange={(e) => handleInputChange('scheduled_start_date', e.target.value)}
                className="vp-input"
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={scheduleIsRange}
                  onChange={(e) => {
                    setScheduleIsRange(e.target.checked);
                    if (!e.target.checked) {
                      handleInputChange('scheduled_end_date', '');
                    }
                  }}
                />
                Spans a date range
              </label>
            </FormField>

            {scheduleIsRange && (
              <FormField label="End Date">
                <input
                  type="date"
                  value={formData.scheduled_end_date}
                  onChange={(e) => handleInputChange('scheduled_end_date', e.target.value)}
                  className="vp-input"
                />
              </FormField>
            )}

            <FormField label="Start Time">
              <input
                type="time"
                value={formData.scheduled_start_time || ''}
                onChange={(e) => handleInputChange('scheduled_start_time', e.target.value)}
                className="vp-input"
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
                className="vp-input"
              />
            </FormField>
          </FormSection>
          )}
        </div>

        {formData.task_category === 'vineyard' && multiMode && (
          <div className="vp-col-span-full">
            <FormSection title="Apply to Multiple Blocks" icon={<MapPin size={18} />}>
              <div style={{ width: '100%' }}>
                <div className="vp-multi-block-table">
                  <div className="vp-multi-block-head">
                    <div>✓</div>
                    <div>Block</div>
                    <div>Start Date</div>
                    <div>End Date</div>
                    <div>Assignees</div>
                  </div>

                  {blockRows.length === 0 ? (
                    <div style={{ padding: 'var(--space-md)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      No blocks to show.
                    </div>
                  ) : blockRows.map(row => (
                    <div key={row.block_id} className="vp-multi-block-row">
                      <div>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleRow(row.block_id)}
                        />
                      </div>
                      <div>
                        {getBlockName(row.block_id)}
                      </div>
                      <div>
                        <input
                          type="date"
                          value={row.start_date}
                          onChange={(e) => setRowDate(row.block_id, 'start_date', e.target.value)}
                          className="vp-input"
                        />
                      </div>
                      <div>
                        <input
                          type="date"
                          value={row.end_date}
                          onChange={(e) => setRowDate(row.block_id, 'end_date', e.target.value)}
                          className="vp-input"
                        />
                      </div>
                      <div>
                        <select
                          multiple
                          value={row.user_ids.map(String)}
                          onChange={(e) => {
                            const ids = Array.from(e.target.options)
                              .filter(o => o.selected)
                              .map(o => parseInt(o.value));
                            setRowUsers(row.block_id, ids);
                          }}
                          className="vp-select"
                          style={{ height: 96 }}
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

                <p className="vp-hint" style={{ marginTop: 'var(--space-sm)' }}>
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
    <div className="vp-section">
      <div className="vp-section-header">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div className="vp-form-group">
      {label && (
        <label className="vp-label">
          {label}
          {required && <span className="vp-required">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

export default TaskCreationWizard;
