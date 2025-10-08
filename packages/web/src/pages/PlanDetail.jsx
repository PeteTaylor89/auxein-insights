import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, MapPin, ArrowLeft, ArrowRight } from 'lucide-react';
import { observationService, authService, blocksService, usersService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import BlockSelectionModal from '../components/BlockSelectionModal';

const asArray = (v) => Array.isArray(v) ? v : (v?.items ?? v?.results ?? v?.data ?? v?.rows ?? []);
const safe = (v, d = '—') => (v ?? v === 0 ? v : d);

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();

  const [plan, setPlan] = useState(null);
  const [runs, setRuns] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [startingRun, setStartingRun] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const [p, r, blks, usrs] = await Promise.all([
        observationService.getPlan(id),
        observationService.listRuns({ plan_id: parseInt(id) }),
        blocksService.getCompanyBlocks().catch(() => []),
        usersService.listCompanyUsers().catch(() => []),
      ]);
      setPlan(p);
      setRuns(asArray(r));
      setBlocks(asArray(blks));
      setUsers(asArray(usrs));
      console.log('Plan loaded:', p);
      console.log('Runs loaded:', asArray(r));
    } catch (e) {
      console.error(e);
      setErr('Failed to load plan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  const blockMap = useMemo(() => {
    const m = new Map();
    for (const b of asArray(blocks)) {
      m.set(String(b.id), b.block_name || `Block ${b.id}`);
    }
    return m;
  }, [blocks]);

  const userMap = useMemo(() => {
    const m = new Map();
    for (const u of asArray(users)) {
      const name = u.full_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || `User ${u.id}`;
      m.set(String(u.id), name);
    }
    return m;
  }, [users]);

  const StatusBadge = ({ status }) => {
    const colors = {
      scheduled: { bg: '#e0f2fe', color: '#0369a1' },
      active: { bg: '#dcfce7', color: '#166534' },
      completed: { bg: '#f3f4f6', color: '#374151' },
      canceled: { bg: '#fee2e2', color: '#dc2626' },
      cancelled: { bg: '#fee2e2', color: '#dc2626' },
    };
    const style = colors[status] || { bg: '#f3f4f6', color: '#374151' };
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: '500'
      }}>
        {status || '—'}
      </span>
    );
  };

  const openBlockModal = () => {
    setBlockModalOpen(true);
  };

  const closeBlockModal = () => {
    setBlockModalOpen(false);
  };

  const startRunWithBlock = async (blockId) => {
    if (!plan || startingRun) return;
    
    try {
      setStartingRun(true);
      
      const payload = {
        company_id: companyId,
        plan_id: plan.id,
        template_id: plan.template_id,
        block_id: blockId,
        started_at: new Date().toISOString(),
      };

      console.log('Creating run with payload:', payload);

      const run = await observationService.createRun(payload);
      
      if (run?.id) {
        navigate(`/observations/runcapture/${run.id}`);
      } else {
        alert('Run was not created (no id returned).');
      }
    } catch (e) {
      console.error('Failed to start run:', e);
      const detail = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Failed to start run';
      alert(`Could not start run:\n${Array.isArray(detail) ? detail[0]?.msg || detail : detail}`);
    } finally {
      setStartingRun(false);
      closeBlockModal();
    }
  };

  const startRunForTarget = async (targetBlockId) => {
    try {
      setBusy(true);
      const run = await observationService.startRun(plan.id, {
        template_id: plan.template_id,
        company_id: companyId,
        block_id: targetBlockId,
      });
      if (!run?.id) throw new Error('Run not created');
      navigate(`/observations/runcapture/${run.id}`);
    } catch (e) {
      console.error(e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to start run.';
      alert(Array.isArray(detail) ? detail[0]?.msg || 'Failed to start run.' : String(detail));
    } finally {
      setBusy(false);
    }
  };

  const canStart = () => {
    if (!plan) return false;
    if (['canceled', 'cancelled', 'completed'].includes(plan.status)) return false;
    return true;
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
          <h2>Loading Plan Details...</h2>
        </div>
      </div>
    );
  }

  if (err) {
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
          <p style={{ marginBottom: '1rem' }}>{err}</p>
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
            onClick={() => navigate('/observations')}
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
            <ArrowLeft size={16} /> Back to Observations
          </button>
        </div>

        {plan && (
          <>
            {/* Header Card */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div>
                  <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: '600' }}>
                    {plan.name || `Plan #${plan.id}`}
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    <StatusBadge status={plan.status} />
                    <span>•</span>
                    <span>Template: {plan.template_name || plan.template?.name || `#${plan.template_id}`}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => navigate(`/planedit/${plan.id}`)}
                    style={{
                      background: '#f3f4f6',
                      color: '#111827',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}
                  >
                    Edit Plan
                  </button>
                  <button
                    disabled={!canStart() || startingRun}
                    onClick={openBlockModal}
                    style={{
                      background: canStart() && !startingRun ? '#3b82f6' : '#9ca3af',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      cursor: canStart() && !startingRun ? 'pointer' : 'not-allowed',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}
                    title="Start a run for this plan"
                  >
                    <PlayCircle size={16} /> {startingRun ? 'Starting...' : 'Start Run'}
                  </button>
                </div>
              </div>
            </div>

            {/* Instructions */}
            {plan.instructions && (
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: '600' }}>Instructions</h3>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#374151', fontSize: '0.875rem' }}>
                  {plan.instructions}
                </div>
              </div>
            )}

            {/* Targets */}
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
                <MapPin size={18} /> Targets
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  fontSize: '0.875rem'
                }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Block</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Row Start</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Row End</th>
                      <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Required Spots</th>
                      <th style={{ padding: 12, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!plan.targets || plan.targets.length === 0) && (
                      <tr>
                        <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>
                          No targets specified.
                        </td>
                      </tr>
                    )}
                    {(plan.targets || []).map((t, idx) => {
                      const blockId = t.block_id;
                      
                      const displayName = t.name ?? t.block_name ?? t.label ?? `Block ${blockId}`;
                      const rowLabels = t.row_labels || [];
                      const rowStart = rowLabels[0] || '—';
                      const rowEnd = rowLabels[1] || (rowLabels.length > 1 ? rowLabels[rowLabels.length - 1] : '—');
                      
                      return (
                        <tr 
                          key={idx} 
                          style={{ borderBottom: '1px solid #f3f4f6' }}
                          onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                          onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                        >
                          <td style={{ padding: 12, fontWeight: '500' }}>{displayName}</td>
                          <td style={{ padding: 12 }}>{rowStart}</td>
                          <td style={{ padding: 12 }}>{rowEnd}</td>
                          <td style={{ padding: 12, textAlign: 'center' }}>{safe(t.sample_size, 0)}</td>
                          <td style={{ padding: 12, textAlign: 'right' }}>
                            <button
                              disabled={!canStart() || busy}
                              onClick={() => startRunForTarget(blockId)}
                              style={{
                                background: canStart() && !busy ? '#10b981' : '#9ca3af',
                                color: '#fff',
                                border: 'none',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                cursor: canStart() && !busy ? 'pointer' : 'not-allowed',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                              title={`Start run for ${displayName}`}
                            >
                              <PlayCircle size={14} /> Start
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Runs */}
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
                <ClipboardList size={18} /> Runs ({runs.length})
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  fontSize: '0.875rem'
                }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>ID</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Started</th>
                      <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Block</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Created By</th>
                      <th style={{ padding: 12, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>
                          No runs yet. Click <em>Start Run</em> to begin.
                        </td>
                      </tr>
                    )}
                    {runs.map((r) => (
                      <tr 
                        key={r.id} 
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                        onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                      >
                        <td style={{ padding: 12, fontWeight: '500' }}>#{r.id}</td>
                        <td style={{ padding: 12 }}>
                          {r.created_at ? dayjs(r.created_at).format('MMM DD, HH:mm') : '—'}
                        </td>
                        <td style={{ padding: 12, textAlign: 'center' }}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td style={{ padding: 12 }}>
                          {blockMap.get(String(r.block_id)) || r.block_name || `Block ${r.block_id}` || '—'}
                        </td>
                        <td style={{ padding: 12 }}>
                          {userMap.get(String(r.creator_name)) || '—'}
                        </td>
                        <td style={{ padding: 12, textAlign: 'right' }}>
                          <button
                            onClick={() => navigate(`/observations/runcapture/${r.id}`)}
                            style={{
                              background: '#065f46',
                              color: '#fff',
                              border: 'none',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}
                          >
                            Open <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <MobileNavigation />
      </div>
      
      <BlockSelectionModal
        open={blockModalOpen}
        plan={plan}
        onClose={closeBlockModal}
        onStartRun={startRunWithBlock}
      />
    </div>
  );
}