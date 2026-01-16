// src/components/RegionalMap/ReportIssueForm.jsx
import { useState } from 'react';
import { AlertCircle, Send, CheckCircle } from 'lucide-react';
import publicApi from '../../services/publicApi';

const ISSUE_TYPES = [
  { value: 'wrong_variety', label: 'Wrong Variety' },
  { value: 'wrong_name', label: 'Wrong Block Name' },
  { value: 'wrong_area', label: 'Wrong Area' },
  { value: 'wrong_location', label: 'Wrong Location' },
  { value: 'other', label: 'Other Issue' }
];

function ReportIssueForm({ block, onClose, onSuccess }) {
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
      await publicApi.post('/public/feedback/report-issue', {
        block_id: block.id,
        block_name: block.block_name || 'Unnamed Block',
        issue_type: issueType,
        description: description.trim(),
        reported_at: new Date().toISOString()
      });

      setSubmitted(true);
      
      // Auto-close after success
      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }, 2000);

    } catch (err) {
      console.error('Error reporting issue:', err);
      setError(err.message || 'Failed to submit report. Please try again.');
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