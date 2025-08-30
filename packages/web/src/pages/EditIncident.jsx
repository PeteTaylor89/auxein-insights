import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import {riskManagementService} from '@vineyard/shared';

function EditIncident() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { incidentId } = useParams();
  const location = useLocation();
  
  const [loading, setLoading] = useState(false);
  const [loadingIncident, setLoadingIncident] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  // State for incident data
  const [incident, setIncident] = useState(null);
  const [availableRisks, setAvailableRisks] = useState([]);
  const [users, setUsers] = useState([]);
  const [complianceData, setComplianceData] = useState(null);

  // Form states for different sections
  const [basicDetails, setBasicDetails] = useState({});
  const [investigationData, setInvestigationData] = useState({});
  const [workSafeData, setWorkSafeData] = useState({});
  const [closureData, setClosureData] = useState({});

  // UI states
  const [showWorkSafeForm, setShowWorkSafeForm] = useState(false);
  const [showClosureForm, setShowClosureForm] = useState(false);
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const [loadingSteps, setLoadingSteps] = useState({
    incident: false,
    compliance: false,
    supportingData: false
  });

  // Options for dropdowns (these are constants, not state)
  const investigationStatuses = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' }
  ];

  const incidentStatuses = [
    { value: 'open', label: 'Open' },
    { value: 'investigating', label: 'Investigating' },
    { value: 'awaiting_actions', label: 'Awaiting Actions' },
    { value: 'closed', label: 'Closed' }
  ];

  const notificationMethods = [
    { value: 'online', label: 'Online (WorkSafe Website)' },
    { value: 'phone', label: 'Phone (0800 030 040)' },
    { value: 'email', label: 'Email' }
  ];

  const immediateCauses = [
    'unsafe_act', 'unsafe_condition', 'equipment_failure', 'procedural_failure',
    'inadequate_training', 'poor_communication', 'time_pressure', 'fatigue',
    'environmental_factors', 'design_deficiency', 'maintenance_failure'
  ];

  const rootCauses = [
    'inadequate_procedures', 'insufficient_training', 'poor_supervision',
    'inadequate_maintenance', 'design_flaws', 'organizational_pressure',
    'communication_breakdown', 'resource_constraints', 'cultural_issues',
    'regulatory_gaps', 'vendor_issues'
  ];

  const contributingFactors = [
    'time_constraints', 'workload_pressure', 'insufficient_resources',
    'poor_weather_conditions', 'equipment_age', 'inadequate_lighting',
    'noise_levels', 'temperature_extremes', 'workplace_culture',
    'communication_barriers', 'skill_gaps', 'complacency'
  ];

  // Initialize form data when incident loads
  useEffect(() => {
    const initializeFormData = () => {
      if (!incident) return;

      setBasicDetails({
        incident_title: incident.incident_title || '',
        incident_description: incident.incident_description || '',
        incident_type: incident.incident_type || '',
        severity: incident.severity || '',
        category: incident.category || '',
        incident_date: incident.incident_date ? new Date(incident.incident_date).toISOString().slice(0, 16) : '',
        discovered_date: incident.discovered_date ? new Date(incident.discovered_date).toISOString().slice(0, 16) : '',
        location_description: incident.location_description || '',
        injured_person_name: incident.injured_person_name || '',
        injured_person_role: incident.injured_person_role || '',
        injured_person_company: incident.injured_person_company || '',
        witness_details: incident.witness_details || '',
        injury_type: incident.injury_type || '',
        body_part_affected: incident.body_part_affected || '',
        medical_treatment_required: incident.medical_treatment_required || false,
        medical_provider: incident.medical_provider || '',
        time_off_work: incident.time_off_work || false,
        estimated_time_off_days: incident.estimated_time_off_days || '',
        property_damage_cost: incident.property_damage_cost || '',
        environmental_impact: incident.environmental_impact || '',
        immediate_actions_taken: incident.immediate_actions_taken || '',
        evidence_collected: incident.evidence_collected || false,
        photos_taken: incident.photos_taken || false,
        related_risk_id: incident.related_risk_id || '',
        status: incident.status || 'open'
      });

      setInvestigationData({
        investigation_required: incident.investigation_required !== false,
        investigation_status: incident.investigation_status || 'pending',
        investigator_id: incident.investigator_id || '',
        investigation_due_date: incident.investigation_due_date ? 
          new Date(incident.investigation_due_date).toISOString().slice(0, 16) : '',
        investigation_completed_date: incident.investigation_completed_date ? 
          new Date(incident.investigation_completed_date).toISOString().slice(0, 16) : '',
        investigation_findings: incident.investigation_findings || '',
        immediate_causes: incident.immediate_causes || [],
        root_causes: incident.root_causes || [],
        contributing_factors: incident.contributing_factors || [],
        corrective_actions_required: incident.corrective_actions_required || '',
        lessons_learned: incident.lessons_learned || '',
        immediate_causes_other: incident.immediate_causes_other || '',
        root_causes_other: incident.root_causes_other || '',
        contributing_factors_other: incident.contributing_factors_other || ''
      });

      setWorkSafeData({
        notification_method: '',
        worksafe_reference: incident.worksafe_reference || '',
        notification_notes: ''
      });

      setClosureData({
        closure_reason: '',
        lessons_learned: incident.lessons_learned || '',
        communication_completed: incident.communication_completed || false
      });

      // Set location data
      if (incident.location) {
        setSelectedLocation(incident.location);
      }
    };

    initializeFormData();
  }, [incident]);

  // Load incident and supporting data
  useEffect(() => {
    const loadData = async () => {
      if (!incidentId) {
        console.error('❌ No incidentId provided:', incidentId);
        setLoadingIncident(false);
        setError('No incident ID provided');
        return;
      }

      console.log('🔄 Starting data load for incident:', incidentId);
      
      try {
        setLoadingIncident(true);
        setError(null); // Clear any previous errors
        
        // Step 1: Load incident data
        setLoadingSteps(prev => ({ ...prev, incident: true }));
        console.log('📞 Step 1: Loading incident data...');
        
        const incidentData = await riskManagementService.getIncidentById(incidentId);
        
        if (!incidentData) {
          throw new Error('No incident data received from server');
        }

        if (!incidentData.id) {
          throw new Error('Invalid incident data - missing ID');
        }

        console.log('✅ Step 1 complete: Incident loaded:', incidentData.incident_number);
        setIncident(incidentData);
        setLoadingSteps(prev => ({ ...prev, incident: false }));
        
        // Step 2: Load compliance data (non-blocking)
        setLoadingSteps(prev => ({ ...prev, compliance: true }));
        console.log('📞 Step 2: Loading compliance data...');
        
        try {
          const compliance = await riskManagementService.testEndpoint(
            `/risk-management/incidents/${incidentId}/compliance-check`
          );
          if (compliance.success) {
            console.log('✅ Step 2 complete: Compliance loaded');
            setComplianceData(compliance.data);
          } else {
            console.warn('⚠️ Step 2 warning: Compliance check returned error:', compliance);
          }
        } catch (complianceError) {
          console.warn('⚠️ Step 2 warning: Compliance check failed:', complianceError);
          // Don't fail the whole load for compliance issues
        }
        setLoadingSteps(prev => ({ ...prev, compliance: false }));
        
        // Step 3: Load supporting data
        setLoadingSteps(prev => ({ ...prev, supportingData: true }));
        console.log('📞 Step 3: Loading supporting data...');
        
        try {
          const [risksData, usersData] = await Promise.all([
            riskManagementService.getAllRisks({ status: 'active', limit: 100 }).catch(err => {
              console.warn('⚠️ Failed to load risks:', err);
              return [];
            }),
            riskManagementService.testEndpoint('/api/users/company').catch(err => {
              console.warn('⚠️ Failed to load users:', err);
              return { success: false, data: [] };
            })
          ]);
          
          console.log('✅ Step 3 complete: Supporting data loaded');
          setAvailableRisks(Array.isArray(risksData) ? risksData : risksData.data || []);
          setUsers(usersData.success ? usersData.data : []);
        } catch (supportingError) {
          console.warn('⚠️ Step 3 warning: Some supporting data failed to load:', supportingError);
          // Set empty arrays as fallbacks
          setAvailableRisks([]);
          setUsers([]);
        }
        setLoadingSteps(prev => ({ ...prev, supportingData: false }));
        
        console.log('🏁 All data loading complete');
        
      } catch (error) {
        console.error('❌ Critical error loading incident:', error);
        
        // Provide specific error messages
        let errorMessage = 'Failed to load incident';
        if (error.response?.status === 404) {
          errorMessage = 'Incident not found or you do not have permission to view it';
        } else if (error.response?.status === 403) {
          errorMessage = 'You do not have permission to view this incident';
        } else if (error.message) {
          errorMessage = `Failed to load incident: ${error.message}`;
        }
        
        setError(errorMessage);
        setIncident(null); // Ensure incident is null on error
      } finally {
        setLoadingIncident(false);
        setLoadingSteps({ incident: false, compliance: false, supportingData: false });
        console.log('🏁 Loading process finished');
      }
    };

    if (user) { // Only load data if user is available
      loadData();
    }
  }, [incidentId, user]);

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  // ✅ EARLY RETURNS - ONLY THESE ONES, NO DUPLICATES
  if (loadingIncident) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <h2>Loading Incident...</h2>
          <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
            {loadingSteps.incident && '📋 Loading incident details...'}
            {loadingSteps.compliance && '🔍 Checking compliance...'}
            {loadingSteps.supportingData && '📊 Loading supporting data...'}
            {!loadingSteps.incident && !loadingSteps.compliance && !loadingSteps.supportingData && 
             'Finalizing...'}
          </div>
          <div style={{ 
            marginTop: '1rem', 
            fontSize: '0.75rem', 
            color: '#9ca3af',
            fontFamily: 'monospace' 
          }}>
            Incident ID: {incidentId}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
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
          <div style={{
            background: '#fecaca',
            border: '1px solid #dc2626',
            borderRadius: '8px',
            padding: '1.5rem',
            color: '#991b1b'
          }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              ❌ Error Loading Incident
            </div>
            <div style={{ marginBottom: '1rem' }}>
              {error}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
              Incident ID: {incidentId}
            </div>
            <button
              onClick={() => navigate('/riskdashboard')}
              style={{
                marginTop: '1rem',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!incident) {
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
          <div style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '1.5rem',
            color: '#92400e'
          }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              ⚠️ Incident Not Found
            </div>
            <div style={{ marginBottom: '1rem' }}>
              The incident could not be loaded. This might be because:
            </div>
            <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>
              <li>The incident does not exist</li>
              <li>You don't have permission to view it</li>
              <li>The incident ID is invalid</li>
            </ul>
            <div style={{ fontSize: '0.875rem', color: '#78350f', marginBottom: '1rem' }}>
              Incident ID: {incidentId}
            </div>
            <button
              onClick={() => navigate('/riskdashboard')}
              style={{
                background: '#f59e0b',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ ALL FUNCTIONS DEFINED AFTER EARLY RETURNS
  // Handle form changes
  const handleBasicDetailsChange = (field, value) => {
    setBasicDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleInvestigationChange = (field, value) => {
    setInvestigationData(prev => ({ ...prev, [field]: value }));
  };

  const handleWorkSafeChange = (field, value) => {
    setWorkSafeData(prev => ({ ...prev, [field]: value }));
  };

  const handleClosureChange = (field, value) => {
    setClosureData(prev => ({ ...prev, [field]: value }));
  };

  // Handle multi-select changes for causes
  const handleCausesChange = (type, cause, checked) => {
    setInvestigationData(prev => {
      const currentCauses = prev[type] || [];
      if (checked) {
        return { ...prev, [type]: [...currentCauses, cause] };
      } else {
        return { ...prev, [type]: currentCauses.filter(c => c !== cause) };
      }
    });
  };

  // Handle location mapping
  const handleLocationSet = (location) => {
    setSelectedLocation(location);
    setShowLocationMap(false);
    // Update basic details with location
    setBasicDetails(prev => ({ ...prev, location: location }));
  };

  const handleRemoveLocation = () => {
    setSelectedLocation(null);
    setBasicDetails(prev => ({ ...prev, location: null }));
  };

  // Save basic details
  const saveBasicDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const updateData = {
        ...basicDetails,
        incident_date: basicDetails.incident_date ? new Date(basicDetails.incident_date).toISOString() : null,
        discovered_date: basicDetails.discovered_date ? new Date(basicDetails.discovered_date).toISOString() : null,
        estimated_time_off_days: basicDetails.estimated_time_off_days ? 
          parseInt(basicDetails.estimated_time_off_days) : null,
        property_damage_cost: basicDetails.property_damage_cost ? 
          parseFloat(basicDetails.property_damage_cost) : null,
        related_risk_id: basicDetails.related_risk_id ? parseInt(basicDetails.related_risk_id) : null,
        location: selectedLocation
      };

      const result = await riskManagementService.updateIncident(incidentId, updateData);
      setIncident(result);
      setSuccess('Basic details updated successfully');
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('❌ Error updating basic details:', error);
      setError(`Failed to update details: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save investigation
  const saveInvestigation = async () => {
    try {
      setLoading(true);
      setError(null);

      const combineWithOther = (checkboxArray, otherText) => {
        const combined = [...(checkboxArray || [])];
        if (otherText && otherText.trim()) {
          combined.push(`${otherText.trim()}`);
        }
        return combined;
      };

      const investigationUpdate = {
        investigation_findings: investigationData.investigation_findings,
        immediate_causes: combineWithOther(
          investigationData.immediate_causes, 
          investigationData.immediate_causes_other
        ),
        root_causes: combineWithOther(
          investigationData.root_causes, 
          investigationData.root_causes_other
        ),
        contributing_factors: combineWithOther(
          investigationData.contributing_factors, 
          investigationData.contributing_factors_other
        ),
        corrective_actions_required: investigationData.corrective_actions_required,
        lessons_learned: investigationData.lessons_learned,
        investigation_status: investigationData.investigation_status,
        investigator_id: investigationData.investigator_id ? parseInt(investigationData.investigator_id) : null,
        investigation_due_date: investigationData.investigation_due_date ? 
          new Date(investigationData.investigation_due_date).toISOString() : null,
        investigation_completed_date: investigationData.investigation_completed_date ? 
          new Date(investigationData.investigation_completed_date).toISOString() : null
      };

      const result = await riskManagementService.testEndpoint(
        `/risk-management/incidents/${incidentId}/investigation`,
        'PUT',
        investigationUpdate
      );
      
      if (result.success) {
        setIncident(result.data);
        setSuccess('Investigation updated successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        throw new Error(result.error?.message || 'Failed to update investigation');
      }
    } catch (error) {
      console.error('❌ Error updating investigation:', error);
      setError(`Failed to update investigation: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Notify WorkSafe
  const notifyWorkSafe = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await riskManagementService.testEndpoint(
        `/risk-management/incidents/${incidentId}/worksafe-notify`,
        'POST',
        workSafeData
      );
      
      if (result.success) {
        setIncident(prev => ({
          ...prev,
          worksafe_notified: true,
          worksafe_notification_date: new Date().toISOString(),
          worksafe_reference: workSafeData.worksafe_reference
        }));
        
        setShowWorkSafeForm(false);
        setSuccess('WorkSafe notification recorded successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        throw new Error(result.error?.message || 'Failed to record notification');
      }
    } catch (error) {
      console.error('❌ Error notifying WorkSafe:', error);
      setError(`Failed to record WorkSafe notification: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Close incident
  const closeIncident = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await riskManagementService.testEndpoint(
        `/risk-management/incidents/${incidentId}/close`,
        'POST',
        closureData
      );
      
      if (result.success) {
        setIncident(result.data);
        setShowClosureForm(false);
        setSuccess('Incident closed successfully');
        
        setTimeout(() => {
          setSuccess('');
          navigate('/riskdashboard');
        }, 2000);
      } else {
        throw new Error(result.error?.message || 'Failed to close incident');
      }
    } catch (error) {
      console.error('❌ Error closing incident:', error);
      setError(`Failed to close incident: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Create corrective action from investigation
  const createCorrectiveAction = async () => {
    if (!investigationData.corrective_actions_required) {
      setError('Please specify corrective actions required first');
      return;
    }

    try {
      setLoading(true);
      const actionData = {
        action_title: `Corrective Action - ${incident.incident_title}`,
        action_description: investigationData.corrective_actions_required,
        action_type: 'corrective',
        priority: incident.severity === 'critical' || incident.severity === 'fatal' ? 'critical' : 'high',
        urgency: 'high',
        assigned_to: investigationData.investigator_id || user.id,
        target_completion_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        related_risk_id: incident.related_risk_id,
        custom_fields: {
          source: 'incident_investigation',
          incident_id: incident.id,
          incident_number: incident.incident_number
        }
      };

      const result = await riskManagementService.createAction(actionData);
      setSuccess('Corrective action created successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('❌ Error creating corrective action:', error);
      setError(`Failed to create corrective action: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ✅ COMPUTED VALUES
  const isNotifiable = incident.is_notifiable;
  const isNotified = incident.worksafe_notified;
  const isClosed = incident.status === 'closed';
  const isOverdueInvestigation = incident.investigation_due_date && 
    new Date(incident.investigation_due_date) < new Date() &&
    incident.investigation_status !== 'completed';

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '1200px', 
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
            <div>
              <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '600' }}>
                Edit Incident: {incident.incident_number}
              </h1>
              <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                {incident.incident_title}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isNotifiable && !isNotified && (
                <button 
                  onClick={() => setShowWorkSafeForm(true)}
                  style={{
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  📢 Notify WorkSafe
                </button>
              )}
              {!isClosed && (
                <button 
                  onClick={() => setShowClosureForm(true)}
                  style={{
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  ✅ Close Incident
                </button>
              )}
              <button 
                onClick={() => navigate('/riskdashboard')}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
          
          {/* Incident Status Indicators */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            <div style={{
              padding: '0.75rem',
              background: incident.severity === 'critical' || incident.severity === 'fatal' ? '#fecaca' : '#f8fafc',
              border: `1px solid ${incident.severity === 'critical' || incident.severity === 'fatal' ? '#dc2626' : '#e5e7eb'}`,
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Severity</div>
              <div style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                {incident.severity}
              </div>
            </div>
            
            <div style={{
              padding: '0.75rem',
              background: isNotifiable ? (isNotified ? '#dcfce7' : '#fecaca') : '#f8fafc',
              border: `1px solid ${isNotifiable ? (isNotified ? '#22c55e' : '#dc2626') : '#e5e7eb'}`,
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>WorkSafe Status</div>
              <div style={{ fontWeight: '600' }}>
                {isNotifiable ? (isNotified ? '✅ Notified' : '⚠️ Notification Required') : 'Not Notifiable'}
              </div>
            </div>
            
            <div style={{
              padding: '0.75rem',
              background: isOverdueInvestigation ? '#fecaca' : 
                        incident.investigation_status === 'completed' ? '#dcfce7' : '#f8fafc',
              border: `1px solid ${isOverdueInvestigation ? '#dc2626' : 
                                 incident.investigation_status === 'completed' ? '#22c55e' : '#e5e7eb'}`,
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Investigation</div>
              <div style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                {isOverdueInvestigation ? 'Overdue' : incident.investigation_status?.replace('_', ' ')}
              </div>
            </div>
            
            <div style={{
              padding: '0.75rem',
              background: isClosed ? '#dcfce7' : '#f8fafc',
              border: `1px solid ${isClosed ? '#22c55e' : '#e5e7eb'}`,
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Status</div>
              <div style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                {incident.status?.replace('_', ' ')}
              </div>
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div style={{
            background: '#dcfce7',
            border: '1px solid #22c55e',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#166534'
          }}>
            ✅ {success}
          </div>
        )}

        {error && (
          <div style={{
            background: '#fecaca',
            border: '1px solid #dc2626',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#991b1b'
          }}>
            ❌ {error}
          </div>
        )}

        {/* Compliance Alerts */}
        {complianceData && !complianceData.overall_compliance && (
          <div style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#92400e'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
              ⚠️ Compliance Issues Detected
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
              {complianceData.issues?.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Tab Navigation */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '0',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #f3f4f6'
          }}>
            {[
              { id: 'details', label: 'Basic Details', icon: '📝' },
              { id: 'investigation', label: 'Investigation', icon: '🔍' },
              { id: 'worksafe', label: 'WorkSafe', icon: '📢' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '1rem',
                  border: 'none',
                  background: activeTab === tab.id ? '#f8fafc' : 'white',
                  borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ padding: '1.25rem' }}>
            
            {/* Basic Details Tab */}
            {activeTab === 'details' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                    Basic Incident Details
                  </h3>
                  <button
                    onClick={saveBasicDetails}
                    disabled={loading}
                    style={{
                      background: loading ? '#9ca3af' : '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    {loading ? 'Saving...' : 'Save Details'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Type
                    </label>
                    <select
                      value={basicDetails.incident_type}
                      onChange={(e) => handleBasicDetailsChange('incident_type', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    >
                      <option value="injury">Injury</option>
                      <option value="near_miss">Near Miss</option>
                      <option value="property_damage">Property Damage</option>
                      <option value="environmental">Environmental</option>
                      <option value="security">Security</option>
                      <option value="dangerous_occurrence">Dangerous Occurrence</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Severity
                    </label>
                    <select
                      value={basicDetails.severity}
                      onChange={(e) => handleBasicDetailsChange('severity', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    >
                      <option value="minor">Minor</option>
                      <option value="moderate">Moderate</option>
                      <option value="serious">Serious</option>
                      <option value="critical">Critical</option>
                      <option value="fatal">Fatal</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Category
                    </label>
                    <select
                      value={basicDetails.category}
                      onChange={(e) => handleBasicDetailsChange('category', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    >
                      <option value="slip_trip_fall">Slip, Trip & Fall</option>
                      <option value="chemical_exposure">Chemical Exposure</option>
                      <option value="equipment_failure">Equipment Failure</option>
                      <option value="manual_handling">Manual Handling</option>
                      <option value="cuts_lacerations">Cuts & Lacerations</option>
                      <option value="burns">Burns</option>
                      <option value="eye_injury">Eye Injury</option>
                      <option value="respiratory">Respiratory</option>
                      <option value="electrical">Electrical</option>
                      <option value="vehicle_related">Vehicle Related</option>
                      <option value="fire_explosion">Fire/Explosion</option>
                      <option value="structural_collapse">Structural Collapse</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Incident Date
                    </label>
                    <input
                      type="datetime-local"
                      value={basicDetails.incident_date}
                      onChange={(e) => handleBasicDetailsChange('incident_date', e.target.value)}
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
                      Discovered Date
                    </label>
                    <input
                      type="datetime-local"
                      value={basicDetails.discovered_date}
                      onChange={(e) => handleBasicDetailsChange('discovered_date', e.target.value)}
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

                {/* Location Section */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Location Description
                  </label>
                  <input
                    type="text"
                    value={basicDetails.location_description}
                    onChange={(e) => handleBasicDetailsChange('location_description', e.target.value)}
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

                {/* Investigation completion date */}
                {investigationData.investigation_status === 'completed' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Investigation Completed Date
                    </label>
                    <input
                      type="datetime-local"
                      value={investigationData.investigation_completed_date}
                      onChange={(e) => handleInvestigationChange('investigation_completed_date', e.target.value)}
                      style={{
                        width: '300px',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                )}
              </div>
            )}



            {/* Investigation Tab */}
            {activeTab === 'investigation' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                    Incident Investigation
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {investigationData.corrective_actions_required && (
                      <button
                        onClick={createCorrectiveAction}
                        disabled={loading}
                        style={{
                          background: loading ? '#9ca3af' : '#f59e0b',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        {loading ? 'Creating...' : '➕ Create Action'}
                      </button>
                    )}
                    <button
                      onClick={saveInvestigation}
                      disabled={loading}
                      style={{
                        background: loading ? '#9ca3af' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      {loading ? 'Saving...' : 'Save Investigation'}
                    </button>
                  </div>
                </div>

                {/* Investigation Status and Assignment */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Investigation Status
                    </label>
                    <select
                      value={investigationData.investigation_status}
                      onChange={(e) => handleInvestigationChange('investigation_status', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    >
                      {investigationStatuses.map(status => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Investigator
                    </label>
                    <select
                      value={investigationData.investigator_id || ''}
                      onChange={(e) => handleInvestigationChange('investigator_id', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    >
                      <option value="">Select investigator...</option>
                      {users.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Investigation Due Date
                    </label>
                    <input
                      type="datetime-local"
                      value={investigationData.investigation_due_date}
                      onChange={(e) => handleInvestigationChange('investigation_due_date', e.target.value)}
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

                {/* Investigation Findings */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Investigation Findings
                  </label>
                  <textarea
                    value={investigationData.investigation_findings}
                    onChange={(e) => handleInvestigationChange('investigation_findings', e.target.value)}
                    rows={4}
                    placeholder="Document detailed findings from the investigation..."
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

                {/* Root Cause Analysis */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: '600' }}>
                    Root Cause Analysis
                  </h4>

                  {/* Immediate Causes */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Immediate Causes
                    </label>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                      gap: '0.5rem',
                      background: '#f8fafc',
                      padding: '1rem',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}>
                      {immediateCauses.map(cause => (
                        <label key={cause} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem', 
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={investigationData.immediate_causes?.includes(cause) || false}
                            onChange={(e) => handleCausesChange('immediate_causes', cause, e.target.checked)}
                          />
                          <span style={{ textTransform: 'capitalize' }}>
                            {cause.replace(/_/g, ' ')}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder="Other immediate cause (specify)..."
                        value={investigationData.immediate_causes_other || ''}
                        onChange={(e) => handleInvestigationChange('immediate_causes_other', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                  </div>

                  {/* Root Causes */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Root Causes
                    </label>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                      gap: '0.5rem',
                      background: '#f8fafc',
                      padding: '1rem',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}>
                      {rootCauses.map(cause => (
                        <label key={cause} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem', 
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={investigationData.root_causes?.includes(cause) || false}
                            onChange={(e) => handleCausesChange('root_causes', cause, e.target.checked)}
                          />
                          <span style={{ textTransform: 'capitalize' }}>
                            {cause.replace(/_/g, ' ')}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder="Other root cause (specify)..."
                        value={investigationData.root_causes_other || ''}
                        onChange={(e) => handleInvestigationChange('root_causes_other', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                  </div>

                  {/* Contributing Factors */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Contributing Factors
                    </label>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                      gap: '0.5rem',
                      background: '#f8fafc',
                      padding: '1rem',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}>
                      {contributingFactors.map(factor => (
                        <label key={factor} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem', 
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={investigationData.contributing_factors?.includes(factor) || false}
                            onChange={(e) => handleCausesChange('contributing_factors', factor, e.target.checked)}
                          />
                          <span style={{ textTransform: 'capitalize' }}>
                            {factor.replace(/_/g, ' ')}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder="Other contributing factor (specify)..."
                        value={investigationData.contributing_factors_other || ''}
                        onChange={(e) => handleInvestigationChange('contributing_factors_other', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Corrective Actions and Lessons Learned */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Corrective Actions Required
                    </label>
                    <textarea
                      value={investigationData.corrective_actions_required}
                      onChange={(e) => handleInvestigationChange('corrective_actions_required', e.target.value)}
                      rows={4}
                      placeholder="Specify corrective actions needed to prevent recurrence..."
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

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Lessons Learned
                    </label>
                    <textarea
                      value={investigationData.lessons_learned}
                      onChange={(e) => handleInvestigationChange('lessons_learned', e.target.value)}
                      rows={4}
                      placeholder="Document key lessons learned from this incident..."
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

                {/* Investigation Timeline */}
                {investigationData.investigation_status === 'completed' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Investigation Completed Date
                    </label>
                    <input
                      type="datetime-local"
                      value={investigationData.investigation_completed_date}
                      onChange={(e) => handleInvestigationChange('investigation_completed_date', e.target.value)}
                      style={{
                        width: '300px',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                )}

                {/* Investigation Summary */}
                {(investigationData.immediate_causes?.length > 0 || 
                  investigationData.root_causes?.length > 0 || 
                  investigationData.contributing_factors?.length > 0) && (
                  <div style={{
                    background: '#f0f9ff',
                    border: '1px solid #0ea5e9',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginTop: '1.5rem'
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#0369a1' }}>
                      🔍 Investigation Summary
                    </h4>
                    
                    {investigationData.immediate_causes?.length > 0 && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong style={{ fontSize: '0.875rem', color: '#0369a1' }}>Immediate Causes:</strong>
                        <span style={{ fontSize: '0.875rem', color: '#0369a1', marginLeft: '0.5rem' }}>
                          {investigationData.immediate_causes.map(cause => 
                            cause.replace(/_/g, ' ')
                          ).join(', ')}
                        </span>
                      </div>
                    )}
                    
                    {investigationData.root_causes?.length > 0 && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong style={{ fontSize: '0.875rem', color: '#0369a1' }}>Root Causes:</strong>
                        <span style={{ fontSize: '0.875rem', color: '#0369a1', marginLeft: '0.5rem' }}>
                          {investigationData.root_causes.map(cause => 
                            cause.replace(/_/g, ' ')
                          ).join(', ')}
                        </span>
                      </div>
                    )}
                    
                    {investigationData.contributing_factors?.length > 0 && (
                      <div>
                        <strong style={{ fontSize: '0.875rem', color: '#0369a1' }}>Contributing Factors:</strong>
                        <span style={{ fontSize: '0.875rem', color: '#0369a1', marginLeft: '0.5rem' }}>
                          {investigationData.contributing_factors.map(factor => 
                            factor.replace(/_/g, ' ')
                          ).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}







            {/* WorkSafe Tab */}
            {activeTab === 'worksafe' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                    WorkSafe NZ Notification
                  </h3>
                </div>

                {/* Notification Requirements */}
                <div style={{
                  background: isNotifiable ? (isNotified ? '#dcfce7' : '#fecaca') : '#f8fafc',
                  border: `1px solid ${isNotifiable ? (isNotified ? '#22c55e' : '#dc2626') : '#e5e7eb'}`,
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.75rem'
                  }}>
                    <div style={{
                      fontSize: '1.5rem'
                    }}>
                      {isNotifiable ? (isNotified ? '✅' : '⚠️') : 'ℹ️'}
                    </div>
                    <div style={{ fontWeight: '600', fontSize: '1rem' }}>
                      {isNotifiable ? 
                        (isNotified ? 'WorkSafe Notified' : 'WorkSafe Notification Required') : 
                        'WorkSafe Notification Not Required'
                      }
                    </div>
                  </div>
                  
                  {isNotifiable && (
                    <div style={{
                      fontSize: '0.875rem',
                      color: isNotified ? '#166534' : '#991b1b',
                      marginBottom: '0.75rem'
                    }}>
                      {isNotified ? 
                        `This incident was notified to WorkSafe on ${incident.worksafe_notification_date ? 
                          new Date(incident.worksafe_notification_date).toLocaleDateString() : 'Unknown date'}.` :
                        'This incident must be notified to WorkSafe NZ within 48 hours of occurrence.'
                      }
                    </div>
                  )}

                  {isNotifiable && !isNotified && (
                    <div style={{
                      background: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      color: '#92400e'
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                        📞 How to Notify WorkSafe:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        <li><strong>Phone:</strong> 0800 030 040 (24/7)</li>
                        <li><strong>Online:</strong> worksafe.govt.nz/notifications</li>
                        <li><strong>Email:</strong> info@worksafe.govt.nz</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Current Notification Status */}
                {isNotified && (
                  <div style={{
                    background: '#dcfce7',
                    border: '1px solid #22c55e',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.5rem'
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#166534' }}>
                      ✅ Notification Details
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                      <div>
                        <strong>Notification Date:</strong><br />
                        {incident.worksafe_notification_date ? 
                          new Date(incident.worksafe_notification_date).toLocaleString() : 'Not recorded'}
                      </div>
                      <div>
                        <strong>Reference Number:</strong><br />
                        {incident.worksafe_reference || 'Not provided'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Notification Form */}
                {isNotifiable && !isNotified && (
                  <div style={{
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.5rem'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: '600' }}>
                      📢 Record WorkSafe Notification
                    </h4>
                    
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Notification Method *
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {notificationMethods.map(method => (
                          <label key={method.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <input
                              type="radio"
                              name="notification_method"
                              value={method.value}
                              checked={workSafeData.notification_method === method.value}
                              onChange={(e) => handleWorkSafeChange('notification_method', e.target.value)}
                            />
                            {method.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        WorkSafe Reference Number (if provided)
                      </label>
                      <input
                        type="text"
                        value={workSafeData.worksafe_reference}
                        onChange={(e) => handleWorkSafeChange('worksafe_reference', e.target.value)}
                        placeholder="Reference number from WorkSafe"
                        style={{
                          width: '300px',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Notification Notes
                      </label>
                      <textarea
                        value={workSafeData.notification_notes}
                        onChange={(e) => handleWorkSafeChange('notification_notes', e.target.value)}
                        rows={3}
                        placeholder="Additional notes about the notification (e.g., who you spoke to, follow-up required)"
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

                    <button
                      onClick={notifyWorkSafe}
                      disabled={loading || !workSafeData.notification_method}
                      style={{
                        background: (loading || !workSafeData.notification_method) ? '#9ca3af' : '#dc2626',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '6px',
                        cursor: (loading || !workSafeData.notification_method) ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      {loading ? 'Recording...' : 'Record Notification'}
                    </button>
                  </div>
                )}

                {/* Compliance Information */}
                <div style={{
                  background: '#f0f9ff',
                  border: '1px solid #0ea5e9',
                  borderRadius: '8px',
                  padding: '1rem'
                }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#0369a1' }}>
                    📋 WorkSafe NZ Notification Requirements
                  </h4>
                  
                  <div style={{ fontSize: '0.875rem', color: '#0369a1', lineHeight: '1.5' }}>
                    <p style={{ margin: '0 0 0.5rem 0' }}>
                      <strong>Must be notified within 48 hours if:</strong>
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                      <li>Death of any person</li>
                      <li>Notifiable injury or illness (fractures, amputations, serious burns, etc.)</li>
                      <li>Notifiable incident (dangerous occurrences, structural collapses, etc.)</li>
                    </ul>
                    
                    <p style={{ margin: '0.75rem 0 0.5rem 0' }}>
                      <strong>Contact WorkSafe:</strong>
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                      <li><strong>Phone:</strong> 0800 030 040 (24 hours, 7 days)</li>
                      <li><strong>Online:</strong> worksafe.govt.nz/notifications</li>
                      <li><strong>Email:</strong> info@worksafe.govt.nz</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* WorkSafe Notification Modal */}
        {showWorkSafeForm && (
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
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}>
              <h3 style={{ margin: '0 0 1rem 0' }}>📢 WorkSafe Notification Required</h3>
              
              <div style={{
                background: '#fecaca',
                border: '1px solid #dc2626',
                borderRadius: '6px',
                padding: '1rem',
                marginBottom: '1rem',
                color: '#991b1b'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                  ⚠️ This incident requires WorkSafe notification
                </div>
                <div style={{ fontSize: '0.875rem' }}>
                  You must notify WorkSafe NZ within 48 hours of the incident occurring.
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                  Contact WorkSafe Now:
                </div>
                <div style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
                  📞 <strong>Phone:</strong> 0800 030 040 (24/7)<br />
                  🌐 <strong>Online:</strong> worksafe.govt.nz/notifications<br />
                  📧 <strong>Email:</strong> info@worksafe.govt.nz
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowWorkSafeForm(false)}
                  style={{
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  I'll Notify Later
                </button>
                <button
                  onClick={() => {
                    setShowWorkSafeForm(false);
                    setActiveTab('worksafe');
                  }}
                  style={{
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Record Notification
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Incident Closure Modal */}
        {showClosureForm && (
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
              borderRadius: '12px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}>
              <h3 style={{ margin: '0 0 1rem 0' }}>✅ Close Incident</h3>
              
              {/* Closure validation warnings */}
              {(isNotifiable && !isNotified) && (
                <div style={{
                  background: '#fecaca',
                  border: '1px solid #dc2626',
                  borderRadius: '6px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  color: '#991b1b'
                }}>
                  ⚠️ Cannot close: WorkSafe notification is required but not completed.
                </div>
              )}

              {(incident.investigation_required && incident.investigation_status !== 'completed') && (
                <div style={{
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '6px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  color: '#92400e'
                }}>
                  ⚠️ Warning: Investigation is not marked as completed.
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Closure Reason *
                </label>
                <textarea
                  value={closureData.closure_reason}
                  onChange={(e) => handleClosureChange('closure_reason', e.target.value)}
                  rows={3}
                  placeholder="Explain why this incident is being closed..."
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
                  Final Lessons Learned
                </label>
                <textarea
                  value={closureData.lessons_learned}
                  onChange={(e) => handleClosureChange('lessons_learned', e.target.value)}
                  rows={3}
                  placeholder="Any final lessons learned or recommendations..."
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

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                  <input
                    type="checkbox"
                    checked={closureData.communication_completed}
                    onChange={(e) => handleClosureChange('communication_completed', e.target.checked)}
                  />
                  All required communications completed
                </label>
                <small style={{ display: 'block', marginTop: '0.25rem', color: '#6b7280' }}>
                  Stakeholders have been informed of the incident resolution
                </small>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowClosureForm(false)}
                  style={{
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={closeIncident}
                  disabled={loading || !closureData.closure_reason || (isNotifiable && !isNotified)}
                  style={{
                    background: (loading || !closureData.closure_reason || (isNotifiable && !isNotified)) ? 
                      '#9ca3af' : '#059669',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    cursor: (loading || !closureData.closure_reason || (isNotifiable && !isNotified)) ? 
                      'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Closing...' : 'Close Incident'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Location Map Modal */}
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
              borderRadius: '12px',
              maxWidth: '800px',
              width: '90%',
              height: '600px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
              }}>
                <h3 style={{ margin: 0 }}>📍 Set Incident Location</h3>
                <button
                  onClick={() => setShowLocationMap(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  ×
                </button>
              </div>
              
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '2rem',
                textAlign: 'center',
                height: '400px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <div style={{ fontSize: '3rem' }}>🗺️</div>
                <div>
                  <h4>Interactive Map Component</h4>
                  <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                    Map integration would be implemented here using a service like Leaflet, Google Maps, or Mapbox.
                  </p>
                  <button
                    onClick={() => {
                      // Simulate setting a location
                      handleLocationSet({
                        type: 'Point',
                        coordinates: [174.0 + Math.random() * 0.1, -43.5 + Math.random() * 0.1]
                      });
                    }}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Set Sample Location
                  </button>
                </div>
              </div>
              
              <div style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end',
                marginTop: '1rem'
              }}>
                <button
                  onClick={() => setShowLocationMap(false)}
                  style={{
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
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

export default EditIncident;