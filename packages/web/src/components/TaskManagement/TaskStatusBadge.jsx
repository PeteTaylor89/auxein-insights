// src/components/TaskManagement/TaskStatusBadge.jsx
import React from 'react';
import PropTypes from 'prop-types';

const TaskStatusBadge = ({ status, size = 'md', showIcon = true }) => {
  const statusConfig = {
    draft: {
      label: 'Draft',
      color: 'bg-gray-100 text-gray-800 border-gray-300',
      icon: '📝',
    },
    scheduled: {
      label: 'Scheduled',
      color: 'bg-blue-100 text-blue-800 border-blue-300',
      icon: '📅',
    },
    ready: {
      label: 'Ready',
      color: 'bg-green-100 text-green-800 border-green-300',
      icon: '✅',
    },
    in_progress: {
      label: 'In Progress',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      icon: '⚡',
    },
    paused: {
      label: 'Paused',
      color: 'bg-orange-100 text-orange-800 border-orange-300',
      icon: '⏸️',
    },
    completed: {
      label: 'Completed',
      color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      icon: '✓',
    },
    cancelled: {
      label: 'Cancelled',
      color: 'bg-red-100 text-red-800 border-red-300',
      icon: '✕',
    },
  };

  const config = statusConfig[status] || statusConfig.draft;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${config.color} ${sizeClasses[size]}`}
    >
      {showIcon && <span className="text-xs">{config.icon}</span>}
      {config.label}
    </span>
  );
};

TaskStatusBadge.propTypes = {
  status: PropTypes.oneOf([
    'draft',
    'scheduled',
    'ready',
    'in_progress',
    'paused',
    'completed',
    'cancelled',
  ]).isRequired,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  showIcon: PropTypes.bool,
};

export default TaskStatusBadge;
