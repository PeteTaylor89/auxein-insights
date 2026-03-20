import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, MapPin, ArrowLeft, ArrowRight } from 'lucide-react';
import { observationService, authService, blocksService, usersService } from '@vineyard/shared';
import BlockSelectionModal from '../components/BlockSelectionModal';
import './vineyard-pages.css';

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

  const statusBadgeClass = (status) => {
    const map = {
      scheduled: 'vp-badge vp-badge--info',
      active: 'vp-badge vp-badge--success',
      completed: 'vp-badge vp-badge--neutral',
      canceled: 'vp-badge vp-badge--danger',
      cancelled: 'vp-badge vp-badge--danger',
    };
    return map[status] || 'vp-badge vp-badge--neutral';
  };

  const StatusBadge = ({ status }) => (
    <span className={statusBadgeClass(status)}>
      {status || '—'}
    </span>
  );

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
      <div className="page-container">
        <div className="vp-loading">
          <h2>Loading Plan Details...</h2>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="page-container">
        <div className="vp-loading">
          <div style={{ textAlign: 'center' }}>
            <div className="vp-error-alert" style={{ maxWidth: '500px', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <span style={{ color: 'var(--color-danger)' }}>Error Loading Plan</span>
              <p style={{ margin: 0 }}>{err}</p>
              <button
                onClick={() => navigate('/observations')}
                className="btn-primary"
              >
                Back to Observations
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">

      {/* Back button */}
      <button
        onClick={() => navigate('/observations')}
        className="vp-back"
      >
        <ArrowLeft size={16} /> Back to Observations
      </button>

      {plan && (
        <>
          {/* Header Card */}
          <div className="vp-card">
            <div className="vp-card-header">
              <div>
                <h1>{plan.name || `Plan #${plan.id}`}</h1>
                <div className="vp-info-row" style={{ marginTop: 'var(--space-xs)' }}>
                  <StatusBadge status={plan.status} />
                  <span style={{ color: 'var(--color-text-muted)' }}>•</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    Template: {plan.template_name || plan.template?.name || `#${plan.template_id}`}
                  </span>
                </div>
              </div>
              <div className="vp-actions">
                <button
                  onClick={() => navigate(`/planedit/${plan.id}`)}
                  className="btn-ghost"
                >
                  Edit Plan
                </button>
                <button
                  disabled={!canStart() || startingRun}
                  onClick={openBlockModal}
                  className="btn-primary"
                  style={!canStart() || startingRun ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  title="Start a run for this plan"
                >
                  <PlayCircle size={16} /> {startingRun ? 'Starting...' : 'Start Run'}
                </button>
              </div>
            </div>
          </div>

          {/* Instructions */}
          {plan.instructions && (
            <div className="vp-card">
              <h3 className="vp-section-title">Instructions</h3>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--color-text)', fontSize: 'var(--font-size-sm)' }}>
                {plan.instructions}
              </div>
            </div>
          )}

          {/* Targets */}
          <div className="vp-card">
            <h3 className="vp-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <MapPin size={18} /> Targets
            </h3>

            <div className="vp-table-wrap">
              <table className="vp-table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Row Start</th>
                    <th>Row End</th>
                    <th className="center">Required Spots</th>
                    <th className="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(!plan.targets || plan.targets.length === 0) && (
                    <tr>
                      <td colSpan={5} className="vp-empty">
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
                      <tr key={idx}>
                        <td className="bold">{displayName}</td>
                        <td>{rowStart}</td>
                        <td>{rowEnd}</td>
                        <td className="center">{safe(t.sample_size, 0)}</td>
                        <td className="right">
                          <button
                            disabled={!canStart() || busy}
                            onClick={() => startRunForTarget(blockId)}
                            className="btn-accent"
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              padding: '2px var(--space-sm)',
                              ...(!canStart() || busy ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
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
          <div className="vp-card">
            <h3 className="vp-section-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <ClipboardList size={18} /> Runs ({runs.length})
            </h3>

            <div className="vp-table-wrap">
              <table className="vp-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Started</th>
                    <th className="center">Status</th>
                    <th>Block</th>
                    <th>Created By</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="vp-empty">
                        No runs yet. Click <em>Start Run</em> to begin.
                      </td>
                    </tr>
                  )}
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="bold">#{r.id}</td>
                      <td>
                        {r.created_at ? dayjs(r.created_at).format('MMM DD, HH:mm') : '—'}
                      </td>
                      <td className="center">
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        {blockMap.get(String(r.block_id)) || r.block_name || `Block ${r.block_id}` || '—'}
                      </td>
                      <td>
                        {userMap.get(String(r.creator_name)) || '—'}
                      </td>
                      <td className="right">
                        <button
                          onClick={() => navigate(`/observations/runcapture/${r.id}`)}
                          className="btn-primary"
                          style={{ fontSize: 'var(--font-size-xs)', padding: '2px var(--space-sm)' }}
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

      <BlockSelectionModal
        open={blockModalOpen}
        plan={plan}
        onClose={closeBlockModal}
        onStartRun={startRunWithBlock}
      />
    </div>
  );
}
