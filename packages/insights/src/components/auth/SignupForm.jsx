// src/components/auth/SignupForm.jsx
// Updated with password confirmation and legal agreement modal integration
import { useState, useEffect } from 'react';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import publicAuthService from '../../services/publicAuthService';
import LegalModal from '../legal/LegalModal';
import { Eye, EyeOff } from 'lucide-react';

function SignupForm({ onSuccess, onSwitchToLogin }) {
  const { signup } = usePublicAuth();
  const [step, setStep] = useState(1); // 1: Basic, 2: About You, 3: Stay Connected
  const [userTypes, setUserTypes] = useState([]);
  const [regions, setRegions] = useState([]);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '', // NEW: Password confirmation field
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Legal agreement state
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);

  // Load user types and regions
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [typesData, regionsData] = await Promise.all([
          publicAuthService.getUserTypes(),
          publicAuthService.getRegions()
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

  const validatePassword = (password) => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must include an uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must include a lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must include a number';
    }
    return null;
  };

  const validateStep1 = () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }
    
    // Validate password strength
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setError(passwordError);
      return false;
    }
    
    // Check password confirmation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
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

  // Handle form submission - show legal modal if not accepted
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // If legal not accepted, show modal instead of submitting
    if (!legalAccepted) {
      setShowLegalModal(true);
      return;
    }

    await submitForm();
  };

  // Called when user accepts legal terms in modal
  const handleLegalAccept = async () => {
    setLegalAccepted(true);
    setShowLegalModal(false);
    await submitForm();
  };

  // Actual form submission
  const submitForm = async () => {
    setError('');
    setLoading(true);

    try {
      // Remove confirmPassword before sending to API
      const { confirmPassword, ...signupData } = formData;
      await signup(signupData);
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
  
  // Password match indicator
  const passwordsMatch = formData.password && formData.confirmPassword && 
                         formData.password === formData.confirmPassword;
  const passwordsDontMatch = formData.confirmPassword && 
                             formData.password !== formData.confirmPassword;

  return (
    <>
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
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <small>Must include uppercase, lowercase, and number</small>
            </div>

            {/* NEW: Password Confirmation Field */}
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <div className="password-input-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {/* Password match feedback */}
              {passwordsDontMatch && (
                <small className="password-mismatch">Passwords do not match</small>
              )}
              {passwordsMatch && (
                <small className="password-match">✓ Passwords match</small>
              )}
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
            <p className="step-description">Help us personalise your experience</p>

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

            {/* Legal acceptance indicator */}
            {legalAccepted ? (
              <div className="legal-accepted-notice">
                ✓ You have accepted the Terms of Use, Privacy Policy, and Cookie Policy.
                <button 
                  type="button" 
                  className="link-button"
                  onClick={() => setShowLegalModal(true)}
                >
                  Review
                </button>
              </div>
            ) : (
              <p className="legal-notice">
                By creating an account, you will be asked to agree to our{' '}
                <button 
                  type="button" 
                  className="link-button"
                  onClick={() => setShowLegalModal(true)}
                >
                  Terms of Use, Privacy Policy, and Cookie Policy
                </button>
              </p>
            )}

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

      {/* Legal Modal */}
      <LegalModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        onAccept={handleLegalAccept}
      />
    </>
  );
}

export default SignupForm;