// pages/QuickPlanObservation.jsx — 3-step quick scheduling: template → blocks → review.
// Creates one ObservationRun per selected block (in Scheduled state — observed_at_start
// stays NULL until someone hits Start). The legacy Plan layer is bypassed entirely.
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, Check, Calendar } from 'lucide-react';
import { observationService, authService, blocksService, usersService, byNatural } from '@vineyard/shared';
import BlockSelector from '../components/tasks/BlockSelector';
import './QuickObservation.css';

// Same grouping as the field Quick Obs flow so users see the same template
// taxonomy in both places.
const TEMPLATE_GROUPS = [
  {
    key: 'quick',
    label: 'Quick Check',
    hint: 'Something you noticed in the field',
    types: ['other', 'disease', 'pest'],
    names: ['Free-form Observation', 'Pests & Diseases', 'Vine Health'],
  },
  {
    key: 'phenology',
    label: 'Phenology & Growth',
    hint: 'Seasonal monitoring',
    types: ['phenology', 'bud_count', 'growth'],
    names: ['Phenology', 'Bud Count', 'Growth', 'Canopy'],
  },
  {
    key: 'yield',
    label: 'Yield Estimation',
    hint: 'Crop estimation & counting',
    types: ['flower_count', 'pre_veraison_yield', 'post_veraison_yield'],
    names: ['Flower Count', 'Bunch Count', 'Yield Estimation'],
  },
  {
    key: 'lab',
    label: 'Lab & Sampling',
    hint: 'Lab analysis & sample collection',
    types: ['lab_sampling', 'maturity_sampling'],
    names: ['Lab Sampling', 'External Lab'],
  },
  {
    key: 'environment',
    label: 'Environment & Compliance',
    hint: 'Land, weather, biosecurity',
    types: ['land_management', 'weather', 'biosecurity', 'compliance', 'hazard'],
    names: ['Land Management', 'Frost Event', 'Beneficial Species', 'Biosecurity'],
  },
];

function groupTemplates(templates) {
  const grouped = TEMPLATE_GROUPS.map((g) => ({ ...g, templates: [] }));
  const customGroup = { key: 'custom', label: 'Custom', hint: 'Company templates', templates: [] };
  const used = new Set();

  for (const group of grouped) {
    for (const t of templates) {
      if (used.has(t.id)) continue;
      const typeName = t.type || t.observation_type || '';
      const nameMatch = group.names.some((n) => t.name?.toLowerCase().includes(n.toLowerCase()));
      const typeMatch = group.types.includes(typeName);
      if (nameMatch || typeMatch) {
        group.templates.push(t);
        used.add(t.id);
      }
    }
  }

  for (const t of templates) {
    if (!used.has(t.id)) customGroup.templates.push(t);
  }

  const result = grouped.filter((g) => g.templates.length > 0);
  if (customGroup.templates.length > 0) result.push(customGroup);
  return result;
}

const STEPS = ['Pick Template', 'Pick Block(s)', 'Schedule'];

export default function QuickPlanObservation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetTemplateId = searchParams.get('template');
  const companyId = authService.getCompanyId();
  const [step, setStep] = useState(0);

  // Data
  const [templates, setTemplates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingBlocks, setLoadingBlocks] = useState(true);

  // Selections
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedBlocks, setSelectedBlocks] = useState([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [instructions, setInstructions] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    observationService.getTemplates({ include_system: true })
      .then((data) => {
        let arr = [];
        if (Array.isArray(data)) arr = data;
        else if (Array.isArray(data?.items)) arr = data.items;
        else if (Array.isArray(data?.templates)) arr = data.templates;
        setTemplates(arr.filter((t) => t && typeof t === 'object' && t.id && t.name));
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));

    blocksService.getCompanyBlocks()
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.blocks || data?.items || [];
        setBlocks([...arr].sort(byNatural('block_name')));
      })
      .catch(() => setBlocks([]))
      .finally(() => setLoadingBlocks(false));

    usersService.listCompanyUsers()
      .then((users) => {
        const active = (Array.isArray(users) ? users : []).filter(u => u.is_active !== false && !u.is_suspended);
        setCompanyUsers(active);
      })
      .catch(() => setCompanyUsers([]));
  }, []);

  // Honor ?template=ID — pre-select and skip to step 1. Lets the Templates
  // tab "Use Template" button deep-link straight into block selection.
  useEffect(() => {
    if (!presetTemplateId || selectedTemplate || templates.length === 0) return;
    const found = templates.find(t => String(t.id) === String(presetTemplateId));
    if (found) {
      setSelectedTemplate(found);
      setStep(1);
    }
  }, [presetTemplateId, templates, selectedTemplate]);

  const grouped = groupTemplates(templates);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setStep(1);
  };

  const handleBlockToggle = (block) => {
    setSelectedBlocks(prev => {
      const exists = prev.some(b => b.id === block.id);
      return exists ? prev.filter(b => b.id !== block.id) : [...prev, block];
    });
  };

  const handleBlocksConfirm = () => {
    if (selectedBlocks.length > 0) setStep(2);
  };

  const handleSchedule = async () => {
    if (!selectedTemplate || selectedBlocks.length === 0) return;
    try {
      setSaving(true);
      setError(null);

      // One Run per block — each is a single scheduled observation. Server
      // leaves observed_at_start NULL because we pass scheduled_date without
      // started_at, which puts the run in the Scheduled state.
      const assignedId = assigneeId ? Number(assigneeId) : null;
      for (const block of selectedBlocks) {
        const payload = {
          company_id: companyId,
          template_id: selectedTemplate.id,
          block_id: block.id,
          name: `${selectedTemplate.name} — ${block.block_name}`,
          scheduled_date: dueDate || null,
          assigned_to_user_id: assignedId,
          instructions: instructions || null,
        };
        await observationService.createRun(payload);
      }

      navigate('/observations');
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to schedule observation';
      setError(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail[0]?.msg || JSON.stringify(detail) : JSON.stringify(detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="qo-page">
        {/* Header */}
        <div className="qo-header">
          <button className="btn-ghost" onClick={() => step > 0 && !saving ? setStep(step - 1) : navigate('/observations')}>
            <ArrowLeft size={18} />
            {step > 0 && !saving ? 'Back' : 'Vineyard'}
          </button>
          <div className="qo-title">
            <Calendar size={20} />
            <h1 className="section-title">Schedule Observation</h1>
          </div>
          <span style={{ width: 80 }} />
        </div>

        {/* Step indicator */}
        <div className="qo-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`qo-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="qo-step-circle">
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className="qo-step-label">{label}</span>
            </div>
          ))}
        </div>

        {error && <div className="qo-error">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}

        {/* Step 0: Pick template (grouped) */}
        {step === 0 && (
          <div className="qo-content">
            <h2 className="qo-subtitle">What's being observed?</h2>
            {loadingTemplates ? (
              <div className="qo-loading">Loading templates...</div>
            ) : grouped.length === 0 ? (
              <div className="qo-empty">No observation templates available</div>
            ) : (
              <div className="qo-template-groups">
                {grouped.map((group) => (
                  <div key={group.key} className="qo-group">
                    <div className="qo-group-header">
                      <h3>{group.label}</h3>
                      <span className="qo-group-hint">{group.hint}</span>
                    </div>
                    <div className="qo-template-grid">
                      {group.templates.map((t) => (
                        <button
                          key={t.id}
                          className="qo-template-card"
                          onClick={() => handleTemplateSelect(t)}
                        >
                          <span className="qo-template-name">{t.name}</span>
                          {t.company_id && <span className="qo-template-badge">Custom</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Pick block(s) */}
        {step === 1 && (
          <div className="qo-content">
            <h2 className="qo-subtitle">Which block(s)?</h2>
            <p className="qo-hint">
              Template: <strong>{selectedTemplate?.name}</strong> — selecting multiple blocks creates one scheduled observation per block.
            </p>
            <BlockSelector
              blocks={blocks}
              loading={loadingBlocks}
              multiSelect
              selectedIds={selectedBlocks.map(b => b.id)}
              onToggle={handleBlockToggle}
            />
            <button
              className="btn-primary"
              onClick={handleBlocksConfirm}
              disabled={selectedBlocks.length === 0}
              style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {selectedBlocks.length > 1
                ? `Next — ${selectedBlocks.length} blocks`
                : selectedBlocks.length === 1
                ? 'Next'
                : 'Select at least one block'}
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* Step 2: Review & schedule */}
        {step === 2 && (
          <div className="qo-content">
            <h2 className="qo-subtitle">Schedule it</h2>

            <div className="qo-summary-card">
              <div className="qo-summary-row">
                <span className="qo-summary-label">Template</span>
                <span>{selectedTemplate?.name}</span>
              </div>
              <div className="qo-summary-row">
                <span className="qo-summary-label">{selectedBlocks.length > 1 ? 'Blocks' : 'Block'}</span>
                <span>
                  {selectedBlocks.length > 1
                    ? `${selectedBlocks.map(b => b.block_name).join(', ')} (${selectedBlocks.length} scheduled obs)`
                    : selectedBlocks[0]?.block_name || 'None'}
                </span>
              </div>

              <div className="qo-field">
                <label htmlFor="qpo-due-date">Due date</label>
                <input
                  id="qpo-due-date"
                  type="date"
                  className="qo-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  min={dayjs().format('YYYY-MM-DD')}
                />
              </div>

              <div className="qo-field">
                <label htmlFor="qpo-assignee">Assign to (optional)</label>
                {companyUsers.length === 0 ? (
                  <p className="qo-hint">No team members to assign.</p>
                ) : (
                  <select
                    id="qpo-assignee"
                    className="qo-input"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">— Unassigned —</option>
                    {companyUsers.map((u) => {
                      const label = u.full_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email;
                      return (
                        <option key={u.id} value={u.id}>{label}</option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div className="qo-field">
                <label htmlFor="qpo-instructions">Instructions (optional)</label>
                <textarea
                  id="qpo-instructions"
                  className="qo-input"
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Anything the assignee needs to know..."
                />
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={handleSchedule}
              disabled={saving}
              style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {saving
                ? 'Scheduling...'
                : selectedBlocks.length > 1
                ? `Schedule ${selectedBlocks.length} observations`
                : 'Schedule observation'}
              <Check size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
