// packages/mobile/src/components/MaintenanceTable.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Plus,
  ArrowRight,
  Calendar,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { assetService } from '@vineyard/shared';

export default function MaintenanceTable({ assetId }) {
  const navigate = useNavigate();
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMaintenance();
  }, [assetId]);

  const loadMaintenance = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await assetService.maintenance.getAssetMaintenanceHistory(assetId, 50);
      setMaintenance(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load maintenance:', e);
      setError('Failed to load maintenance records');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleMaintenance = () => {
    navigate('/assets/maintenance/new', { 
      state: { assetId } 
    });
  };

  const handleViewMaintenance = (maintenanceId) => {
    navigate(`/assets/maintenance/${maintenanceId}`);
  };

  const getMaintenancePriorityColor = (record) => {
    return assetService.helpers.getMaintenancePriorityColor(record);
  };

  const calculateDaysUntilDue = (scheduledDate) => {
    return assetService.helpers.calculateDaysUntilDue(scheduledDate);
  };

  const isOverdue = (record) => {
    return assetService.helpers.isMaintenanceOverdue(record);
  };

  if (loading) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.25rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        color: '#6b7280'
      }}>
        Loading maintenance records...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: '#fef2f2',
        border: '1px solid #fca5a5',
        borderRadius: '12px',
        padding: '1.25rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        color: '#dc2626'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1.25rem',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '1rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Calendar size={18} />
          Maintenance History ({maintenance.length})
        </h3>
        <button
          onClick={handleScheduleMaintenance}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.813rem',
            fontWeight: '500'
          }}
        >
          <Plus size={14} /> Schedule Maintenance
        </button>
      </div>

      {/* Table */}
      {maintenance.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔧</div>
          <div>No maintenance records yet</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            <button
              onClick={handleScheduleMaintenance}
              style={{
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Schedule First Maintenance
            </button>
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.813rem'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Title</th>
                <th style={{ padding: 10, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Scheduled</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Priority</th>
                <th style={{ padding: 10, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                <th style={{ padding: 10, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {maintenance.map(record => {
                const priorityColor = getMaintenancePriorityColor(record);
                const daysInfo = calculateDaysUntilDue(record.scheduled_date);
                const overdueStatus = isOverdue(record);

                return (
                  <tr
                    key={record.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                    onClick={() => handleViewMaintenance(record.id)}
                  >
                    <td style={{ padding: 10, fontWeight: '500' }}>
                      {record.title || `Maintenance #${record.id}`}
                    </td>
                    <td style={{ padding: 10, textTransform: 'capitalize' }}>
                      {record.maintenance_type?.replace('_', ' ') || '—'}
                    </td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      {record.scheduled_date ? dayjs(record.scheduled_date).format('MMM D, YYYY') : '—'}
                    </td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <PriorityBadge
                        color={priorityColor}
                        isOverdue={overdueStatus}
                        daysInfo={daysInfo}
                      />
                    </td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <StatusBadge status={record.status} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewMaintenance(record.id);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0.25rem 0.5rem',
                            background: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          View <ArrowRight size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    scheduled: { bg: '#dbeafe', color: '#1e40af' },
    in_progress: { bg: '#fef3c7', color: '#92400e' },
    completed: { bg: '#dcfce7', color: '#166534' },
    cancelled: { bg: '#fee2e2', color: '#991b1b' }
  };

  const style = colors[status] || { bg: '#f3f4f6', color: '#374151' };

  return (
    <span style={{
      background: style.bg,
      color: style.color,
      padding: '0.25rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.7rem',
      fontWeight: '600',
      textTransform: 'capitalize'
    }}>
      {status?.replace('_', ' ')}
    </span>
  );
}

function PriorityBadge({ color, isOverdue, daysInfo }) {
  const colorMap = {
    red: { bg: '#fef2f2', color: '#dc2626' },
    orange: { bg: '#fff7ed', color: '#ea580c' },
    yellow: { bg: '#fefce8', color: '#ca8a04' },
    blue: { bg: '#eff6ff', color: '#2563eb' }
  };

  const style = colorMap[color] || colorMap.blue;

  let label = 'Normal';
  let icon = <Clock size={12} />;

  if (isOverdue) {
    label = `${daysInfo.days}d Overdue`;
    icon = <AlertTriangle size={12} />;
  } else if (daysInfo.is_due_soon) {
    label = 'Due Soon';
    icon = <Clock size={12} />;
  }

  return (
    <span style={{
      background: style.bg,
      color: style.color,
      padding: '0.25rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.7rem',
      fontWeight: '600',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem'
    }}>
      {icon} {label}
    </span>
  );
}