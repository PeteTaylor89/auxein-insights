import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  ClipboardList,
  CalendarDays,
  Filter,
  Users,
  Plus,
  ArrowRight
} from 'lucide-react';
import {
  observationService,
  authService,
  api,
  usersService
} from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

const asArray = (v) =>
  Array.isArray(v) ? v :
  v?.items ?? v?.results ?? v?.data ?? v?.rows ?? [];

// Fallback if shared service doesn't have listPlans yet
const defaultListPlans = async (params) => {
  const res = await api.get('/observations/api/observation-plans', { params });
  return res.data;
};

export default function PlanList() {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();

  const [plans, setPlans] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Filters
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [dateTo, setDateTo] = useState(dayjs().add(30, 'day').format('YYYY-MM-DD'));
  const [status, setStatus] = useState(''); // '', scheduled, active, completed, canceled
  const [assigneeId, setAssigneeId] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const params = {
        company_id: companyId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status || undefined,
        assignee_id: assigneeId || undefined,
        q: q || undefined,
      };
      const svcList = observationService?.listPlans || defaultListPlans;
      const [plansRes, usersRes] = await Promise.all([
        svcList(params),
        usersService?.listCompanyUsers?.().catch(() => []),
      ]);
      setPlans(asArray(plansRes));
      setPeople(asArray(usersRes));
    } catch (e) {
      console.error(e);
      setErr('Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const assigneeMap = useMemo(() => {
    const m = new Map();
    for (const u of people) {
      const name =
        u.full_name ||
        `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() ||
        u.email || `User ${u.id}`;
      m.set(String(u.id), name);
    }
    return m;
  }, [people]);

  const filtered = useMemo(() => {
    let list = plans;
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(s) ||
        (p.description || '').toLowerCase().includes(s) ||
        (p.type || p.observation_type || '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [plans, q]);

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
    const style = { ...base, ...(colors[s] || colors.default) };
    return <span style={style}>{s || '—'}</span>;
  };

  const openPlan = (id) => navigate(`/plandetail/${id}`);

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem' }}>
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Observation Plans</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '12px 0 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="stat-card" style={{ padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={16} /> Filters
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input
                placeholder="Search by name/type/description"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ minWidth: 260 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarDays size={16} />
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span>to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Status: Any</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
              </select>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Assignee: Any</option>
                {people.map(u => (
                  <option key={u.id} value={u.id}>
                    {assigneeMap.get(String(u.id))}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={load}>Apply</button>
            </div>
          </div>
        </div>
        <div>
          <button
            className="btn"
            onClick={() => navigate('/planobservation')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> New Plan
          </button>
        </div>
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {err && <div className="stat-card" style={{ borderColor: 'red' }}>{err}</div>}

      {!loading && !err && (
        <div className="stat-card" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Name</th>
                <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Type</th>
                <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Date</th>
                <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Assignees</th>
                <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Targets</th>
                <th style={{ padding: 12, borderBottom: '1px solid #eee' }}>Status</th>
                <th style={{ padding: 12, borderBottom: '1px solid #eee' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#777' }}>
                    No plans match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const type = p.type || p.observation_type || '—';
                const date = p.scheduled_for || p.date || p.scheduledDate;
                const assignees = (p.assignees || p.assignee_user_ids || [])
                  .map(a => {
                    const id = a?.user_id ?? a?.id ?? a;
                    return assigneeMap.get(String(id)) || `User ${id}`;
                  })
                  .join(', ');
                const targetsCount =
                  p.targets_count ??
                  p.targets?.length ??
                  p.plan_targets?.length ??
                  0;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600 }}>{p.name || `Plan #${p.id}`}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{p.description}</div>
                    </td>
                    <td style={{ padding: 12 }}>{type}</td>
                    <td style={{ padding: 12 }}>{date ? dayjs(date).format('YYYY-MM-DD') : '—'}</td>
                    <td style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={16} /> <span>{assignees || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: 12 }}>{targetsCount}</td>
                    <td style={{ padding: 12 }}>{badge(p.status)}</td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      <button className="btn" onClick={() => openPlan(p.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Open <ArrowRight size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
        </div>
        
      )}
      <MobileNavigation />
    </div>
  );
}
