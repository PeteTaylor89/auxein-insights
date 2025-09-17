import React, { useState } from 'react';
import { User, Car, Phone, Building, Clock, MapPin, AlertTriangle, CheckCircle, Camera, FileText } from 'lucide-react';
import { useAuth } from '@vineyard/shared';
import {visitorService, api} from '@vineyard/shared';
import { useNavigate } from 'react-router-dom';

const VisitorRegistrationPortal = () => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    // Personal details
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    position: '',
    
    // Emergency contact
    emergencyName: '',
    emergencyPhone: '',
    
    // Vehicle details
    vehicleReg: '',
    driverLicense: '',
    
    // Visit details
    purpose: '',
    hostName: '',
    expectedDuration: '',
    areasToVisit: [],
    
    // Site induction
    inductionCompleted: false,
    safetyBriefingAccepted: false,
    ppeRequired: [],
    
    // Photo capture
    photoTaken: false
  });

  const [errors, setErrors] = useState({});

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateStep = (step) => {
    const newErrors = {};
    
    switch (step) {
      case 1: // Personal Details
        if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
        if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
        if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
        if (!formData.email.trim()) newErrors.email = 'Email is required';
        if (!formData.purpose.trim()) newErrors.purpose = 'Purpose of visit is required';
        break;
      case 2: // Emergency & Vehicle
        if (!formData.emergencyName.trim()) newErrors.emergencyName = 'Emergency contact name is required';
        if (!formData.emergencyPhone.trim()) newErrors.emergencyPhone = 'Emergency contact phone is required';
        break;
      case 3: // Site Induction
        if (!formData.inductionCompleted) newErrors.inductionCompleted = 'Site induction must be completed';
        if (!formData.safetyBriefingAccepted) newErrors.safetyBriefingAccepted = 'Safety briefing must be accepted';
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (validateStep(currentStep)) {
      try {
        // Get company ID from authenticated user
        const companyId = user?.company_id;

        if (!companyId) {
          alert('Unable to determine company information. Please contact reception.');
          return;
        }

        // Use the visitor service
        const result = await visitorService.registerVisitorPortal(formData, companyId);

        // Show success message with next steps
        alert(`Registration completed successfully! 

  Visit ID: ${result.visit_id}
  Welcome ${result.visitor_name}!

  Next steps:
  ${result.next_steps.join('\n')}
        `);

        navigate('/home');

      } catch (error) {
        console.error('Registration error:', error);

        let errorMessage = 'Registration failed. Please try again or contact reception for assistance.';

        if (error.response?.data?.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.message.includes('Network Error')) {
          errorMessage = 'Unable to connect to registration system. Please check your internet connection or contact reception.';
        } else if (error.response?.status === 405) {
          errorMessage = 'Registration system is not properly configured. Please contact reception to register manually.';
        } else if (error.response?.status === 404) {
          errorMessage = 'Registration service not found. Please contact reception for assistance.';
        }

        alert(errorMessage);
      }
    }
  };

  const mockInductionStart = () => {
    // Simulate induction process
    setFormData(prev => ({ ...prev, inductionCompleted: true }));
  };

  const togglePPE = (item) => {
    setFormData(prev => ({
      ...prev,
      ppeRequired: prev.ppeRequired.includes(item)
        ? prev.ppeRequired.filter(p => p !== item)
        : [...prev.ppeRequired, item]
    }));
  };

  const stepLabels = ['Details', 'Emergency Contact', 'H&S Induction', 'Review'];

  const renderProgressBar = () => (
    <div className="progress-container">
      <div className="progress-steps">
        {[1, 2, 3, 4].map((step, index) => (
          <div key={step} className="progress-step-wrapper">
            <div
              className={`progress-step ${currentStep >= step ? 'active' : ''}`}
            >
              {step}
            </div>
            <div className="progress-label">{stepLabels[index]}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div>
      <div className="step-header">
        <User className="step-icon" />
        <h2 className="step-title">Welcome!</h2>
        <p className="step-subtitle">Please provide your details to register your visit</p>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">First Name *</label>
          <input
            type="text"
            value={formData.firstName}
            onChange={(e) => handleInputChange('firstName', e.target.value)}
            className={`form-input ${errors.firstName ? 'error' : ''}`}
            placeholder="Enter your first name"
          />
          {errors.firstName && <p className="error-text">{errors.firstName}</p>}
        </div>

        <div className="form-group">
          <label className="form-label">Last Name *</label>
          <input
            type="text"
            value={formData.lastName}
            onChange={(e) => handleInputChange('lastName', e.target.value)}
            className={`form-input ${errors.lastName ? 'error' : ''}`}
            placeholder="Enter your last name"
          />
          {errors.lastName && <p className="error-text">{errors.lastName}</p>}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Phone Number *</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => handleInputChange('phone', e.target.value)}
          className={`form-input ${errors.phone ? 'error' : ''}`}
          placeholder="Enter your mobile number"
        />
        {errors.phone && <p className="error-text">{errors.phone}</p>}
      </div>

      <div className="form-group">
        <label className="form-label">Email *</label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => handleInputChange('email', e.target.value)}
          className="form-input"
          placeholder="Enter your email"
        />
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Company</label>
          <input
            type="text"
            value={formData.company}
            onChange={(e) => handleInputChange('company', e.target.value)}
            className="form-input"
            placeholder="Company name"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Position</label>
          <input
            type="text"
            value={formData.position}
            onChange={(e) => handleInputChange('position', e.target.value)}
            className="form-input"
            placeholder="Your job title"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Purpose of Visit *</label>
        <select
          value={formData.purpose}
          onChange={(e) => handleInputChange('purpose', e.target.value)}
          className={`form-select ${errors.purpose ? 'error' : ''}`}
        >
          <option value="">Select purpose...</option>
          <option value="Meeting">Business Meeting</option>
          <option value="Delivery">Delivery/Pickup</option>
          <option value="Maintenance">Maintenance/Service</option>
          <option value="Inspection">Inspection</option>
          <option value="Tour">Site Tour</option>
          <option value="Other">Other</option>
        </select>
        {errors.purpose && <p className="error-text">{errors.purpose}</p>}
      </div>

      <div className="form-group">
        <label className="form-label">Who are you visiting?</label>
        <input
          type="text"
          value={formData.hostName}
          onChange={(e) => handleInputChange('hostName', e.target.value)}
          className="form-input"
          placeholder="Host name or department"
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <div className="step-header">
        <Phone className="step-icon" />
        <h2 className="step-title">Emergency Contact & Vehicle</h2>
        <p className="step-subtitle">Safety information and vehicle details</p>
      </div>

      <div className="alert-box warning">
        <AlertTriangle className="alert-icon" />
        <div className="alert-content">
          <h3 className="alert-title">Emergency Contact Required</h3>
          <p className="alert-text">This person will be contacted in case of emergency</p>
        </div>
      </div>

      <h3 className="section-title">Emergency Contact</h3>
      
      <div className="form-group">
        <label className="form-label">Contact Name *</label>
        <input
          type="text"
          value={formData.emergencyName}
          onChange={(e) => handleInputChange('emergencyName', e.target.value)}
          className={`form-input ${errors.emergencyName ? 'error' : ''}`}
          placeholder="Emergency contact name"
        />
        {errors.emergencyName && <p className="error-text">{errors.emergencyName}</p>}
      </div>

      <div className="form-group">
        <label className="form-label">Contact Phone *</label>
        <input
          type="tel"
          value={formData.emergencyPhone}
          onChange={(e) => handleInputChange('emergencyPhone', e.target.value)}
          className={`form-input ${errors.emergencyPhone ? 'error' : ''}`}
          placeholder="Emergency contact phone"
        />
        {errors.emergencyPhone && <p className="error-text">{errors.emergencyPhone}</p>}
      </div>

      <h3 className="section-title">
        <Car className="section-icon" />
        Vehicle Information
      </h3>
      
      <div className="form-group">
        <label className="form-label">Vehicle Registration</label>
        <input
          type="text"
          value={formData.vehicleReg}
          onChange={(e) => handleInputChange('vehicleReg', e.target.value.toUpperCase())}
          className="form-input"
          placeholder="License plate number"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Driver License</label>
        <input
          type="text"
          value={formData.driverLicense}
          onChange={(e) => handleInputChange('driverLicense', e.target.value)}
          className="form-input"
          placeholder="Driver license number (optional)"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Expected Duration</label>
        <select
          value={formData.expectedDuration}
          onChange={(e) => handleInputChange('expectedDuration', e.target.value)}
          className="form-select"
        >
          <option value="">Select duration...</option>
          <option value="1">Less than 1 hour</option>
          <option value="2">1-2 hours</option>
          <option value="4">2-4 hours</option>
          <option value="8">Half day (4-8 hours)</option>
          <option value="24">Full day</option>
        </select>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <div className="step-header">
        <CheckCircle className="step-icon" />
        <h2 className="step-title">Site Safety Induction</h2>
        <p className="step-subtitle">Complete your safety induction before entering the site</p>
      </div>

      <div className="induction-panel">
        <h3 className="panel-title">Site Induction Required</h3>
        
        {!formData.inductionCompleted ? (
          <div className="induction-card">
            <div className="induction-header">
              <h4>Watch Safety Video</h4>
              <span className="duration">~5 minutes</span>
            </div>
            <div className="mock-video">
              <div className="video-placeholder">
                <FileText className="video-icon" />
                <p>Safety Induction Video</p>
                <span>Click to start</span>
              </div>
            </div>
            <button
              onClick={mockInductionStart}
              className="induction-button"
            >
              Start Safety Induction
            </button>
          </div>
        ) : (
          <div className="alert-box success">
            <CheckCircle className="alert-icon" />
            <div className="alert-content">
              <h4 className="alert-title">Induction Completed</h4>
              <p className="alert-text">You have successfully completed the site safety induction</p>
            </div>
          </div>
        )}
      </div>

      <h3 className="section-title">Personal Protective Equipment (PPE)</h3>
      <p className="section-subtitle">Select any PPE items you'll be using:</p>
      
      <div className="ppe-grid">
        {['Safety Helmet', 'Safety Glasses', 'Hi-Vis Vest', 'Steel Cap Boots', 'Gloves', 'Hearing Protection'].map((item) => (
          <label key={item} className={`ppe-checkbox ${formData.ppeRequired.includes(item) ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={formData.ppeRequired.includes(item)}
              onChange={() => togglePPE(item)}
              className="checkbox-input"
            />
            <span className="checkbox-label">{item}</span>
          </label>
        ))}
      </div>

      <div className="safety-agreement">
        <label className="agreement-label">
          <input
            type="checkbox"
            checked={formData.safetyBriefingAccepted}
            onChange={(e) => handleInputChange('safetyBriefingAccepted', e.target.checked)}
            className={`checkbox-input ${errors.safetyBriefingAccepted ? 'error' : ''}`}
          />
          <div className="agreement-text">
            <span className="agreement-title">
              I acknowledge that I have read and understood the safety requirements *
            </span>
            <p className="agreement-subtitle">
              I agree to follow all safety protocols and wear required PPE while on site
            </p>
          </div>
        </label>
        {errors.safetyBriefingAccepted && (
          <p className="error-text">{errors.safetyBriefingAccepted}</p>
        )}
      </div>

      {errors.inductionCompleted && (
        <p className="error-text">{errors.inductionCompleted}</p>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div>
      <div className="step-header">
        <CheckCircle className="step-icon success" />
        <h2 className="step-title">Review</h2>
        <p className="step-subtitle">Review your details and complete registration</p>
      </div>

      <div className="summary-panel">
        <h3 className="panel-title">Registration Summary</h3>
        
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Name:</span>
            <p>{formData.firstName} {formData.lastName}</p>
          </div>
          <div className="summary-item">
            <span className="summary-label">Phone:</span>
            <p>{formData.phone}</p>
          </div>
          <div className="summary-item">
            <span className="summary-label">Your Company:</span>
            <p>{formData.company || 'Not specified'}</p>
          </div>
          <div className="summary-item">
            <span className="summary-label">Purpose:</span>
            <p>{formData.purpose}</p>
          </div>
          <div className="summary-item">
            <span className="summary-label">Vehicle:</span>
            <p>{formData.vehicleReg || 'Not specified'}</p>
          </div>
          <div className="summary-item">
            <span className="summary-label">Expected Duration:</span>
            <p>{formData.expectedDuration ? `${formData.expectedDuration} hours` : 'Not specified'}</p>
          </div>
        </div>

        <div className="completion-status">
          <div className="status-item">
            <CheckCircle className="status-icon success" />
            <span>Safety induction completed</span>
          </div>
          <div className="status-item">
            <CheckCircle className="status-icon success" />
            <span>Safety briefing accepted</span>
          </div>
        </div>
      </div>

      <div className="alert-box info">
        <h4 className="alert-title">Next Steps</h4>
        <ul className="next-steps">
          <li>You will be signed in automatically</li>
          <li>Do not go into any unauthorised areas without supervision</li>
          <li>Remember to sign out when leaving</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className="visitor-portal">
      <div className="portal-container">
        {renderProgressBar()}
        
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}

        <div className="form-actions">
          {currentStep > 1 && (
            <button
              onClick={prevStep}
              className="action-button secondary"
            >
              Previous
            </button>
          )}
          
          <div className="action-spacer">
            {currentStep < 4 ? (
              <button
                onClick={nextStep}
                className="action-button primary"
              >
                {currentStep === 3 ? 'Review' : 'Next'}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="action-button success"
              >
                Complete Registration
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .visitor-portal {
          width: 100%;
          min-height: 100vh;
          background: #f9fafb;
          padding: 16px;
          font-family: system-ui, -apple-system, sans-serif;
        }

        .portal-container {
          max-width: 672px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1);
          padding: 32px;
        }

        .progress-container {
          margin-bottom: 32px;
        }

        .progress-steps {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .progress-step {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid #d1d5db;
          font-size: 14px;
          font-weight: 600;
          background: #f3f4f6;
          color: #9ca3af;
          transition: all 0.3s ease;
        }

        .progress-step.active {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
        }

        .progress-bar {
          width: 100%;
          background: #e5e7eb;
          border-radius: 999px;
          height: 8px;
          overflow: hidden;
        }

        .progress-fill {
          background: #2563eb;
          height: 100%;
          border-radius: 999px;
          transition: width 0.3s ease;
        }

        .progress-labels {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #6b7280;
          margin-top: 4px;
        }

        .step-header {
          text-align: center;
          margin-bottom: 24px;
        }

        .step-icon {
          width: 48px;
          height: 48px;
          color: #2563eb;
          margin: 0 auto 8px;
        }

        .step-icon.success {
          width: 64px;
          height: 64px;
          color: #10b981;
        }

        .step-title {
          font-size: 24px;
          font-weight: bold;
          color: #111827;
          margin: 0 0 8px 0;
        }

        .step-subtitle {
          color: #6b7280;
          margin: 0;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 4px;
        }

        .form-input, .form-select {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
          background: white;
        }

        .form-input:focus, .form-select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .form-input.error, .form-select.error {
          border-color: #ef4444;
        }

        .error-text {
          color: #ef4444;
          font-size: 14px;
          margin-top: 4px;
        }

        .alert-box {
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
          display: flex;
          align-items: flex-start;
        }

        .alert-box.warning {
          background: #fef3c7;
          border: 1px solid #f59e0b;
        }

        .alert-box.success {
          background: #d1fae5;
          border: 1px solid #10b981;
        }

        .alert-box.info {
          background: #dbeafe;
          border: 1px solid #3b82f6;
        }

        .alert-icon {
          width: 20px;
          height: 20px;
          margin-right: 8px;
          margin-top: 2px;
        }

        .alert-box.warning .alert-icon {
          color: #d97706;
        }

        .alert-box.success .alert-icon {
          color: #059669;
        }

        .alert-box.info .alert-icon {
          color: #2563eb;
        }

        .alert-content {
          flex: 1;
        }

        .alert-title {
          margin: 0 0 0.75rem 0;
          font-weight: 500;
          margin: 0 0 4px 0;
        }

        .alert-box.warning .alert-title {
          color: #92400e;
        }

        .alert-box.success .alert-title {
          color: #065f46;
        }

        .alert-box.info .alert-title {
          color: #1e40af;
        }

        .alert-text {
          font-size: 14px;
          margin: 0;
        }

        .alert-box.warning .alert-text {
          color: #92400e;
        }

        .alert-box.success .alert-text {
          color: #065f46;
        }

        .alert-box.info .alert-text {
          color: #1e40af;
        }

        .section-title {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
        }

        .section-icon {
          width: 20px;
          height: 20px;
          margin-right: 8px;
        }

        .section-subtitle {
          color: #6b7280;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .induction-panel {
          background: #dbeafe;
          border: 1px solid #3b82f6;
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .panel-title {
          font-size: 18px;
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 16px;
        }

        .induction-card {
          background: white;
          border-radius: 8px;
          padding: 16px;
          border: 1px solid #dbeafe;
          margin-bottom: 16px;
        }

        .induction-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .induction-header h4 {
          font-weight: 500;
          color: #111827;
          margin: 0;
        }

        .duration {
          font-size: 14px;
          color: #6b7280;
        }

        .mock-video {
          background: #f3f4f6;
          border-radius: 8px;
          height: 128px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }

        .video-placeholder {
          text-align: center;
        }

        .video-icon {
          width: 32px;
          height: 32px;
          color: #9ca3af;
          margin: 0 auto 8px;
        }

        .video-placeholder p {
          color: #6b7280;
          font-size: 14px;
          margin: 0 0 4px 0;
        }

        .video-placeholder span {
          color: #9ca3af;
          font-size: 12px;
        }

        .induction-button {
          width: 100%;
          background: #2563eb;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .induction-button:hover {
          background: #1d4ed8;
        }

        .ppe-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }

        .ppe-checkbox {
          display: flex;
          align-items: center;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .ppe-checkbox:hover {
          background: #f9fafb;
        }

        .ppe-checkbox.checked {
          background: #f3f4f6;
          border-color: #2563eb;
        }

        .checkbox-input {
          margin-right: 12px;
          width: 16px;
          height: 16px;
        }

        .checkbox-label {
          font-size: 14px;
          font-weight: 500;
        }

        .safety-agreement {
          background: #f9fafb;
          border-radius: 8px;
          padding: 16px;
          margin-top: 24px;
        }

        .agreement-label {
          display: flex;
          align-items: flex-start;
          cursor: pointer;
        }

        .agreement-label .checkbox-input {
          margin-top: 4px;
        }

        .agreement-text {
          flex: 1;
        }

        .agreement-title {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
          display: block;
          margin-bottom: 4px;
        }

        .agreement-subtitle {
          font-size: 12px;
          color: #6b7280;
          margin: 0;
        }

        .summary-panel {
          background: #f9fafb;
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 24px;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .summary-item {
          margin-bottom: 8px;
        }

        .summary-label {
          font-weight: 500;
          color: #374151;
          display: block;
        }

        .summary-item p {
          margin: 0;
          color: #111827;
        }

        .completion-status {
          border-top: 1px solid #e5e7eb;
          padding-top: 16px;
        }

        .status-item {
          display: flex;
          align-items: center;
          color: #059669;
          margin-bottom: 4px;
        }

        .status-icon {
          width: 16px;
          height: 16px;
          margin-right: 8px;
        }

        .status-icon.success {
          color: #059669;
        }

        .status-item span {
          font-size: 14px;
          font-weight: 500;
        }

        .next-steps {
          font-size: 14px;
          color: #1e40af;
          margin: 0.0;
          padding-left: 35px;
        }

        .next-steps li {
          margin-bottom: 4px;
        }

        .form-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
        }

        .action-spacer {
          margin-left: auto;
        }

        .action-button {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-left: 12px;
        }

        .action-button.primary {
          background: #2563eb;
          color: white;
        }

        .action-button.primary:hover {
          background: #1d4ed8;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }

        .action-button.secondary {
          background: white;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .action-button.secondary:hover {
          background: #f9fafb;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .action-button.success {
          background: #10b981;
          padding: 16px 28px;
          font-size: 13px;
          color: white;
        }

        .action-button.success:hover {
          background: #059669;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .progress-container {
          width: 100%;
          padding: 20px 0;
        }

        .progress-steps {
          display: flex;
          justify-content: space-between;
          align-items: flex-start; 
          width: 100%;
        }

        .progress-step-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }

        .progress-step {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: #ccc;
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: bold;
        }

        .progress-step.active {
          background-color: #4caf50; /* green when active */
        }

        .progress-label {
          margin-top: 8px;
          font-size: 14px;
          text-align: center;
          color: #333;
        }


        @media (max-width: 768px) {
          .visitor-portal {
            padding: 8px;
          }

          .portal-container {
            padding: 20px;
          }

          .form-grid, .ppe-grid, .summary-grid {
            grid-template-columns: 1fr;
          }

          .progress-labels {
            font-size: 10px;
          }

          .form-actions {
            flex-direction: column;
            gap: 12px;
          }

          .action-spacer {
            margin-left: 0;
          }

          .action-button {
            width: 100%;
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default VisitorRegistrationPortal