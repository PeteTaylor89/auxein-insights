// pages/TaskQuickCreate.jsx — 3-step quick task creation flow
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Zap, Settings2, Star } from 'lucide-react';
import { tasksService, blocksService, usersService, byNatural, contractorManagementService } from '@vineyard/shared';
import TemplateSelector from '../components/tasks/TemplateSelector';
import BlockSelector from '../components/tasks/BlockSelector';
import './TaskQuickCreate.css';

const STEPS = ['Pick Template', 'Pick Block', 'Review & Create'];

function TaskQuickCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);

  // Data
  const [templates, setTemplates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingBlocks, setLoadingBlocks] = useState(true);

  // Selections
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [selectedBlocks, setSelectedBlocks] = useState([]);
  // assigned_user_ids: multi-select. Backend accepts an array — one
  // TaskAssignment row is created per id. Mirrors the mobile flow.
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [assignedContractorIds, setAssignedContractorIds] = useState([]);
  const [scheduledDate, setScheduledDate] = useState(searchParams.get('date') || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Team members
  const [companyUsers, setCompanyUsers] = useState([]);
  const [contractors, setContractors] = useState([]);

  useEffect(() => {
    tasksService.getQuickCreateTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));

    blocksService.getCompanyBlocks()
      .then((data) => {
        const list = data.blocks || data || [];
        setBlocks([...list].sort(byNatural('block_name')));
      })
      .catch(() => setBlocks([]))
      .finally(() => setLoadingBlocks(false));

    usersService.getCompanyUsers()
      .then((users) => {
        const active = (Array.isArray(users) ? users : []).filter(u => u.is_active !== false && !u.is_suspended);
        setCompanyUsers(active);
      })
      .catch((err) => {
        console.warn('Could not load company users for assignment:', err.message);
        setCompanyUsers([]);
      });

    contractorManagementService.listRelationships()
      .then((rels) => {
        const assignable = (Array.isArray(rels) ? rels : [])
          .filter(r => r.status === 'active')
          .sort((a, b) => {
            const aPref = a.relationship_type === 'preferred_contractor' ? 0 : 1;
            const bPref = b.relationship_type === 'preferred_contractor' ? 0 : 1;
            if (aPref !== bPref) return aPref - bPref;
            return (a.contractor_name || '').localeCompare(b.contractor_name || '');
          });
        setContractors(assignable);
      })
      .catch((err) => {
        console.warn('Could not load contractors for assignment:', err.message);
        setContractors([]);
      });
  }, []);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setStep(1);
  };

  const handleBlockSelect = (block) => {
    setSelectedBlock(block);
    setSelectedBlocks(block ? [block] : []);
    setStep(2);
  };

  const handleBlockToggle = (block) => {
    setSelectedBlocks(prev => {
      const exists = prev.some(b => b.id === block.id);
      return exists ? prev.filter(b => b.id !== block.id) : [...prev, block];
    });
  };

  const handleBlocksConfirm = () => {
    if (selectedBlocks.length > 0) {
      setSelectedBlock(selectedBlocks[0]); // primary for display
      setStep(2);
    }
  };

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      setError(null);

      const blocksToCreate = selectedBlocks.length > 0 ? selectedBlocks : [selectedBlock];

      for (const block of blocksToCreate) {
        const payload = {
          template_id: selectedTemplate.id,
        };
        if (block) payload.block_id = block.id;
        if (scheduledDate) payload.scheduled_start_date = scheduledDate;
        if (assignedUserIds.length > 0) payload.assigned_user_ids = assignedUserIds;

        const newTask = await tasksService.quickCreateTask(payload);
        const newTaskId = newTask?.id || newTask?.task?.id;

        if (newTaskId && assignedContractorIds.length > 0) {
          // Backend wants one ContractorAssignment per contractor. Sequential keeps
          // the error path simple — first failure surfaces, the user task itself is created.
          for (const contractorId of assignedContractorIds) {
            try {
              await contractorManagementService.assignToTask(newTaskId, {
                contractor_id: contractorId,
                work_description: selectedTemplate.name || 'Task from template',
              });
            } catch (err) {
              console.error(`Failed to assign contractor ${contractorId} to task ${newTaskId}:`, err);
            }
          }
        }
      }

      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="quick-create-page">
        {/* Header */}
        <div className="quick-create-header">
          <button className="btn-ghost" onClick={() => step > 0 ? setStep(step - 1) : navigate('/')}>
            <ArrowLeft size={18} />
            {step > 0 ? 'Back' : 'Home'}
          </button>
          <div className="quick-create-title">
            <Zap size={20} />
            <h1 className="section-title">Quick Create Task</h1>
          </div>
          <Link to="/tasks/new/advanced" className="btn-ghost quick-create-advanced-link">
            <Settings2 size={16} />
            Advanced
          </Link>
        </div>

        {/* Step indicator */}
        <div className="quick-create-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`quick-create-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="quick-create-step-circle">
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className="quick-create-step-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="quick-create-content">
          {step === 0 && (
            <>
              <h2 className="quick-create-subtitle">What type of task?</h2>
              <TemplateSelector
                templates={templates}
                onSelect={handleTemplateSelect}
                loading={loadingTemplates}
              />
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="quick-create-subtitle">Where?</h2>
              <p className="quick-create-hint">
                Creating: <strong>{selectedTemplate?.name}</strong> — select one or more blocks
              </p>
              <BlockSelector
                blocks={blocks}
                loading={loadingBlocks}
                multiSelect
                selectedIds={selectedBlocks.map(b => b.id)}
                onToggle={handleBlockToggle}
                onSelect={handleBlockSelect}
                selectedId={selectedBlock?.id ?? null}
              />
              <button
                className="btn-primary quick-create-submit"
                onClick={handleBlocksConfirm}
                disabled={selectedBlocks.length === 0}
                style={{ marginTop: '1rem' }}
              >
                {selectedBlocks.length > 1
                  ? `Next — ${selectedBlocks.length} blocks`
                  : selectedBlocks.length === 1
                  ? 'Next'
                  : 'Select at least one block'}
                <ArrowRight size={18} />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="quick-create-subtitle">Almost done</h2>
              <div className="quick-create-summary card">
                <div className="quick-create-summary-row">
                  <span className="quick-create-summary-label">Template</span>
                  <span>{selectedTemplate?.name}</span>
                </div>
                <div className="quick-create-summary-row">
                  <span className="quick-create-summary-label">{selectedBlocks.length > 1 ? 'Blocks' : 'Block'}</span>
                  <span>
                    {selectedBlocks.length > 1
                      ? `${selectedBlocks.map(b => b.block_name).join(', ')} (${selectedBlocks.length} tasks)`
                      : selectedBlocks[0]?.block_name || selectedBlock?.block_name || 'None'}
                  </span>
                </div>

                <div className="quick-create-field">
                  <label>
                    Assign to (optional)
                    {assignedUserIds.length > 0 && (
                      <span className="quick-create-assignee-count">
                        {' '}— {assignedUserIds.length} selected
                      </span>
                    )}
                  </label>
                  {companyUsers.length === 0 ? (
                    <p className="quick-create-hint">No team members to assign.</p>
                  ) : (
                    <div className="quick-create-assignees">
                      {companyUsers.map((u) => {
                        const checked = assignedUserIds.includes(u.id);
                        const toggle = () => {
                          setAssignedUserIds((prev) =>
                            checked ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                          );
                        };
                        return (
                          <label
                            key={u.id}
                            className={`quick-create-assignee ${checked ? 'checked' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={toggle}
                            />
                            <span>{u.first_name} {u.last_name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="quick-create-field">
                  <label>
                    Assign contractors (optional)
                    {assignedContractorIds.length > 0 && (
                      <span className="quick-create-assignee-count">
                        {' '}— {assignedContractorIds.length} selected
                      </span>
                    )}
                  </label>
                  {contractors.length === 0 ? (
                    <p className="quick-create-hint">
                      No active contractor relationships. Add one in Company → Relationships.
                    </p>
                  ) : (
                    <div className="quick-create-assignees">
                      {contractors.map((c) => {
                        const checked = assignedContractorIds.includes(c.contractor_id);
                        const toggle = () => {
                          setAssignedContractorIds((prev) =>
                            checked ? prev.filter((id) => id !== c.contractor_id) : [...prev, c.contractor_id],
                          );
                        };
                        const isPreferred = c.relationship_type === 'preferred_contractor';
                        return (
                          <label
                            key={c.id}
                            className={`quick-create-assignee ${checked ? 'checked' : ''}`}
                          >
                            <input type="checkbox" checked={checked} onChange={toggle} />
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {isPreferred && <Star size={12} fill="#f59e0b" color="#f59e0b" />}
                              {c.contractor_name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="quick-create-field">
                  <label>Scheduled date (optional)</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="quick-create-input"
                  />
                </div>
              </div>

              {error && <div className="quick-create-error">{error}</div>}

              <button
                className="btn-primary quick-create-submit"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? 'Creating...' : selectedBlocks.length > 1 ? `Create ${selectedBlocks.length} Tasks` : 'Create Task'}
                {!saving && <ArrowRight size={18} />}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskQuickCreate;
