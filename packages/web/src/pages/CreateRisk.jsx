import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import {riskManagementService} from '@vineyard/shared';
import RiskLocationMap from '../components/RiskLocationMap';

function CreateRisk() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we're in edit mode
  const editMode = location.state?.editMode || false;
  const existingRiskData = location.state?.riskData || null;
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Location map state
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [riskLocation, setRiskLocation] = useState(null);
  const [relatedActions, setRelatedActions] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);
  
  // Form state - initialize with existing data if in edit mode
  const [formData, setFormData] = useState(() => {
    if (editMode && existingRiskData) {
      return {
        risk_title: existingRiskData.risk_title || '',
        risk_description: existingRiskData.risk_description || '',
        risk_category: existingRiskData.risk_category || '',
        risk_type: existingRiskData.risk_type || '',
        inherent_likelihood: existingRiskData.inherent_likelihood || 1,
        inherent_severity: existingRiskData.inherent_severity || 1,
        residual_likelihood: existingRiskData.residual_likelihood || existingRiskData.inherent_likelihood || 1,
        residual_severity: existingRiskData.residual_severity || existingRiskData.inherent_severity || 1,
        location_description: existingRiskData.location_description || '',
        potential_consequences: existingRiskData.potential_consequences || '',
        existing_controls: existingRiskData.existing_controls || '',
        regulatory_requirements: existingRiskData.regulatory_requirements || '',
        owner_id: existingRiskData.owner_id || '',
        review_frequency_days: existingRiskData.review_frequency_days || 365
      };
    }
    return {
      risk_title: '',
      risk_description: '',
      risk_category: '',
      risk_type: '',
      inherent_likelihood: 1,
      inherent_severity: 1,
      residual_likelihood: 1,
      residual_severity: 1,
      location_description: '',
      potential_consequences: '',
      existing_controls: '',
      regulatory_requirements: '',
      owner_id: '',
      review_frequency_days: 365
    };
  });

  // Check if risk has existing controls that would justify different residual scores
  const hasImplementedActions = useMemo(() => {
    if (!editMode || !relatedActions.length) return false;
    
    // Check if there are any completed or verified actions
    return relatedActions.some(action => 
      action.status === 'completed' || 
      action.status === 'verified' ||
      (action.progress_percentage && action.progress_percentage >= 100)
    );
  }, [editMode, relatedActions]);

  // For create mode, there are never implemented actions
  const hasExistingControls = editMode ? hasImplementedActions : false;

  // Validation state for residual risk
  const [residualRiskError, setResidualRiskError] = useState('');

  // Options for dropdowns
  const riskCategories = [
    { value: 'weather', label: 'Weather' },
    { value: 'pests_diseases', label: 'Pests & Diseases' },
    { value: 'biosecurity', label: 'Biosecurity' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'chemical', label: 'Chemical' },
    { value: 'personnel', label: 'Personnel' },
    { value: 'biological', label: 'Biological' },
    { value: 'fire', label: 'Fire' },
    { value: 'structural', label: 'Structural' },
    { value: 'environmental', label: 'Environmental' },
    { value: 'security', label: 'Security' },
    { value: 'other', label: 'Other' }
  ];

  const riskTypes = [
    { value: 'health_safety', label: 'Health & Safety' },
    { value: 'environmental', label: 'Environmental' },
    { value: 'production', label: 'Production' },
    { value: 'operational', label: 'Operational' },
    { value: 'financial', label: 'Financial' },
    { value: 'regulatory', label: 'Regulatory' },
    { value: 'reputational', label: 'Reputational' }
  ];

  const likelihoodLabels = [
    'Very Unlikely',
    'Unlikely',
    'Possible',
    'Likely',
    'Very Likely'
  ];

  const severityLabels = [
    'Minimal',
    'Minor',
    'Moderate',
    'Major',
    'Catastrophic'
  ];

  // Set body background and handle existing location data
  useEffect(() => {
    document.body.classList.add("primary-bg");
    
    // If in edit mode, set the existing location data
    if (editMode && existingRiskData) {
      if (existingRiskData.location) {
        setRiskLocation(existingRiskData.location);
      } else if (existingRiskData.area) {
        setRiskLocation(existingRiskData.area);
      }
    }
    
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, [editMode, existingRiskData]);

  // Auto-sync residual risk with inherent risk when no controls exist
  useEffect(() => {
    if (!hasExistingControls) {
      // Auto-sync residual risk to match inherent risk when no controls exist
      if (formData.residual_likelihood !== formData.inherent_likelihood || 
          formData.residual_severity !== formData.inherent_severity) {
        
        setFormData(prev => ({
          ...prev,
          residual_likelihood: prev.inherent_likelihood,
          residual_severity: prev.inherent_severity
        }));
      }
      setResidualRiskError('');
    } else {
      // Validate that residual risk is not higher than inherent risk when controls exist
      const inherentScore = formData.inherent_likelihood * formData.inherent_severity;
      const residualScore = formData.residual_likelihood * formData.residual_severity;
      
      if (residualScore > inherentScore) {
        setResidualRiskError('Residual risk cannot be higher than inherent risk');
      } else {
        setResidualRiskError('');
      }
    }
  }, [formData.inherent_likelihood, formData.inherent_severity, formData.residual_likelihood, formData.residual_severity, hasExistingControls]);

  useEffect(() => {
    const fetchRelatedActions = async () => {
      if (editMode && existingRiskData?.id) {
        setLoadingActions(true);
        try {
          const actions = await riskManagementService.getActionsByRiskId(existingRiskData.id);
          setRelatedActions(actions);
          console.log('✅ Related actions loaded:', actions);
        } catch (error) {
          console.error('❌ Error loading related actions:', error);
          setRelatedActions([]);
        } finally {
          setLoadingActions(false);
        }
      }
    };

    fetchRelatedActions();
  }, [editMode, existingRiskData?.id]);

  // Handle location from map
  const handleLocationSet = (location) => {
    setRiskLocation(location);
    setShowLocationMap(false);
  };

  // Handle remove location
  const handleRemoveLocation = () => {
    setRiskLocation(null);
  };

    const handleEditAction = async (actionId) => {
    try {
      console.log('🔄 Fetching action details for edit:', actionId);
      
      // Fetch the full action details
      const actionDetails = await riskManagementService.getActionById(actionId);
      
      console.log('✅ Action details fetched:', actionDetails);
      
      // Navigate to create action page with the action data as state
      navigate('/actions/create', { 
        state: { 
          editMode: true,
          actionData: actionDetails
        } 
      });
    } catch (error) {
      console.error('❌ Error fetching action details for edit:', error);
      alert('Failed to load action details for editing');
    }
  };


  // Check if risk category suggests location
  const shouldSuggestLocation = () => {
    const locationSuggestedCategories = [
      'weather', 'pests_diseases', 'biosecurity', 'equipment', 
      'chemical', 'fire', 'structural', 'environmental'
    ];
    return locationSuggestedCategories.includes(formData.risk_category);
  };

  // Handle form field changes
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) : value
    }));
  };

  // Calculate risk score and level
  const calculateRiskScore = (likelihood, severity) => {
    const score = likelihood * severity;
    let level, color;
    
    if (score <= 4) {
      level = 'Low';
      color = '#22c55e';
    } else if (score <= 9) {
      level = 'Medium';
      color = '#f59e0b';
    } else if (score <= 16) {
      level = 'High';
      color = '#ef4444';
    } else {
      level = 'Critical';
      color = '#991b1b';
    }
    
    return { score, level, color };
  };

  // Get cell color for risk matrix
  const getCellColor = (likelihood, severity) => {
    const score = likelihood * severity;
    if (score <= 4) return '#22c55e';
    if (score <= 9) return '#f59e0b';
    if (score <= 16) return '#ef4444';
    return '#991b1b';
  };

  // Handle risk matrix cell click
  const handleMatrixClick = (likelihood, severity, type = 'inherent') => {
    if (type === 'inherent') {
      setFormData(prev => ({
        ...prev,
        inherent_likelihood: likelihood,
        inherent_severity: severity
      }));
    } else {
      // Only allow residual risk changes if there are existing controls
      if (hasExistingControls) {
        setFormData(prev => ({
          ...prev,
          residual_likelihood: likelihood,
          residual_severity: severity
        }));
      }
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check for residual risk validation errors
    if (residualRiskError) {
      setError(residualRiskError);
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      console.log(`🔄 ${editMode ? 'Updating' : 'Creating'} risk with data:`, formData);
      console.log('🔄 Risk location:', riskLocation);
      
      // Clean the form data - convert empty strings to null but KEEP company_id
      const cleanedData = {
        ...formData,
        company_id: user.company_id,
        owner_id: formData.owner_id || null,
        regulatory_requirements: formData.regulatory_requirements || null,
        existing_controls: formData.existing_controls || null,
        potential_consequences: formData.potential_consequences || null,
        location_description: formData.location_description || null,
        // Add location data if present
        location: riskLocation?.type === 'Point' ? riskLocation : null,
        area: riskLocation?.type === 'Polygon' ? riskLocation : null
      };
      
      console.log(`🔄 Cleaned data being sent:`, cleanedData);
      
      let result;
      if (editMode && existingRiskData?.id) {
        // Update existing risk
        result = await riskManagementService.updateRisk(existingRiskData.id, cleanedData);
        console.log('✅ Risk updated successfully:', result);
        setSuccess(true);
        
        // Redirect after 2 seconds
        setTimeout(() => {
          navigate('/riskdashboard');
        }, 2000);
      } else {
        // Create new risk
        result = await riskManagementService.createRisk(cleanedData);
        console.log('✅ Risk created successfully:', result);
        setSuccess(true);
        
        // Redirect after 2 seconds
        setTimeout(() => {
          navigate('/riskdashboard');
        }, 2000);
      }

    } catch (error) {
      console.error(`❌ Error ${editMode ? 'updating' : 'creating'} risk:`, error);
      console.error('❌ Error response:', error.response?.data);
      
      // Better error handling for validation errors
      if (error.response?.status === 422) {
        const validationErrors = error.response.data?.detail;
        if (Array.isArray(validationErrors)) {
          const errorMessages = validationErrors.map(err => `${err.loc?.join('.')} - ${err.msg}`).join(', ');
          setError(`Validation error: ${errorMessages}`);
        } else {
          setError(`Validation error: ${JSON.stringify(validationErrors)}`);
        }
      } else {
        setError(error.response?.data?.detail || error.message || `Failed to ${editMode ? 'update' : 'create'} risk`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    navigate('/riskdashboard');
  };

  const inherentAssessment = calculateRiskScore(formData.inherent_likelihood, formData.inherent_severity);
  const residualAssessment = calculateRiskScore(formData.residual_likelihood, formData.residual_severity);

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
        
        {/* Header */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid #f3f4f6'
          }}>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '600' }}>
              {editMode ? 'Edit Risk:' : 'Create New Risk'}
              {editMode && existingRiskData && (
                <span style={{ fontSize: '1.0rem', color: '#6b7280', fontWeight: '500' }}>
                  {' '}{existingRiskData.risk_title}
                </span>
              )}
            </h1>
            <button 
              onClick={handleCancel}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
          
          {/* Risk Score Display */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem'
          }}>
            <div style={{
              padding: '1rem',
              background: '#f8fafc',
              border: `2px solid ${inherentAssessment.color}`,
              borderRadius: '8px'
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Inherent Risk Score:</strong> {inherentAssessment.score}
              </div>
              <div style={{
                background: inherentAssessment.color,
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'inline-block'
              }}>
                {inherentAssessment.level} Risk
              </div>
            </div>
            
            <div style={{
              padding: '1rem',
              background: '#f8fafc',
              border: `2px solid ${residualAssessment.color}`,
              borderRadius: '8px'
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Residual Risk Score:</strong> {residualAssessment.score}
              </div>
              <div style={{
                background: residualAssessment.color,
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'inline-block'
              }}>
                {residualAssessment.level} Risk
              </div>
              {inherentAssessment.score > residualAssessment.score && (
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#059669', 
                  marginTop: '0.25rem',
                  fontWeight: '500'
                }}>
                  ↓ Risk Reduced by {inherentAssessment.score - residualAssessment.score} points
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div style={{
            background: '#dcfce7',
            border: '1px solid #22c55e',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#166534'
          }}>
            ✅ Risk {editMode ? 'updated' : 'created'} successfully! Redirecting to dashboard...
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            background: '#fecaca',
            border: '1px solid #dc2626',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#991b1b'
          }}>
            ❌ {typeof error === 'string' ? error : JSON.stringify(error)}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            
            {/* Basic Information */}
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Basic Information
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Risk Title *
              </label>
              <input
                type="text"
                name="risk_title"
                value={formData.risk_title}
                onChange={handleChange}
                required
                placeholder="e.g., Chemical spill during spraying operations"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Risk Description *
              </label>
              <textarea
                name="risk_description"
                value={formData.risk_description}
                onChange={handleChange}
                required
                rows={4}
                placeholder="Describe the risk in detail..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              {/* Risk Category */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Risk Category *
                </label>
                <select
                  name="risk_category"
                  value={formData.risk_category}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Select Category</option>
                  {riskCategories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.7rem', fontWeight: '500' }}>
                  Categories help identify where risks originate
                </label>
              </div>

              {/* Risk Type */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Risk Type *
                </label>
                <select
                  name="risk_type"
                  value={formData.risk_type}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Select Type</option>
                  {riskTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.7rem', fontWeight: '500' }}>
                  Types identify the kind of impact risks might have
                </label>
              </div>
            </div>

            {/* Location Mapping Section */}
            <div style={{ 
              marginBottom: '1rem',
              padding: '1rem',
              background: shouldSuggestLocation() ? '#f0f9ff' : '#f8fafc',
              border: `1px solid ${shouldSuggestLocation() ? '#0ea5e9' : '#e5e7eb'}`,
              borderRadius: '8px'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '0.5rem'
              }}>
                <label style={{ fontWeight: '500', margin: 0 }}>
                  📍 Risk Location (Optional)
                </label>
                {!riskLocation && (
                  <button
                    type="button"
                    onClick={() => setShowLocationMap(true)}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    📍 Set Location on Map
                  </button>
                )}
              </div>
              
              {shouldSuggestLocation() && !riskLocation && (
                <div style={{ 
                  fontSize: '0.875rem', 
                  color: '#0369a1',
                  marginBottom: '0.5rem'
                }}>
                  💡 This type of risk typically has a physical location - consider adding it on the map
                </div>
              )}
              
              {riskLocation ? (
                <div style={{
                  background: '#dcfce7',
                  border: '1px solid #22c55e',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: '500', color: '#166534' }}>
                      ✅ Location Set: {riskLocation.type === 'Point' ? 'Point Location' : 'Area Risk'}
                    </div>
                    {riskLocation.type === 'Point' && (
                      <div style={{ fontSize: '0.875rem', color: '#166534' }}>
                        Coordinates: {riskLocation.coordinates[1].toFixed(6)}, {riskLocation.coordinates[0].toFixed(6)}
                      </div>
                    )}
                    {riskLocation.type === 'Polygon' && (
                      <div style={{ fontSize: '0.875rem', color: '#166534' }}>
                        Area polygon with {riskLocation.coordinates[0].length} points
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowLocationMap(true)}
                      style={{
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLocation}
                      style={{
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ 
                  fontSize: '0.875rem', 
                  color: '#6b7280'
                }}>
                  No location set. Click "Set Location on Map" to add a specific location for this risk.
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Location Description
              </label>
              <input
                type="text"
                name="location_description"
                value={formData.location_description}
                onChange={handleChange}
                placeholder="e.g., Main vineyard block, Chemical storage shed"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            {/* Risk Assessment Matrix */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Risk Assessment
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1rem' }}>
              {/* Inherent Risk Matrix */}
              <div>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#374151' }}>
                  Inherent Risk (Without Controls)
                </h4>
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem'
                }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    marginBottom: '1rem',
                    textAlign: 'center'
                  }}>
                    Click to select likelihood × severity
                  </div>
                  
                  {/* Inherent Risk Matrix Grid */}
                  <div style={{
                    display: 'inline-block',
                    border: '2px solid #374151',
                    borderRadius: '4px'
                  }}>
                    <div style={{ display: 'flex' }}>
                      {/* Y-axis Severity Labels */}
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column'
                      }}>
                        <div style={{ 
                          width: '80px',
                          height: '60px',
                          display: 'flex',
                          alignItems: 'end',
                          justifyContent: 'center',
                          fontSize: '0.625rem',
                          fontWeight: '500',
                          color: '#374151',
                          borderRight: '1px solid #9ca3af',
                          borderBottom: '1px solid #9ca3af',
                          paddingBottom: '4px'
                        }}>
                          SEVERITY
                        </div>
                        {[5, 4, 3, 2, 1].map((severity, index) => (
                          <div key={severity} style={{
                            width: '80px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.625rem',
                            fontWeight: '500',
                            color: '#374151',
                            borderRight: '1px solid #9ca3af',
                            borderTop: index > 0 ? '1px solid #9ca3af' : 'none',
                            textAlign: 'center'
                          }}>
                            {severityLabels[severity - 1]}
                          </div>
                        ))}
                      </div>
                      
                      <div>
                        {/* Likelihood labels row */}
                        <div style={{ display: 'flex', height: '60px' }}>
                          {[1, 2, 3, 4, 5].map((likelihood, index) => (
                            <div key={likelihood} style={{
                              width: '30px',
                              height: '60px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.625rem',
                              fontWeight: '500',
                              color: '#374151',
                              borderLeft: index > 0 ? '1px solid #9ca3af' : 'none',
                              borderBottom: '1px solid #9ca3af',
                              textAlign: 'center',
                              writingMode: 'vertical-rl',
                              textOrientation: 'mixed'
                            }}>
                              {likelihoodLabels[likelihood - 1]}
                            </div>
                          ))}
                        </div>
                        
                        {/* Grid cells */}
                        {[5, 4, 3, 2, 1].map((severity, severityIndex) => (
                          <div key={severity} style={{ display: 'flex' }}>
                            {[1, 2, 3, 4, 5].map((likelihood, likelihoodIndex) => (
                              <div
                                key={`inherent-${likelihood}-${severity}`}
                                onClick={() => handleMatrixClick(likelihood, severity, 'inherent')}
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  backgroundColor: getCellColor(likelihood, severity),
                                  border: '1px solid #ffffff',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.625rem',
                                  fontWeight: 'bold',
                                  color: 'white',
                                  position: 'relative',
                                  opacity: (formData.inherent_likelihood === likelihood && formData.inherent_severity === severity) ? 1 : 0.8,
                                  transform: (formData.inherent_likelihood === likelihood && formData.inherent_severity === severity) ? 'scale(1.1)' : 'scale(1)',
                                  boxShadow: (formData.inherent_likelihood === likelihood && formData.inherent_severity === severity) ? '0 0 0 2px #3b82f6' : 'none',
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                {likelihood * severity}
                                {formData.inherent_likelihood === likelihood && formData.inherent_severity === severity && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '-2px',
                                    right: '-2px',
                                    width: '10px',
                                    height: '10px',
                                    backgroundColor: '#3b82f6',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '6px',
                                    color: 'white'
                                  }}>
                                    ✓
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div style={{
                      textAlign: 'center',
                      padding: '4px',
                      fontSize: '0.625rem',
                      fontWeight: '500',
                      color: '#374151',
                      borderTop: '1px solid #9ca3af'
                    }}>
                      LIKELIHOOD
                    </div>
                  </div>
                </div>
              </div>

              {/* Residual Risk Matrix */}
              <div>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#374151' }}>
                  Residual Risk (With Implemented Controls)
                  {!hasExistingControls && (
                    <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: '400', display: 'block' }}>
                      {editMode ? 
                        'Complete actions to enable residual risk reduction' : 
                        'Must equal inherent risk - create and complete actions first'
                      }
                    </span>
                  )}
                  {hasExistingControls && (
                    <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '400', display: 'block' }}>
                      ✅ Risk reduction enabled - {relatedActions.filter(a => 
                        a.status === 'completed' || a.status === 'verified' || 
                        (a.progress_percentage && a.progress_percentage >= 100)
                      ).length} completed action(s)
                    </span>
                  )}
                </h4>
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  opacity: hasExistingControls ? 1 : 0.6
                }}>
                  {residualRiskError && (
                    <div style={{
                      background: '#fecaca',
                      color: '#991b1b',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      marginBottom: '1rem'
                    }}>
                      {residualRiskError}
                    </div>
                  )}
                  
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    marginBottom: '1rem',
                    textAlign: 'center'
                  }}>
                    {hasExistingControls ? 
                      'Click to select likelihood × severity (reduced by completed actions)' : 
                      editMode ? 
                        'Complete risk actions to enable residual risk adjustment' :
                        'Create and complete actions first to enable residual risk reduction'
                    }
                  </div>
                  
                  {/* Residual Risk Matrix Grid */}
                  <div style={{
                    display: 'inline-block',
                    border: '2px solid #374151',
                    borderRadius: '4px'
                  }}>
                    <div style={{ display: 'flex' }}>
                      {/* Y-axis Severity Labels */}
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column'
                      }}>
                        <div style={{ 
                          width: '80px',
                          height: '60px',
                          display: 'flex',
                          alignItems: 'end',
                          justifyContent: 'center',
                          fontSize: '0.625rem',
                          fontWeight: '500',
                          color: '#374151',
                          borderRight: '1px solid #9ca3af',
                          borderBottom: '1px solid #9ca3af',
                          paddingBottom: '4px'
                        }}>
                          SEVERITY
                        </div>
                        {[5, 4, 3, 2, 1].map((severity, index) => (
                          <div key={severity} style={{
                            width: '80px',
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.625rem',
                            fontWeight: '500',
                            color: '#374151',
                            borderRight: '1px solid #9ca3af',
                            borderTop: index > 0 ? '1px solid #9ca3af' : 'none',
                            textAlign: 'center'
                          }}>
                            {severityLabels[severity - 1]}
                          </div>
                        ))}
                      </div>
                      
                      <div>
                        {/* Likelihood labels row */}
                        <div style={{ display: 'flex', height: '60px' }}>
                          {[1, 2, 3, 4, 5].map((likelihood, index) => (
                            <div key={likelihood} style={{
                              width: '30px',
                              height: '60px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.625rem',
                              fontWeight: '500',
                              color: '#374151',
                              borderLeft: index > 0 ? '1px solid #9ca3af' : 'none',
                              borderBottom: '1px solid #9ca3af',
                              textAlign: 'center',
                              writingMode: 'vertical-rl',
                              textOrientation: 'mixed'
                            }}>
                              {likelihoodLabels[likelihood - 1]}
                            </div>
                          ))}
                        </div>
                        
                        {/* Grid cells */}
                        {[5, 4, 3, 2, 1].map((severity, severityIndex) => (
                          <div key={severity} style={{ display: 'flex' }}>
                            {[1, 2, 3, 4, 5].map((likelihood, likelihoodIndex) => (
                              <div
                                key={`residual-${likelihood}-${severity}`}
                                onClick={() => handleMatrixClick(likelihood, severity, 'residual')}
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  backgroundColor: getCellColor(likelihood, severity),
                                  border: '1px solid #ffffff',
                                  cursor: hasExistingControls ? 'pointer' : 'not-allowed',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.625rem',
                                  fontWeight: 'bold',
                                  color: 'white',
                                  position: 'relative',
                                  opacity: (formData.residual_likelihood === likelihood && formData.residual_severity === severity) ? 1 : 0.8,
                                  transform: (formData.residual_likelihood === likelihood && formData.residual_severity === severity) ? 'scale(1.1)' : 'scale(1)',
                                  boxShadow: (formData.residual_likelihood === likelihood && formData.residual_severity === severity) ? '0 0 0 2px #3b82f6' : 'none',
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                {likelihood * severity}
                                {formData.residual_likelihood === likelihood && formData.residual_severity === severity && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '-2px',
                                    right: '-2px',
                                    width: '10px',
                                    height: '10px',
                                    backgroundColor: '#3b82f6',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '6px',
                                    color: 'white'
                                  }}>
                                    ✓
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div style={{
                      textAlign: 'center',
                      padding: '4px',
                      fontSize: '0.625rem',
                      fontWeight: '500',
                      color: '#374151',
                      borderTop: '1px solid #9ca3af'
                    }}>
                      LIKELIHOOD
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Values Display */}
            <div style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '6px',
              border: '1px solid #d1d5db'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    <strong>Inherent:</strong> L{formData.inherent_likelihood} × S{formData.inherent_severity} = {inherentAssessment.score}
                  </div>
                  <div style={{
                    display: 'inline-block',
                    background: inherentAssessment.color,
                    color: 'white',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: '500'
                  }}>
                    {inherentAssessment.level} Risk
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    <strong>Residual:</strong> L{formData.residual_likelihood} × S{formData.residual_severity} = {residualAssessment.score}
                  </div>
                  <div style={{
                    display: 'inline-block',
                    background: residualAssessment.color,
                    color: 'white',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: '500'
                  }}>
                    {residualAssessment.level} Risk
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Details */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Additional Details
            </h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Potential Consequences
              </label>
              <textarea
                name="potential_consequences"
                value={formData.potential_consequences}
                onChange={handleChange}
                rows={3}
                placeholder="What could happen if this risk occurs?"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
            </div>


            {/* Existing Controls with Related Actions Summary */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Existing Controls Documentation
                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '400' }}>
                  {' '}(For documentation only - completed actions enable risk reduction)
                </span>
              </label>
              <textarea
                name="existing_controls"
                value={formData.existing_controls}
                onChange={handleChange}
                rows={3}
                placeholder="Document any existing controls or protective measures (this field does not affect residual risk calculation)"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#6b7280', 
                marginTop: '0.25rem' 
              }}>
                💡 <strong>Note:</strong> Residual risk reduction is enabled by completed actions, not this text field. 
                Use this field to document additional context about existing controls.
              </div>

              {/* Related Actions Summary - Only show in edit mode */}
              {editMode && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem'
                  }}>
                    <h4 style={{ 
                      margin: 0, 
                      fontSize: '0.9rem', 
                      fontWeight: '600', 
                      color: '#374151' 
                    }}>
                      📋 Related Risk Actions ({relatedActions.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => navigate('/actions/create', { 
                        state: { 
                          preSelectedRiskId: existingRiskData.id,
                          preSelectedRiskTitle: existingRiskData.risk_title
                        } 
                      })}
                      style={{
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      ➕ Add Action
                    </button>
                  </div>

                  {loadingActions ? (
                    <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                      Loading actions...
                    </div>
                  ) : relatedActions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {relatedActions.map((action, index) => {
                        const isOverdue = action.target_completion_date && 
                                        new Date(action.target_completion_date) < new Date() &&
                                        !['completed', 'cancelled'].includes(action.status);
                        const progress = action.progress_percentage || 0;
                        
                        return (
                          <div key={action.id || index} style={{
                            background: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ 
                                fontWeight: '500', 
                                fontSize: '0.875rem', 
                                color: '#1f2937',
                                marginBottom: '0.25rem' 
                              }}>
                                {action.action_title || 'Untitled Action'}
                              </div>
                              <div style={{
                                display: 'flex',
                                gap: '0.5rem',
                                alignItems: 'center',
                                fontSize: '0.75rem'
                              }}>
                                <span style={{
                                  background: action.priority === 'critical' ? '#fecaca' :
                                            action.priority === 'high' ? '#fed7aa' :
                                            action.priority === 'medium' ? '#fef3c7' : '#f3f4f6',
                                  color: action.priority === 'critical' ? '#991b1b' :
                                        action.priority === 'high' ? '#c2410c' :
                                        action.priority === 'medium' ? '#92400e' : '#374151',
                                  padding: '0.125rem 0.375rem',
                                  borderRadius: '8px',
                                  fontWeight: '500',
                                  textTransform: 'capitalize'
                                }}>
                                  {action.priority || 'Medium'}
                                </span>
                                <span style={{
                                  background: isOverdue ? '#fecaca' : 
                                            action.status === 'completed' ? '#dcfce7' :
                                            action.status === 'in_progress' ? '#dbeafe' : '#fef3c7',
                                  color: isOverdue ? '#991b1b' :
                                        action.status === 'completed' ? '#166534' :
                                        action.status === 'in_progress' ? '#1d4ed8' : '#92400e',
                                  padding: '0.125rem 0.375rem',
                                  borderRadius: '8px',
                                  fontWeight: '500'
                                }}>
                                  {isOverdue ? 'Overdue' : (action.status?.replace('_', ' ') || 'Open')}
                                </span>
                                {action.target_completion_date && (
                                  <span style={{ color: '#6b7280' }}>
                                    Due: {new Date(action.target_completion_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {/* Progress Bar */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{
                                  width: '60px',
                                  height: '6px',
                                  background: '#e5e7eb',
                                  borderRadius: '3px',
                                  overflow: 'hidden'
                                }}>
                                  <div style={{
                                    width: `${Math.min(progress, 100)}%`,
                                    height: '100%',
                                    background: progress === 100 ? '#22c55e' : 
                                              progress >= 75 ? '#3b82f6' :
                                              progress >= 50 ? '#f59e0b' : '#ef4444',
                                    borderRadius: '3px',
                                    transition: 'width 0.3s ease'
                                  }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: '500', minWidth: '30px' }}>
                                  {progress}%
                                </span>
                              </div>
                              
                              {/* Action Buttons */}
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button
                                  type="button"
                                  onClick={() => handleEditAction(action.id)}
                                  title="Edit Action"
                                  style={{
                                    background: '#f59e0b',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.125rem 0.25rem',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    fontSize: '0.625rem'
                                  }}
                                >
                                  ✏️
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ 
                      textAlign: 'center', 
                      color: '#6b7280', 
                      fontSize: '0.875rem',
                      padding: '1rem'
                    }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📋</div>
                      <div>No actions created for this risk yet</div>
                      <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                        Actions help implement controls to reduce risk
                      </div>
                    </div>
                  )}

                  {relatedActions.length > 0 && (
                    <div style={{
                      marginTop: '0.75rem',
                      padding: '0.5rem',
                      background: '#f0fdf4',
                      border: '1px solid #dcfce7',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#166534'
                    }}>
                      <strong>💡 Tip:</strong> Consider these actions when updating your "Existing Controls" above. 
                      Completed actions should be reflected as implemented controls.
                    </div>
                  )}
                </div>
              )}
            </div>



            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Regulatory Requirements
              </label>
              <textarea
                name="regulatory_requirements"
                value={formData.regulatory_requirements}
                onChange={handleChange}
                rows={2}
                placeholder="Any specific regulatory requirements related to this risk?"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Review Frequency (days)
              </label>
              <input
                type="number"
                name="review_frequency_days"
                value={formData.review_frequency_days}
                onChange={handleChange}
                min="1"
                max="1095"
                style={{
                  width: '200px',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              />
              <small style={{ display: 'block', marginTop: '0.25rem', color: '#6b7280' }}>
                How often should this risk be reviewed? (Default: 365 days)
              </small>
            </div>

            {/* Submit Buttons */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '2rem',
              paddingTop: '1rem',
              borderTop: '1px solid #f3f4f6'
            }}>
              <button
                type="submit"
                disabled={loading || !!residualRiskError}
                style={{
                  background: (loading || residualRiskError) ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '6px',
                  cursor: (loading || residualRiskError) ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                {loading ? (editMode ? 'Updating...' : 'Creating...') : (editMode ? 'Update Risk' : 'Create Risk')}
              </button>
              
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                style={{
                  background: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>

        {/* Risk Location Map Modal*/}
        {showLocationMap && (
          <RiskLocationMap
            isOpen={showLocationMap}
            onClose={() => setShowLocationMap(false)}
            onLocationSet={handleLocationSet}
            initialLocation={riskLocation}
          />
        )}

      </div>
    </div>
  );
}

export default CreateRisk;