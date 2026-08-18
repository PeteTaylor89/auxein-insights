// components/reports/ReportsPanel.jsx — the Reports tab on Insights.
//
// Absorbed from CompanyAdmin's ReportsTab, which is where reporting used to
// live. A vineyard manager does not go to Company Admin to find out what
// happened last week, and the five reports in there were effectively invisible.
//
// Ten reports is too many for one row of tabs, so they are grouped by the
// question being asked:
//
//   Operations — what got done, what is late
//   Compliance — the audit pack: H&S, who was on site, what is planted
//   Resources  — people, kit and contractors
//
// Not every report takes the same filters, and pretending otherwise is how a
// date range ends up silently ignored. Each entry declares what it uses and the
// filter bar disables the rest with a reason.
import { useState, useEffect, useMemo } from 'react';
import { propertyService } from '@vineyard/shared';
import HelpTip from '../HelpTip';
import TaskReport from './TaskReport';
import ObservationReport from './ObservationReport';
import ContractorReport from './ContractorReport';
import TimesheetReport from './TimesheetReport';
import AssetReport from './AssetReport';
import WorkByBlockReport from './WorkByBlockReport';
import OutstandingReport from './OutstandingReport';
import HealthSafetyReport from './HealthSafetyReport';
import SiteAccessReport from './SiteAccessReport';
import VineyardCensusReport from './VineyardCensusReport';
import '../../pages/Reports.css';

const GROUPS = [
  {
    key: 'operations',
    label: 'Operations',
    reports: [
      { key: 'work-by-block', label: 'Work by block', dates: true, property: true },
      { key: 'outstanding', label: 'Outstanding & overdue', dates: false, property: true,
        noDatesReason: 'Shows all open work, whatever its age' },
      { key: 'tasks', label: 'Tasks', dates: true, property: true },
      { key: 'observations', label: 'Observations', dates: true, property: true },
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance',
    reports: [
      { key: 'health-safety', label: 'Health & safety', dates: true, property: true },
      { key: 'site-access', label: 'Site access', dates: true, property: true },
      { key: 'census', label: 'Vineyard census', dates: false, property: true,
        noDatesReason: 'A census states what is in the ground now' },
    ],
  },
  {
    key: 'resources',
    label: 'Resources',
    reports: [
      { key: 'timesheets', label: 'Timesheets', dates: true, property: true },
      { key: 'assets', label: 'Assets', dates: false, property: false,
        noDatesReason: 'Assets are a current-state register',
        noPropertyReason: 'Assets are held at company level' },
      { key: 'contractors', label: 'Contractors', dates: true, property: true },
    ],
  },
];

const ALL_REPORTS = GROUPS.flatMap((g) => g.reports.map((r) => ({ ...r, group: g.key })));

export default function ReportsPanel({ companyName }) {
  const [group, setGroup] = useState('operations');
  const [report, setReport] = useState('work-by-block');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]);

  useEffect(() => {
    propertyService.listProperties()
      .then((data) => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setProperties([]));
  }, []);

  const active = useMemo(
    () => ALL_REPORTS.find((r) => r.key === report) || ALL_REPORTS[0],
    [report],
  );
  const activeGroup = GROUPS.find((g) => g.key === group) || GROUPS[0];

  // Switching group lands on that group's first report rather than leaving the
  // tab row highlighting nothing.
  const pickGroup = (key) => {
    setGroup(key);
    const first = GROUPS.find((g) => g.key === key)?.reports[0];
    if (first) setReport(first.key);
  };

  const prop = propertyId || undefined;
  // The PDF header names the property rather than its id, so the panel
  // resolves it once here instead of every report fetching the list again.
  const propertyName = properties.find((p) => String(p.id) === String(propertyId))?.name;
  const common = { propertyId: prop, propertyName, companyName };

  return (
    <div className="reports-page">
      <div className="reports-header">
        <h2 className="reports-title help-tip-head">
          Reports<HelpTip topic="manage.reports" />
        </h2>
        <div className="reports-filters">
          <label className={active.property ? '' : 'reports-filter--off'}>
            Property
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="reports-date-input"
              disabled={!active.property}
              title={active.property ? undefined : active.noPropertyReason}
            >
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className={active.dates ? '' : 'reports-filter--off'}>
            From
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="reports-date-input"
              disabled={!active.dates}
              title={active.dates ? undefined : active.noDatesReason}
            />
          </label>
          <label className={active.dates ? '' : 'reports-filter--off'}>
            To
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="reports-date-input"
              disabled={!active.dates}
              title={active.dates ? undefined : active.noDatesReason}
            />
          </label>
        </div>
      </div>

      {!active.dates && active.noDatesReason && (
        <div className="reports-filter-note">{active.noDatesReason} — the date range does not apply.</div>
      )}

      <div className="reports-groups">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            className={`reports-group ${group === g.key ? 'active' : ''}`}
            onClick={() => pickGroup(g.key)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="reports-tabs">
        {activeGroup.reports.map((r) => (
          <button
            key={r.key}
            className={`reports-tab ${report === r.key ? 'active' : ''}`}
            onClick={() => setReport(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="reports-content">
        {report === 'work-by-block' && <WorkByBlockReport startDate={startDate} endDate={endDate} {...common} />}
        {report === 'outstanding' && <OutstandingReport {...common} />}
        {report === 'tasks' && <TaskReport startDate={startDate} endDate={endDate} {...common} />}
        {report === 'observations' && <ObservationReport startDate={startDate} endDate={endDate} {...common} />}

        {report === 'health-safety' && <HealthSafetyReport startDate={startDate} endDate={endDate} {...common} />}
        {report === 'site-access' && <SiteAccessReport startDate={startDate} endDate={endDate} {...common} />}
        {report === 'census' && <VineyardCensusReport {...common} />}

        {report === 'timesheets' && <TimesheetReport startDate={startDate} endDate={endDate} {...common} />}
        {/* Assets take no property or date filter — only the name for the PDF header. */}
        {report === 'assets' && <AssetReport companyName={companyName} />}
        {report === 'contractors' && <ContractorReport startDate={startDate} endDate={endDate} {...common} />}
      </div>
    </div>
  );
}
