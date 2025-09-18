import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import MobileNavigation from '../components/MobileNavigation';
import { useAuth } from '@vineyard/shared';
import {riskManagementService, adminService} from '@vineyard/shared';


function CreateAction() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(false);
  const [loadingRisks, setLoadingRisks] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [risks, setRisks] = useState([]);
  const location = useLocation();
  const editMode = location.state?.editMode || false;
  const existingActionData = location.state?.actionData || null;
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Fixed formData initialization with proper field handling
  const [formData, setFormData] = useState({
    risk_id: existingActionData?.risk_id || searchParams.get('risk_id') || '',
    action_title: existingActionData?.action_title || '',
    action_description: existingActionData?.action_description || '',
    action_type: existingActionData?.action_type || 'preventive',
    control_type: existingActionData?.control_type || 'administrative',
    priority: existingActionData?.priority || 'medium',
    urgency: existingActionData?.urgency || 'medium',
    assigned_to: existingActionData?.assigned_to || '',
    target_completion_date: existingActionData?.target_completion_date || '',
    estimated_cost: existingActionData?.estimated_cost || '',
    currency: existingActionData?.currency || 'NZD',
    expected_likelihood_reduction: existingActionData?.expected_likelihood_reduction || '',
    expected_severity_reduction: existingActionData?.expected_severity_reduction || '',
    auto_create_task: existingActionData?.auto_create_task ?? false,
    requires_verification: existingActionData?.requires_verification || false,
    is_recurring: existingActionData?.is_recurring || false,
    recurrence_frequency_quarters: existingActionData?.recurrence_frequency_quarters || '',
    // Added missing fields for progress tracking
    status: existingActionData?.status || 'planned',
    progress_percentage: existingActionData?.progress_percentage || 0,
    completion_notes: existingActionData?.completion_notes || '',
    actual_start_date: existingActionData?.actual_start_date || '',
    actual_completion_date: existingActionData?.actual_completion_date || '',
    custom_fields: existingActionData?.custom_fields || {},
    tags: existingActionData?.tags || []
  });

  const validateForm = () => {
    const errors = {};
    
    // Required field validations
    if (!formData.risk_id) errors.risk_id = 'Risk selection is required';
    if (!formData.action_title.trim()) errors.action_title = 'Action title is required';
    if (!formData.action_description.trim()) errors.action_description = 'Action description is required';
    if (!formData.target_completion_date) errors.target_completion_date = 'Target completion date is required';
    
    // Business logic validations
    const completionDate = new Date(formData.target_completion_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (completionDate < today) {
      errors.target_completion_date = 'Target completion date cannot be in the past';
    }
    
    // Progress validation
    if (formData.status === 'completed' && formData.progress_percentage < 100) {
      errors.progress_percentage = 'Completed actions must have 100% progress';
    }
    
    if (formData.progress_percentage > 0 && formData.status === 'planned') {
      errors.status = 'Actions with progress cannot be in planned status';
    }
    
    // Cost validation
    if (formData.estimated_cost && formData.estimated_cost < 0) {
      errors.estimated_cost = 'Cost cannot be negative';
    }
    
    // Assignment validation for high-priority actions
    if ((formData.priority === 'critical' || formData.urgency === 'urgent') && !formData.assigned_to) {
      errors.assigned_to = 'Critical/urgent actions should be assigned to someone';
    }
    
    return errors;
  };

  // Options for dropdowns
  const recurrenceOptions = [
    { value: '', label: 'Not recurring' },
    { value: '1', label: 'Every quarter (3 months)' },
    { value: '2', label: 'Every 6 months (2 quarters)' },
    { value: '3', label: 'Every 9 months (3 quarters)' },
    { value: '4', label: 'Every 12 months (4 quarters)' }
  ];

  const actionTypes = [
    { value: 'preventive', label: 'Preventive - Prevent the risk from occurring' },
    { value: 'detective', label: 'Detective - Detect when risk occurs' },
    { value: 'corrective', label: 'Corrective - Fix issues after they occur' },
    { value: 'mitigative', label: 'Mitigative - Reduce impact when risk occurs' }
  ];

  const controlTypes = [
    { value: 'elimination', label: 'Elimination - Remove the hazard entirely (most effective)' },
    { value: 'substitution', label: 'Substitution - Replace with something less hazardous' },
    { value: 'engineering', label: 'Engineering - Engineering controls (guards, ventilation, etc.)' },
    { value: 'administrative', label: 'Administrative - Procedures, training, signage, job rotation' },
    { value: 'ppe', label: 'PPE - Personal protective equipment (least effective)' }
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' }
  ];

  const urgencyOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' }
  ];

  const statusOptions = [
    { value: 'planned', label: 'Planned - Not yet started' },
    { value: 'in_progress', label: 'In Progress - Currently working on' },
    { value: 'completed', label: 'Completed - Finished successfully' },
    { value: 'on_hold', label: 'On Hold - Temporarily paused' },
    { value: 'cancelled', label: 'Cancelled - No longer needed' }
  ];

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  // Fetch available risks
  useEffect(() => {
    const fetchRisks = async () => {
      try {
        setLoadingRisks(true);
        const risksData = await riskManagementService.getAllRisks({ status: 'active', limit: 100 });
        
        // Handle different response formats
        let risksArray = [];
        if (Array.isArray(risksData)) {
          risksArray = risksData;
        } else if (risksData && Array.isArray(risksData.data)) {
          risksArray = risksData.data;
        }
        
        setRisks(risksArray);
        console.log('✅ Loaded risks for selection:', risksArray);
      } catch (error) {
        console.error('❌ Error fetching risks:', error);
        setError('Failed to load risks');
      } finally {
        setLoadingRisks(false);
      }
    };

    fetchRisks();
  }, []);

  // Fetch company users
  useEffect(() => {
    const fetchCompanyUsers = async () => {
      try {
        setLoadingUsers(true);
        const usersData = await adminService.getCompanyUsers(user.company_id, { limit: 200 }); 
        
        // Handle different response formats
        let usersArray = [];
        if (Array.isArray(usersData)) {
          usersArray = usersData;
        } else if (usersData && Array.isArray(usersData.data)) {
          usersArray = usersData.data;
        } else if (usersData && Array.isArray(usersData.users)) {
          usersArray = usersData.users;
        }
        
        // Filter to only active, non-suspended users
        const activeUsers = usersArray.filter(u => 
          u.is_active && !u.is_suspended
        );
        
        setCompanyUsers(activeUsers);
        console.log('✅ Loaded company users for assignment:', activeUsers);
      } catch (error) {
        console.error('❌ Error fetching company users:', error);
        setCompanyUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    if (user?.company_id) {
      fetchCompanyUsers();
    }
  }, [user?.company_id]);

  // Auto-set verification requirement when risk is selected
  useEffect(() => {
    if (formData.risk_id) {
      const needsVerification = requiresAdminVerification();
      if (needsVerification && !formData.requires_verification) {
        setFormData(prev => ({
          ...prev,
          requires_verification: true
        }));
      }
    }
  }, [formData.risk_id, risks]);

  // Fetch action history for recurring actions
  useEffect(() => {
    const fetchActionHistory = async () => {
      if (editMode && existingActionData?.parent_action_id) {
        try {
          const historyData = await riskManagementService.getActionHistory(existingActionData.parent_action_id);
          setActionHistory(historyData || []);
        } catch (error) {
          console.error('❌ Error fetching action history:', error);
        }
      } else if (editMode && existingActionData?.id) {
        try {
          const childActions = await riskManagementService.getChildActions(existingActionData.id);
          setActionHistory(childActions || []);
        } catch (error) {
          console.error('❌ Error fetching child actions:', error);
        }
      }
    };

    if (editMode && existingActionData) {
      fetchActionHistory();
    }
  }, [editMode, existingActionData]);

  // Enhanced handleChange to manage status-related logic
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: type === 'checkbox' ? checked : 
                type === 'number' ? (value === '' ? '' : parseInt(value)) : 
                value
      };
      
      // Auto-update related fields based on status changes
      if (name === 'status') {
        if (value === 'in_progress' && !prev.actual_start_date) {
          newData.actual_start_date = new Date().toISOString().split('T')[0];
        }
        if (value === 'completed') {
          newData.progress_percentage = 100;
          if (!prev.actual_completion_date) {
            newData.actual_completion_date = new Date().toISOString().split('T')[0];
          }
        }
        if (value === 'planned') {
          newData.progress_percentage = 0;
          newData.actual_start_date = '';
          newData.actual_completion_date = '';
        }
      }
      
      // Auto-update status based on progress
      if (name === 'progress_percentage') {
        const progress = parseInt(value) || 0;
        if (progress === 100 && prev.status !== 'completed') {
          newData.status = 'completed';
          if (!prev.actual_completion_date) {
            newData.actual_completion_date = new Date().toISOString().split('T')[0];
          }
        } else if (progress > 0 && progress < 100 && prev.status === 'planned') {
          newData.status = 'in_progress';
          if (!prev.actual_start_date) {
            newData.actual_start_date = new Date().toISOString().split('T')[0];
          }
        }
      }
      
      return newData;
    });
  };

  const getSelectedRisk = () => {
    return risks.find(r => r.id === parseInt(formData.risk_id));
  };

  const requiresAdminVerification = () => {
    const selectedRisk = getSelectedRisk();
    if (!selectedRisk) return false;
    
    const inherentLevel = selectedRisk.inherent_risk_level;
    const residualLevel = selectedRisk.residual_risk_level;
    
    return inherentLevel === 'high' || inherentLevel === 'critical' || 
          residualLevel === 'high' || residualLevel === 'critical';
  };

  const ActionHistoryComponent = ({ history, currentAction }) => {
    if (!history || history.length === 0) return null;

    const sortedHistory = [...history].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
          🔄 Recurring Action History
        </h3>
        
        <div style={{
          padding: '0.75rem',
          background: '#f0f9ff',
          border: '1px solid #0ea5e9',
          borderRadius: '6px',
          marginBottom: '1rem'
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#0369a1' }}>
            This is part of a recurring action series. Below is the complete history of all instances.
          </p>
        </div>

        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {sortedHistory.map((action, index) => (
            <div key={action.id} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              marginBottom: '0.5rem',
              background: action.id === currentAction?.id ? '#fef3c7' : '#f9fafb'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getStatusColor(action.status)
                  }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {action.id === currentAction?.id ? 'Current Instance' : `Instance #${sortedHistory.length - index}`}
                  </span>
                  <span style={{
                    padding: '0.125rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    background: getStatusColor(action.status),
                    color: 'white'
                  }}>
                    {action.status}
                  </span>
                </div>
                
                <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
                  Created: {new Date(action.created_at).toLocaleDateString()}
                  {action.target_completion_date && (
                    <> • Due: {new Date(action.target_completion_date).toLocaleDateString()}</>
                  )}
                  {action.actual_completion_date && (
                    <> • Completed: {new Date(action.actual_completion_date).toLocaleDateString()}</>
                  )}
                </div>
                
                {action.progress_percentage > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{
                      width: '100%',
                      height: '4px',
                      backgroundColor: '#e5e7eb',
                      borderRadius: '2px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${action.progress_percentage}%`,
                        height: '100%',
                        backgroundColor: action.progress_percentage === 100 ? '#10b981' : '#3b82f6',
                        borderRadius: '2px'
                      }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {action.progress_percentage}% complete
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Helper function for status colors
  const getStatusColor = (status) => {
    const colors = {
      'planned': '#6b7280',
      'in_progress': '#3b82f6',
      'completed': '#10b981',
      'on_hold': '#f59e0b',
      'cancelled': '#ef4444',
      'overdue': '#dc2626'
    };
    return colors[status] || '#6b7280';
  };

  // FIXED: Handle form submission with proper data flow
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form first
    const errors = validateForm();
    setValidationErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      setError('Please fix the validation errors before submitting');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      console.log('Creating/updating action with data:', formData);
      
      // FIXED: Prepare cleaned data with proper field handling
      const cleanedData = {
        ...formData,
        company_id: user.company_id,
        risk_id: parseInt(formData.risk_id),
        assigned_to: formData.assigned_to && formData.assigned_to !== '' ? parseInt(formData.assigned_to) : null,
        estimated_cost: formData.estimated_cost && formData.estimated_cost !== '' ? parseFloat(formData.estimated_cost) : null,
        expected_likelihood_reduction: formData.expected_likelihood_reduction && formData.expected_likelihood_reduction !== '' ? parseInt(formData.expected_likelihood_reduction) : null,
        expected_severity_reduction: formData.expected_severity_reduction && formData.expected_severity_reduction !== '' ? parseInt(formData.expected_severity_reduction) : null,
        
        // FIXED: Ensure dates are properly formatted or null
        target_completion_date: formData.target_completion_date || null,
        actual_start_date: formData.actual_start_date || null,
        actual_completion_date: formData.actual_completion_date || null,
        
        // FIXED: Ensure progress is always an integer
        progress_percentage: parseInt(formData.progress_percentage) || 0,
        
        // FIXED: Ensure status is always included
        status: formData.status || 'planned',
        
        // FIXED: Handle completion notes
        completion_notes: formData.completion_notes || '',
        
        // Convert quarterly recurrence to days
        is_recurring: formData.recurrence_frequency_quarters !== '',
        recurrence_frequency_days: formData.recurrence_frequency_quarters ? 
          parseInt(formData.recurrence_frequency_quarters) * 90 : null,
        
        // Custom fields for quarterly tracking
        custom_fields: {
          ...formData.custom_fields,
          recurrence_frequency_quarters: formData.recurrence_frequency_quarters || null
        },
        
        // FIXED: Ensure tags is always an array
        tags: Array.isArray(formData.tags) ? formData.tags : []
      };

      console.log('Cleaned data being sent:', cleanedData);

      let result;
      if (editMode && existingActionData?.id) {
        result = await riskManagementService.updateAction(existingActionData.id, cleanedData);
        console.log('Action updated successfully:', result);
      } else {
        result = await riskManagementService.createAction(cleanedData);
        console.log('Action created successfully:', result);
      }
      
      setSuccess(true);
      
      // Redirect after 2 seconds
      setTimeout(() => {
        navigate('/riskdashboard');
      }, 2000);

    } catch (error) {
      console.error('Error saving action:', error);
      console.error('Error response:', error.response?.data);
      
      // Enhanced error handling
      if (error.response?.status === 422) {
        const validationErrors = error.response.data?.detail;
        if (Array.isArray(validationErrors)) {
          const errorMessages = validationErrors.map(err => `${err.loc?.join('.')} - ${err.msg}`).join(', ');
          setError(`Validation error: ${errorMessages}`);
        } else {
          setError(`Validation error: ${JSON.stringify(validationErrors)}`);
        }
      } else if (error.response?.status === 403) {
        setError('You do not have permission to create/modify this action');
      } else {
        setError(error.response?.data?.detail || error.message || 'Failed to save action');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    navigate('/riskdashboard');
  };

  const selectedRisk = getSelectedRisk();

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '800px', 
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
              {editMode ? 'Edit Risk Action' : 'Create Risk Action'}
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
          
          {/* Selected Risk Display */}
          {selectedRisk && (
            <div style={{
              padding: '1rem',
              background: '#f0f9ff',
              border: '1px solid #0ea5e9',
              borderRadius: '8px'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#0369a1' }}>Selected Risk:</h4>
              <p style={{ margin: 0, fontWeight: '500' }}>{selectedRisk.risk_title}</p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                {selectedRisk.risk_category?.replace('_', ' ')} • {selectedRisk.inherent_risk_level} risk
              </p>
            </div>
          )}

          {/* High/Critical Risk Warning */}
          {selectedRisk && requiresAdminVerification() && (
            <div style={{
              padding: '1rem',
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '8px',
              marginTop: '1rem'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#92400e' }}>⚠️ High/Critical Risk Action</h4>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>
                This action is for a {selectedRisk.inherent_risk_level} risk and may require company management verification upon completion.
                Ensure the action plan is comprehensive and addresses the significant risk level.
              </p>
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
            ✅ Action {editMode ? 'updated' : 'created'} successfully! Redirecting to dashboard...
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

        {/* Loading Risks */}
        {loadingRisks && (
          <div style={{
            background: '#f0f9ff',
            border: '1px solid #0ea5e9',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#0369a1'
          }}>
            Loading available risks...
          </div>
        )}

        {/* Action History Display */}
        {(editMode && actionHistory.length > 0) && (
          <ActionHistoryComponent 
            history={actionHistory} 
            currentAction={existingActionData}
          />
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            
            {/* Enhanced Recurrence Info for existing recurring actions */}
            {editMode && existingActionData?.is_recurring && (
              <div style={{
                padding: '1rem',
                background: '#f0f9ff',
                border: '1px solid #0ea5e9',
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#0369a1' }}>🔄 Recurring Action Information</h4>
                <div style={{ fontSize: '0.875rem', color: '#0369a1' }}>
                  <p style={{ margin: '0 0 0.5rem 0' }}>
                    <strong>Frequency:</strong> Every {existingActionData.recurrence_frequency_quarters || Math.ceil(existingActionData.recurrence_frequency_days / 90)} quarter(s)
                  </p>
                  {existingActionData.parent_action_id && (
                    <p style={{ margin: '0 0 0.5rem 0' }}>
                      <strong>Series:</strong> This is part of a recurring action series (ID: {existingActionData.parent_action_id})
                    </p>
                  )}
                  {existingActionData.next_due_date && (
                    <p style={{ margin: 0 }}>
                      <strong>Next Due:</strong> {new Date(existingActionData.next_due_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Basic Information */}
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Basic Information
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Select Risk *
              </label>
              <select
                name="risk_id"
                value={formData.risk_id}
                onChange={handleChange}
                required
                disabled={loadingRisks}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="">Select a risk to create action for</option>
                {risks.map(risk => (
                  <option key={risk.id} value={risk.id}>
                    {risk.risk_title} ({risk.risk_category?.replace('_', ' ')} - {risk.inherent_risk_level})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Action Title *
              </label>
              <input
                type="text"
                name="action_title"
                value={formData.action_title}
                onChange={handleChange}
                required
                placeholder="e.g., Install chemical spill containment system"
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
                Action Description *
              </label>
              <textarea
                name="action_description"
                value={formData.action_description}
                onChange={handleChange}
                required
                rows={4}
                placeholder="Describe what needs to be done in detail..."
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

            {/* Assignment Section */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Assign To
              </label>
              <select
                name="assigned_to"
                value={formData.assigned_to}
                onChange={handleChange}
                disabled={loadingUsers}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="">Unassigned</option>
                {companyUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.first_name && user.last_name 
                      ? `${user.first_name} ${user.last_name}` 
                      : user.username
                    } ({user.email}) {user.role && `- ${user.role}`}
                  </option>
                ))}
              </select>
              {loadingUsers && (
                <small style={{ display: 'block', marginTop: '0.25rem', color: '#6b7280' }}>
                  Loading team members...
                </small>
              )}
              {!loadingUsers && companyUsers.length === 0 && (
                <small style={{ display: 'block', marginTop: '0.25rem', color: '#dc2626' }}>
                  No team members available for assignment.
                </small>
              )}
              <small style={{ display: 'block', marginTop: '0.25rem', color: '#6b7280' }}>
                Select a team member to assign this action to. Leave unassigned if responsibility is unclear.
              </small>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Action Type *
                </label>
                <select
                  name="action_type"
                  value={formData.action_type}
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
                  {actionTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Control Type *
                </label>
                <select
                  name="control_type"
                  value={formData.control_type}
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
                  {controlTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Priority *
                </label>
                <select
                  name="priority"
                  value={formData.priority}
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
                  {priorityOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Urgency *
                </label>
                <select
                  name="urgency"
                  value={formData.urgency}
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
                  {urgencyOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Progress & Status Tracking */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Progress & Status Tracking
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Current Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Progress Percentage
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="range"
                    name="progress_percentage"
                    min="0"
                    max="100"
                    step="5"
                    value={formData.progress_percentage}
                    onChange={handleChange}
                    style={{
                      flex: 1,
                      height: '6px',
                      background: '#e5e7eb',
                      borderRadius: '3px',
                      outline: 'none'
                    }}
                  />
                  <input
                    type="number"
                    name="progress_percentage"
                    min="0"
                    max="100"
                    value={formData.progress_percentage}
                    onChange={handleChange}
                    style={{
                      width: '60px',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      textAlign: 'center'
                    }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>%</span>
                </div>
              </div>
            </div>

            {/* Progress Visual Indicator */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                width: '100%',
                height: '20px',
                backgroundColor: '#e5e7eb',
                borderRadius: '10px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: `${formData.progress_percentage}%`,
                  height: '100%',
                  backgroundColor: formData.progress_percentage === 100 ? '#10b981' : '#3b82f6',
                  borderRadius: '10px',
                  transition: 'width 0.3s ease'
                }} />
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  color: formData.progress_percentage > 50 ? 'white' : '#374151'
                }}>
                  {formData.progress_percentage}% Complete
                </div>
              </div>
            </div>

            {/* Date Tracking */}
            {(formData.status === 'in_progress' || formData.actual_start_date || 
              formData.status === 'completed' || formData.actual_completion_date) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                {(formData.status === 'in_progress' || formData.actual_start_date) && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Actual Start Date
                    </label>
                    <input
                      type="date"
                      name="actual_start_date"
                      value={formData.actual_start_date}
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
                )}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Target Completion Date *
                </label>
                <input
                  type="date"
                  name="target_completion_date"
                  value={formData.target_completion_date}
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
                {(formData.status === 'completed' || formData.actual_completion_date) && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Actual Completion Date
                    </label>
                    <input
                      type="date"
                      name="actual_completion_date"
                      value={formData.actual_completion_date}
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
                )}
              </div>
            )}

            {/* Completion Notes */}
            {(formData.status === 'completed' || formData.progress_percentage > 0) && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Progress/Completion Notes
                </label>
                <textarea
                  name="completion_notes"
                  value={formData.completion_notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Add notes about progress, challenges, or completion details..."
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

            {/* Status-based warnings/info */}
            {formData.status === 'completed' && formData.progress_percentage < 100 && (
              <div style={{
                padding: '0.75rem',
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                marginBottom: '1rem'
              }}>
                <small style={{ color: '#92400e' }}>
                  ⚠️ Status is marked as completed but progress is less than 100%. Consider updating the progress percentage.
                </small>
              </div>
            )}

            {/* Show additional info for recurring actions */}
            {formData.recurrence_frequency_quarters && (
              <div style={{
                padding: '1rem',
                background: '#f0f9ff',
                border: '1px solid #0ea5e9',
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#0369a1' }}>Recurring Action Settings:</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#0369a1' }}>
                  This action will automatically create a new instance every{' '}
                  {formData.recurrence_frequency_quarters === '1' ? '3 months' :
                  formData.recurrence_frequency_quarters === '2' ? '6 months' :
                  formData.recurrence_frequency_quarters === '3' ? '9 months' :
                  formData.recurrence_frequency_quarters === '4' ? '12 months' : ''}.
                  Each new instance will be linked to maintain a complete history.
                </p>
              </div>
            )}

            {/* Cost Estimation */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Cost Estimation
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Estimated Cost
                </label>
                <input
                  type="number"
                  name="estimated_cost"
                  value={formData.estimated_cost}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
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
                  Currency
                </label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="NZD">NZD</option>
                  <option value="AUD">AUD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* Risk Reduction Expectations */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>
              Expected Risk Reduction
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Expected Likelihood Reduction
                </label>
                <select
                  name="expected_likelihood_reduction"
                  value={formData.expected_likelihood_reduction}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Select reduction</option>
                  <option value="1">1 point reduction</option>
                  <option value="2">2 point reduction</option>
                  <option value="3">3 point reduction</option>
                  <option value="4">4 point reduction</option>
                  <option value="5">5 point reduction</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Expected Severity Reduction
                </label>
                <select
                  name="expected_severity_reduction"
                  value={formData.expected_severity_reduction}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Select reduction</option>
                  <option value="1">1 point reduction</option>
                  <option value="2">2 point reduction</option>
                  <option value="3">3 point reduction</option>
                  <option value="4">4 point reduction</option>
                  <option value="5">5 point reduction</option>
                </select>
              </div>
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
                disabled={loading || loadingRisks || !formData.risk_id}
                style={{
                  background: (loading || loadingRisks || !formData.risk_id) ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '6px',
                  cursor: (loading || loadingRisks || !formData.risk_id) ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                {loading ? (editMode ? 'Updating...' : 'Creating...') : (editMode ? 'Update Action' : 'Create Action')}
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

      </div>
      <MobileNavigation />
    </div>
  );
}

export default CreateAction;