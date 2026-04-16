import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { riskManagementService } from '@vineyard/shared';
import RiskLocationMap from '../components/RiskLocationMap';
import MobileNavigation from '../components/MobileNavigation';
import './RiskManagement.css';

function CreateRisk() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const editMode = location.state?.editMode || false;
  const existingRiskData = location.state?.riskData || null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [riskLocation, setRiskLocation] = useState(null);
  const [relatedActions, setRelatedActions] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);

  const [formData, setFormData] = useState(() => {
    if (editMode && existingRiskData) {
      return {
        risk_title: existingRiskData.risk_title || '', risk_description: existingRiskData.risk_description || '',
        risk_category: existingRiskData.risk_category || '', risk_type: existingRiskData.risk_type || '',
        inherent_likelihood: existingRiskData.inherent_likelihood || 1, inherent_severity: existingRiskData.inherent_severity || 1,
        residual_likelihood: existingRiskData.residual_likelihood || existingRiskData.inherent_likelihood || 1,
        residual_severity: existingRiskData.residual_severity || existingRiskData.inherent_severity || 1,
        location_description: existingRiskData.location_description || '',
        potential_consequences: existingRiskData.potential_consequences || '', existing_controls: existingRiskData.existing_controls || '',
        regulatory_requirements: existingRiskData.regulatory_requirements || '',
        owner_id: existingRiskData.owner_id || '', review_frequency_days: existingRiskData.review_frequency_days || 365
      };
    }
    return {
      risk_title: '', risk_description: '', risk_category: '', risk_type: '',
      inherent_likelihood: 1, inherent_severity: 1, residual_likelihood: 1, residual_severity: 1,
      location_description: '', potential_consequences: '', existing_controls: '',
      regulatory_requirements: '', owner_id: '', review_frequency_days: 365
    };
  });

  const hasImplementedActions = useMemo(() => {
    if (!editMode || !relatedActions.length) return false;
    return relatedActions.some(a => a.status === 'completed' || a.status === 'verified' || (a.progress_percentage && a.progress_percentage >= 100));
  }, [editMode, relatedActions]);

  const hasExistingControls = editMode ? hasImplementedActions : false;
  const [residualRiskError, setResidualRiskError] = useState('');

  const riskCategories = [
    { value: 'weather', label: 'Weather' }, { value: 'pests_diseases', label: 'Pests & Diseases' },
    { value: 'biosecurity', label: 'Biosecurity' }, { value: 'equipment', label: 'Equipment' },
    { value: 'chemical', label: 'Chemical' }, { value: 'personnel', label: 'Personnel' },
    { value: 'biological', label: 'Biological' }, { value: 'fire', label: 'Fire' },
    { value: 'structural', label: 'Structural' }, { value: 'environmental', label: 'Environmental' },
    { value: 'security', label: 'Security' }, { value: 'other', label: 'Other' }
  ];

  const riskTypes = [
    { value: 'health_safety', label: 'Health & Safety' }, { value: 'environmental', label: 'Environmental' },
    { value: 'production', label: 'Production' }, { value: 'operational', label: 'Operational' },
    { value: 'financial', label: 'Financial' }, { value: 'regulatory', label: 'Regulatory' },
    { value: 'reputational', label: 'Reputational' }
  ];

  const likelihoodLabels = ['Very Unlikely', 'Unlikely', 'Possible', 'Likely', 'Very Likely'];
  const severityLabels = ['Minimal', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

  useEffect(() => {
    document.body.classList.add("primary-bg");
    if (editMode && existingRiskData) {
      if (existingRiskData.location) setRiskLocation(existingRiskData.location);
      else if (existingRiskData.area) setRiskLocation(existingRiskData.area);
    }
    return () => document.body.classList.remove("primary-bg");
  }, [editMode, existingRiskData]);

  useEffect(() => {
    if (!hasExistingControls) {
      if (formData.residual_likelihood !== formData.inherent_likelihood || formData.residual_severity !== formData.inherent_severity) {
        setFormData(prev => ({ ...prev, residual_likelihood: prev.inherent_likelihood, residual_severity: prev.inherent_severity }));
      }
      setResidualRiskError('');
    } else {
      const inherentScore = formData.inherent_likelihood * formData.inherent_severity;
      const residualScore = formData.residual_likelihood * formData.residual_severity;
      setResidualRiskError(residualScore > inherentScore ? 'Residual risk cannot be higher than inherent risk' : '');
    }
  }, [formData.inherent_likelihood, formData.inherent_severity, formData.residual_likelihood, formData.residual_severity, hasExistingControls]);

  useEffect(() => {
    if (editMode && existingRiskData?.id) {
      setLoadingActions(true);
      riskManagementService.getActionsByRiskId(existingRiskData.id)
        .then(actions => setRelatedActions(actions))
        .catch(() => setRelatedActions([]))
        .finally(() => setLoadingActions(false));
    }
  }, [editMode, existingRiskData?.id]);

  const handleLocationSet = (loc) => { setRiskLocation(loc); setShowLocationMap(false); };
  const handleRemoveLocation = () => setRiskLocation(null);

  const handleEditAction = async (actionId) => {
    try { const d = await riskManagementService.getActionById(actionId); navigate('/actions/create', { state: { editMode: true, actionData: d } }); }
    catch (e) { alert('Failed to load action details for editing'); }
  };

  const shouldSuggestLocation = () => ['weather', 'pests_diseases', 'biosecurity', 'equipment', 'chemical', 'fire', 'structural', 'environmental'].includes(formData.risk_category);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value) : value }));
  };

  const calculateRiskScore = (likelihood, severity) => {
    const score = likelihood * severity;
    if (score <= 4) return { score, level: 'Low', color: '#22c55e' };
    if (score <= 9) return { score, level: 'Medium', color: '#f59e0b' };
    if (score <= 16) return { score, level: 'High', color: '#ef4444' };
    return { score, level: 'Critical', color: '#991b1b' };
  };

  const getCellColor = (l, s) => { const sc = l * s; if (sc <= 4) return '#22c55e'; if (sc <= 9) return '#f59e0b'; if (sc <= 16) return '#ef4444'; return '#991b1b'; };

  const handleMatrixClick = (likelihood, severity, type = 'inherent') => {
    if (type === 'inherent') setFormData(prev => ({ ...prev, inherent_likelihood: likelihood, inherent_severity: severity }));
    else if (hasExistingControls) setFormData(prev => ({ ...prev, residual_likelihood: likelihood, residual_severity: severity }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (residualRiskError) { setError(residualRiskError); return; }
    setLoading(true); setError(null);
    try {
      const cleanedData = {
        ...formData, company_id: user.company_id,
        owner_id: formData.owner_id || null, regulatory_requirements: formData.regulatory_requirements || null,
        existing_controls: formData.existing_controls || null, potential_consequences: formData.potential_consequences || null,
        location_description: formData.location_description || null,
        location: riskLocation?.type === 'Point' ? riskLocation : null,
        area: riskLocation?.type === 'Polygon' ? riskLocation : null
      };
      if (editMode && existingRiskData?.id) {
        await riskManagementService.updateRisk(existingRiskData.id, cleanedData);
      } else {
        await riskManagementService.createRisk(cleanedData);
      }
      setSuccess(true);
      setTimeout(() => navigate('/riskdashboard'), 2000);
    } catch (error) {
      if (error.response?.status === 422) {
        const ve = error.response.data?.detail;
        setError(Array.isArray(ve) ? `Validation error: ${ve.map(e => `${e.loc?.join('.')} - ${e.msg}`).join(', ')}` : `Validation error: ${JSON.stringify(ve)}`);
      } else {
        setError(error.response?.data?.detail || error.message || `Failed to ${editMode ? 'update' : 'create'} risk`);
      }
    } finally { setLoading(false); }
  };

  const inherentAssessment = calculateRiskScore(formData.inherent_likelihood, formData.inherent_severity);
  const residualAssessment = calculateRiskScore(formData.residual_likelihood, formData.residual_severity);

  const RiskMatrix = ({ type, assessment }) => {
    const isResidual = type === 'residual';
    const disabled = isResidual && !hasExistingControls;
    const currentL = isResidual ? formData.residual_likelihood : formData.inherent_likelihood;
    const currentS = isResidual ? formData.residual_severity : formData.inherent_severity;

    return (
      <div>
        <h4 style={{ margin: '0 0 var(--space-base) 0', fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text)' }}>
          {isResidual ? 'Residual Risk (With Implemented Controls)' : 'Inherent Risk (Without Controls)'}
          {isResidual && !hasExistingControls && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)', fontWeight: 400, display: 'block' }}>{editMode ? 'Complete actions to enable residual risk reduction' : 'Must equal inherent risk - create and complete actions first'}</span>}
          {isResidual && hasExistingControls && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', fontWeight: 400, display: 'block' }}>Risk reduction enabled - {relatedActions.filter(a => a.status === 'completed' || a.status === 'verified' || (a.progress_percentage >= 100)).length} completed action(s)</span>}
        </h4>
        <div style={{ background: 'var(--color-surface-warm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-base)', opacity: disabled ? 0.6 : 1 }}>
          {isResidual && residualRiskError && <div className="rm-error" style={{ marginBottom: 'var(--space-base)', fontSize: 'var(--font-size-xs)' }}>{residualRiskError}</div>}
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-base)', textAlign: 'center' }}>
            {disabled ? (editMode ? 'Complete risk actions to enable residual risk adjustment' : 'Create and complete actions first') : 'Click to select likelihood x severity'}
          </div>
          <div style={{ display: 'inline-block', border: '2px solid var(--color-charcoal)', borderRadius: '4px' }}>
            <div style={{ display: 'flex' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: 80, height: 60, display: 'flex', alignItems: 'end', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 500, color: 'var(--color-text)', borderRight: '1px solid #9ca3af', borderBottom: '1px solid #9ca3af', paddingBottom: 4 }}>SEVERITY</div>
                {[5,4,3,2,1].map((s, i) => (
                  <div key={s} style={{ width: 80, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 500, color: 'var(--color-text)', borderRight: '1px solid #9ca3af', borderTop: i > 0 ? '1px solid #9ca3af' : 'none', textAlign: 'center' }}>{severityLabels[s-1]}</div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', height: 60 }}>
                  {[1,2,3,4,5].map((l, i) => (
                    <div key={l} style={{ width: 30, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 500, color: 'var(--color-text)', borderLeft: i > 0 ? '1px solid #9ca3af' : 'none', borderBottom: '1px solid #9ca3af', writingMode: 'vertical-rl', textOrientation: 'mixed' }}>{likelihoodLabels[l-1]}</div>
                  ))}
                </div>
                {[5,4,3,2,1].map(s => (
                  <div key={s} style={{ display: 'flex' }}>
                    {[1,2,3,4,5].map(l => {
                      const sel = currentL === l && currentS === s;
                      return (
                        <div key={`${type}-${l}-${s}`} onClick={() => handleMatrixClick(l, s, type)}
                          style={{ width: 30, height: 30, backgroundColor: getCellColor(l, s), border: '1px solid #fff', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 'bold', color: 'white', position: 'relative', opacity: sel ? 1 : 0.8, transform: sel ? 'scale(1.1)' : 'scale(1)', boxShadow: sel ? '0 0 0 2px var(--color-primary)' : 'none', transition: 'all 0.2s ease' }}>
                          {l * s}
                          {sel && <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, backgroundColor: 'var(--color-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, color: 'white' }}>✓</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 4, fontSize: '0.625rem', fontWeight: 500, color: 'var(--color-text)', borderTop: '1px solid #9ca3af' }}>LIKELIHOOD</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div className="rm-form-header">
        <h1>
          {editMode ? 'Edit Risk:' : 'Create New Risk'}
          {editMode && existingRiskData && <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-text-muted)', fontWeight: 500 }}> {existingRiskData.risk_title}</span>}
        </h1>
        <div className="rm-form-header-actions">
          <button className="rm-btn-ghost" onClick={() => navigate('/riskdashboard')}>Cancel</button>
        </div>
      </div>

      {/* Risk Scores */}
      <div className="rm-form-section">
        <div className="rm-form-grid rm-form-grid--2col">
          <div className="rm-risk-score" style={{ border: `2px solid ${inherentAssessment.color}` }}>
            <div><strong>Inherent Risk Score:</strong> {inherentAssessment.score}</div>
            <div style={{ background: inherentAssessment.color, color: 'white', padding: '2px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--font-size-base)', fontWeight: 500, display: 'inline-block', marginTop: 'var(--space-xs)' }}>{inherentAssessment.level} Risk</div>
          </div>
          <div className="rm-risk-score" style={{ border: `2px solid ${residualAssessment.color}` }}>
            <div><strong>Residual Risk Score:</strong> {residualAssessment.score}</div>
            <div style={{ background: residualAssessment.color, color: 'white', padding: '2px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--font-size-base)', fontWeight: 500, display: 'inline-block', marginTop: 'var(--space-xs)' }}>{residualAssessment.level} Risk</div>
            {inherentAssessment.score > residualAssessment.score && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', marginTop: 'var(--space-xs)', fontWeight: 500 }}>Risk Reduced by {inherentAssessment.score - residualAssessment.score} points</div>}
          </div>
        </div>
      </div>

      {success && <div className="rm-success">Risk {editMode ? 'updated' : 'created'} successfully! Redirecting to dashboard...</div>}
      {error && <div className="rm-error">{typeof error === 'string' ? error : JSON.stringify(error)}</div>}

      <form onSubmit={handleSubmit}>
        <div className="rm-form-section">
          <div className="rm-form-section-header"><h3>Basic Information</h3></div>

          <div style={{ marginBottom: 'var(--space-base)' }}>
            <label className="rm-field-label">Risk Title <span className="rm-required">*</span></label>
            <input className="rm-input" type="text" name="risk_title" value={formData.risk_title} onChange={handleChange} required placeholder="e.g., Chemical spill during spraying operations" />
          </div>

          <div style={{ marginBottom: 'var(--space-base)' }}>
            <label className="rm-field-label">Risk Description <span className="rm-required">*</span></label>
            <textarea className="rm-textarea" name="risk_description" value={formData.risk_description} onChange={handleChange} required rows={4} placeholder="Describe the risk in detail..." />
          </div>

          <div className="rm-form-grid rm-form-grid--2col" style={{ marginBottom: 'var(--space-base)' }}>
            <div>
              <label className="rm-field-label">Risk Category <span className="rm-required">*</span></label>
              <select className="rm-select" name="risk_category" value={formData.risk_category} onChange={handleChange} required>
                <option value="">Select Category</option>
                {riskCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>Categories help identify where risks originate</div>
            </div>
            <div>
              <label className="rm-field-label">Risk Type <span className="rm-required">*</span></label>
              <select className="rm-select" name="risk_type" value={formData.risk_type} onChange={handleChange} required>
                <option value="">Select Type</option>
                {riskTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>Types identify the kind of impact risks might have</div>
            </div>
          </div>

          {/* Location */}
          <div style={{ marginBottom: 'var(--space-base)', padding: 'var(--space-base)', background: shouldSuggestLocation() ? 'var(--color-info-bg)' : 'var(--color-surface-warm)', border: `1px solid ${shouldSuggestLocation() ? '#0ea5e9' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
              <label className="rm-field-label" style={{ marginBottom: 0 }}>Risk Location (Optional)</label>
              {!riskLocation && <button type="button" className="rm-btn-primary" onClick={() => setShowLocationMap(true)}>Set Location on Map</button>}
            </div>
            {shouldSuggestLocation() && !riskLocation && <div className="rm-info" style={{ marginBottom: 'var(--space-sm)' }}>This type of risk typically has a physical location - consider adding it on the map</div>}
            {riskLocation ? (
              <div className="rm-success" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Location Set: {riskLocation.type === 'Point' ? 'Point Location' : 'Area Risk'}</div>
                  {riskLocation.type === 'Point' && <div style={{ fontSize: 'var(--font-size-base)' }}>Coordinates: {riskLocation.coordinates[1].toFixed(6)}, {riskLocation.coordinates[0].toFixed(6)}</div>}
                  {riskLocation.type === 'Polygon' && <div style={{ fontSize: 'var(--font-size-base)' }}>Area polygon with {riskLocation.coordinates[0].length} points</div>}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <button type="button" className="rm-btn-primary rm-btn-sm" onClick={() => setShowLocationMap(true)}>Edit</button>
                  <button type="button" className="rm-btn-danger rm-btn-sm" onClick={handleRemoveLocation}>Remove</button>
                </div>
              </div>
            ) : <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)' }}>No location set. Click "Set Location on Map" to add a specific location for this risk.</div>}
          </div>

          <div style={{ marginBottom: 'var(--space-base)' }}>
            <label className="rm-field-label">Location Description</label>
            <input className="rm-input" type="text" name="location_description" value={formData.location_description} onChange={handleChange} placeholder="e.g., Main vineyard block, Chemical storage shed" />
          </div>
        </div>

        {/* Risk Assessment */}
        <div className="rm-form-section">
          <div className="rm-form-section-header"><h3>Risk Assessment</h3></div>
          <div className="rm-form-grid rm-form-grid--2col" style={{ gap: 'var(--space-xl)' }}>
            <RiskMatrix type="inherent" assessment={inherentAssessment} />
            <RiskMatrix type="residual" assessment={residualAssessment} />
          </div>

          {/* Selected Values */}
          <div className="rm-risk-values" style={{ marginTop: 'var(--space-base)' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-sm)' }}><strong>Inherent:</strong> L{formData.inherent_likelihood} x S{formData.inherent_severity} = {inherentAssessment.score}</div>
              <div style={{ display: 'inline-block', background: inherentAssessment.color, color: 'white', padding: '2px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>{inherentAssessment.level} Risk</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-sm)' }}><strong>Residual:</strong> L{formData.residual_likelihood} x S{formData.residual_severity} = {residualAssessment.score}</div>
              <div style={{ display: 'inline-block', background: residualAssessment.color, color: 'white', padding: '2px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>{residualAssessment.level} Risk</div>
            </div>
          </div>
        </div>

        {/* Additional Details */}
        <div className="rm-form-section">
          <div className="rm-form-section-header"><h3>Additional Details</h3></div>

          <div style={{ marginBottom: 'var(--space-base)' }}>
            <label className="rm-field-label">Potential Consequences</label>
            <textarea className="rm-textarea" name="potential_consequences" value={formData.potential_consequences} onChange={handleChange} rows={3} placeholder="What could happen if this risk occurs?" />
          </div>

          <div style={{ marginBottom: 'var(--space-base)' }}>
            <label className="rm-field-label">Existing Controls Documentation <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>(For documentation only)</span></label>
            <textarea className="rm-textarea" name="existing_controls" value={formData.existing_controls} onChange={handleChange} rows={3} placeholder="Document any existing controls or protective measures" />
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-xs)' }}>Residual risk reduction is enabled by completed actions, not this text field.</div>

            {editMode && (
              <div style={{ marginTop: 'var(--space-base)', padding: 'var(--space-base)', background: 'var(--color-surface-warm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div className="rm-section-header" style={{ marginBottom: 'var(--space-md)' }}>
                  <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>Related Risk Actions ({relatedActions.length})</h4>
                  <button type="button" className="rm-btn-primary rm-btn-sm" onClick={() => navigate('/actions/create', { state: { preSelectedRiskId: existingRiskData.id, preSelectedRiskTitle: existingRiskData.risk_title } })}>Add Action</button>
                </div>

                {loadingActions ? <div className="rm-loading" style={{ padding: 'var(--space-base)' }}>Loading actions...</div> :
                relatedActions.length > 0 ? (
                  <div className="rm-related-actions">
                    {relatedActions.map((action, i) => {
                      const isOverdue = action.target_completion_date && new Date(action.target_completion_date) < new Date() && !['completed', 'cancelled'].includes(action.status);
                      const progress = action.progress_percentage || 0;
                      return (
                        <div key={action.id || i} className="rm-related-action">
                          <div className="rm-related-action-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-xs)' }}>
                            <div className="rm-cell-title">{action.action_title || 'Untitled Action'}</div>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', fontSize: 'var(--font-size-xs)' }}>
                              <span className={`rm-badge rm-badge--priority-${action.priority || 'medium'}`}>{action.priority || 'Medium'}</span>
                              <span className={`rm-badge rm-badge--${isOverdue ? 'overdue' : (action.status || 'open')}`}>{isOverdue ? 'Overdue' : (action.status?.replace('_', ' ') || 'Open')}</span>
                              {action.target_completion_date && <span className="muted">Due: {new Date(action.target_completion_date).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                            <div className="rm-progress">
                              <div className="rm-progress-bar" style={{ width: 60 }}><div className="rm-progress-fill" style={{ width: `${Math.min(progress, 100)}%`, background: progress === 100 ? '#22c55e' : progress >= 50 ? 'var(--color-warning)' : 'var(--color-danger)' }} /></div>
                              <span className="rm-progress-text">{progress}%</span>
                            </div>
                            <button type="button" className="rm-btn-primary rm-btn-sm" onClick={() => handleEditAction(action.id)}>Edit</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rm-empty" style={{ padding: 'var(--space-base)' }}>
                    <div>No actions created for this risk yet</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-xs)' }}>Actions help implement controls to reduce risk</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 'var(--space-base)' }}>
            <label className="rm-field-label">Regulatory Requirements</label>
            <textarea className="rm-textarea" name="regulatory_requirements" value={formData.regulatory_requirements} onChange={handleChange} rows={2} placeholder="Any specific regulatory requirements related to this risk?" />
          </div>

          <div style={{ marginBottom: 'var(--space-base)' }}>
            <label className="rm-field-label">Review Frequency (days)</label>
            <input className="rm-input" type="number" name="review_frequency_days" value={formData.review_frequency_days} onChange={handleChange} min="1" max="1095" style={{ width: 200 }} />
            <small style={{ display: 'block', marginTop: 'var(--space-xs)', color: 'var(--color-text-muted)' }}>How often should this risk be reviewed? (Default: 365 days)</small>
          </div>

          <div className="rm-submit-actions" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-base)' }}>
            <button type="button" className="rm-btn-ghost" onClick={() => navigate('/riskdashboard')} disabled={loading}>Cancel</button>
            <button type="submit" className="rm-btn-primary" disabled={loading || !!residualRiskError}>
              {loading ? (editMode ? 'Updating...' : 'Creating...') : (editMode ? 'Update Risk' : 'Create Risk')}
            </button>
          </div>
        </div>
      </form>

      {showLocationMap && <RiskLocationMap isOpen={showLocationMap} onClose={() => setShowLocationMap(false)} onLocationSet={handleLocationSet} initialLocation={riskLocation} />}
      <MobileNavigation />
    </div>
  );
}

export default CreateRisk;
