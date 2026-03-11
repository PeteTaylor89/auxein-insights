// maps-v2/components/drawing/BlockSplitFlow.jsx — Split confirmation UI
import { Scissors, Check, X, Loader } from 'lucide-react';

/**
 * Floating UI shown during the block split workflow.
 * Displays status messages and confirm/cancel buttons.
 *
 * @param {Object} props
 * @param {string} props.statusMessage
 * @param {boolean} props.isConfirming - line has been drawn, awaiting confirmation
 * @param {boolean} props.isProcessing - split API call in progress
 * @param {string|null} props.error
 * @param {Function} props.onConfirm
 * @param {Function} props.onCancel
 */
export default function BlockSplitFlow({
  statusMessage,
  isConfirming,
  isProcessing,
  error,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="v2-split-flow">
      <div className="v2-split-flow-icon">
        <Scissors size={18} />
      </div>

      <div className="v2-split-flow-content">
        <div className="v2-split-flow-message">{statusMessage}</div>
        {error && <div className="v2-split-flow-error">{error}</div>}
      </div>

      <div className="v2-split-flow-actions">
        {isConfirming && !isProcessing && (
          <button
            className="v2-split-flow-btn v2-split-flow-btn--confirm"
            onClick={onConfirm}
          >
            <Check size={14} />
            Confirm Split
          </button>
        )}

        {isProcessing && (
          <div className="v2-split-flow-processing">
            <Loader size={14} className="v2-spin" />
            Processing...
          </div>
        )}

        <button
          className="v2-split-flow-btn v2-split-flow-btn--cancel"
          onClick={onCancel}
          disabled={isProcessing}
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
