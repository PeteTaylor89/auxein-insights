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
import './vineyard-pages.css';

const asArray = (v) => (Array.isArray(v) ? v : v?.blocks ?? v?.items ?? v?.results ?? v?.data ?? []);

function readTemplateFields(tpl) {
  if (!tpl) return [];
  const s = tpl.field_schema ?? tpl.fields_json ?? tpl.schema?.fields ?? tpl.schema ?? [];
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
      <div className="vp-page page-container">
        <div className="vp-loading">
          <h2>Loading Plan Data...</h2>
        </div>
      </div>
    );
  }

  if (error && !originalPlan) {
    return (
      <div className="vp-page page-container">
        <div className="vp-loading">
          <div style={{ textAlign: 'center', maxWidth: '500px' }}>
            <h2 style={{ color: 'var(--color-danger)' }}>Error Loading Plan</h2>
            <p style={{ marginBottom: 'var(--space-base)' }}>{error}</p>
            <button
              onClick={() => navigate('/observations')}
              className="btn-primary"
            >
              Back to Observations
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vp-page">
      <div className="page-container">

        {/* Back button */}
        <button
          onClick={() => navigate(`/plandetail/${id}`)}
          className="vp-back"
        >
          <ArrowLeft size={16} /> Back to Plan
        </button>

        {/* Header */}
        <div className="vp-card">
          <div className="vp-card-header">
            <h1>
              <ClipboardList size={24} style={{ verticalAlign: 'middle', marginRight: 'var(--space-sm)' }} />
              Edit Observation Plan
            </h1>
          </div>
        </div>

        {error && (
          <div className="vp-error-alert">
            {error}
            <button className="vp-error-close" onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {/* Plan Details */}
        <div className="vp-card">
          <h3 className="vp-section-title">
            <Target size={18} style={{ verticalAlign: 'middle', marginRight: 'var(--space-sm)' }} />
            Plan Details
          </h3>

          <div className="vp-form-group">
            <label className="vp-label">
              Plan Name
            </label>
            <input
              className="vp-input"
              placeholder="e.g. Phenology tracking – Block A"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="vp-form-group">
            <label className="vp-label">
              Instructions / Description
            </label>
            <textarea
              className="vp-textarea"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Any special instructions for this observation plan..."
            />
          </div>

          <div className="vp-form-group">
            <label className="vp-label">
              Template (cannot be changed)
            </label>
            <div className="vp-input" style={{
              background: 'var(--color-surface-warm)',
              color: 'var(--color-text-muted)'
            }}>
              {template?.name || templates.find(t => String(t.id) === templateId)?.name || `Template #${templateId}`}
            </div>
            <span className="vp-hint">
              Template cannot be changed after plan creation to preserve data integrity
            </span>
          </div>
        </div>

        {/* Targets */}
        <div className="vp-card">
          <div className="vp-card-header">
            <h2>
              <MapPin size={18} style={{ verticalAlign: 'middle', marginRight: 'var(--space-sm)' }} />
              Targets (Blocks)
            </h2>
            <span className="vp-hint">
              Select blocks and configure observation details
            </span>
          </div>

          {blocks.length === 0 && (
            <div className="vp-empty">
              No blocks found for your company.
            </div>
          )}

          {blocks.length > 0 && (
            <>
              <div className="vp-table-wrap">
                <table className="vp-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Block Name</th>
                      <th>Variety</th>
                      <th style={{ width: 100 }}>Row Start</th>
                      <th style={{ width: 100 }}>Row End</th>
                      <th style={{ width: 100 }}>Spots</th>
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
                          style={target.selected ? { background: 'var(--color-olive-light)' } : undefined}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={target.selected}
                              onChange={() => toggleBlock(bid)}
                            />
                          </td>
                          <td className={target.selected ? 'bold' : ''}>
                            {displayName}
                          </td>
                          <td style={{ color: 'var(--color-text-muted)' }}>
                            {displayVariety || '\u2014'}
                          </td>
                          <td>
                            <input
                              className="vp-input"
                              type="text"
                              placeholder="1"
                              value={target.rowStart}
                              onChange={(e) => updateBlockTarget(bid, 'rowStart', e.target.value)}
                              disabled={!target.selected}
                              style={{ opacity: target.selected ? 1 : 0.6 }}
                            />
                          </td>
                          <td>
                            <input
                              className="vp-input"
                              type="text"
                              placeholder="10"
                              value={target.rowEnd}
                              onChange={(e) => updateBlockTarget(bid, 'rowEnd', e.target.value)}
                              disabled={!target.selected}
                              style={{ opacity: target.selected ? 1 : 0.6 }}
                            />
                          </td>
                          <td>
                            <input
                              className="vp-input"
                              type="number"
                              min="1"
                              value={target.spots}
                              onChange={(e) => updateBlockTarget(bid, 'spots', e.target.value)}
                              disabled={!target.selected}
                              style={{ opacity: target.selected ? 1 : 0.6 }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {getSelectedTargets().length > 0 && (
                <div className="vp-info-banner" style={{ marginTop: 'var(--space-base)' }}>
                  <div style={{ fontWeight: '600', marginBottom: 'var(--space-xs)' }}>
                    Summary:
                  </div>
                  <div>
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
          <div className="vp-card">
            <div className="vp-card-header">
              <h2>{template.name} : Template Fields</h2>
              <span className="vp-badge vp-badge--neutral">
                {fields.length} field{fields.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="vp-table-wrap">
              <table className="vp-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Name</th>
                    <th>Required</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.length === 0 && (
                    <tr>
                      <td colSpan={3} className="vp-empty">
                        No fields defined.
                      </td>
                    </tr>
                  )}
                  {fields.map((f, i) => (
                    <tr key={f.name ?? i}>
                      <td className="bold">{f.label || '\u2014'}</td>
                      <td>{f.name || '\u2014'}</td>
                      <td>{f.required ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Changes indicator */}
        {hasChanges() && (
          <div className="vp-warning-banner">
            <strong>Unsaved changes detected.</strong> Click "Update Plan" to save your changes.
          </div>
        )}

        {/* Actions */}
        <div className="vp-actions vp-actions--spread">
          <button
            onClick={() => navigate(`/plandetail/${id}`)}
            className="btn-ghost"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit || busy || !hasChanges()}
            onClick={submit}
            className="btn-primary"
            style={(!canSubmit || !hasChanges() || busy) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            <Save size={16} /> {busy ? 'Updating...' : 'Update Plan'}
          </button>
        </div>

      </div>
    </div>
  );
}
