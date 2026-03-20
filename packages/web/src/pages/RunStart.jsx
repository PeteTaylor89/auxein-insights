import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ClipboardList,
  ArrowLeft,
  PlayCircle,
  MapPin,
  AlertTriangle,
  CheckCircle,
  X,
  ExternalLink
} from 'lucide-react';
import { observationService, authService, blocksService } from '@vineyard/shared';
import './vineyard-pages.css';

const asArray = (v) => (Array.isArray(v) ? v : v?.blocks ?? v?.items ?? v?.results ?? v?.data ?? []);

export default function RunStart() {
  const navigate = useNavigate();
  const { planId } = useParams();
  const [searchParams] = useSearchParams();
  const suggestedBlockId = searchParams.get('block');
  const companyId = authService.getCompanyId();

  const [plan, setPlan] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(suggestedBlockId || '');
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Load plan and blocks
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const [planRes, blocksRes] = await Promise.all([
          observationService.getPlan(planId),
          blocksService.getCompanyBlocks().catch(() => [])
        ]);

        if (!mounted) return;

        setPlan(planRes);
        setBlocks(asArray(blocksRes));

        // Pre-select block if plan has only one target
        if (!selectedBlockId && planRes.targets?.length === 1) {
          setSelectedBlockId(String(planRes.targets[0].block_id));
        }

        console.log('Plan loaded for run start:', planRes);
      } catch (e) {
        console.error('Failed to load plan:', e);
        if (mounted) setError('Failed to load plan details');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [planId, selectedBlockId]);

  // Check conflicts when block selection changes
  useEffect(() => {
    if (!selectedBlockId || !plan) {
      setConflicts([]);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        const conflictResults = await observationService.checkRunConflicts(
          parseInt(planId),
          parseInt(selectedBlockId),
          companyId
        );

        if (!mounted) return;
        setConflicts(asArray(conflictResults));
      } catch (e) {
        console.error('Failed to check conflicts:', e);
        if (mounted) setConflicts([]);
      }
    })();

    return () => { mounted = false; };
  }, [selectedBlockId, planId, companyId, plan]);

  const blockMap = useMemo(() => {
    const m = new Map();
    for (const b of asArray(blocks)) {
      m.set(String(b.id), b.name || `Block ${b.id}`);
    }
    return m;
  }, [blocks]);

  const availableBlocks = useMemo(() => {
    // If plan has specific targets, only show those blocks
    if (plan?.targets?.length > 0) {
      return plan.targets.map(target => ({
        id: target.block_id,
        name: blockMap.get(String(target.block_id)) || `Block ${target.block_id}`,
        rowLabels: target.row_labels || [],
        sampleSize: target.sample_size || 1,
        notes: target.notes
      }));
    }

    // Otherwise show all company blocks
    return blocks.map(b => ({
      id: b.id,
      name: b.name || `Block ${b.id}`,
      variety: b.variety || b.variety_name || '',
      rowLabels: [],
      sampleSize: 1
    }));
  }, [plan, blocks, blockMap]);

  const hasConflicts = conflicts.length > 0;
  const canStart = selectedBlockId && !loading && !busy;

  const handleCancelConflictRun = async (runId) => {
    try {
      setBusy(true);
      await observationService.cancelRun(runId);

      // Refresh conflicts after cancellation
      const updated = await observationService.checkRunConflicts(
        parseInt(planId),
        parseInt(selectedBlockId),
        companyId
      );
      setConflicts(asArray(updated));
    } catch (e) {
      console.error('Failed to cancel run:', e);
      alert('Failed to cancel conflicting run');
    } finally {
      setBusy(false);
    }
  };

  const startRun = async (forceStart = false) => {
    if (!canStart) return;

    // If there are conflicts and not force starting, show warning
    if (hasConflicts && !forceStart) {
      const confirmed = window.confirm(
        `There are ${conflicts.length} active run(s) on this block. ` +
        'You can cancel them or choose a different block. Continue anyway?'
      );
      if (!confirmed) return;
    }

    try {
      setBusy(true);
      setError(null);

      // Use the enhanced createRun method with proper payload
      const payload = {
        plan_id: parseInt(planId),
        template_id: plan.template_id,
        company_id: companyId,
        block_id: parseInt(selectedBlockId), // This is the key fix
      };

      console.log('Starting run with payload:', payload);

      // Call createRun directly instead of startRun
      const run = await observationService.createRun(payload);

      if (run?.id) {
        navigate(`/observations/runcapture/${run.id}`, { replace: true });
      } else {
        throw new Error('Run creation failed - no ID returned');
      }
    } catch (e) {
      console.error('Failed to start run:', e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to start run';
      setError(Array.isArray(detail) ? detail[0]?.msg || detail : String(detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-container">
      {/* Back button */}
      <button
        className="vp-back"
        onClick={() => navigate(`/plandetail/${planId}`)}
      >
        <ArrowLeft size={16} /> Back to Plan
      </button>

      {/* Header */}
      <div className="vp-card">
        <div className="vp-card-header">
          <h2><ClipboardList style={{ verticalAlign: 'middle', marginRight: 8 }} /> Start Observation Run</h2>
        </div>
      </div>

      {loading && <div className="vp-loading">Loading plan details…</div>}
      {error && <div className="vp-error-alert">{error}</div>}

      {!loading && plan && (
        <>
          {/* Plan Info */}
          <section className="vp-card">
            <div className="vp-select-card-title" style={{ fontSize: 'var(--font-size-lg)' }}>{plan.name}</div>
            <div className="vp-select-card-sub" style={{ marginTop: 'var(--space-xs)' }}>
              Template: {plan.template_name || `#${plan.template_id}`}
            </div>
            {plan.instructions && (
              <div className="vp-info-banner" style={{ marginTop: 'var(--space-md)', marginBottom: 0 }}>
                {plan.instructions}
              </div>
            )}
          </section>

          {/* Block Selection */}
          <section className="vp-card">
            <h3 className="vp-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <MapPin size={18} /> Select Block for Observation
            </h3>

            {availableBlocks.length === 0 && (
              <div className="vp-info-banner">
                No blocks available. Check that the plan has configured targets or your company has blocks.
              </div>
            )}

            {availableBlocks.length > 0 && (
              <div className="vp-grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {availableBlocks.map(block => {
                  const isSelected = String(block.id) === selectedBlockId;
                  const blockConflicts = conflicts.filter(c => c.block_id === block.id);
                  const hasBlockConflicts = blockConflicts.length > 0;

                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() => setSelectedBlockId(String(block.id))}
                      className={`vp-select-card${isSelected ? ' selected' : ''}${hasBlockConflicts && !isSelected ? ' vp-select-card--warning' : ''}`}
                      style={hasBlockConflicts && !isSelected ? {
                        borderColor: 'var(--color-warning)',
                        background: 'var(--color-warning-bg)'
                      } : undefined}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div className="vp-select-card-title">{block.name}</div>
                          {block.variety && (
                            <div className="vp-select-card-sub">
                              Variety: {block.variety}
                            </div>
                          )}
                          {block.rowLabels?.length > 0 && (
                            <div className="vp-select-card-sub">
                              Rows: {block.rowLabels.join(' - ')}
                            </div>
                          )}
                          {block.sampleSize > 1 && (
                            <div className="vp-select-card-sub">
                              Target spots: {block.sampleSize}
                            </div>
                          )}
                        </div>

                        {isSelected && <CheckCircle size={20} style={{ color: 'var(--color-primary)' }} />}
                        {hasBlockConflicts && !isSelected && <AlertTriangle size={20} style={{ color: 'var(--color-warning)' }} />}
                      </div>

                      {hasBlockConflicts && (
                        <div className="vp-badge--warning" style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--font-size-xs)' }}>
                          {blockConflicts.length} active run{blockConflicts.length === 1 ? '' : 's'} on this block
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Conflicts Warning */}
          {hasConflicts && selectedBlockId && (
            <section className="vp-card" style={{ border: '1px solid var(--color-warning)', background: 'var(--color-warning-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                <AlertTriangle size={20} style={{ color: 'var(--color-warning)', marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <h4 className="vp-section-title" style={{ color: 'var(--color-warning)' }}>
                    Active Run Conflicts ({conflicts.length})
                  </h4>
                  <div className="vp-warning-banner" style={{ marginBottom: 'var(--space-md)' }}>
                    The following runs are active on the selected block and may conflict:
                  </div>

                  <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                    {conflicts.map(run => (
                      <div
                        key={run.id}
                        className="vp-info-row"
                        style={{
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: 'var(--space-md)',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-warning-bg)',
                          borderRadius: 'var(--radius-md)'
                        }}
                      >
                        <div>
                          <div className="vp-select-card-title" style={{ fontSize: 'var(--font-size-base)' }}>Run #{run.id}</div>
                          <div className="vp-select-card-sub">
                            {run.plan_name && `Plan: ${run.plan_name} • `}
                            {run.creator_name && `By: ${run.creator_name} • `}
                            Started: {new Date(run.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                          <button
                            className="btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/observations/runcapture/${run.id}`);
                            }}
                            style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: 'var(--font-size-xs)' }}
                          >
                            <ExternalLink size={12} /> View
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelConflictRun(run.id);
                            }}
                            disabled={busy}
                            style={{
                              padding: 'var(--space-xs) var(--space-sm)',
                              fontSize: 'var(--font-size-xs)',
                              background: 'var(--color-danger-bg)',
                              color: 'var(--color-danger)',
                              borderColor: 'var(--color-danger)'
                            }}
                          >
                            <X size={12} /> Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Actions */}
          <div className="vp-actions vp-actions--spread" style={{ alignItems: 'center' }}>
            <div className="vp-select-card-sub">
              {selectedBlockId ? (
                hasConflicts ? (
                  `Selected: ${blockMap.get(selectedBlockId)} (${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'})`
                ) : (
                  `Selected: ${blockMap.get(selectedBlockId)} ✓`
                )
              ) : (
                'Select a block to continue'
              )}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                className="btn-ghost"
                onClick={() => navigate(`/plandetail/${planId}`)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={!canStart}
                onClick={() => startRun()}
                style={!canStart ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <PlayCircle size={16} />
                {busy ? 'Starting...' : 'Start Run'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
