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
import MaintenanceInlineManager from './MaintenanceInlineManager';

export default function MaintenanceTable({ assetId }) {
  return <MaintenanceInlineManager assetId={assetId} inline={true} />;
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