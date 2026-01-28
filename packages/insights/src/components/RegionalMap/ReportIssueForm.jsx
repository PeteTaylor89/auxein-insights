// src/components/RegionalMap/ReportIssueForm.jsx
// Sends issue reports via EmailJS to insights@auxein.co.nz
import { useState } from 'react';
import { AlertCircle, Send, CheckCircle } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { usePublicAuth } from '../../contexts/PublicAuthContext';

// EmailJS configuration - you'll need to set these up at https://www.emailjs.com/
// 1. Create account and add email service (e.g., Gmail, Outlook, or custom SMTP)
// 2. Create email template with variables: {{block_name}}, {{block_id}}, {{issue_type}}, {{description}}, {{region}}, {{variety}}, {{area}}, {{reported_at}}, {{user_name}}, {{user_email}}
// 3. Get your Service ID, Template ID, and Public Key
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'YOUR_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'YOUR_PUBLIC_KEY';

const ISSUE_TYPES = [
  { value: 'wrong_variety', label: 'Wrong Variety' },
  { value: 'wrong_name', label: 'Wrong Block Name' },
  { value: 'wrong_area', label: 'Wrong Area' },
  { value: 'wrong_location', label: 'Wrong Location' },
  { value: 'other', label: 'Other Issue' }
];

// Get human-readable issue type label
function getIssueTypeLabel(value) {
  const type = ISSUE_TYPES.find(t => t.value === value);
  return type ? type.label : value;
}

function ReportIssueForm({ block, onClose, onSuccess }) {
  const { user } = usePublicAuth();
  const [issueType, setIssueType] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!issueType) {
      setError('Please select an issue type');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a description');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Build user display name from first/last name fields
      const userName = user 
        ? [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Anonymous'
        : 'Anonymous';

      // Prepare template parameters for EmailJS
      const templateParams = {
        to_email: 'insights@auxein.co.nz',
        block_name: block.block_name || 'Unnamed Block',
        block_id: block.id || 'Unknown',
        issue_type: getIssueTypeLabel(issueType),
        issue_type_value: issueType,
        description: description.trim(),
        region: block.region || 'Unknown',
        variety: block.variety || 'Unknown',
        area: block.area ? `${block.area.toFixed(2)} ha` : 'Unknown',
        winery: block.winery || 'Unknown',
        // User details from auth context
        user_name: userName,
        user_email: user?.email || 'Not provided',
        user_id: user?.id || 'Unknown',
        user_company: user?.company_name || 'Not provided',
        user_type: user?.user_type || 'Unknown',
        reported_at: new Date().toLocaleString('en-NZ', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'Pacific/Auckland'
        })
      };

      // Send email via EmailJS
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );

      setSubmitted(true);
      
      // Auto-close after success
      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }, 2000);

    } catch (err) {
      console.error('Error sending issue report:', err);
      
      // Provide user-friendly error messages
      if (err.text) {
        setError(`Failed to send report: ${err.text}`);
      } else if (err.message) {
        setError(err.message);
      } else {
        setError('Failed to submit report. Please try again or email insights@auxein.co.nz directly.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (submitted) {
    return (
      <div className="report-success">
        <CheckCircle size={24} className="success-icon" />
        <p>Thank you! Your report has been submitted.</p>
      </div>
    );
  }

  return (
    <div className="report-issue-form">
      <h4>Report Data Issue</h4>
      
      <form onSubmit={handleSubmit}>
        {/* Issue Type Selector */}
        <div className="form-group">
          <label htmlFor="issue-type">Issue Type *</label>
          <select
            id="issue-type"
            value={issueType}
            onChange={(e) => setIssueType(e.target.value)}
            required
            disabled={submitting}
          >
            <option value="">Select an issue type...</option>
            {ISSUE_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="form-group">
          <label htmlFor="description">
            Description *
            {issueType && (
              <span className="label-hint">
                {getDescriptionHint(issueType, block)}
              </span>
            )}
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please describe the issue in detail..."
            rows={4}
            required
            disabled={submitting}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="form-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="form-actions">
          <button 
            type="button" 
            className="btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" />
                Submitting...
              </>
            ) : (
              <>
                <Send size={16} />
                Submit Report
              </>
            )}
          </button>
        </div>
      </form>

      <p className="form-note">
        Reports are reviewed by our team and updates are typically processed within 2-3 business days.
      </p>
    </div>
  );
}

// Helper function to provide contextual hints
function getDescriptionHint(issueType, block) {
  switch (issueType) {
    case 'wrong_variety':
      return `Current: ${block.variety || 'Unknown'}. What is the correct variety?`;
    case 'wrong_name':
      return `Current: ${block.block_name || 'Unnamed'}. What is the correct name?`;
    case 'wrong_area':
      return `Current: ${block.area?.toFixed(2) || 'Unknown'} ha. What is the correct area?`;
    case 'wrong_location':
      return 'Please describe the correct location or coordinates.';
    case 'other':
      return 'Please provide details about the issue.';
    default:
      return '';
  }
}

export default ReportIssueForm;