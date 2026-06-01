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
    scheduled: { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
    in_progress: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
    completed: { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
    cancelled: { bg: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }
  };

  const style = colors[status] || { bg: 'var(--color-surface-warm)', color: 'var(--color-text)' };

  return (
    <span style={{
      background: style.bg,
      color: style.color,
      padding: '0.25rem 0.5rem',
      borderRadius: 'var(--radius-pill)',
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
    red: { bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
    orange: { bg: '#fff7ed', color: '#ea580c' },
    yellow: { bg: '#fefce8', color: '#ca8a04' },
    blue: { bg: 'var(--color-olive-light)', color: 'var(--color-primary-hover)' }
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
      borderRadius: 'var(--radius-pill)',
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