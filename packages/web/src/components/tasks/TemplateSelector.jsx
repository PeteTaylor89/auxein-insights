// components/tasks/TemplateSelector.jsx — reusable template card grid
import { Link } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import './TaskComponents.css';

const CATEGORY_COLORS = {
  vineyard: '#5B6830',
  land_management: '#2d5a87',
  asset_management: '#f59e0b',
  compliance: '#D1583B',
  general: '#666',
};

function TemplateSelector({ templates, onSelect, loading }) {
  if (loading) {
    return <div className="template-selector-loading">Loading templates...</div>;
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="template-selector-empty">
        <ClipboardList size={40} strokeWidth={1.5} />
        <p>No quick-create templates available</p>
        <p className="template-selector-hint">
          Templates must have "Quick Create" enabled in the template editor
        </p>
      </div>
    );
  }

  return (
    <div className="template-grid">
      <Link to="/tasks/templates/new" className="template-card template-card--create">
        <div className="template-card-icon template-card-icon--create">
          <Plus size={24} />
        </div>
        <div className="template-card-content">
          <h3 className="template-card-title">Create Template</h3>
          <span className="template-card-category">New task template</span>
        </div>
      </Link>
      {templates.map((t) => (
        <button
          key={t.id}
          className="template-card"
          onClick={() => onSelect(t)}
          style={{ '--template-color': CATEGORY_COLORS[t.task_category] || CATEGORY_COLORS.general }}
        >
          <div className="template-card-icon">
            <ClipboardList size={24} />
          </div>
          <div className="template-card-content">
            <h3 className="template-card-title">{t.name}</h3>
            {t.task_category && (
              <span className="template-card-category">
                {t.task_category.replace(/_/g, ' ')}
              </span>
            )}
            {t.description && (
              <p className="template-card-desc">{t.description}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

export default TemplateSelector;
