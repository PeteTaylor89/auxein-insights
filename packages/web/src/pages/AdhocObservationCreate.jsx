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
      style={{
        cursor: 'pointer',
        border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
        background: isSelected ? '#f0f9ff' : '#fff',
        padding: '1rem',
        borderRadius: '8px',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => !isSelected && (e.currentTarget.style.borderColor = '#bfdbfe')}
      onMouseLeave={(e) => !isSelected && (e.currentTarget.style.borderColor = '#e5e7eb')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon size={24} color={isSelected ? '#2563eb' : '#6b7280'} />
        <div>
          <div style={{ fontWeight: 600, color: isSelected ? '#2563eb' : '#111827', fontSize: '0.938rem' }}>
            {title}
          </div>
          <div style={{ fontSize: '0.813rem', color: '#6b7280', marginTop: 4 }}>
            {description}
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '900px', 
        margin: '0 auto', 
        padding: '1rem' 
      }}>
        
        {/* Back button */}
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={() => navigate('/observations')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <ArrowLeft size={16} /> Back to Observations
          </button>
        </div>

        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: '1.5rem', 
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <ClipboardList size={24} /> Create New Observation
          </h1>
        </div>

        {error && (
          <div style={{ 
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#dc2626',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {/* Mode Selection */}
        {!mode && (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '600' }}>
              Choose Observation Type
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
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
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                  Observation Details
                </h3>
                <button 
                  onClick={() => setMode('')}
                  style={{ 
                    background: '#f3f4f6', 
                    border: 'none',
                    fontSize: '0.75rem', 
                    padding: '0.375rem 0.75rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Change Type
                </button>
              </div>

              <div style={{ display: 'grid', gap: '1rem' }}>
                <label>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                    Observation Name
                  </div>
                  <input
                    placeholder="Enter observation name..."
                    value={observationName}
                    onChange={(e) => setObservationName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </label>

                <label>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                    Block
                  </div>
                  <select
                    value={selectedBlockId}
                    onChange={(e) => setSelectedBlockId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'white'
                    }}
                  >
                    <option value="">— Select a block —</option>
                    {blocks.map(b => (
                      <option key={b.block_name} value={b.block_name}>
                        {b.block_name || `Block ${b.block_name}`}
                        {b.variety && ` (${b.variety})`}
                      </option>
                    ))}
                  </select>
                </label>

                {mode === 'plan' && (
                  <label>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                      Plan
                    </div>
                    <select
                      value={selectedPlanId}
                      onChange={(e) => setSelectedPlanId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        background: 'white'
                      }}
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

                {mode === 'freeform' && (
                  <label>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                      Notes
                    </div>
                    <textarea 
                      rows={6} 
                      value={freeformNotes} 
                      onChange={(e) => setFreeformNotes(e.target.value)}
                      placeholder="Enter your observation notes here..."
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontFamily: 'inherit'
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Summary */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb'
            }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.938rem', fontWeight: '600' }}>
                Summary
              </h4>
              <div style={{ fontSize: '0.875rem', color: '#374151', display: 'grid', gap: '0.5rem' }}>
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
            <div style={{ 
              display: 'flex', 
              gap: '0.75rem', 
              justifyContent: 'flex-end',
              marginBottom: '1.5rem'
            }}>
              <button 
                onClick={() => navigate('/observations')}
                style={{ 
                  padding: '0.5rem 1rem', 
                  borderRadius: '6px', 
                  background: '#f3f4f6',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151'
                }}
              >
                Cancel
              </button>
              <button 
                disabled={!canSubmit() || busy} 
                onClick={handleSubmit} 
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '6px', 
                  background: canSubmit() && !busy ? '#3b82f6' : '#9ca3af', 
                  color: '#fff',
                  border: 'none',
                  cursor: canSubmit() && !busy ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                <PlayCircle size={16}/> {busy ? 'Creating...' : 'Create & Start Observation'}
              </button>
            </div>
          </>
        )}

        <MobileNavigation />
      </div>
    </div>
  );
}