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
 * Error boundary for lazy-loaded climate explorer chunks and for climate
 * widgets embedded in prose.
 *
 * WHY IT MATTERS IN AN ARTICLE: article and research bodies render widget
 * settings that came out of the database, and a stored config outlives the code
 * that wrote it. Without a boundary, one widget throwing during render unmounts
 * the whole React root and the reader gets a blank page instead of an article
 * with one broken figure. That is exactly what a temporal-dead-zone slip in
 * ArticleSurfaceMap did on 2026-09-10.
 *
 * `message` overrides the default copy, because "explorer" is the wrong word
 * for a figure sitting in the middle of a paragraph. `onError` is optional and
 * lets a host log without owning the fallback.
 */
export class ClimateErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Loud in the console, contained on the page. A widget that fails silently
    // is how this class of bug survives to production in the first place.
    console.error('ClimateErrorBoundary caught:', error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ClimateErrorCard
          message={this.props.message
            || 'Failed to load this explorer. This may be a network issue.'}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}

export default ClimateErrorCard;
