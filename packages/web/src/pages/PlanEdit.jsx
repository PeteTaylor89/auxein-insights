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
  const [blockTargets, setBlockTargets] = useState({}); // { blockId: { selected: bool, rowStart: '', rowEnd: '', spots: number } }

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

        // Populate form with existing plan data
        setName(plan.name || '');
        setInstructions(plan.instructions || '');
        setTemplateId(String(plan.template_id || ''));

        // Convert targets to blockTargets format
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

  // When templateId changes, find template object
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
      
      // Fetch full template (ensure we have schema)
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
    // Remove template comparison since it's now locked
    
    // Check if targets have changed
    const currentTargets = getSelectedTargets();
    const originalTargets = originalPlan.targets || [];
    
    if (currentTargets.length !== originalTargets.length) return true;
    
    // Compare targets (simplified comparison)
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

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 1rem' }}>
      {/* Back button */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => navigate(`/plandetail/${id}`)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={16} /> Back to Plan
        </button>
      </div>

      {/* Header */}
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Edit Observation Plan</span>
      </div>

      {loading && <div className="stat-card" style={{ marginTop: 12 }}>Loading plan data…</div>}
      {error && <div className="stat-card" style={{ marginTop: 12, borderColor: 'red' }}>{error}</div>}

      {!loading && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          {/* Plan Basics */}
          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target /> Plan Details
            </h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <label>
                <div>Plan Name</div>
                <input
                  placeholder="e.g. Phenology tracking — Block A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label>
                <div>Instructions / Description</div>
                <textarea 
                  rows={3} 
                  value={instructions} 
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Any special instructions for this observation plan..."
                />
              </label>

              <label>
                <div>Template (cannot be changed)</div>
                <div style={{ 
                  padding: '8px 12px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: 6, 
                  background: '#f9fafb',
                  color: '#6b7280',
                  fontSize: 18
                }}>
                  {template?.name || templates.find(t => String(t.id) === templateId)?.name || `Template #${templateId}`}
                </div>
                <small style={{ color: '#666', fontSize: 12 }}>
                  Template cannot be changed after plan creation to preserve data integrity
                </small>
              </label>
            </div>
          </section>

          {/* Targets */}
          <section className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin /> Targets (Blocks)
              </h3>
              <div style={{ fontSize: 13, color: '#666' }}>
                Select blocks and configure observation details
              </div>
            </div>

            {blocks.length === 0 && (
              <div style={{ padding: 16, color: '#777', background: '#f9fafb', borderRadius: 8 }}>
                No blocks found for your company.
              </div>
            )}

            {blocks.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Select</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Block Name</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Variety</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, width: 100 }}>Row Start</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, width: 100 }}>Row End</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, width: 100 }}>Spots</th>
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
                          borderBottom: '1px solid #f2f2f2',
                          background: target.selected ? '#f0f9ff' : '#fff'
                        }}
                      >
                        <td style={{ padding: 12 }}>
                          <input
                            type="checkbox"
                            checked={target.selected}
                            onChange={() => toggleBlock(bid)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: 12, fontWeight: target.selected ? 600 : 400 }}>
                          {displayName}
                        </td>
                        <td style={{ padding: 12, color: '#6b7280', fontSize: 14 }}>
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
                              padding: '6px 8px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              background: target.selected ? '#fff' : '#f9fafb',
                              opacity: target.selected ? 1 : 0.6
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
                              padding: '6px 8px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              background: target.selected ? '#fff' : '#f9fafb',
                              opacity: target.selected ? 1 : 0.6
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
                              padding: '6px 8px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              background: target.selected ? '#fff' : '#f9fafb',
                              opacity: target.selected ? 1 : 0.6
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {getSelectedTargets().length > 0 && (
              <div style={{ marginTop: 12, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Summary:</div>
                <div style={{ fontSize: 13, color: '#374151' }}>
                  {getSelectedTargets().length} block{getSelectedTargets().length === 1 ? '' : 's'} selected, {' '}
                  {getSelectedTargets().reduce((sum, t) => sum + t.required_spots, 0)} total observation spots per run
                </div>
              </div>
            )}
          </section>

          {/* Template Fields Preview */}
          {template && (
            <section className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>{template.name} : Template Fields</h3>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {fields.length} field{fields.length === 1 ? '' : 's'}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={{ padding: 10 }}>Label</th>
                    <th style={{ padding: 10 }}>Name</th>
                    <th style={{ padding: 10 }}>Required</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: 14, color: '#777' }}>No fields defined.</td></tr>
                  )}
                  {fields.map((f, i) => (
                    <tr key={f.name ?? i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                      <td style={{ padding: 10, fontWeight: 500 }}>{f.label || '—'}</td>
                      <td style={{ padding: 10 }}>{f.name || '—'}</td>
                      <td style={{ padding: 10 }}>{f.required ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Changes indicator */}
          {hasChanges() && (
            <div style={{ padding: 12, background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, color: '#92400e' }}>
              <strong>Unsaved changes detected.</strong> Click "Update Plan" to save your changes.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <button 
              className="btn" 
              onClick={() => navigate(`/plandetail/${id}`)}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#f3f4f6' }}
            >
              Cancel
            </button>
            <button 
              className="btn" 
              disabled={!canSubmit || busy || !hasChanges()}
              onClick={submit}
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: 6, 
                padding: '8px 16px', 
                borderRadius: 8, 
                background: hasChanges() ? '#059669' : '#9ca3af', 
                color: '#fff' 
              }}
            >
              <Save size={16} /> {busy ? 'Updating...' : 'Update Plan'}
            </button>
          </div>

          <MobileNavigation />
        </div>
      )}
    </div>
  );
}