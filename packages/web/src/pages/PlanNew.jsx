import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { CalendarDays, UserPlus, ClipboardList, MapPin, Target, PlayCircle } from 'lucide-react';
import {observationService, blocksService, usersService, authService} from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

export default function PlanNew() {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [people, setPeople] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // form
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dateStr, setDateStr] = useState(dayjs().format('YYYY-MM-DD'));
  const [autoBlock, setAutoBlock] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [isActive, setIsActive] = useState(true);

  const [targets, setTargets] = useState([
    { block_id: '', row_start: '', row_end: '', required_spots: 1 }
  ]);

  const companyId = authService.getCompanyId(); // from login metadata

  const asArray = (v) =>
    Array.isArray(v) ? v :
    v?.blocks ?? v?.items ?? v?.results ?? v?.data ?? [];


  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [tpls, blks, users] = await Promise.all([
          observationService.getTemplates({ include_system: true }),
          // pulls current company blocks via /blocks/company
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
        setError('Please choose an observation type.');
        setSaving(false);
        return;
      }
      if (!name?.trim()) {
        setError('Please give this plan a name.');
        setSaving(false);
        return;
      }

      const cleanTargets = targets
        .filter(t => t.block_id)
        .map(t => ({
          block_id: Number(t.block_id),
          row_start: t.row_start || null,
          row_end: t.row_end || null,
          required_spots: Number(t.required_spots || 1),
        }));

      const payload = {
        company_id: companyId || undefined,
        template_id: Number(templateId),
        name: name.trim(),
        description: description || null,
        scheduled_for: dayjs(startNow ? new Date() : dateStr).format('YYYY-MM-DD'),
        auto_block_selection: !!autoBlock,
        targets: cleanTargets,
        instructions: instructions || null,
        is_active: !!isActive,
        assignee_user_ids: assignees.map(id => Number(id)),
      };

      const plan = await observationService.createPlan(payload);
      navigate(`/plandetail/${plan.id}`, { replace: true });
    } catch (e) {
      console.error(e);
      setError('Failed to create plan. Please check your inputs.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 960, margin: '0 auto', padding: '5rem' }}>
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>New Observation Plan</span>
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target /> Observation Type
            </h3>
            <div className="form-row" style={{ display: 'grid', gap: 12 }}>
              <label>
                <div>Type / Template</div>
                <select value={templateId} onChange={e => setTemplateId(e.target.value)}>
                  <option value="">— Choose observation —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t?.type || t?.observation_type || t?.name || `Template #${t.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div>Plan name</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pre-veraison yield – B3/4/5" />
              </label>

              <label>
                <div>Description (optional)</div>
                <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
              </label>
            </div>
          </section>

          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays /> Schedule
            </h3>
            <div className="form-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ minWidth: 220 }}>
                <div>Date</div>
                <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={autoBlock} onChange={e => setAutoBlock(e.target.checked)} />
                <span>Auto-select blocks</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                <span>Active</span>
              </label>
            </div>
          </section>

          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin /> Targets (blocks/rows)
            </h3>

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
                  <input
                    placeholder="Row start"
                    value={t.row_start}
                    onChange={(e) => handleTargetChange(idx, 'row_start', e.target.value)}
                  />
                  <input
                    placeholder="Row end"
                    value={t.row_end}
                    onChange={(e) => handleTargetChange(idx, 'row_end', e.target.value)}
                  />
                  <input
                    type="number"
                    min={1}
                    placeholder="Spots"
                    value={t.required_spots}
                    onChange={(e) => handleTargetChange(idx, 'required_spots', e.target.value)}
                  />
                  <button type="button" onClick={() => removeTarget(idx)}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn" onClick={addTarget}>+ Add target</button>
            </div>
          </section>

          <section className="stat-card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserPlus /> Assign to
            </h3>
            <div className="form-row" style={{ display: 'grid', gap: 12 }}>
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
            </div>
          </section>

          <section className="stat-card">
            <h3 style={{ marginTop: 0 }}>Instructions (optional)</h3>
            <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </section>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn" disabled={saving} onClick={() => onSubmit(false)}>
              Schedule Plan
            </button>
            <button className="btn" disabled={saving} onClick={() => onSubmit(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <PlayCircle size={18}/> Start Now
            </button>
          </div>
          <MobileNavigation />
        </div>
        
      )}
    </div>
  );
}
