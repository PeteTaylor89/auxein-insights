// pages/Reports.jsx — tabbed reporting dashboard with property filter
import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { propertyService } from '@vineyard/shared';
import TaskReport from '../components/reports/TaskReport';
import ObservationReport from '../components/reports/ObservationReport';
import TimesheetReport from '../components/reports/TimesheetReport';
import AssetReport from '../components/reports/AssetReport';
import './Reports.css';

const TABS = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'observations', label: 'Observations' },
  { key: 'timesheets', label: 'Timesheets' },
  { key: 'assets', label: 'Assets' },
];

function Reports() {
  const [activeTab, setActiveTab] = useState('tasks');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]);

  useEffect(() => {
    propertyService.listProperties()
      .then(data => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setProperties([]));
  }, []);

  const propFilter = propertyId || undefined;

  return (
    <div className="page-container">
      <div className="reports-page">
        {/* Header */}
        <div className="reports-header">
          <div className="reports-title-row">
            <BarChart3 size={24} />
            <h1 className="section-title">Reports</h1>
          </div>

          <div className="reports-filters">
            {properties.length > 0 && (
              <label>
                Property
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="reports-date-input"
                >
                  <option value="">All Properties</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              From
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="reports-date-input"
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="reports-date-input"
              />
            </label>
          </div>
        </div>

        {/* Tabs */}
        <div className="reports-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`reports-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="reports-content">
          {activeTab === 'tasks' && <TaskReport startDate={startDate} endDate={endDate} propertyId={propFilter} />}
          {activeTab === 'observations' && <ObservationReport startDate={startDate} endDate={endDate} propertyId={propFilter} />}
          {activeTab === 'timesheets' && <TimesheetReport startDate={startDate} endDate={endDate} propertyId={propFilter} />}
          {activeTab === 'assets' && <AssetReport />}
        </div>
      </div>
    </div>
  );
}

export default Reports;
