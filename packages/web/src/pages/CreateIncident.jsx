import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import {riskManagementService} from '@vineyard/shared';

function CreateIncident() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we're in edit mode or creating risk from incident
  const editMode = location.state?.editMode || false;
  const createRiskFromIncident = location.state?.createRiskFromIncident || false;
  const existingIncidentData = location.state?.incidentData || null;
  
  const [loading, setLoading] = useState(false);
  const [loadingRisks, setLoadingRisks] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Available risks for linking
  const [availableRisks, setAvailableRisks] = useState([]);
  const [showCreateRiskSection, setShowCreateRiskSection] = useState(createRiskFromIncident);

  // Location map state
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [incidentLocation, setIncidentLocation] = useState(null);
  
  // Form state - initialize with existing data if in edit mode
  const [formData, setFormData] = useState(() => {
    if (editMode && existingIncidentData) {
      return {
        incident_title: existingIncidentData.incident_title || '',
        incident_description: existingIncidentData.incident_description || '',
        incident_type: existingIncidentData.incident_type || '',
        severity: existingIncidentData.severity || '',
        category: existingIncidentData.category || '',
        incident_date: existingIncidentData.incident_date ? 
          new Date(existingIncidentData.incident_date).toISOString().slice(0, 16) : '',
        discovered_date: existingIncidentData.discovered_date ? 
          new Date(existingIncidentData.discovered_date).toISOString().slice(0, 16) : '',
        location_description: existingIncidentData.location_description || '',
        injured_person_name: existingIncidentData.injured_person_name || '',
        injured_person_role: existingIncidentData.injured_person_role || '',
        injured_person_company: existingIncidentData.injured_person_company || '',
        witness_details: existingIncidentData.witness_details || '',
        injury_type: existingIncidentData.injury_type || '',
        body_part_affected: existingIncidentData.body_part_affected || '',
        medical_treatment_required: existingIncidentData.medical_treatment_required || false,
        medical_provider: existingIncidentData.medical_provider || '',
        time_off_work: existingIncidentData.time_off_work || false,
        estimated_time_off_days: existingIncidentData.estimated_time_off_days || '',
        property_damage_cost: existingIncidentData.property_damage_cost || '',
        environmental_impact: existingIncidentData.environmental_impact || '',
        immediate_actions_taken: existingIncidentData.immediate_actions_taken || '',
        related_risk_id: existingIncidentData.related_risk_id || '',
        evidence_collected: existingIncidentData.evidence_collected || false,
        photos_taken: existingIncidentData.photos_taken || false
      };
    }
    return {
      incident_title: '',
      incident_description: '',
      incident_type: '',
      severity: '',
      category: '',
      incident_date: new Date().toISOString().slice(0, 16), // Default to now
      discovered_date: '',
      location_description: '',
      injured_person_name: '',
      injured_person_role: '',
      injured_person_company: '',
      witness_details: '',
      injury_type: '',
      body_part_affected: '',
      medical_treatment_required: false,
      medical_provider: '',
      time_off_work: false,
      estimated_time_off_days: '',
      property_damage_cost: '',
      environmental_impact: '',
      immediate_actions_taken: '',
      related_risk_id: '',
      evidence_collected: false,
      photos_taken: false
    };
  });

  // New risk form data (for creating risk from incident)
  const [newRiskData, setNewRiskData] = useState({
    risk_title: '',
    risk_description: '',
    risk_category: '',
    risk_type: '',
    inherent_likelihood: 3,
    inherent_severity: 3,
    location_description: '',
    potential_consequences: '',
    existing_controls: ''
  });

  // Options for dropdowns
  const incidentTypes = [
    { value: 'injury', label: 'Injury' },
    { value: 'near_miss', label: 'Near Miss' },
    { value: 'property_damage', label: 'Property Damage' },
    { value: 'environmental', label: 'Environmental' },
    { value: 'security', label: 'Security' },
    { value: 'dangerous_occurrence', label: 'Dangerous Occurrence' }
  ];

  const severityLevels = [
    { value: 'minor', label: 'Minor' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'serious', label: 'Serious' },
    { value: 'critical', label: 'Critical' },
    { value: 'fatal', label: 'Fatal' }
  ];

  const incidentCategories = [
    { value: 'slip_trip_fall', label: 'Slip, Trip & Fall' },
    { value: 'chemical_exposure', label: 'Chemical Exposure' },
    { value: 'equipment_failure', label: 'Equipment Failure' },
    { value: 'manual_handling', label: 'Manual Handling' },
    { value: 'cuts_lacerations', label: 'Cuts & Lacerations' },
    { value: 'burns', label: 'Burns' },
    { value: 'eye_injury', label: 'Eye Injury' },
    { value: 'respiratory', label: 'Respiratory' },
    { value: 'electrical', label: 'Electrical' },
    { value: 'vehicle_related', label: 'Vehicle Related' },
    { value: 'fire_explosion', label: 'Fire/Explosion' },
    { value: 'structural_collapse', label: 'Structural Collapse' },
    { value: 'other', label: 'Other' }
  ];

  const injuryTypes = [
    'cut', 'bruise', 'fracture', 'sprain', 'strain', 'burn', 'laceration',
    'amputation', 'eye_injury', 'head_injury', 'spinal_injury', 'crush',
    'puncture', 'abrasion', 'concussion', 'chemical_burn', 'heat_exhaustion',
    'allergic_reaction', 'repetitive_strain', 'other'
  ];

  const bodyParts = [
    'head', 'neck', 'shoulder', 'arm', 'elbow', 'wrist', 'hand', 'finger',
    'chest', 'back', 'abdomen', 'hip', 'leg', 'knee', 'ankle', 'foot', 'toe',
    'eye', 'multiple', 'other'
  ];

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

  // Set body background and fetch available risks
  useEffect(() => {
    document.body.classList.add("primary-bg");
    
    // If in edit mode, set the existing location data
    if (editMode && existingIncidentData) {
      if (existingIncidentData.location) {
        setIncidentLocation(existingIncidentData.location);
      }
    }
    
    // Fetch available risks for linking
    fetchAvailableRisks();
    
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, [editMode, existingIncidentData]);

  // Auto-populate new risk data based on incident
  useEffect(() => {
    if (showCreateRiskSection) {
      setNewRiskData(prev => ({
        ...prev,
        risk_title: formData.incident_title ? `Risk related to: ${formData.incident_title}` : '',
        risk_description: formData.incident_description ? 
          `Risk identified from incident: ${formData.incident_description}` : '',
        location_description: formData.location_description,
        potential_consequences: formData.incident_description,
        // Auto-suggest risk category based on incident type
        risk_category: formData.incident_type === 'environmental' ? 'environmental' :
                      formData.incident_type === 'injury' ? 'personnel' :
                      formData.category === 'equipment_failure' ? 'equipment' :
                      formData.category === 'chemical_exposure' ? 'chemical' :
                      formData.category === 'fire_explosion' ? 'fire' :
                      formData.category === 'structural_collapse' ? 'structural' : 'other',
        // Auto-suggest risk type based on incident type
        risk_type: formData.incident_type === 'injury' ? 'health_safety' :
                  formData.incident_type === 'environmental' ? 'environmental' :
                  formData.incident_type === 'property_damage' ? 'operational' : 'health_safety'
      }));
    }
  }, [showCreateRiskSection, formData.incident_title, formData.incident_description, formData.location_description, formData.incident_type, formData.category]);

  // Fetch available risks
  const fetchAvailableRisks = async () => {
    setLoadingRisks(true);
    try {
      const risks = await riskManagementService.getAllRisks({ status: 'active', limit: 100 });
      console.log('✅ Available risks loaded:', risks);
      
      // Handle different response formats
      let risksArray = [];
      if (Array.isArray(risks)) {
        risksArray = risks;
      } else if (risks && Array.isArray(risks.data)) {
        risksArray = risks.data;
      } else if (risks && Array.isArray(risks.risks)) {
        risksArray = risks.risks;
      }
      
      setAvailableRisks(risksArray);
    } catch (error) {
      console.error('❌ Error fetching available risks:', error);
      setAvailableRisks([]);
    } finally {
      setLoadingRisks(false);
    }
  };

  // Handle location from map
  const handleLocationSet = (location) => {
    setIncidentLocation(location);
    setShowLocationMap(false);
  };

  // Handle remove location
  const handleRemoveLocation = () => {
    setIncidentLocation(null);
  };

  // Handle form field changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle new risk form changes
  const handleNewRiskChange = (e) => {
    const { name, value, type } = e.target;
    setNewRiskData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) : value
    }));
  };

  // Check if incident suggests certain fields
  const isInjuryIncident = () => {
    return formData.incident_type === 'injury';
  };

  const isPropertyDamageIncident = () => {
    return formData.incident_type === 'property_damage';
  };

  const isEnvironmentalIncident = () => {
    return formData.incident_type === 'environmental';
  };

  // Calculate risk score for new risk
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

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setLoading(true);
    setError(null);

    try {
      console.log(`🔄 ${editMode ? 'Updating' : 'Creating'} incident with data:`, formData);
      console.log('🔄 Incident location:', incidentLocation);
      
      // Clean the form data
      const cleanedData = {
        ...formData,
        company_id: user.company_id,
        // Convert date strings to proper format
        incident_date: formData.incident_date ? new Date(formData.incident_date).toISOString() : new Date().toISOString(),
        discovered_date: formData.discovered_date ? new Date(formData.discovered_date).toISOString() : null,
        // Handle numeric fields
        estimated_time_off_days: formData.estimated_time_off_days ? parseInt(formData.estimated_time_off_days) : null,
        property_damage_cost: formData.property_damage_cost ? parseFloat(formData.property_damage_cost) : null,
        // Add location data if present
        location: incidentLocation?.type === 'Point' ? incidentLocation : null,
        // Clean empty strings to null
        injured_person_name: formData.injured_person_name || null,
        injured_person_role: formData.injured_person_role || null,
        injured_person_company: formData.injured_person_company || null,
        witness_details: formData.witness_details || null,
        injury_type: formData.injury_type || null,
        body_part_affected: formData.body_part_affected || null,
        medical_provider: formData.medical_provider || null,
        environmental_impact: formData.environmental_impact || null,
        immediate_actions_taken: formData.immediate_actions_taken || null,
        related_risk_id: formData.related_risk_id || null
      };
      
      console.log(`🔄 Cleaned incident data being sent:`, cleanedData);
      
      let incidentResult;
      if (editMode && existingIncidentData?.id) {
        // Update existing incident
        incidentResult = await riskManagementService.updateIncident(existingIncidentData.id, cleanedData);
        console.log('✅ Incident updated successfully:', incidentResult);
      } else {
        // Create new incident
        incidentResult = await riskManagementService.createIncident(cleanedData);
        console.log('✅ Incident created successfully:', incidentResult);
      }

      // If creating a new risk from incident
      if (showCreateRiskSection && !editMode) {
        try {
          console.log('🔄 Creating related risk from incident...');
          
          const riskDataToCreate = {
            ...newRiskData,
            company_id: user.company_id,
            location: incidentLocation?.type === 'Point' ? incidentLocation : null,
            // Calculate risk scores
            inherent_likelihood: newRiskData.inherent_likelihood,
            inherent_severity: newRiskData.inherent_severity,
            residual_likelihood: newRiskData.inherent_likelihood,
            residual_severity: newRiskData.inherent_severity
          };
          
          const riskResult = await riskManagementService.createRisk(riskDataToCreate);
          console.log('✅ Related risk created successfully:', riskResult);
          
          // Link the incident to the newly created risk
          try {
            await riskManagementService.updateIncident(incidentResult.id, {
              related_risk_id: riskResult.id,
              new_risk_created: true
            });
            console.log('✅ Incident linked to new risk');
          } catch (linkError) {
            console.warn('⚠️ Failed to link incident to risk:', linkError);
          }
          
        } catch (riskError) {
          console.error('❌ Error creating related risk:', riskError);
          // Don't fail the whole operation if risk creation fails
          setError(`Incident created successfully, but failed to create related risk: ${riskError.message}`);
        }
      }

      setSuccess(true);
      
      // Redirect after 2 seconds
      setTimeout(() => {
        navigate('/riskdashboard');
      }, 2000);

    } catch (error) {
      console.error(`❌ Error ${editMode ? 'updating' : 'creating'} incident:`, error);
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
        setError(error.response?.data?.detail || error.message || `Failed to ${editMode ? 'update' : 'create'} incident`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    navigate('/riskdashboard');
  };

  const newRiskAssessment = calculateRiskScore(newRiskData.inherent_likelihood, newRiskData.inherent_severity);

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
              {editMode ? 'Edit Incident:' : 'Report New Incident'}
              {editMode && existingIncidentData && (
                <span style={{ fontSize: '1.0rem', color: '#6b7280', fontWeight: '500' }}>
                  {' '}{existingIncidentData.incident_number} - {existingIncidentData.incident_title}
                </span>
              )}
            </h1>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
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
          </div>


          {/* Incident Severity Warning */}
          {formData.severity &&
            ['serious', 'critical', 'fatal'].includes(formData.severity) &&
            formData.incident_type &&
            ['injury', 'near_miss', 'dangerous_occurrence'].includes(formData.incident_type) && (
              <div
                style={{
                  background: '#fecaca',
                  border: '1px solid #dc2626',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div
                  style={{
                    color: '#991b1b',
                    fontWeight: '600',
                    marginBottom: '0.5rem',
                  }}
                >
                  🚨 Serious Incident Alert
                </div>
                <div style={{ color: '#991b1b', fontSize: '0.875rem' }}>
                  This incident may require WorkSafe notification. An internal investigation will be automatically scheduled.
                  <br /><br />
                  Please ensure you meet all regulatory requirements under the Health and Safety at Work Act 2015. 
                  <br /><br />
                  Use of this module in Auxein Insights does not constitute compliance with the Health and Safety at Work Act 2015. 
                </div>
              </div>
          )}

          {/* Environmental Incident Severity Warning */}
          {formData.severity &&
            ['serious', 'critical'].includes(formData.severity) &&
            formData.incident_type &&
            ['environmental'].includes(formData.incident_type) && (
              <div
                style={{
                  background: '#fecaca',
                  border: '1px solid #dc2626',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div
                  style={{
                    color: '#991b1b',
                    fontWeight: '600',
                    marginBottom: '0.5rem',
                  }}
                >
                  🚨 Environmental Incident Alert
                </div>
                <div style={{ color: '#991b1b', fontSize: '0.875rem' }}>
                  This incident may require notification to your Local or Regional Council. An internal investigation will be automatically scheduled.
                  <br /><br />
                  Use of this module in Auxein Insights does not constitute compliance with local or regional regulations. 
                </div>
              </div>
          )}

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
            ✅ Incident {editMode ? 'updated' : 'reported'} successfully!
            {showCreateRiskSection && !editMode && ' Related risk will be created.'}
            {' '}Redirecting to dashboard...
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
          
          {/* Basic Incident Information */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Basic Incident Information
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Incident Title *
              </label>
              <input
                type="text"
                name="incident_title"
                value={formData.incident_title}
                onChange={handleChange}
                required
                placeholder="e.g., Worker slipped on wet floor in processing area"
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
                Incident Description *
              </label>
              <textarea
                name="incident_description"
                value={formData.incident_description}
                onChange={handleChange}
                required
                rows={4}
                placeholder="Describe what happened in detail..."
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Incident Type *
                </label>
                <select
                  name="incident_type"
                  value={formData.incident_type}
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
                  {incidentTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Severity *
                </label>
                <select
                  name="severity"
                  value={formData.severity}
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
                  <option value="">Select Severity</option>
                  {severityLevels.map(level => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Category *
                </label>
                <select
                  name="category"
                  value={formData.category}
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
                  {incidentCategories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Incident Date & Time *
                </label>
                <input
                  type="datetime-local"
                  name="incident_date"
                  value={formData.incident_date}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Discovered Date & Time
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '400' }}>
                    {' '}(if different from incident date)
                  </span>
                </label>
                <input
                  type="datetime-local"
                  name="discovered_date"
                  value={formData.discovered_date}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Location Section */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Incident Location
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Location Description *
              </label>
              <input
                type="text"
                name="location_description"
                value={formData.location_description}
                onChange={handleChange}
                required
                placeholder="e.g., Main vineyard block, Processing facility, Chemical storage shed"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            {/* Location Mapping Section */}
            <div style={{ 
              marginBottom: '1rem',
              padding: '1rem',
              background: '#f8fafc',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem'
              }}>
                <label style={{ fontWeight: '500', margin: 0 }}>
                  📍 Precise Location (Optional)
                </label>
                {!incidentLocation && (
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
              
              {incidentLocation ? (
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
                      ✅ Location Set: Point Location
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#166534' }}>
                      Coordinates: {incidentLocation.coordinates[1].toFixed(6)}, {incidentLocation.coordinates[0].toFixed(6)}
                    </div>
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
                  No precise location set. Use "Set Location on Map" to mark the exact incident location.
                </div>
              )}
            </div>
          </div>

          {/* People Involved Section */}
          {(isInjuryIncident() || formData.witness_details) && (
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
                People Involved
              </h3>
              
              {isInjuryIncident() && (
                <div>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#dc2626' }}>
                    🏥 Injured Person Details
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Name
                      </label>
                      <input
                        type="text"
                        name="injured_person_name"
                        value={formData.injured_person_name}
                        onChange={handleChange}
                        placeholder="Full name of injured person"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Role/Position
                      </label>
                      <input
                        type="text"
                        name="injured_person_role"
                        value={formData.injured_person_role}
                        onChange={handleChange}
                        placeholder="e.g., Vineyard Worker, Supervisor"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Company
                      </label>
                      <input
                        type="text"
                        name="injured_person_company"
                        value={formData.injured_person_company}
                        onChange={handleChange}
                        placeholder="Company name (if contractor)"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Type of Injury
                      </label>
                      <select
                        name="injury_type"
                        value={formData.injury_type}
                        onChange={handleChange}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="">Select injury type</option>
                        {injuryTypes.map(type => (
                          <option key={type} value={type}>
                            {type.replace('_', ' ').charAt(0).toUpperCase() + type.replace('_', ' ').slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Body Part Affected
                      </label>
                      <select
                        name="body_part_affected"
                        value={formData.body_part_affected}
                        onChange={handleChange}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="">Select body part</option>
                        {bodyParts.map(part => (
                          <option key={part} value={part}>
                            {part.charAt(0).toUpperCase() + part.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{
                      padding: '1rem',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        <input
                          type="checkbox"
                          name="medical_treatment_required"
                          checked={formData.medical_treatment_required}
                          onChange={handleChange}
                        />
                        Medical Treatment Required
                      </label>
                      {formData.medical_treatment_required && (
                        <input
                          type="text"
                          name="medical_provider"
                          value={formData.medical_provider}
                          onChange={handleChange}
                          placeholder="Medical provider/facility"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}
                        />
                      )}
                    </div>

                    <div style={{
                      padding: '1rem',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        <input
                          type="checkbox"
                          name="time_off_work"
                          checked={formData.time_off_work}
                          onChange={handleChange}
                        />
                        Time Off Work Required
                      </label>
                      {formData.time_off_work && (
                        <input
                          type="number"
                          name="estimated_time_off_days"
                          value={formData.estimated_time_off_days}
                          onChange={handleChange}
                          placeholder="Estimated days off"
                          min="0"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '0.875rem'
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Witness Details
                </label>
                <textarea
                  name="witness_details"
                  value={formData.witness_details}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Names and contact details of any witnesses..."
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
            </div>
          )}

          {/* Damage/Impact Section */}
          {(isPropertyDamageIncident() || isEnvironmentalIncident()) && (
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
                Damage & Impact Assessment
              </h3>
              
              {isPropertyDamageIncident() && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Estimated Property Damage Cost (NZD)
                  </label>
                  <input
                    type="number"
                    name="property_damage_cost"
                    value={formData.property_damage_cost}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    placeholder="e.g., 1500.00"
                    style={{
                      width: '200px',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#6b7280' }}>
                    Enter estimated cost of repairs/replacement
                  </small>
                </div>
              )}

              {isEnvironmentalIncident() && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Environmental Impact Description
                  </label>
                  <textarea
                    name="environmental_impact"
                    value={formData.environmental_impact}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Describe the environmental impact, contamination, or damage..."
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
              )}
            </div>
          )}

          {/* Immediate Actions Section */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Immediate Actions & Evidence
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Immediate Actions Taken
              </label>
              <textarea
                name="immediate_actions_taken"
                value={formData.immediate_actions_taken}
                onChange={handleChange}
                rows={4}
                placeholder="Describe what immediate actions were taken to address the incident..."
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
              <div style={{
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                  <input
                    type="checkbox"
                    name="evidence_collected"
                    checked={formData.evidence_collected}
                    onChange={handleChange}
                  />
                  Evidence Collected
                </label>
                <small style={{ display: 'block', marginTop: '0.25rem', color: '#6b7280' }}>
                  Physical evidence, samples, or documents gathered
                </small>
              </div>

              <div style={{
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                  <input
                    type="checkbox"
                    name="photos_taken"
                    checked={formData.photos_taken}
                    onChange={handleChange}
                  />
                  Photos Taken
                </label>
                <small style={{ display: 'block', marginTop: '0.25rem', color: '#6b7280' }}>
                  Photographs of the incident scene/damage
                </small>
              </div>
            </div>
          </div>


          {/* Submit Buttons */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end'
            }}>
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
              
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: loading ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                {loading ? 
                  (editMode ? 'Updating...' : 'Reporting...') : 
                  (editMode ? 'Update Incident' : 'Report Incident')
                }
                {showCreateRiskSection && !editMode && ' & Create Risk'}
              </button>
            </div>
            
            {showCreateRiskSection && !editMode && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #22c55e',
                borderRadius: '6px',
                padding: '0.75rem',
                fontSize: '0.875rem',
                color: '#166534',
                marginTop: '1rem'
              }}>
                ✅ This will create both the incident report and a new related risk to help prevent similar incidents.
              </div>
            )}
          </div>
        </form>

        {/* Risk Location Map Modal - Placeholder */}
        {showLocationMap && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '90%'
            }}>
              <h3>Incident Location Map</h3>
              <p>Map component would be implemented here to set the precise incident location.</p>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button
                  onClick={() => {
                    // Simulate setting a location
                    handleLocationSet({
                      type: 'Point',
                      coordinates: [174.0, -43.5] // Example coordinates for Christchurch area
                    });
                  }}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Set Sample Location
                </button>
                <button
                  onClick={() => setShowLocationMap(false)}
                  style={{
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default CreateIncident;