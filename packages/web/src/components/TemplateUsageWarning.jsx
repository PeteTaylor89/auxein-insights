import { useState } from 'react';
import { AlertTriangle, X, ExternalLink, Calendar, Play } from 'lucide-react';

export default function TemplateUsageWarning({ templateUsage, onDismiss, onProceedAnyway, onViewPlan }) {
  const [dismissed, setDismissed] = useState(false);

  if (!templateUsage?.suggestion?.show_warning || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return '#3b82f6';
      case 'in_progress': return '#10b981';
      case 'completed': return '#6b7280';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{
      border: '1px solid #f59e0b',
      borderRadius: 8,
      background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
      padding: 16,
      margin: '12px 0',
      position: 'relative'
    }}>
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#92400e',
          padding: 4
        }}
      >
        <X size={16} />
      </button>

      {/* Warning header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
            Similar Plans Already Exist
          </div>
          <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.4 }}>
            {templateUsage.suggestion.message}
          </div>
        </div>
      </div>

      {/* Existing plans list */}
      {templateUsage.existing_plans?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#92400e', marginBottom: 8 }}>
            Existing plans using "{templateUsage.template_name}":
          </div>
          
          <div style={{ display: 'grid', gap: 8 }}>
            {templateUsage.existing_plans.slice(0, 3).map(plan => (
              <div
                key={plan.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  padding: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: 13, 
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 2
                  }}>
                    {plan.name}
                    <span 
                      style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: getStatusColor(plan.status),
                        color: '#fff',
                        textTransform: 'capitalize'
                      }}
                    >
                      {plan.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{plan.run_count} run{plan.run_count === 1 ? '' : 's'}</span>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={10} />
                      Last: {formatDate(plan.last_run)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onViewPlan?.(plan.id)}
                  style={{
                    padding: '6px 8px',
                    fontSize: 11,
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: '#374151'
                  }}
                >
                  View <ExternalLink size={10} />
                </button>
              </div>
            ))}
          </div>

          {templateUsage.existing_plans.length > 3 && (
            <div style={{ 
              fontSize: 11, 
              color: '#6b7280', 
              marginTop: 6,
              textAlign: 'center'
            }}>
              + {templateUsage.existing_plans.length - 3} more plan{templateUsage.existing_plans.length - 3 === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={handleDismiss}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            cursor: 'pointer',
            color: '#374151'
          }}
        >
          I understand
        </button>
        {onProceedAnyway && (
          <button
            onClick={() => {
              handleDismiss();
              onProceedAnyway();
            }}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: '#f59e0b',
              border: '1px solid #f59e0b',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Play size={12} />
            Create Plan Anyway
          </button>
        )}
      </div>
    </div>
  );
}