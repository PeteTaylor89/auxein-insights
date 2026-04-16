import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trainingService } from '@vineyard/shared';
import '../../pages/Training.css';

function CreateModuleModal({ onClose, onSuccess }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '', description: '', category: 'safety',
    estimated_duration_minutes: 5, has_questionnaire: false, passing_score: 80,
    max_attempts: 3, valid_for_days: 365,
    auto_assign_to_visitors: false, auto_assign_to_contractors: false,
    auto_assign_to_new_users: false, required_for_roles: []
  });
  const [errors, setErrors] = useState({});

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validateStep = (stepNumber) => {
    const newErrors = {};
    if (stepNumber === 1) {
      if (!formData.title.trim()) newErrors.title = 'Title is required';
      else if (formData.title.length < 3) newErrors.title = 'Title must be at least 3 characters';
      if (!formData.description.trim()) newErrors.description = 'Description is required';
      if (formData.estimated_duration_minutes < 1 || formData.estimated_duration_minutes > 480) newErrors.estimated_duration_minutes = 'Duration must be between 1 and 480 minutes';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => { if (validateStep(step)) setStep(prev => prev + 1); };
  const prevStep = () => setStep(prev => prev - 1);

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    try {
      setLoading(true);
      await trainingService.modules.createModule(formData);
      alert('Training module created successfully!');
      onSuccess();
      navigate(`/training`);
    } catch (error) {
      alert('Failed to create training module: ' + trainingService.errorHandler.handleApiError(error));
    } finally { setLoading(false); }
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
    <div className="tr-modal-overlay">
      <div className="tr-modal">
        <div className="tr-modal-header">
          <div>
            <h2>Create Training Module</h2>
            <p style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)' }}>
              Step {step} of 2 - {step === 1 ? 'Basic Information' : 'Assignment Settings'}
            </p>
          </div>
          <button className="tr-modal-close" onClick={onClose}>×</button>
        </div>

        {/* Progress Bar */}
        <div style={{ padding: '0 var(--space-lg)', paddingTop: 'var(--space-base)' }}>
          <div className="tr-progress-bar" style={{ height: 4 }}>
            <div className="tr-progress-fill" style={{ width: `${(step / 2) * 100}%` }} />
          </div>
        </div>

        <div className="tr-modal-body">
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="tr-field-label">Module Title *</label>
                <input className="tr-input" type="text" value={formData.title} onChange={(e) => handleInputChange('title', e.target.value)} placeholder="e.g., Workplace Safety Fundamentals" style={errors.title ? { borderColor: 'var(--color-danger)' } : undefined} />
                {errors.title && <p className="tr-field-error">{errors.title}</p>}
              </div>

              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="tr-field-label">Description *</label>
                <textarea className="tr-textarea" value={formData.description} onChange={(e) => handleInputChange('description', e.target.value)} placeholder="Brief description of what this training covers..." rows={3} style={errors.description ? { borderColor: 'var(--color-danger)' } : undefined} />
                {errors.description && <p className="tr-field-error">{errors.description}</p>}
              </div>

              <div className="tr-form-grid tr-form-grid--2col" style={{ marginBottom: 'var(--space-lg)' }}>
                <div>
                  <label className="tr-field-label">Category</label>
                  <select className="tr-select" value={formData.category} onChange={(e) => handleInputChange('category', e.target.value)}>
                    <option value="safety">Safety</option><option value="compliance">Compliance</option>
                    <option value="operations">Operations</option><option value="induction">Induction</option>
                    <option value="other">Skills Development</option><option value="equipment">Equipment</option>
                  </select>
                </div>
                <div>
                  <label className="tr-field-label">Estimated Duration (minutes)</label>
                  <input className="tr-input" type="number" min="1" max="480" value={formData.estimated_duration_minutes} onChange={(e) => handleInputChange('estimated_duration_minutes', parseInt(e.target.value) || 15)} style={errors.estimated_duration_minutes ? { borderColor: 'var(--color-danger)' } : undefined} />
                  {errors.estimated_duration_minutes && <p className="tr-field-error">{errors.estimated_duration_minutes}</p>}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="tr-info" style={{ background: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)', color: '#92400e' }}>
                <h4 style={{ margin: '0 0 var(--space-sm) 0', fontSize: 'var(--font-size-base)', fontWeight: 600 }}>Auto-Assignment</h4>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)' }}>Choose who should automatically receive this training when they join or visit.</p>
              </div>

              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <h4 style={{ margin: '0 0 var(--space-base) 0', fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text)' }}>Assign to New Visitors & Contractors</h4>
                <div className="tr-checkbox-group">
                  <label className="tr-checkbox-row" style={{ padding: 'var(--space-md)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: formData.auto_assign_to_visitors ? 'var(--color-olive-light)' : 'var(--color-surface)' }}>
                    <input type="checkbox" checked={formData.auto_assign_to_visitors} onChange={(e) => handleInputChange('auto_assign_to_visitors', e.target.checked)} />
                    <div>
                      <div style={{ fontWeight: 500 }}>All Visitors</div>
                      <div className="tr-hint">Required for all site visitors during registration</div>
                    </div>
                  </label>
                  <label className="tr-checkbox-row" style={{ padding: 'var(--space-md)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: formData.auto_assign_to_contractors ? 'var(--color-olive-light)' : 'var(--color-surface)' }}>
                    <input type="checkbox" checked={formData.auto_assign_to_contractors} onChange={(e) => handleInputChange('auto_assign_to_contractors', e.target.checked)} />
                    <div>
                      <div style={{ fontWeight: 500 }}>All Contractors</div>
                      <div className="tr-hint">Required for all contractors when assigned work - coming version 1.1</div>
                    </div>
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <h4 style={{ margin: '0 0 var(--space-base) 0', fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text)' }}>Required for Specific Roles</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-sm)' }}>
                  {['admin', 'manager', 'user'].map(role => (
                    <label key={role} className="tr-checkbox-row" style={{ padding: 'var(--space-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', background: formData.required_for_roles.includes(role) ? 'var(--color-olive-light)' : 'var(--color-surface)' }}>
                      <input type="checkbox" checked={formData.required_for_roles.includes(role)} onChange={() => handleRoleToggle(role)} />
                      <span style={{ textTransform: 'capitalize' }}>{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="tr-info">
                <h4 style={{ margin: '0 0 var(--space-sm) 0', fontSize: 'var(--font-size-base)', fontWeight: 600 }}>Auto-Assignment on Publish</h4>
                <ul style={{ margin: 0, paddingLeft: 'var(--space-base)', fontSize: 'var(--font-size-xs)' }}>
                  {formData.auto_assign_to_visitors && <li>Will auto-assign to future visitors during registration</li>}
                  {formData.auto_assign_to_contractors && <li>Will auto-assign to future contractors when assigned work</li>}
                  {formData.required_for_roles.length > 0 && <li><strong>Will immediately assign to ALL current users with roles: {formData.required_for_roles.join(', ')}</strong></li>}
                  {!formData.auto_assign_to_visitors && !formData.auto_assign_to_contractors && formData.required_for_roles.length === 0 && <li style={{ color: 'var(--color-text-muted)' }}>No automatic assignments - manual assignment only</li>}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="tr-modal-footer">
          <div>
            {step > 1 && <button className="tr-btn-ghost" onClick={prevStep}>Previous</button>}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button className="tr-btn-ghost" onClick={onClose}>Cancel</button>
            {step < 2 ? (
              <button className="tr-btn-primary" onClick={nextStep}>Next</button>
            ) : (
              <button className="tr-btn-success" onClick={handleSubmit} disabled={loading}>
                {loading ? <><span className="tr-spinner" style={{ width: 16, height: 16, border: '2px solid white', borderTop: '2px solid transparent', borderRadius: '50%' }} /> Creating...</> : 'Create Module'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateModuleModal;
