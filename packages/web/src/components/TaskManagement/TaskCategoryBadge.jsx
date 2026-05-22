// src/components/TaskManagement/TaskCategoryBadge.jsx
import React from 'react';
import PropTypes from 'prop-types';

const TaskCategoryBadge = ({ category, size = 'md', variant = 'solid' }) => {
  const categoryConfig = {
    vineyard: {
      label: 'Vineyard',
      icon: '🍇',
      color: 'bg-purple-100 text-purple-800 border-purple-300',
      outlineColor: 'text-purple-700 border-purple-400',
    },
    land_management: {
      label: 'Land Management',
      icon: '🌱',
      color: 'bg-green-100 text-green-800 border-green-300',
      outlineColor: 'text-green-700 border-green-400',
    },
    compliance: {
      label: 'Compliance',
      icon: '📋',
      color: 'bg-amber-100 text-amber-800 border-amber-300',
      outlineColor: 'text-amber-700 border-amber-400',
    },
    general: {
      label: 'General',
      icon: '📌',
      color: 'bg-gray-100 text-gray-800 border-gray-300',
      outlineColor: 'text-gray-700 border-gray-400',
    },
  };

  const config = categoryConfig[category] || categoryConfig.general;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const colorClass = variant === 'outline' ? config.outlineColor : config.color;
  const borderClass = variant === 'outline' ? 'border-2 bg-white' : 'border';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${colorClass} ${borderClass} ${sizeClasses[size]}`}
    >
      <span className="text-xs">{config.icon}</span>
      {config.label}
    </span>
  );
};

TaskCategoryBadge.propTypes = {
  category: PropTypes.oneOf([
    'vineyard',
    'land_management',
    'compliance',
    'general',
  ]).isRequired,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  variant: PropTypes.oneOf(['solid', 'outline']),
};

export default TaskCategoryBadge;