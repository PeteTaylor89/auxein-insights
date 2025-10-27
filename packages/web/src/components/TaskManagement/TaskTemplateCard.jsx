// src/components/TaskManagement/TaskTemplateCard.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { TaskCategoryBadge, TaskPriorityIcon } from './index';

const TaskTemplateCard = ({ template, onView, onEdit, onUse }) => {
  const {
    id,
    name,
    task_category,
    task_subcategory,
    description,
    icon,
    color,
    default_priority,
    requires_gps_tracking,
    quick_create_enabled,
    is_active,
  } = template;

  // Get task count if available (from TaskTemplateWithUsage)
  const taskCount = template.task_count || 0;

  // Parse color for card styling
  const cardColor = color || '#6B7280'; // Default gray
  const borderColorStyle = { borderLeftColor: cardColor, borderLeftWidth: '4px' };

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow duration-200"
      style={borderColorStyle}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-1">
            {/* Icon */}
            {icon && (
              <span className="text-2xl" title="Template icon">
                {icon}
              </span>
            )}
            
            {/* Template name */}
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {name}
            </h3>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-1 ml-2">
            {!is_active && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 border border-gray-300">
                Inactive
              </span>
            )}
            {quick_create_enabled && is_active && (
              <span 
                className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 border border-green-300"
                title="Enabled for quick create in field"
              >
                Quick
              </span>
            )}
          </div>
        </div>

        {/* Category and subcategory */}
        <div className="flex items-center gap-2 flex-wrap">
          <TaskCategoryBadge category={task_category} size="sm" />
          {task_subcategory && (
            <span className="text-xs text-gray-600 bg-gray-50 px-2 py-0.5 rounded">
              {task_subcategory}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Description */}
        {description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {description}
          </p>
        )}

        {/* Template settings */}
        <div className="flex items-center gap-3 mb-3 text-xs text-gray-600">
          {/* Priority */}
          <div className="flex items-center gap-1">
            <TaskPriorityIcon priority={default_priority} size="sm" />
            <span className="capitalize">{default_priority}</span>
          </div>

          {/* GPS tracking */}
          {requires_gps_tracking && (
            <div className="flex items-center gap-1" title="Requires GPS tracking">
              <span>📍</span>
              <span>GPS</span>
            </div>
          )}

          {/* Equipment count */}
          {template.required_equipment_ids?.length > 0 && (
            <div className="flex items-center gap-1" title="Required equipment">
              <span>🔧</span>
              <span>{template.required_equipment_ids.length}</span>
            </div>
          )}

          {/* Consumables count */}
          {template.required_consumables?.length > 0 && (
            <div className="flex items-center gap-1" title="Required consumables">
              <span>📦</span>
              <span>{template.required_consumables.length}</span>
            </div>
          )}
        </div>

        {/* Usage stats */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>📊</span>
            <span>
              Used <span className="font-semibold text-gray-700">{taskCount}</span> time{taskCount !== 1 ? 's' : ''}
            </span>
          </div>

          {template.last_used && (
            <div className="text-xs text-gray-500" title={`Last used: ${new Date(template.last_used).toLocaleDateString()}`}>
              {formatLastUsed(template.last_used)}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => onView(template)}
          className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          View
        </button>
        
        <button
          onClick={() => onEdit(template)}
          className="flex-1 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          Edit
        </button>
        
        <button
          onClick={() => onUse(template)}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
          disabled={!is_active}
        >
          Use
        </button>
      </div>
    </div>
  );
};

// Helper function to format last used date
const formatLastUsed = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}mo ago`;
  return `${Math.floor(diffInDays / 365)}y ago`;
};

TaskTemplateCard.propTypes = {
  template: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    task_category: PropTypes.string.isRequired,
    task_subcategory: PropTypes.string,
    description: PropTypes.string,
    icon: PropTypes.string,
    color: PropTypes.string,
    default_priority: PropTypes.string.isRequired,
    requires_gps_tracking: PropTypes.bool,
    quick_create_enabled: PropTypes.bool,
    is_active: PropTypes.bool,
    required_equipment_ids: PropTypes.array,
    required_consumables: PropTypes.array,
    task_count: PropTypes.number,
    last_used: PropTypes.string,
  }).isRequired,
  onView: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onUse: PropTypes.func.isRequired,
};

export default TaskTemplateCard;