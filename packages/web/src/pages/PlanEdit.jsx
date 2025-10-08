import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ClipboardList, 
  ArrowLeft, 
  MapPin, 
  Target, 
  Save
} from 'lucide-react';
import { observationService, authService, blocksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

const asArray = (v) => (Array.isArray(v) ? v : v?.blocks ?? v?.items ?? v?.results ?? v?.data ?? []);

function readTemplateFields(tpl) {
  if (!tpl) return [];
  const s = tpl.schema?.fields ?? tpl.schema ?? tpl.fields_json ?? [];
  return Array.isArray(s) ? s : Array.isArray(s.fields) ? s.fields : [];
}

export default function PlanEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const companyId = authService.getCompanyId();

  // Form fields
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [template, setTemplate] = useState(null);

  // Data
  const [originalPlan, setOriginalPlan] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [blockTargets, setBlockTargets] = useState({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const [planRes, tplRes, blkRes] = await Promise.all([
          observationService.getPlan(id),
          observationService.getTemplates({ include_system: true }).catch(() => []),
          blocksService.getCompanyBlocks().catch(() => []),
        ]);

        if (!mounted) return;
        
        const plan = planRes;
        setOriginalPlan(plan);
        setTemplates(asArray(tplRes));
        setBlocks(asArray(blkRes));

        setName(plan.name || '');
        setInstructions(plan.instructions || '');
        setTemplateId(String(plan.template_id || ''));

        const targetsMap = {};
        if (plan.targets) {
          plan.targets.forEach(target => {
            const rowLabels = target.row_labels || [];
            targetsMap[target.block_id] = {
              selected: true,
              rowStart: rowLabels[0] || '',
              rowEnd: rowLabels[1] || (rowLabels.length > 1 ? rowLabels[rowLabels.length - 1] : ''),
              spots: target.sample_size || 1
            };
          });
        }
        setBlockTargets(targetsMap);

        console.log('Plan loaded for editing:', plan);
        console.log('Populated blockTargets:', targetsMap);

      } catch (e) {
        console.error('Failed to load plan data:', e);
        if (mounted) setError('Failed to load plan data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [id, companyId]);

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!templateId) { 
        setTemplate(null); 
        return; 
      }
      
      const known = templates.find(t => String(t.id) === String(templateId));
      if (known?.schema || known?.fields_json) {
        setTemplate(known);
        return;
      }
      
      try {
        const full = await observationService.getTemplate?.(templateId);
        if (!mounted) return;
        setTemplate(full || known || null);
      } catch {
        if (!mounted) return;
        setTemplate(known || null);
      }
    })();
    return () => { mounted = false; };
  }, [templateId, templates]);

  const fields = useMemo(() => readTemplateFields(template), [template]);

  const toggleBlock = (id) => {
    const n = Number(id);
    setBlockTargets(prev => {
      const current = prev[n] || { selected: false, rowStart: '', rowEnd: '', spots: 1 };
      return {
        ...prev,
        [n]: { ...current, selected: !current.selected }
      };
    });
  };

  const updateBlockTarget = (id, field, value) => {
    const n = Number(id);
    setBlockTargets(prev => {
      const current = prev[n] || { selected: false, rowStart: '', rowEnd: '', spots: 1 };
      const newValue = field === 'spots' ? Math.max(1, Number(value) || 1) : value;
      return {
        ...prev,
        [n]: { ...current, [field]: newValue }
      };
    });
  };

  const getSelectedTargets = () => {
    return Object.entries(blockTargets)
      .filter(([id, target]) => target.selected)
      .map(([id, target]) => ({
        block_id: Number(id),
        row_start: target.rowStart || null,
        row_end: target.rowEnd || null,
        required_spots: target.spots
      }));
  };

  const hasChanges = () => {
    if (!originalPlan) return false;
    
    if (name !== (originalPlan.name || '')) return true;
    if (instructions !== (originalPlan.instructions || '')) return true;
    
    const currentTargets = getSelectedTargets();
    const originalTargets = originalPlan.targets || [];
    
    if (currentTargets.length !== originalTargets.length) return true;
    
    for (let i = 0; i < currentTargets.length; i++) {
      const current = currentTargets[i];
      const original = originalTargets.find(t => t.block_id === current.block_id);
      if (!original) return true;
      
      const origRowLabels = original.row_labels || [];
      const origRowStart = origRowLabels[0] || null;
      const origRowEnd = origRowLabels[1] || (origRowLabels.length > 1 ? origRowLabels[origRowLabels.length - 1] : null);
      
      if (current.row_start !== origRowStart) return true;
      if (current.row_end !== origRowEnd) return true;
      if (current.required_spots !== original.sample_size) return true;
    }
    
    return false;
  };

  const canSubmit = name.trim() && getSelectedTargets().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    
    try {
      setBusy(true);
      setError(null);

      const payload = {
        name: name.trim(),
        instructions: instructions || null,
        targets: getSelectedTargets(),
      };

      console.log('Updating plan with payload:', payload);

      const updatedPlan = await observationService.updatePlan(id, payload);
      navigate(`/plandetail/${updatedPlan.id}`, { replace: true });
    } catch (e) {
      console.error('Failed to update plan:', e);
      const detail = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Failed to update plan';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to update plan.' : String(detail));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Loading Plan Data...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
          <h2 style={{ color: '#dc2626' }}>❌ Error Loading Plan</h2>
          <p style={{ marginBottom: '1rem' }}>{error}</p>
          <button 
            onClick={() => navigate('/observations')} 
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Back to Observations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '1rem' 
      }}>
        
        {/* Back button */}
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={() => navigate(`/plandetail/${id}`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <ArrowLeft size={16} /> Back to Plan
          </button>
        </div>

        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: '1.5rem', 
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <ClipboardList size={24} /> Edit Observation Plan
          </h1>
        </div>

        {error && (
          <div style={{ 
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#dc2626'
          }}>
            {error}
          </div>
        )}

        {/* Plan Details */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{ 
            margin: '0 0 1rem 0', 
            fontSize: '1rem', 
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Target size={18} /> Plan Details
          </h3>
          
          <div style={{ display: 'grid', gap: '1rem' }}>
            <label>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                Plan Name
              </div>
              <input
                placeholder="e.g. Phenology tracking – Block A"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              />
            </label>

            <label>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                Instructions / Description
              </div>
              <textarea 
                rows={3} 
                value={instructions} 
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Any special instructions for this observation plan..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit'
                }}
              />
            </label>

            <label>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                Template (cannot be changed)
              </div>
              <div style={{ 
                padding: '0.75rem', 
                border: '1px solid #d1d5db', 
                borderRadius: '6px', 
                background: '#f9fafb',
                color: '#6b7280',
                fontSize: '0.875rem'
              }}>
                {template?.name || templates.find(t => String(t.id) === templateId)?.name || `Template #${templateId}`}
              </div>
              <small style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                Template cannot be changed after plan creation to preserve data integrity
              </small>
            </label>
          </div>
        </div>

        {/* Targets */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: '1rem', 
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <MapPin size={18} /> Targets (Blocks)
            </h3>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Select blocks and configure observation details
            </div>
          </div>

          {blocks.length === 0 && (
            <div style={{ 
              padding: '2rem', 
              color: '#6b7280', 
              background: '#f8fafc', 
              borderRadius: '8px',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              No blocks found for your company.
            </div>
          )}

          {blocks.length > 0 && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  fontSize: '0.875rem'
                }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Select</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Block Name</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Variety</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151', width: 100 }}>Row Start</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151', width: 100 }}>Row End</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151', width: 100 }}>Spots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map(b => {
                      const bid = Number(b.id ?? b.block_id);
                      const target = blockTargets[bid] || { selected: false, rowStart: '', rowEnd: '', spots: 1 };
                      const displayName = b.name ?? b.block_name ?? b.label ?? `Block ${bid}`;
                      const displayVariety = b.variety ?? b.variety_name ?? b.cultivar ?? b.clone ?? '';

                      return (
                        <tr 
                          key={bid} 
                          style={{ 
                            borderBottom: '1px solid #f3f4f6',
                            background: target.selected ? '#f0f9ff' : 'transparent'
                          }}
                          onMouseEnter={(e) => !target.selected && (e.target.closest('tr').style.background = '#f8fafc')}
                          onMouseLeave={(e) => !target.selected && (e.target.closest('tr').style.background = 'transparent')}
                        >
                          <td style={{ padding: 12 }}>
                            <input
                              type="checkbox"
                              checked={target.selected}
                              onChange={() => toggleBlock(bid)}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </td>
                          <td style={{ padding: 12, fontWeight: target.selected ? '600' : '400' }}>
                            {displayName}
                          </td>
                          <td style={{ padding: 12, color: '#6b7280' }}>
                            {displayVariety || '—'}
                          </td>
                          <td style={{ padding: 12 }}>
                            <input
                              type="text"
                              placeholder="1"
                              value={target.rowStart}
                              onChange={(e) => updateBlockTarget(bid, 'rowStart', e.target.value)}
                              disabled={!target.selected}
                              style={{
                                width: 80,
                                padding: '0.375rem 0.5rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                background: target.selected ? '#fff' : '#f9fafb',
                                opacity: target.selected ? 1 : 0.6,
                                fontSize: '0.813rem'
                              }}
                            />
                          </td>
                          <td style={{ padding: 12 }}>
                            <input
                              type="text"
                              placeholder="10"
                              value={target.rowEnd}
                              onChange={(e) => updateBlockTarget(bid, 'rowEnd', e.target.value)}
                              disabled={!target.selected}
                              style={{
                                width: 80,
                                padding: '0.375rem 0.5rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                background: target.selected ? '#fff' : '#f9fafb',
                                opacity: target.selected ? 1 : 0.6,
                                fontSize: '0.813rem'
                              }}
                            />
                          </td>
                          <td style={{ padding: 12 }}>
                            <input
                              type="number"
                              min="1"
                              value={target.spots}
                              onChange={(e) => updateBlockTarget(bid, 'spots', e.target.value)}
                              disabled={!target.selected}
                              style={{
                                width: 80,
                                padding: '0.375rem 0.5rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                background: target.selected ? '#fff' : '#f9fafb',
                                opacity: target.selected ? 1 : 0.6,
                                fontSize: '0.813rem'
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {getSelectedTargets().length > 0 && (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem', 
                  background: '#f0f9ff', 
                  borderRadius: '8px', 
                  border: '1px solid #bfdbfe' 
                }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', color: '#1e40af' }}>
                    Summary:
                  </div>
                  <div style={{ fontSize: '0.813rem', color: '#374151' }}>
                    {getSelectedTargets().length} block{getSelectedTargets().length === 1 ? '' : 's'} selected, {' '}
                    {getSelectedTargets().reduce((sum, t) => sum + t.required_spots, 0)} total observation spots per run
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Template Fields Preview */}
        {template && (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                {template.name} : Template Fields
              </h3>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {fields.length} field{fields.length === 1 ? '' : 's'}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontSize: '0.875rem'
              }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Label</th>
                    <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Name</th>
                    <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Required</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: 20, color: '#6b7280', textAlign: 'center', fontStyle: 'italic' }}>
                        No fields defined.
                      </td>
                    </tr>
                  )}
                  {fields.map((f, i) => (
                    <tr key={f.name ?? i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 10, fontWeight: '500' }}>{f.label || '—'}</td>
                      <td style={{ padding: 10 }}>{f.name || '—'}</td>
                      <td style={{ padding: 10 }}>{f.required ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Changes indicator */}
        {hasChanges() && (
          <div style={{ 
            padding: '0.75rem', 
            background: '#fef3c7', 
            border: '1px solid #f59e0b', 
            borderRadius: '8px', 
            color: '#92400e',
            marginBottom: '1.5rem',
            fontSize: '0.875rem'
          }}>
            <strong>Unsaved changes detected.</strong> Click "Update Plan" to save your changes.
          </div>
        )}

        {/* Actions */}
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          justifyContent: 'space-between',
          marginBottom: '1.5rem'
        }}>
          <button 
            onClick={() => navigate(`/plandetail/${id}`)}
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '6px', 
              background: '#f3f4f6',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151'
            }}
          >
            Cancel
          </button>
          <button 
            disabled={!canSubmit || busy || !hasChanges()}
            onClick={submit}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '0.5rem 1rem', 
              borderRadius: '6px', 
              background: canSubmit && hasChanges() && !busy ? '#059669' : '#9ca3af', 
              color: '#fff',
              border: 'none',
              cursor: canSubmit && hasChanges() && !busy ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <Save size={16} /> {busy ? 'Updating...' : 'Update Plan'}
          </button>
        </div>

        <MobileNavigation />
      </div>
    </div>
  );
}