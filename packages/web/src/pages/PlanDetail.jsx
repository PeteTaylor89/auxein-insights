import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ClipboardList, PlayCircle, MapPin, ArrowLeft, ArrowRight } from 'lucide-react';
import { observationService, authService, blocksService, usersService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

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

  const blockMap = useMemo(() => {
    const m = new Map();
    for (const b of asArray(blocks)) m.set(String(b.id), b.name || `Block ${b.id}`);
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

  const badge = (s) => {
    const base = { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, border: '1px solid #ddd' };
    const colors = {
      scheduled: { background: '#f6f9ff', border: '1px solid #cfe0ff' },
      active: { background: '#f4fff6', border: '1px solid #cdeccd' },
      completed: { background: '#f8f8f8', border: '1px solid #e0e0e0' },
      canceled: { background: '#fff6f6', border: '1px solid #ffd6d6' },
      cancelled: { background: '#fff6f6', border: '1px solid #ffd6d6' },
      default: { background: '#f8f8f8' },
    };
    return <span style={{ ...base, ...(colors[s] || colors.default) }}>{s || '—'}</span>;
  };

  const startRun = async () => {
    try {
      setBusy(true);
      const run = await observationService.startRun(plan.id, {
        template_id: plan.template_id,
        company_id: companyId,
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

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 1rem' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/observations'))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Plan Detail</span>
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {err && <div className="stat-card" style={{ borderColor: 'red' }}>{err}</div>}

      {!loading && !err && plan && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          {/* Header summary */}
          <section className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{plan.name || `Plan #${plan.id}`}</div>
              <div style={{ color: '#666', marginTop: 4 }}>
                {badge(plan.status)} &nbsp;·&nbsp; Template: {plan.template_name || plan.template?.name || `#${plan.template_id}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                onClick={() => navigate(`/observations/planedit/${plan.id}`)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6', color: '#111827' }}
              >
                Edit Plan
              </button>
              <button
                className="btn"
                disabled={!canStart() || busy}
                onClick={startRun}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff' }}
                title="Start a run for this plan"
              >
                <PlayCircle size={16} /> Start Run
              </button>
            </div>
          </section>

          {/* Instructions */}
          {plan.instructions && (
            <section className="stat-card">
              <h3 style={{ marginTop: 0 }}>Instructions</h3>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{plan.instructions}</div>
            </section>
          )}

          {/* Targets */}
          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin /> Targets
            </h3>
            <div style={{ marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>Block</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>Row Start</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>Row End</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>Required Spots</th>
                  </tr>
                </thead>
                <tbody>
                  {(!plan.targets || plan.targets.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#777' }}>
                        No targets specified.
                      </td>
                    </tr>
                  )}
                  {(plan.targets || []).map((t, idx) => {
                    const blockId = t.block_id;
                    const blockName = blockMap.get(String(blockId)) || `Block ${blockId || '—'}`;
                    const rowLabels = t.row_labels || [];
                    const rowStart = rowLabels[0] || '—';
                    const rowEnd = rowLabels[1] || (rowLabels.length > 1 ? rowLabels[rowLabels.length - 1] : '—');
                    
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f2f2f2' }}>
                        <td style={{ padding: 12 }}>{blockName}</td>
                        <td style={{ padding: 12 }}>{rowStart}</td>
                        <td style={{ padding: 12 }}>{rowEnd}</td>
                        <td style={{ padding: 12 }}>{safe(t.sample_size, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Runs */}
          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList /> Runs ({runs.length})
            </h3>

            <div style={{ marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>ID</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>Started</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>Block</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>Created By</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }} />
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#777' }}>
                        No runs yet. Click <em>Start Run</em> to begin.
                      </td>
                    </tr>
                  )}
                  {runs.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                      <td style={{ padding: 12 }}>#{r.id}</td>
                      <td style={{ padding: 12 }}>
                        {r.created_at ? dayjs(r.created_at).format('MMM DD, HH:mm') : '—'}
                      </td>
                      <td style={{ padding: 12 }}>{badge(r.status)}</td>
                      <td style={{ padding: 12 }}>
                        {blockMap.get(String(r.block_id)) || `Block ${r.block_id || '—'}`}
                      </td>
                      <td style={{ padding: 12 }}>
                        {userMap.get(String(r.created_by)) || '—'}
                      </td>
                      <td style={{ padding: 12, textAlign: 'right' }}>
                        <button
                          className="btn"
                          onClick={() => navigate(`/observations/runcapture/${r.id}`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6' }}
                        >
                          Open <ArrowRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <MobileNavigation />
        </div>
      )}
    </div>
  );
}