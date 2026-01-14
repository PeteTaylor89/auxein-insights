// src/components/auth/UserPreferencesModal.jsx
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import * as publicAuthService from '../../services/publicAuthService';

function UserPreferencesModal({ isOpen, onClose }) {
  const { user, updateProfile, updateMarketingPreferences } = usePublicAuth();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'marketing'
  const [userTypes, setUserTypes] = useState([]);
  const [regions, setRegions] = useState([]);
  const [formData, setFormData] = useState({
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

  // Load user data and options
  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        user_type: user.user_type || '',
        company_name: user.company_name || '',
        job_title: user.job_title || '',
        region_of_interest: user.region_of_interest || '',
        newsletter_opt_in: user.newsletter_opt_in || false,
        marketing_opt_in: user.marketing_opt_in || false,
        research_opt_in: user.research_opt_in || false
      });

      // Load options
      Promise.all([
        publicAuthService.getUserTypes(),
        publicAuthService.getRegions()
      ]).then(([types, regs]) => {
        setUserTypes(types);
        setRegions(regs);
      });
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    setError('');
    setSuccess('');
  };

  const handleSaveProfile = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await updateProfile({
        first_name: formData.first_name,
        last_name: formData.last_name,
        user_type: formData.user_type,
        company_name: formData.company_name,
        job_title: formData.job_title,
        region_of_interest: formData.region_of_interest
      });
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMarketing = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await updateMarketingPreferences({
        newsletter_opt_in: formData.newsletter_opt_in,
        marketing_opt_in: formData.marketing_opt_in,
        research_opt_in: formData.research_opt_in
      });
      setSuccess('Preferences updated successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedUserType = userTypes.find(t => t.value === formData.user_type);
  const requiresCompany = selectedUserType?.requires_company;

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal-content preferences-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose}>
          <X size={24} />
        </button>

        <div className="auth-modal-header">
          <h2>Account Preferences</h2>
          <p>Manage your profile and communication preferences</p>
        </div>

        {/* Tabs */}
        <div className="preferences-tabs">
          <button
            className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('profile');
              setError('');
              setSuccess('');
            }}
          >
            Profile
          </button>
          <button
            className={`tab ${activeTab === 'marketing' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('marketing');
              setError('');
              setSuccess('');
            }}
          >
            Communications
          </button>
        </div>

        <div className="auth-modal-body">
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="preferences-content">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="first_name">First Name</label>
                  <input
                    type="text"
                    id="first_name"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
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
                  />
                </div>
              </div>

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
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="job_title">Job Title</label>
                <input
                  type="text"
                  id="job_title"
                  name="job_title"
                  value={formData.job_title}
                  onChange={handleChange}
                />
              </div>

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

              <button 
                onClick={handleSaveProfile}
                className="auth-submit-btn"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          )}

          {/* Marketing Tab */}
          {activeTab === 'marketing' && (
            <div className="preferences-content">
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

              <button 
                onClick={handleSaveMarketing}
                className="auth-submit-btn"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserPreferencesModal;