import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  ClipboardList,
  ArrowLeft,
  PlayCircle,
  FileText,
  Target,
  Edit3
} from 'lucide-react';
import { observationService, authService, blocksService } from '@vineyard/shared';
import './vineyard-pages.css';

const asArray = (v) => (Array.isArray(v) ? v : v?.blocks ?? v?.items ?? v?.results ?? v?.data ?? []);

export default function AdhocObservationCreate() {
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();

  // Mode selection
  const [mode, setMode] = useState(''); // 'plan', 'template', 'freeform'

  // Common data
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Form data
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [observationName, setObservationName] = useState('');
  const [freeformNotes, setFreeformNotes] = useState('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const [plansRes, templatesRes, blocksRes] = await Promise.all([
          observationService.listPlans({ company_id: companyId }).catch(() => []),
          observationService.getTemplates({ include_system: true }).catch(() => []),
          blocksService.getCompanyBlocks().catch(() => []),
        ]);

        if (!mounted) return;

        setPlans(asArray(plansRes));
        setTemplates(asArray(templatesRes));
        setBlocks(asArray(blocksRes));

        console.log('Loaded data:', {
          plans: asArray(plansRes).length,
          templates: asArray(templatesRes).length,
          blocks: asArray(blocksRes).length
        });

      } catch (e) {
        console.error('Failed to load data:', e);
        if (mounted) setError('Failed to load plans, templates, or blocks');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [companyId]);

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  const handleModeSelect = (selectedMode) => {
    setMode(selectedMode);
    setError(null);
    // Generate default name based on mode
    const timestamp = dayjs().format('MMM DD, HH:mm');
    if (selectedMode === 'freeform') {
      setObservationName(`Ad-hoc observation — ${timestamp}`);
    } else if (selectedMode === 'template') {
      setObservationName(`Template observation — ${timestamp}`);
    } else if (selectedMode === 'plan') {
      setObservationName(`Plan observation — ${timestamp}`);
    }
  };

  const canSubmit = () => {
    if (!observationName.trim()) return false;
    if (!selectedBlockId) return false;

    if (mode === 'plan' && !selectedPlanId) return false;
    if (mode === 'template' && !selectedTemplateId) return false;
    if (mode === 'freeform' && !freeformNotes.trim()) return false;

    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;

    try {
      setBusy(true);
      setError(null);

      let payload = {
        company_id: companyId,
        block_id: Number(selectedBlockId),
        started_at: dayjs().toISOString(),
      };

      if (mode === 'plan') {
        const plan = plans.find(p => String(p.id) === String(selectedPlanId));
        payload.plan_id = Number(selectedPlanId);
        payload.template_id = plan?.template_id;
      } else if (mode === 'template') {
        payload.template_id = Number(selectedTemplateId);
      } else if (mode === 'freeform') {
        payload.template_id = 1;
        payload.summary_stats = {
          type: 'freeform',
          notes: freeformNotes,
          created_via: 'adhoc_dashboard'
        };
      }

      console.log('Creating observation run with payload:', payload);

      const run = await observationService.createRun(payload);
      const runId = run?.id;

      if (runId) {
        navigate(`/observations/runcapture/${runId}`, { replace: true });
      } else {
        throw new Error('Run not created properly');
      }
    } catch (e) {
      console.error('Failed to create observation:', e);
      const detail = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Failed to create observation';
      setError(Array.isArray(detail) ? detail[0]?.msg || 'Failed to create observation.' : String(detail));
    } finally {
      setBusy(false);
    }
  };

  const ModeCard = ({ modeKey, icon: Icon, title, description, isSelected, onClick }) => (
    <div
      onClick={onClick}
      className={`vp-mode-card${isSelected ? ' selected' : ''}`}
    >
      <div className="vp-mode-card-icon">
        <Icon size={24} color={isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)'} />
      </div>
      <div className="vp-mode-card-title">{title}</div>
      <div className="vp-mode-card-desc">{description}</div>
    </div>
  );

  if (loading) {
    return (
      <div className="page-container">
        <div className="vp-loading">
          <div style={{ textAlign: 'center' }}>
            <h2>Loading...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="vp-container">

        {/* Back button */}
        <button
          className="vp-back"
          onClick={() => navigate('/observations')}
        >
          <ArrowLeft size={16} /> Back to Observations
        </button>

        {/* Header */}
        <div className="vp-card">
          <div className="vp-card-header">
            <h1>
              <ClipboardList size={24} /> Create New Observation
            </h1>
          </div>
        </div>

        {error && (
          <div className="vp-error-alert">
            {error}
          </div>
        )}

        {/* Mode Selection */}
        {!mode && (
          <div className="vp-card">
            <h3 className="vp-section-title">
              Choose Observation Type
            </h3>
            <p className="vp-mode-card-desc" style={{ marginBottom: 'var(--space-base)' }}>
              How would you like to create your observation?
            </p>

            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
              <ModeCard
                modeKey="plan"
                icon={Target}
                title="From Existing Plan"
                description="Start a run from a pre-configured observation plan"
                isSelected={false}
                onClick={() => handleModeSelect('plan')}
              />

              <ModeCard
                modeKey="freeform"
                icon={Edit3}
                title="Free-form Notes"
                description="Quick observation with free-text notes only"
                isSelected={false}
                onClick={() => handleModeSelect('freeform')}
              />
            </div>
          </div>
        )}

        {/* Form based on selected mode */}
        {mode && (
          <>
            <div className="vp-card">
              <div className="vp-card-header">
                <h2>Observation Details</h2>
                <button
                  className="btn-ghost"
                  onClick={() => setMode('')}
                >
                  Change Type
                </button>
              </div>

              <div style={{ display: 'grid', gap: 'var(--space-base)' }}>
                <div className="vp-form-group">
                  <label className="vp-label">
                    Observation Name
                  </label>
                  <input
                    className="vp-input"
                    placeholder="Enter observation name..."
                    value={observationName}
                    onChange={(e) => setObservationName(e.target.value)}
                  />
                </div>

                <div className="vp-form-group">
                  <label className="vp-label">
                    Block
                  </label>
                  <select
                    className="vp-select"
                    value={selectedBlockId}
                    onChange={(e) => setSelectedBlockId(e.target.value)}
                  >
                    <option value="">— Select a block —</option>
                    {blocks.map(b => (
                      <option key={b.block_name} value={b.block_name}>
                        {b.block_name || `Block ${b.block_name}`}
                        {b.variety && ` (${b.variety})`}
                      </option>
                    ))}
                  </select>
                </div>

                {mode === 'plan' && (
                  <div className="vp-form-group">
                    <label className="vp-label">
                      Plan
                    </label>
                    <select
                      className="vp-select"
                      value={selectedPlanId}
                      onChange={(e) => setSelectedPlanId(e.target.value)}
                    >
                      <option value="">— Select a plan —</option>
                      {plans.filter(p => p.status !== 'completed' && p.status !== 'cancelled').map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name || `Plan #${p.id}`}
                          {p.template_name && ` (${p.template_name})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {mode === 'freeform' && (
                  <div className="vp-form-group">
                    <label className="vp-label">
                      Notes
                    </label>
                    <textarea
                      className="vp-textarea"
                      rows={6}
                      value={freeformNotes}
                      onChange={(e) => setFreeformNotes(e.target.value)}
                      placeholder="Enter your observation notes here..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="vp-card">
              <h4 className="vp-section-title">
                Summary
              </h4>
              <div className="vp-info-row" style={{ flexDirection: 'column' }}>
                <div>
                  <strong>Type:</strong> {mode === 'plan' ? 'Plan-based' : mode === 'template' ? 'Template-based' : 'Free-form'}
                </div>
                <div>
                  <strong>Block:</strong> {selectedBlockId ? (blocks.find(b => String(b.id) === selectedBlockId)?.name || `Block ${selectedBlockId}`) : 'Not selected'}
                </div>
                {mode === 'plan' && selectedPlanId && (
                  <div>
                    <strong>Plan:</strong> {plans.find(p => String(p.id) === selectedPlanId)?.name || `Plan #${selectedPlanId}`}
                  </div>
                )}
                {mode === 'template' && selectedTemplateId && (
                  <div>
                    <strong>Template:</strong> {templates.find(t => String(t.id) === selectedTemplateId)?.name || `Template #${selectedTemplateId}`}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="vp-actions">
              <button
                className="btn-ghost"
                onClick={() => navigate('/observations')}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={!canSubmit() || busy}
                onClick={handleSubmit}
              >
                <PlayCircle size={16}/> {busy ? 'Creating...' : 'Create & Start Observation'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
