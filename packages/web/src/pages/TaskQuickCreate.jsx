// pages/TaskQuickCreate.jsx — 3-step quick task creation flow
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Zap, Settings2 } from 'lucide-react';
import { tasksService, blocksService, usersService } from '@vineyard/shared';
import TemplateSelector from '../components/tasks/TemplateSelector';
import BlockSelector from '../components/tasks/BlockSelector';
import './TaskQuickCreate.css';

const STEPS = ['Pick Template', 'Pick Block', 'Review & Create'];

function TaskQuickCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Data
  const [templates, setTemplates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingBlocks, setLoadingBlocks] = useState(true);

  // Selections
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Team members
  const [companyUsers, setCompanyUsers] = useState([]);

  useEffect(() => {
    tasksService.getQuickCreateTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));

    blocksService.getCompanyBlocks()
      .then((data) => setBlocks(data.blocks || data || []))
      .catch(() => setBlocks([]))
      .finally(() => setLoadingBlocks(false));

    if (usersService.getCompanyUsers) {
      usersService.getCompanyUsers()
        .then(setCompanyUsers)
        .catch(() => {});
    }
  }, []);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setStep(1);
  };

  const handleBlockSelect = (block) => {
    setSelectedBlock(block);
    setStep(2);
  };

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      setError(null);

      const payload = {
        template_id: selectedTemplate.id,
      };
      if (selectedBlock) payload.block_id = selectedBlock.id;
      if (scheduledDate) payload.scheduled_start_date = scheduledDate;
      if (assignedUserId) payload.assigned_user_ids = [parseInt(assignedUserId)];

      await tasksService.quickCreateTask(payload);
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
                Creating: <strong>{selectedTemplate?.name}</strong>
              </p>
              <BlockSelector
                blocks={blocks}
                onSelect={handleBlockSelect}
                loading={loadingBlocks}
                selectedId={selectedBlock?.id ?? null}
              />
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
                  <span className="quick-create-summary-label">Block</span>
                  <span>{selectedBlock?.block_name || 'None'}</span>
                </div>

                <div className="quick-create-field">
                  <label>Assign to (optional)</label>
                  <select
                    value={assignedUserId}
                    onChange={(e) => setAssignedUserId(e.target.value)}
                    className="quick-create-select"
                  >
                    <option value="">— Unassigned —</option>
                    {companyUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name} {u.last_name}
                      </option>
                    ))}
                  </select>
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
                {saving ? 'Creating...' : 'Create Task'}
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
