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
import TemplateUsageWarning from '../components/TemplateUsageWarning';
import './vineyard-pages.css';

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

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

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
  };

  if (loading) {
    return (
      <div className="vp-page">
        <div className="vp-loading">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="vp-page">
      <div className="page-container">

        {/* Back button */}
        <button
          className="vp-back"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/observations'))}
        >
          <ArrowLeft size={16} /> Back
        </button>

        {/* Header */}
        <div className="vp-card">
          <div className="vp-card-header">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <ClipboardList size={24} /> New Observation Plan
            </h1>
          </div>
        </div>

        {error && (
          <div className="vp-error-alert">
            {error}
          </div>
        )}

        {/* Plan Details */}
        <div className="vp-card">
          <h3 className="vp-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Target size={18} /> Plan Details
          </h3>

          <div className="vp-form-group">
            <label className="vp-label">
              Plan Name
            </label>
            <input
              className="vp-input"
              placeholder="e.g. Phenology tracking — Block A"
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
              Template {checkingUsage && <span className="vp-hint">(checking for existing plans...)</span>}
            </label>
            <select
              className="vp-select"
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
        </div>

        {/* Targets (Blocks) */}
        <div className="vp-card">
          <div className="vp-card-header">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <MapPin size={18} /> Targets (Blocks)
            </h2>
            <span className="vp-hint">
              Select blocks and configure observation details
            </span>
          </div>

          {blocks.length === 0 && (
            <div className="vp-empty">
              No blocks found for your company. Check that blocks are properly configured.
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
                          className={target.selected ? 'selected' : ''}
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
                            {displayVariety || '—'}
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
                  <div style={{ fontWeight: '600', marginBottom: 'var(--space-xs)', color: 'var(--color-info)' }}>
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
              <span className="vp-hint">
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
                      <td className="bold">{f.label || '—'}</td>
                      <td>{f.name || '—'}</td>
                      <td>{f.required ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="vp-actions">
          <button
            className="btn-ghost"
            disabled={!canSubmit || busy}
            onClick={() => submit(false)}
          >
            Create Plan
          </button>
          <button
            className="btn-primary"
            disabled={!canSubmit || busy}
            onClick={() => submit(true)}
          >
            <PlayCircle size={16}/> Create & Start Now
          </button>
        </div>

      </div>
    </div>
  );
}
