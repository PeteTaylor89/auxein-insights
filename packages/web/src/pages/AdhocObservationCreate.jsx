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
import MobileNavigation from '../components/MobileNavigation';

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
        // Use existing plan flow
        const plan = plans.find(p => String(p.id) === String(selectedPlanId));
        payload.plan_id = Number(selectedPlanId);
        payload.template_id = plan?.template_id;
      } else if (mode === 'template') {
        // Direct template usage
        payload.template_id = Number(selectedTemplateId);
      } else if (mode === 'freeform') {
        // Freeform - we'll need a basic template or handle this differently
        // Option 1: Create a minimal "freeform" template on the backend
        // Option 2: Use summary_stats to store the freeform content
        // Let's go with option 2 for now
        payload.template_id = 1; // Assuming you have a basic "freeform" template with ID 1
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
      className="stat-card"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
        background: isSelected ? '#f0f9ff' : '#fff',
        transition: 'all 0.2s ease',
        ':hover': { borderColor: '#2563eb' }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon size={24} color={isSelected ? '#2563eb' : '#6b7280'} />
        <div>
          <div style={{ fontWeight: 600, color: isSelected ? '#2563eb' : '#111827' }}>
            {title}
          </div>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
            {description}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container" style={{ maxWidth: 800, margin: '0 auto', padding: '5rem 1rem' }}>
      {/* Back button */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => navigate('/observations')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={16} /> Back to Observations
        </button>
      </div>

      {/* Header */}
      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Create New Observation</span>
      </div>

      {loading && <div className="stat-card" style={{ marginTop: 12 }}>Loading…</div>}
      {error && <div className="stat-card" style={{ marginTop: 12, borderColor: 'red' }}>{error}</div>}

      {!loading && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          
          {/* Mode Selection */}
          {!mode && (
            <section className="stat-card">
              <h3 style={{ marginTop: 0 }}>Choose Observation Type</h3>
              <p style={{ color: '#666', marginBottom: 16 }}>
                How would you like to create your observation?
              </p>
              
              <div style={{ display: 'grid', gap: 12 }}>
                <ModeCard
                  modeKey="plan"
                  icon={Target}
                  title="From Existing Plan"
                  description="Start a run from a pre-configured observation plan"
                  isSelected={false}
                  onClick={() => handleModeSelect('plan')}
                />
                
                <ModeCard
                  modeKey="template"
                  icon={FileText}
                  title="From Template"
                  description="Use a template with structured fields and data collection"
                  isSelected={false}
                  onClick={() => handleModeSelect('template')}
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
            </section>
          )}

          {/* Form based on selected mode */}
          {mode && (
            <>
              <section className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0 }}>Observation Details</h3>
                  <button 
                    className="btn" 
                    onClick={() => setMode('')}
                    style={{ background: '#f3f4f6', fontSize: 12, padding: '4px 8px' }}
                  >
                    Change Type
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  <label>
                    <div>Observation Name</div>
                    <input
                      placeholder="Enter observation name..."
                      value={observationName}
                      onChange={(e) => setObservationName(e.target.value)}
                    />
                  </label>

                  <label>
                    <div>Block</div>
                    <select
                      value={selectedBlockId}
                      onChange={(e) => setSelectedBlockId(e.target.value)}
                    >
                      <option value="">— Select a block —</option>
                      {blocks.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name || `Block ${b.id}`}
                          {b.variety && ` (${b.variety})`}
                        </option>
                      ))}
                    </select>
                  </label>

                  {mode === 'plan' && (
                    <label>
                      <div>Plan</div>
                      <select
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
                    </label>
                  )}

                  {mode === 'template' && (
                    <label>
                      <div>Template</div>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                      >
                        <option value="">— Select a template —</option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>
                            {t?.name || t?.observation_type || `Template #${t.id}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {mode === 'freeform' && (
                    <label>
                      <div>Notes</div>
                      <textarea 
                        rows={6} 
                        value={freeformNotes} 
                        onChange={(e) => setFreeformNotes(e.target.value)}
                        placeholder="Enter your observation notes here..."
                      />
                    </label>
                  )}
                </div>
              </section>

              {/* Summary */}
              <section className="stat-card" style={{ background: '#f9fafb' }}>
                <h4 style={{ marginTop: 0 }}>Summary</h4>
                <div style={{ fontSize: 14, color: '#374151' }}>
                  <div><strong>Type:</strong> {mode === 'plan' ? 'Plan-based' : mode === 'template' ? 'Template-based' : 'Free-form'}</div>
                  <div><strong>Block:</strong> {selectedBlockId ? (blocks.find(b => String(b.id) === selectedBlockId)?.name || `Block ${selectedBlockId}`) : 'Not selected'}</div>
                  {mode === 'plan' && selectedPlanId && (
                    <div><strong>Plan:</strong> {plans.find(p => String(p.id) === selectedPlanId)?.name || `Plan #${selectedPlanId}`}</div>
                  )}
                  {mode === 'template' && selectedTemplateId && (
                    <div><strong>Template:</strong> {templates.find(t => String(t.id) === selectedTemplateId)?.name || `Template #${selectedTemplateId}`}</div>
                  )}
                </div>
              </section>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button 
                  className="btn" 
                  onClick={() => navigate('/observations')}
                  style={{ background: '#f3f4f6' }}
                >
                  Cancel
                </button>
                <button 
                  className="btn" 
                  disabled={!canSubmit() || busy} 
                  onClick={handleSubmit} 
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: 6, 
                    background: '#2563eb', 
                    color: '#fff' 
                  }}
                >
                  <PlayCircle size={18}/> Create & Start Observation
                </button>
              </div>
            </>
          )}

          <MobileNavigation />
        </div>
      )}
    </div>
  );
}