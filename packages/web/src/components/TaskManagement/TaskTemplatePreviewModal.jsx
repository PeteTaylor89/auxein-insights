// TaskTemplatePreviewModal.jsx
// Modal for viewing task template details (read-only)
// Matches observation template modal styling

import React from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Info, Settings, Package, Wrench, MapPin } from 'lucide-react';

function TaskTemplatePreviewModal({ open, template, onClose }) {
  if (!open || !template) return null;

  const categoryIcons = {
    vineyard: '🍇',
    land_management: '🌱',
    asset_management: '🔧',
    compliance: '📋',
    general: '📌'
  };

  const categoryLabels = {
    vineyard: 'Vineyard',
    land_management: 'Land Management',
    asset_management: 'Asset Management',
    compliance: 'Compliance',
    general: 'General'
  };

  const priorityLabels = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent'
  };

  const priorityEmojis = {
    low: '⬇️',
    medium: '➡️',
    high: '⬆️',
    urgent: '🚨'
  };

  const icon = template.icon || categoryIcons[template.task_category] || '📌';
  const categoryLabel = categoryLabels[template.task_category] || template.task_category;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
            <span style={{ fontSize: '1.5rem' }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
                {template.name}
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  padding: '0.125rem 0.5rem',
                  background: '#f8fafc',
                  borderRadius: '4px'
                }}>
                  {categoryLabel}
                </span>
                {!template.is_active && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: '#dc2626',
                    padding: '0.125rem 0.5rem',
                    background: '#fee2e2',
                    borderRadius: '4px'
                  }}>
                    Inactive
                  </span>
                )}
                {template.quick_create_enabled && template.is_active && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: '#059669',
                    padding: '0.125rem 0.5rem',
                    background: '#d1fae5',
                    borderRadius: '4px'
                  }}>
                    Quick Create Enabled
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body - Scrollable */}
        <div
          style={{
            padding: '1.25rem',
            overflowY: 'auto',
            flex: 1
          }}
        >
          {/* Basic Information */}
          <Section title="Basic Information" icon={<Info size={16} />}>
            {template.task_subcategory && (
              <InfoRow label="Subcategory" value={template.task_subcategory} />
            )}
            {template.description && (
              <InfoRow label="Description" value={template.description} multiline />
            )}
            <InfoRow 
              label="Priority" 
              value={
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{priorityEmojis[template.default_priority]}</span>
                  <span style={{ textTransform: 'capitalize' }}>
                    {priorityLabels[template.default_priority]}
                  </span>
                </span>
              }
            />
            {template.default_duration_hours && (
              <InfoRow 
                label="Estimated Duration" 
                value={`${template.default_duration_hours} hour${template.default_duration_hours !== 1 ? 's' : ''}`} 
              />
            )}
          </Section>

          {/* Display Settings */}
          {(template.icon || template.color) && (
            <Section title="Display Settings" icon={<Settings size={16} />}>
              {template.icon && (
                <InfoRow label="Icon" value={<span style={{ fontSize: '1.5rem' }}>{template.icon}</span>} />
              )}
              {template.color && (
                <InfoRow 
                  label="Color" 
                  value={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        background: template.color,
                        border: '1px solid #e5e7eb'
                      }} />
                      <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {template.color}
                      </span>
                    </div>
                  }
                />
              )}
            </Section>
          )}

          {/* GPS & Tracking */}
          <Section title="Tracking Options" icon={<MapPin size={16} />}>
            <InfoRow 
              label="GPS Tracking" 
              value={template.requires_gps_tracking ? '✅ Required' : '❌ Not required'} 
            />
            <InfoRow 
              label="Allow Partial Completion" 
              value={template.allow_partial_completion ? '✅ Yes' : '❌ No'} 
            />
          </Section>

          {/* Required Equipment */}
          {template.required_equipment_ids && template.required_equipment_ids.length > 0 && (
            <Section title="Required Equipment" icon={<Wrench size={16} />}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {template.required_equipment_ids.map((equipId, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: '#f9fafb',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      fontSize: '0.875rem'
                    }}
                  >
                    Equipment ID: {equipId}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Optional Equipment */}
          {template.optional_equipment_ids && template.optional_equipment_ids.length > 0 && (
            <Section title="Optional Equipment" icon={<Wrench size={16} />}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {template.optional_equipment_ids.map((equipId, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: '#f9fafb',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      fontSize: '0.875rem',
                      color: '#6b7280'
                    }}
                  >
                    Equipment ID: {equipId}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Required Consumables */}
          {template.required_consumables && template.required_consumables.length > 0 && (
            <Section title="Required Consumables" icon={<Package size={16} />}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {template.required_consumables.map((consumable, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.75rem',
                      background: '#f9fafb',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <div style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      Asset ID: {consumable.asset_id}
                    </div>
                    <div style={{ fontSize: '0.813rem', color: '#6b7280' }}>
                      Rate: {consumable.rate_per_hectare} {consumable.unit} per hectare
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Usage Statistics */}
          {(template.task_count !== undefined || template.last_used) && (
            <Section title="Usage Statistics" icon={<FileText size={16} />}>
              {template.task_count !== undefined && (
                <InfoRow 
                  label="Times Used" 
                  value={`${template.task_count} time${template.task_count !== 1 ? 's' : ''}`} 
                />
              )}
              {template.last_used && (
                <InfoRow 
                  label="Last Used" 
                  value={new Date(template.last_used).toLocaleDateString('en-NZ', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })} 
                />
              )}
            </Section>
          )}

          {/* Metadata */}
          <Section title="Metadata" icon={<Info size={16} />}>
            <InfoRow 
              label="Created" 
              value={new Date(template.created_at).toLocaleDateString('en-NZ', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })} 
            />
            {template.updated_at && (
              <InfoRow 
                label="Last Updated" 
                value={new Date(template.updated_at).toLocaleDateString('en-NZ', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })} 
              />
            )}
          </Section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            background: '#f9fafb'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: 'white',
              color: '#374151',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Section Component
function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid #f3f4f6'
        }}
      >
        <span style={{ color: '#6b7280' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '0.938rem', fontWeight: '600', color: '#374151' }}>
          {title}
        </h3>
      </div>
      <div style={{ paddingLeft: '1.75rem' }}>
        {children}
      </div>
    </div>
  );
}

// InfoRow Component
function InfoRow({ label, value, multiline = false }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: multiline ? 'column' : 'row',
        gap: multiline ? '0.25rem' : '0.5rem',
        marginBottom: '0.75rem'
      }}
    >
      <div
        style={{
          fontSize: '0.813rem',
          color: '#6b7280',
          fontWeight: '500',
          minWidth: multiline ? 'auto' : '150px'
        }}
      >
        {label}:
      </div>
      <div
        style={{
          fontSize: '0.813rem',
          color: '#374151',
          flex: 1,
          wordBreak: 'break-word'
        }}
      >
        {value || '—'}
      </div>
    </div>
  );
}

export default TaskTemplatePreviewModal;