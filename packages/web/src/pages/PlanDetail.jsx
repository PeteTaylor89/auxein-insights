import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  ClipboardList,
  CalendarDays,
  Users,
  PlayCircle,
  MapPin,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import {
  observationService,
  authService,
  api,
  blocksService,
  usersService
} from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

const asArray = (v) =>
  Array.isArray(v) ? v :
  v?.items ?? v?.results ?? v?.data ?? v?.rows ?? [];

const safe = (v, d = '—') => (v ?? v === 0 ? v : d);

// --------- API fallbacks (copy-paste safe) ---------

const getPlanFallback = async (id) =>
  (await api.get(`/observations/api/observation-plans/${id}`)).data;

const listRunsForPlanFallback = async (id) => {
  try {
    // preferred nested route
    const res = await api.get(`/observations/api/observation-plans/${id}/runs`);
    return res.data;
  } catch {
    // generic search route
    const res = await api.get('/observations/api/observation-runs', { params: { plan_id: id } });
    return res.data;
  }
};

/**
 * Attempts multiple likely start-run endpoints, with a richer payload.
 * Returns the created run on success.
 */
const startRunFallback = async (plan, companyId) => {
  const payload = {
    plan_id: plan.id,
    template_id: plan.template_id ?? plan.template?.id ?? undefined,
    company_id: companyId ?? undefined,
    assignee_user_ids: (plan.assignees || plan.assignee_user_ids || [])
      .map(a => a?.user_id ?? a?.id ?? a)
      .filter(Boolean),
  };

  // 1) Nested: /plans/{id}/runs
  try {
    const r1 = await api.post(`/observations/api/observation-plans/${plan.id}/runs`, payload);
    return r1.data;
  } catch (e) {
    // continue
  }

  // 2) Nested: /plans/{id}/start-run
  try {
    const r2 = await api.post(`/observations/api/observation-plans/${plan.id}/start-run`, payload);
    return r2.data;
  } catch (e) {
    // continue
  }

  // 3) Flat: /observation-runs
  const r3 = await api.post('/observations/api/observation-runs', payload);
  return r3.data;
};

// --------- Component ---------

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();

  const [plan, setPlan] = useState(null);
  const [runs, setRuns] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [people, setPeople] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const [p, r, blks, users] = await Promise.all([
        (observationService?.getPlan || getPlanFallback)(id),
        (observationService?.listRunsForPlan || listRunsForPlanFallback)(id),
        blocksService.getCompanyBlocks().catch(() => []),
        usersService?.listCompanyUsers?.().catch(() => []),
      ]);
      setPlan(p);
      setRuns(asArray(r));
      setBlocks(asArray(blks));
      setPeople(asArray(users));
    } catch (e) {
      console.error(e);
      setErr('Failed to load plan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const blockMap = useMemo(() => {
    const m = new Map();
    for (const b of asArray(blocks)) m.set(String(b.id), b.name || `Block ${b.id}`);
    return m;
  }, [blocks]);

  const userMap = useMemo(() => {
    const m = new Map();
    for (const u of asArray(people)) {
      const name =
        u.full_name ||
        `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() ||
        u.email || `User ${u.id}`;
      m.set(String(u.id), name);
    }
    return m;
  }, [people]);

  const badge = (s) => {
    const base = {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      border: '1px solid #ddd'
    };
    const colors = {
      scheduled: { background: '#f6f9ff', border: '1px solid #cfe0ff' },
      active: { background: '#f4fff6', border: '1px solid #cdeccd' },
      completed: { background: '#f8f8f8', border: '1px solid #e0e0e0' },
      canceled: { background: '#fff6f6', border: '1px solid #ffd6d6' },
      default: { background: '#f8f8f8' },
    };
    return <span style={{ ...base, ...(colors[s] || colors.default) }}>{s || '—'}</span>;
  };

  const assigneesText = useMemo(() => {
    const arr = (plan?.assignees || plan?.assignee_user_ids || []).map(a => {
      const id = a?.user_id ?? a?.id ?? a;
      return userMap.get(String(id)) || `User ${id}`;
    });
    return arr.join(', ') || '—';
  }, [plan, userMap]);

  const startRun = async () => {
    try {
      setBusy(true);

      // Prefer shared service if it exists; otherwise use our fallback.
      const run = observationService?.startRun
        ? await observationService.startRun(plan.id, {
            template_id: plan.template_id ?? plan.template?.id,
            company_id: companyId,
            assignee_user_ids: (plan.assignees || plan.assignee_user_ids || [])
              .map(a => a?.user_id ?? a?.id ?? a)
              .filter(Boolean),
          })
        : await startRunFallback(plan, companyId);

      navigate(`/observations/runs/${run.id}`);
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        'Unknown error';
      alert(`Could not start run:\n${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const canStart = () => {
    if (!plan) return false;
    if (['canceled', 'completed'].includes(plan.status)) return false;
    return true;
  };

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn" onClick={() => navigate('/listplan')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> Back to Plans
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
                {badge(plan.status)} &nbsp;·&nbsp; {safe(plan.type || plan.observation_type, 'Type unknown')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                disabled={!canStart() || busy}
                onClick={startRun}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <PlayCircle size={16} /> Start Run
              </button>
            </div>
          </section>

          {/* Details */}
          <section className="stat-card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarDays size={16} /> <strong>Scheduled for</strong>
                </div>
                <div style={{ marginTop: 6 }}>
                  {plan.scheduled_for ? dayjs(plan.scheduled_for).format('YYYY-MM-DD') : '—'}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={16} /> <strong>Assignees</strong>
                </div>
                <div style={{ marginTop: 6 }}>{assigneesText}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><strong>Auto block selection:</strong> {plan.auto_block_selection ? 'Yes' : 'No'}</div>
              <div><strong>Active:</strong> {plan.is_active ? 'Yes' : 'No'}</div>
            </div>

            {plan.instructions && (
              <div style={{ marginTop: 12 }}>
                <strong>Instructions</strong>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{plan.instructions}</div>
              </div>
            )}
          </section>

          {/* Targets */}
          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin /> Targets
            </h3>
            <div style={{ marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Block</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Row start</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Row end</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Required spots</th>
                  </tr>
                </thead>
                <tbody>
                  {(plan.targets || plan.plan_targets || []).length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#777' }}>
                        No targets specified.
                      </td>
                    </tr>
                  )}
                  {(plan.targets || plan.plan_targets || []).map((t, idx) => {
                    const blockId = t.block_id ?? t.block?.id;
                    const blockName = blockMap.get(String(blockId)) || (t.block?.name ?? `Block ${blockId || '—'}`);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f2f2f2' }}>
                        <td style={{ padding: 12 }}>{blockName}</td>
                        <td style={{ padding: 12 }}>{safe(t.row_start)}</td>
                        <td style={{ padding: 12 }}>{safe(t.row_end)}</td>
                        <td style={{ padding: 12 }}>{safe(t.required_spots, 0)}</td>
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
              <ClipboardList /> Runs
            </h3>

            <div style={{ marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>ID</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Started</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Status</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Spots</th>
                    <th style={{ padding: 12, borderBottom: '1px solid #eee' }} />
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#777' }}>
                        No runs yet. Click <em>Start Run</em> to begin.
                      </td>
                    </tr>
                  )}
                  {runs.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                      <td style={{ padding: 12 }}>#{r.id}</td>
                      <td style={{ padding: 12 }}>
                        {r.created_at ? dayjs(r.created_at).format('YYYY-MM-DD HH:mm') : '—'}
                      </td>
                      <td style={{ padding: 12 }}>{badge(r.status)}</td>
                      <td style={{ padding: 12 }}>{r.spots_count ?? r.spots?.length ?? 0}</td>
                      <td style={{ padding: 12, textAlign: 'right' }}>
                        <button
                          className="btn"
                          onClick={() => navigate(`/observations/runs/${r.id}`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
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
