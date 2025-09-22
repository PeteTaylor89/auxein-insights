import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { CalendarDays, UserPlus, ClipboardList, MapPin, Target, PlayCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { observationService, blocksService, usersService, authService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

export default function PlanNew() {
  const navigate = useNavigate();
  const location = useLocation();

  const [templates, setTemplates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [people, setPeople] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // form (MVP: minimal — name, template, scheduled (optional), assignees (optional), instructions (optional))
  const [templateId, setTemplateId] = useState(String(location.state?.template?.id ?? ''));
  const [name, setName] = useState('');
  const [dateStr, setDateStr] = useState(dayjs().format('YYYY-MM-DD'));
  const [instructions, setInstructions] = useState('');
  const [assignees, setAssignees] = useState([]);

  // Advanced (optional for MVP): targets, isActive, autoBlock
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoBlock, setAutoBlock] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [targets, setTargets] = useState([{ block_id: '', row_start: '', row_end: '', required_spots: 1 }]);

  const companyId = authService.getCompanyId();

  const asArray = (v) =>
    Array.isArray(v) ? v : v?.blocks ?? v?.items ?? v?.results ?? v?.data ?? [];

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [tpls, blks, users] = await Promise.all([
          observationService.getTemplates({ include_system: true }).catch(() => []),
          blocksService.getCompanyBlocks().catch(() => []),
          usersService.listCompanyUsers().catch(() => []),
        ]);
        if (!mounted) return;
        setTemplates(asArray(tpls));
        setBlocks(asArray(blks));
        setPeople(asArray(users));
      } catch (e) {
        console.error(e);
        setError('Failed to load form data');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const chosenTemplate = useMemo(
    () => templates.find(t => String(t.id) === String(templateId)),
    [templates, templateId]
  );

  const handleTargetChange = (idx, key, value) => {
    setTargets(prev => {
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], [key]: value };
      return copy;
    });
  };

  const addTarget = () => setTargets(prev => [...prev, { block_id: '', row_start: '', row_end: '', required_spots: 1 }]);
  const removeTarget = (idx) => setTargets(prev => prev.filter((_, i) => i !== idx));

  const onSubmit = async (startNow = false) => {
    try {
      setSaving(true);
      setError(null);

      if (!templateId) {
        setError('Please choose an observation type/template.');
        setSaving(false);
        return;
      }
      if (!name?.trim()) {
        setError('Please give this plan a name.');
        setSaving(false);
        return;
      }

      const cleanTargets = showAdvanced
        ? targets
            .filter(t => t.block_id)
            .map(t => ({
              block_id: Number(t.block_id),
              row_start: t.row_start || null,
              row_end: t.row_end || null,
              required_spots: Number(t.required_spots || 1),
            }))
        : [];

      const payload = {
        company_id: companyId || undefined,
        template_id: Number(templateId),
        name: name.trim(),
        scheduled_for: startNow ? dayjs().format('YYYY-MM-DD') : (dateStr || null),
        auto_block_selection: showAdvanced ? !!autoBlock : false,
        is_active: !!isActive,
        targets: cleanTargets,
        instructions: instructions || null,
        assignee_user_ids: assignees.map(id => Number(id)),
      };

      const plan = await observationService.createPlan(payload);
      navigate(`/plandetail/${plan.id}`, { replace: true });
    } catch (e) {
      console.error(e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to create plan.';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to create plan.' : String(detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 960, margin: '0 auto', padding: '5rem 1rem' }}>
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>New Observation Plan</span>
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          {/* Type / Name */}
          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target /> Observation Type
            </h3>
            <div className="form-row" style={{ display: 'grid', gap: 12 }}>
              <label>
                <div>Template</div>
                <select value={templateId} onChange={e => setTemplateId(e.target.value)}>
                  <option value="">— Choose template —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t?.type || t?.observation_type || t?.name || `Template #${t.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div>Plan name</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bud Count — North Blocks" />
              </label>
            </div>
          </section>

          {/* Schedule & Assignees */}
          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays /> Schedule & Assignees
            </h3>
            <div className="form-row" style={{ display: 'grid', gap: 12 }}>
              <label style={{ maxWidth: 260 }}>
                <div>Date (optional)</div>
                <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} />
              </label>

              <label>
                <div>Assignees (optional)</div>
                <select
                  multiple
                  value={assignees}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map(o => o.value);
                    setAssignees(selected);
                  }}
                  style={{ minHeight: 120 }}
                >
                  {people.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email || `User ${u.id}`}
                    </option>
                  ))}
                </select>
                <small>Hold Ctrl / Cmd to select multiple.</small>
              </label>
            </div>
          </section>

          {/* Instructions */}
          <section className="stat-card">
            <h3 style={{ marginTop: 0 }}>Instructions (optional)</h3>
            <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </section>

          {/* Advanced (optional for MVP) */}
          <section className="stat-card">
            <button
              type="button"
              className="btn"
              onClick={() => setShowAdvanced(s => !s)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6', color: '#111827' }}
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? <ChevronDown size={16}/> : <ChevronRight size={16} />} Advanced: Targets & Options
            </button>

            {showAdvanced && (
              <div style={{ marginTop: 12, display: 'grid', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={autoBlock} onChange={e => setAutoBlock(e.target.checked)} />
                    <span>Auto-select blocks</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                    <span>Active</span>
                  </label>
                </div>

                <div>
                  <h4 style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin /> Targets (blocks/rows)
                  </h4>
                  <div className="form-row" style={{ display: 'grid', gap: 12 }}>
                    {targets.map((t, idx) => (
                      <div key={idx} className="target-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8 }}>
                        <select
                          value={t.block_id}
                          onChange={(e) => handleTargetChange(idx, 'block_id', e.target.value)}
                        >
                          <option value="">— Select block —</option>
                          {(Array.isArray(blocks) ? blocks : []).map(b => (
                            <option key={b.id} value={b.id}>{b.name || `Block ${b.id}`}</option>
                          ))}
                        </select>
                        <input placeholder="Row start" value={t.row_start} onChange={(e) => handleTargetChange(idx, 'row_start', e.target.value)} />
                        <input placeholder="Row end" value={t.row_end} onChange={(e) => handleTargetChange(idx, 'row_end', e.target.value)} />
                        <input type="number" min={1} placeholder="Spots" value={t.required_spots} onChange={(e) => handleTargetChange(idx, 'required_spots', e.target.value)} />
                        <button type="button" onClick={() => removeTarget(idx)}>Remove</button>
                      </div>
                    ))}
                    <button type="button" className="btn" onClick={addTarget}>+ Add target</button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn" disabled={saving} onClick={() => onSubmit(false)} style={{ background: '#4e638bff', color: '#fff' }}>
              Schedule Plan
            </button>
            <button className="btn" disabled={saving} onClick={() => onSubmit(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff' }}>
              <PlayCircle size={18}/> Start Now
            </button>
          </div>

          <MobileNavigation />
        </div>
      )}
    </div>
  );
}
