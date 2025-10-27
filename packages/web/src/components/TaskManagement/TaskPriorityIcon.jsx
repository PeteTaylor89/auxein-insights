// src/components/TaskManagement/TaskPriorityIcon.jsx
import React from 'react';
import PropTypes from 'prop-types';

const TaskPriorityIcon = ({ priority, size = 'md', showLabel = false }) => {
  const priorityConfig = {
    low: {
      label: 'Low',
      color: 'text-gray-500',
      icon: '⬇️',
      bgColor: 'bg-gray-100',
    },
    medium: {
      label: 'Medium',
      color: 'text-blue-600',
      icon: '➡️',
      bgColor: 'bg-blue-100',
    },
    high: {
      label: 'High',
      color: 'text-orange-600',
      icon: '⬆️',
      bgColor: 'bg-orange-100',
    },
    urgent: {
      label: 'Urgent',
      color: 'text-red-600',
      icon: '🚨',
      bgColor: 'bg-red-100',
    },
  };

  const config = priorityConfig[priority] || priorityConfig.medium;

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  if (showLabel) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${sizeClasses[size]}`}>
        <span
          className={`inline-flex items-center justify-center ${iconSizeClasses[size]} ${config.bgColor} rounded`}
        >
          <span className="text-xs">{config.icon}</span>
        </span>
        <span className={`font-medium ${config.color}`}>{config.label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center ${iconSizeClasses[size]} ${config.bgColor} rounded`}
      title={config.label}
    >
      <span className="text-xs">{config.icon}</span>
    </span>
  );
};

TaskPriorityIcon.propTypes = {
  priority: PropTypes.oneOf(['low', 'medium', 'high', 'urgent']).isRequired,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  showLabel: PropTypes.bool,
};

export default TaskPriorityIcon;
