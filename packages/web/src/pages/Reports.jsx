// pages/Reports.jsx — tabbed reporting dashboard
import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
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

  return (
    <div className="page-container">
      <div className="reports-page">
        {/* Header */}
        <div className="reports-header">
          <div className="reports-title-row">
            <BarChart3 size={24} />
            <h1 className="section-title">Reports</h1>
          </div>

          <div className="reports-date-filters">
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
          {activeTab === 'tasks' && <TaskReport startDate={startDate} endDate={endDate} />}
          {activeTab === 'observations' && <ObservationReport startDate={startDate} endDate={endDate} />}
          {activeTab === 'timesheets' && <TimesheetReport startDate={startDate} endDate={endDate} />}
          {activeTab === 'assets' && <AssetReport />}
        </div>
      </div>
    </div>
  );
}

export default Reports;
