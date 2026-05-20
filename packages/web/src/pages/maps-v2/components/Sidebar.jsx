// maps-v2/components/Sidebar.jsx — Collapsible sidebar with mode tabs
import { useState } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import './Sidebar.css';
import './builder/BuilderBetaModal.css';

export default function Sidebar({ mode, onModeChange, children }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Toggle button visible when collapsed */}
      {collapsed && (
        <button
          className="v2-sidebar-toggle collapsed"
          onClick={() => setCollapsed(false)}
          aria-label="Open sidebar"
        >
          <PanelLeft size={20} />
        </button>
      )}

      <aside className={`v2-sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="v2-sidebar-header">
          <div className="v2-sidebar-tabs">
            <button
              className={`v2-sidebar-tab ${mode === 'management' ? 'active' : ''}`}
              onClick={() => onModeChange('management')}
            >
              Management
            </button>
            <button
              className={`v2-sidebar-tab ${mode === 'builder' ? 'active' : ''}`}
              onClick={() => onModeChange('builder')}
            >
              Map Builder
              <span className="v2-beta-pill">Beta</span>
            </button>
          </div>
          <button
            className="v2-sidebar-toggle"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="v2-sidebar-content">
          {children}
        </div>
      </aside>
    </>
  );
}
