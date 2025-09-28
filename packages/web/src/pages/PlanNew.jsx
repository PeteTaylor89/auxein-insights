import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { 
  ClipboardList, 
  ArrowLeft, 
  MapPin, 
  Target, 
  PlayCircle
} from 'lucide-react';
import { observationService, authService, blocksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import TemplateUsageWarning from '../components/TemplateUsageWarning'; // Import our new component

const asArray = (v) => (Array.isArray(v) ? v : v?.blocks ?? v?.items ?? v?.results ?? v?.data ?? []);

function readTemplateFields(tpl) {
  if (!tpl) return [];
  const s = tpl.schema?.fields ?? tpl.schema ?? tpl.fields_json ?? [];
  return Array.isArray(s) ? s : Array.isArray(s.fields) ? s.fields : [];
}

export default function PlanNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const companyId = authService.getCompanyId();

  // Basic form fields
  const [name, setName] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(String(location.state?.template?.id ?? ''));
  const [template, setTemplate] = useState(null);
  const [instructions, setInstructions] = useState('');

  // Template usage warning state
  const [templateUsage, setTemplateUsage] = useState(null);
  const [showUsageWarning, setShowUsageWarning] = useState(false);
  const [checkingUsage, setCheckingUsage] = useState(false);

  // Blocks and targets
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
        const [tplRes, blkRes] = await Promise.all([
          observationService.getTemplates?.({ include_system: true }).catch(() => []),
          blocksService.getCompanyBlocks().catch(() => []),
        ]);

        if (!mounted) return;
        
        setTemplates(asArray(tplRes));
        setBlocks(asArray(blkRes));

        console.log('Loaded data:', { 
          templates: asArray(tplRes).length, 
          blocks: asArray(blkRes).length
        });

      } catch (e) {
        console.error('Failed to load data:', e);
        if (mounted) setError('Failed to load templates or blocks');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [companyId]);

  // When templateId changes, find template object AND check usage
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!templateId) { 
        setTemplate(null); 
        setTemplateUsage(null);
        setShowUsageWarning(false);
        return; 
      }
      
      const known = templates.find(t => String(t.id) === String(templateId));
      if (known?.schema || known?.fields_json) {
        setTemplate(known);
      } else {
        // Fetch full template (ensure we have schema)
        try {
          const full = await observationService.getTemplate?.(templateId);
          if (!mounted) return;
          setTemplate(full || known || null);
        } catch {
          if (!mounted) return;
          setTemplate(known || null);
        }
      }

      // Check template usage for existing plans
      if (observationService.checkTemplateUsage) {
        try {
          setCheckingUsage(true);
          const usage = await observationService.checkTemplateUsage(templateId, companyId);
          if (!mounted) return;
          
          setTemplateUsage(usage);
          setShowUsageWarning(usage?.suggestion?.show_warning || false);
        } catch (e) {
          console.warn('Failed to check template usage:', e);
          // Don't show error to user, just continue without warning
        } finally {
          if (mounted) setCheckingUsage(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [templateId, templates, companyId]);

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

  const canSubmit = name.trim() && templateId && getSelectedTargets().length > 0;

  const submit = async (startNow = false) => {
    if (!canSubmit) return;
    
    try {
      setBusy(true);
      setError(null);

      const payload = {
        company_id: companyId,
        template_id: Number(templateId),
        name: name.trim(),
        scheduled_for: startNow ? dayjs().format('YYYY-MM-DD') : null,
        targets: getSelectedTargets(),
        instructions: instructions || null,
      };

      console.log('Creating plan with payload:', payload);

      const res = await observationService.createPlan(payload);
      const planId = res?.id || res?.plan_id;
      
      if (planId) {
        navigate(`/plandetail/${planId}`, { replace: true });
      } else {
        navigate('/observations');
      }
    } catch (e) {
      console.error('Failed to create plan:', e);
      const detail = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Failed to create plan';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to create plan.' : String(detail));
    } finally {
      setBusy(false);
    }
  };

  const handleViewExistingPlan = (planId) => {
    navigate(`/plandetail/${planId}`);
  };

  const handleDismissWarning = () => {
    setShowUsageWarning(false);
  };

  const handleProceedAnyway = () => {
    setShowUsageWarning(false);
    // User can continue with form normally after dismissing
  };

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 1rem' }}>
      {/* Back button */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/observations'))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      {/* Header */}
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>New Observation Plan</span>
      </div>

      {loading && <div className="stat-card" style={{ marginTop: 12 }}>Loading…</div>}
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
                <div>Template {checkingUsage && <span style={{ fontSize: 12, color: '#666' }}>(checking for existing plans...)</span>}</div>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">— Select a template —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t?.name || t?.observation_type || `Template #${t.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Template usage warning */}
            {showUsageWarning && templateUsage && (
              <TemplateUsageWarning
                templateUsage={templateUsage}
                onDismiss={handleDismissWarning}
                onProceedAnyway={handleProceedAnyway}
                onViewPlan={handleViewExistingPlan}
              />
            )}
          </section>

          {/* Targets (Blocks) - Table Format */}
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
                No blocks found for your company. Check that blocks are properly configured.
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

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button 
              className="btn" 
              disabled={!canSubmit || busy} 
              onClick={() => submit(false)} 
              style={{ background: '#4e638bff', color: '#fff' }}
            >
              Create Plan
            </button>
            <button 
              className="btn" 
              disabled={!canSubmit || busy} 
              onClick={() => submit(true)} 
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff' }}
            >
              <PlayCircle size={18}/> Create & Start Now
            </button>
          </div>

          <MobileNavigation />
        </div>
      )}
    </div>
  );
}