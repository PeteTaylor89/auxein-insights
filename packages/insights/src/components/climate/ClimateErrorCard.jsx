import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Reusable error card for climate explorers.
 * Shows error message with retry button.
 */
const ClimateErrorCard = ({ message, onRetry }) => (
  <div className="climate-error-card">
    <AlertCircle size={32} />
    <p>{message || 'Something went wrong loading this data.'}</p>
    {onRetry && (
      <button className="climate-error-retry" onClick={onRetry}>
        <RefreshCw size={14} />
        Try again
      </button>
    )}
  </div>
);

/**
 * Error boundary for lazy-loaded climate explorer chunks.
 * Catches render errors and shows a retry card.
 */
export class ClimateErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ClimateErrorCard
          message="Failed to load this explorer. This may be a network issue."
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}

export default ClimateErrorCard;
