// src/components/auth/SignupForm.jsx
import { useState, useEffect } from 'react';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import * as publicAuthService from '../../services/publicAuthService';

console.log('publicAuthService methods:', Object.keys(publicAuthService));
console.log('getUserTypes type:', typeof publicAuthService.getUserTypes);

function SignupForm({ onSuccess, onSwitchToLogin }) {
  const { signup } = usePublicAuth();
  const [step, setStep] = useState(1); // 1: Basic, 2: About You, 3: Stay Connected
  const [userTypes, setUserTypes] = useState([]);
  const [regions, setRegions] = useState([]);
  const service = publicAuthService.default || publicAuthService;
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    user_type: '',
    company_name: '',
    job_title: '',
    region_of_interest: '',
    newsletter_opt_in: false,
    marketing_opt_in: false,
    research_opt_in: false
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Load user types and regions
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [typesData, regionsData] = await Promise.all([
          await service.getUserTypes(),
          await service.getRegions()
        ]);
        setUserTypes(typesData);
        setRegions(regionsData);
      } catch (err) {
        console.error('Failed to load options:', err);
      }
    };
    loadOptions();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    setError('');
  };

  const validateStep1 = () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && !validateStep1()) return;
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setStep(step - 1);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signup(formData);
      setSuccess('Account created! Please check your email to verify your account.');
      
      // Auto-close after showing success message
      setTimeout(() => {
        onSuccess();
      }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedUserType = userTypes.find(t => t.value === formData.user_type);
  const requiresCompany = selectedUserType?.requires_company;

  return (
    <form onSubmit={handleSubmit} className="auth-form signup-form">
      {error && <div className="auth-error">{error}</div>}
      {success && <div className="auth-success">{success}</div>}

      {/* Progress Indicator */}
      <div className="signup-progress">
        <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>1</div>
        <div className={`progress-line ${step >= 2 ? 'active' : ''}`}></div>
        <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>2</div>
        <div className={`progress-line ${step >= 3 ? 'active' : ''}`}></div>
        <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>3</div>
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="signup-step">
          <h3>Basic Information</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="first_name">First Name</label>
              <input
                type="text"
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                placeholder="John"
              />
            </div>

            <div className="form-group">
              <label htmlFor="last_name">Last Name</label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="your.email@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password *</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Min. 8 characters"
            />
            <small>Must include uppercase, lowercase, and number</small>
          </div>

          <button type="button" className="auth-submit-btn" onClick={handleNextStep}>
            Next →
          </button>
        </div>
      )}

      {/* Step 2: About You */}
      {step === 2 && (
        <div className="signup-step">
          <h3>About You (Optional)</h3>
          <p className="step-description">Help us personalize your experience</p>

          <div className="form-group">
            <label htmlFor="user_type">I am a...</label>
            <select
              id="user_type"
              name="user_type"
              value={formData.user_type}
              onChange={handleChange}
            >
              <option value="">Select type</option>
              {userTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {selectedUserType && (
              <small>{selectedUserType.description}</small>
            )}
          </div>

          {requiresCompany && (
            <div className="form-group">
              <label htmlFor="company_name">Company Name</label>
              <input
                type="text"
                id="company_name"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                placeholder="Your winery or vineyard"
              />
            </div>
          )}

          {formData.user_type && (
            <div className="form-group">
              <label htmlFor="job_title">Job Title / Role</label>
              <input
                type="text"
                id="job_title"
                name="job_title"
                value={formData.job_title}
                onChange={handleChange}
                placeholder="e.g., Viticulturist, Owner"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="region_of_interest">Region of Interest</label>
            <select
              id="region_of_interest"
              name="region_of_interest"
              value={formData.region_of_interest}
              onChange={handleChange}
            >
              <option value="">Select region</option>
              {regions.map(region => (
                <option key={region.value} value={region.value}>
                  {region.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-actions">
            <button type="button" className="auth-back-btn" onClick={handlePrevStep}>
              ← Back
            </button>
            <button type="button" className="auth-submit-btn" onClick={handleNextStep}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Stay Connected */}
      {step === 3 && (
        <div className="signup-step">
          <h3>Stay Connected</h3>
          <p className="step-description">Choose what you'd like to receive</p>

          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="newsletter_opt_in"
                checked={formData.newsletter_opt_in}
                onChange={handleChange}
              />
              <div className="checkbox-content">
                <strong>Platform Updates & Climate Insights</strong>
                <small>Monthly newsletter with regional climate trends</small>
              </div>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                name="marketing_opt_in"
                checked={formData.marketing_opt_in}
                onChange={handleChange}
              />
              <div className="checkbox-content">
                <strong>Premium Features & Offers</strong>
                <small>Information about Auxein Insights Pro platform</small>
              </div>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                name="research_opt_in"
                checked={formData.research_opt_in}
                onChange={handleChange}
              />
              <div className="checkbox-content">
                <strong>Research & Surveys</strong>
                <small>Help improve wine industry climate intelligence</small>
              </div>
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="auth-back-btn" onClick={handlePrevStep}>
              ← Back
            </button>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </div>
        </div>
      )}

      <div className="auth-switch">
        Already have an account?{' '}
        <button type="button" className="link-button" onClick={onSwitchToLogin}>
          Sign in
        </button>
      </div>
    </form>
  );
}

export default SignupForm;