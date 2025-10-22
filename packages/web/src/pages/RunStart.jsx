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
import MobileNavigation from '../components/MobileNavigation';

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
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 1rem' }}>
      {/* Back button */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => navigate(`/plandetail/${planId}`)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={16} /> Back to Plan
        </button>
      </div>

      {/* Header */}
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Start Observation Run</span>
      </div>

      {loading && <div className="stat-card" style={{ marginTop: 12 }}>Loading plan details…</div>}
      {error && <div className="stat-card" style={{ marginTop: 12, borderColor: 'red' }}>{error}</div>}

      {!loading && plan && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          {/* Plan Info */}
          <section className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{plan.name}</div>
                <div style={{ color: '#666', marginTop: 4 }}>
                  Template: {plan.template_name || `#${plan.template_id}`}
                </div>
                {plan.instructions && (
                  <div style={{ marginTop: 8, fontSize: 14, color: '#374151' }}>
                    {plan.instructions}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Block Selection */}
          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin /> Select Block for Observation
            </h3>

            {availableBlocks.length === 0 && (
              <div style={{ padding: 16, color: '#777', background: '#f9fafb', borderRadius: 8 }}>
                No blocks available. Check that the plan has configured targets or your company has blocks.
              </div>
            )}

            {availableBlocks.length > 0 && (
              <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {availableBlocks.map(block => {
                  const isSelected = String(block.id) === selectedBlockId;
                  const blockConflicts = conflicts.filter(c => c.block_id === block.id);
                  const hasBlockConflicts = blockConflicts.length > 0;

                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() => setSelectedBlockId(String(block.id))}
                      className="btn"
                      style={{
                        textAlign: 'left',
                        padding: 16,
                        border: isSelected 
                          ? '2px solid #2563eb' 
                          : hasBlockConflicts 
                            ? '2px solid #f59e0b' 
                            : '1px solid #e5e7eb',
                        borderRadius: 12,
                        background: isSelected 
                          ? '#eff6ff' 
                          : hasBlockConflicts 
                            ? '#fffbeb' 
                            : '#fff',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{block.name}</div>
                          {block.variety && (
                            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                              Variety: {block.variety}
                            </div>
                          )}
                          {block.rowLabels?.length > 0 && (
                            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                              Rows: {block.rowLabels.join(' - ')}
                            </div>
                          )}
                          {block.sampleSize > 1 && (
                            <div style={{ fontSize: 13, color: '#6b7280' }}>
                              Target spots: {block.sampleSize}
                            </div>
                          )}
                        </div>
                        
                        {isSelected && <CheckCircle size={20} color="#2563eb" />}
                        {hasBlockConflicts && !isSelected && <AlertTriangle size={20} color="#f59e0b" />}
                      </div>

                      {hasBlockConflicts && (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
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
            <section className="stat-card" style={{ border: '1px solid #f59e0b', background: '#fffbeb' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <AlertTriangle size={20} color="#f59e0b" style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#92400e' }}>
                    Active Run Conflicts ({conflicts.length})
                  </h4>
                  <div style={{ fontSize: 14, color: '#92400e', marginBottom: 12 }}>
                    The following runs are active on the selected block and may conflict:
                  </div>
                  
                  <div style={{ display: 'grid', gap: 8 }}>
                    {conflicts.map(run => (
                      <div 
                        key={run.id} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: 12,
                          background: '#fff',
                          border: '1px solid #fed7aa',
                          borderRadius: 8
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500 }}>Run #{run.id}</div>
                          <div style={{ fontSize: 13, color: '#6b7280' }}>
                            {run.plan_name && `Plan: ${run.plan_name} • `}
                            {run.creator_name && `By: ${run.creator_name} • `}
                            Started: {new Date(run.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/observations/runcapture/${run.id}`);
                            }}
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: 4,
                              padding: '4px 8px',
                              fontSize: 12,
                              background: '#e0f2fe'
                            }}
                          >
                            <ExternalLink size={12} /> View
                          </button>
                          <button
                            className="btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelConflictRun(run.id);
                            }}
                            disabled={busy}
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: 4,
                              padding: '4px 8px',
                              fontSize: 12,
                              background: '#fee2e2',
                              color: '#7f1d1d'
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
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, color: '#6b7280' }}>
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
            
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn" 
                onClick={() => navigate(`/plandetail/${planId}`)}
                style={{ padding: '8px 16px', background: '#f3f4f6' }}
              >
                Cancel
              </button>
              <button 
                className="btn" 
                disabled={!canStart}
                onClick={() => startRun()}
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: 6,
                  padding: '8px 16px',
                  background: canStart ? '#2563eb' : '#9ca3af', 
                  color: '#fff' 
                }}
              >
                <PlayCircle size={16} /> 
                {busy ? 'Starting...' : 'Start Run'}
              </button>
            </div>
          </div>

          <MobileNavigation />
        </div>
      )}
    </div>
  );
}