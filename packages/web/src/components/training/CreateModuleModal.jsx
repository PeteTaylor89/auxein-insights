import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {trainingService} from '@vineyard/shared';

function CreateModuleModal({ onClose, onSuccess }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    // Basic info
    title: '',
    description: '',
    category: 'safety',
    
    // Settings
    estimated_duration_minutes: 5,
    has_questionnaire: false,
    passing_score: 80,
    max_attempts: 3,
    valid_for_days: 365,
    
    // Auto-assignment
    auto_assign_to_visitors: false,
    auto_assign_to_contractors: false,
    auto_assign_to_new_users: false,
    required_for_roles: []
  });
  const [errors, setErrors] = useState({});

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateStep = (stepNumber) => {
    const newErrors = {};
    
    if (stepNumber === 1) {
      if (!formData.title.trim()) {
        newErrors.title = 'Title is required';
      } else if (formData.title.length < 3) {
        newErrors.title = 'Title must be at least 3 characters';
      }
      
      if (!formData.description.trim()) {
        newErrors.description = 'Description is required';
      }
      
      if (formData.estimated_duration_minutes < 1 || formData.estimated_duration_minutes > 480) {
        newErrors.estimated_duration_minutes = 'Duration must be between 1 and 480 minutes';
      }
      
      if (formData.has_questionnaire) {
        if (formData.passing_score < 50 || formData.passing_score > 100) {
          newErrors.passing_score = 'Passing score must be between 50% and 100%';
        }
        if (formData.max_attempts < 1 || formData.max_attempts > 10) {
          newErrors.max_attempts = 'Max attempts must be between 1 and 10';
        }
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    
    try {
      setLoading(true);
      
      console.log('🔄 Creating training module:', formData);
      
      // Create the module
      const module = await trainingService.modules.createModule(formData);
      
      console.log('✅ Module created:', module);
      
      // Show success and redirect to editor
      alert('Training module created successfully!');
      
      onSuccess();
      navigate(`/training`);
      
    } catch (error) {
      console.error('❌ Error creating module:', error);
      
      const errorMessage = trainingService.errorHandler.handleApiError(error);
      alert('Failed to create training module: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleToggle = (role) => {
    setFormData(prev => ({
      ...prev,
      required_for_roles: prev.required_for_roles.includes(role)
        ? prev.required_for_roles.filter(r => r !== role)
        : [...prev.required_for_roles, role]
    }));
  };

  return (
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
      zIndex: 50,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{
              margin: '0 0 0.25rem 0',
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937'
            }}>
              Create Training Module
            </h2>
            <p style={{
              margin: 0,
              fontSize: '0.875rem',
              color: '#6b7280'
            }}>
              Step {step} of 2 - {step === 1 ? 'Basic Information' : 'Assignment Settings'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem'
            }}
          >
            ×
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{
          padding: '0 1.5rem',
          paddingTop: '1rem'
        }}>
          <div style={{
            background: '#e5e7eb',
            borderRadius: '999px',
            height: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              background: '#3b82f6',
              height: '100%',
              width: `${(step / 2) * 100}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '1.5rem' }}>
          {step === 1 && (
            <div>
              {/* Basic Information */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Module Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="e.g., Workplace Safety Fundamentals"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: `1px solid ${errors.title ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box'
                  }}
                />
                {errors.title && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {errors.title}
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Brief description of what this training covers..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: `1px solid ${errors.description ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
                {errors.description && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {errors.description}
                  </p>
                )}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleInputChange('category', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'white'
                    }}
                  >
                    <option value="safety">Safety</option>
                    <option value="compliance">Compliance</option>
                    <option value="operations">Operations</option>
                    <option value="induction">Induction</option>
                    <option value="other">Skills Development</option>
                    <option value="equipment">Equipment</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Estimated Duration (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={formData.estimated_duration_minutes}
                    onChange={(e) => handleInputChange('estimated_duration_minutes', parseInt(e.target.value) || 15)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: `1px solid ${errors.estimated_duration_minutes ? '#ef4444' : '#d1d5db'}`,
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                  {errors.estimated_duration_minutes && (
                    <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {errors.estimated_duration_minutes}
                    </p>
                  )}
                </div>
              </div>

              {/* Quiz Settings */}
              <div style={{
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1.5rem'
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '1rem',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.has_questionnaire}
                    onChange={(e) => handleInputChange('has_questionnaire', e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Include Quiz/Assessment
                </label>

                {formData.has_questionnaire && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '1rem'
                  }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: '#6b7280',
                        marginBottom: '0.25rem'
                      }}>
                        Passing Score (%)
                      </label>
                      <input
                        type="number"
                        min="50"
                        max="100"
                        step="5"
                        value={formData.passing_score}
                        onChange={(e) => handleInputChange('passing_score', parseInt(e.target.value) || 80)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: `1px solid ${errors.passing_score ? '#ef4444' : '#d1d5db'}`,
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}
                      />
                      {errors.passing_score && (
                        <p style={{ color: '#ef4444', fontSize: '0.625rem', marginTop: '0.25rem' }}>
                          {errors.passing_score}
                        </p>
                      )}
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: '#6b7280',
                        marginBottom: '0.25rem'
                      }}>
                        Max Attempts
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={formData.max_attempts}
                        onChange={(e) => handleInputChange('max_attempts', parseInt(e.target.value) || 3)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: `1px solid ${errors.max_attempts ? '#ef4444' : '#d1d5db'}`,
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}
                      />
                      {errors.max_attempts && (
                        <p style={{ color: '#ef4444', fontSize: '0.625rem', marginTop: '0.25rem' }}>
                          {errors.max_attempts}
                        </p>
                      )}
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: '#6b7280',
                        marginBottom: '0.25rem'
                      }}>
                        Valid For (days)
                      </label>
                      <select
                        value={formData.valid_for_days}
                        onChange={(e) => handleInputChange('valid_for_days', parseInt(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          background: 'white'
                        }}
                      >
                        <option value={90}>3 months</option>
                        <option value={180}>6 months</option>
                        <option value={365}>1 year</option>
                        <option value={730}>2 years</option>
                        <option value={null}>Never expires</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              {/* Auto-Assignment Settings */}
              <div style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem'
              }}>
                <h4 style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#92400e'
                }}>
                  ⚡ Auto-Assignment
                </h4>
                <p style={{
                  margin: '0',
                  fontSize: '0.75rem',
                  color: '#92400e'
                }}>
                  Choose who should automatically receive this training when they join or visit.
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{
                  margin: '0 0 1rem 0',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  Assign to New Visitors & Contractors
                </h4>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: formData.auto_assign_to_visitors ? '#f0f9ff' : 'white'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.auto_assign_to_visitors}
                      onChange={(e) => handleInputChange('auto_assign_to_visitors', e.target.checked)}
                      style={{ marginRight: '0.75rem' }}
                    />
                    <div>
                      <div style={{
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#374151'
                      }}>
                        All Visitors
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#6b7280'
                      }}>
                        Required for all site visitors during registration
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: formData.auto_assign_to_contractors ? '#f0f9ff' : 'white'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.auto_assign_to_contractors}
                      onChange={(e) => handleInputChange('auto_assign_to_contractors', e.target.checked)}
                      style={{ marginRight: '0.75rem' }}
                    />
                    <div>
                      <div style={{
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#374151'
                      }}>
                        All Contractors
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#6b7280'
                      }}>
                        Required for all contractors when they're assigned work
                      </div>
                    </div>
                  </label>

                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{
                  margin: '0 0 1rem 0',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  Required for Specific Roles
                </h4>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '0.5rem'
                }}>
                  {['admin', 'manager', 'user'].map((role) => (
                    <label
                      key={role}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        background: formData.required_for_roles.includes(role) ? '#f0f9ff' : 'white'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.required_for_roles.includes(role)}
                        onChange={() => handleRoleToggle(role)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{
                background: '#f0f9ff',
                border: '1px solid #3b82f6',
                borderRadius: '8px',
                padding: '1rem'
              }}>
                <h4 style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#1e40af'
                }}>
                  📋 Auto-Assignment on Publish
                </h4>
                <ul style={{
                  margin: '0',
                  paddingLeft: '1rem',
                  fontSize: '0.75rem',
                  color: '#1e40af'
                }}>
                  {formData.auto_assign_to_visitors && <li>Will auto-assign to future visitors during registration</li>}
                  {formData.auto_assign_to_contractors && <li>Will auto-assign to future contractors when assigned work</li>}
                  {formData.required_for_roles.length > 0 && (
                    <li><strong>Will immediately assign to ALL current users with roles: {formData.required_for_roles.join(', ')}</strong></li>
                  )}
                  {!formData.auto_assign_to_visitors && !formData.auto_assign_to_contractors && 
                  formData.required_for_roles.length === 0 && (
                    <li style={{ color: '#6b7280' }}>No automatic assignments - manual assignment only</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            {step > 1 && (
              <button
                onClick={prevStep}
                style={{
                  background: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Previous
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onClose}
              style={{
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Cancel
            </button>
            
            {step < 2 ? (
              <button
                onClick={nextStep}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  background: loading ? '#9ca3af' : '#059669',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1.5rem',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid white',
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Creating...
                  </>
                ) : (
                  'Create Module'
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default CreateModuleModal;