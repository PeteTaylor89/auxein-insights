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
import { propertyService, useAuth } from '@vineyard/shared';
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
import CostReport from './CostReport';
import CountsReport from './CountsReport';
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
      // Behind `costs`, not `reports` — a company_manager holds reports:read and
      // must not see pay-rate-derived figures. `permission` filters the tab out;
      // the endpoint 403s anyway if someone gets to it another way.
      { key: 'costs', label: 'Costs', dates: true, property: true, permission: ['costs', 'read'] },
    ],
  },
  {
    // Its own group rather than two entries under Operations: what was counted
    // is a different question from what got done, and the counts report is the
    // one that grows — bunch, flower and shoot counts all land here.
    key: 'observations',
    label: 'Observations',
    reports: [
      { key: 'counts', label: 'Counts', dates: true, property: true },
      { key: 'observations', label: 'Runs & coverage', dates: true, property: true },
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

export default function ReportsPanel({ companyName, initialReport, initialMetric }) {
  // The CONTEXT's hasPermission, bound to the 5-tier userTypeRole. The
  // standalone helper in shared/utils takes that same role, and passing
  // `user.user_type` — the ROUTING key — returns false for everyone, which is
  // how the Reports pill itself once failed to render at all.
  const { hasPermission } = useAuth();

  // Reports the caller may actually open. A report whose permission they lack
  // is not a disabled tab: an empty Costs tab still tells a manager the report
  // exists and that they are being kept out of it.
  const groups = useMemo(
    () => GROUPS
      .map((g) => ({
        ...g,
        reports: g.reports.filter((r) => !r.permission || hasPermission(...r.permission)),
      }))
      .filter((g) => g.reports.length > 0),
    [hasPermission],
  );
  const allReports = useMemo(
    () => groups.flatMap((g) => g.reports.map((r) => ({ ...r, group: g.key }))),
    [groups],
  );

  // A deep link names a report, not a group — the caller should not have to know
  // which tab row it lives under. The group is resolved from it, and an unknown
  // or forbidden report falls back to the default rather than showing an empty
  // panel.
  const landing = useMemo(() => {
    const match = allReports.find((r) => r.key === initialReport);
    return match || null;
  }, [initialReport, allReports]);

  const [group, setGroup] = useState(landing?.group || 'operations');
  const [report, setReport] = useState(landing?.key || 'work-by-block');

  // A second link arriving while the panel is already open must still move it.
  useEffect(() => {
    if (!landing) return;
    setGroup(landing.group);
    setReport(landing.key);
  }, [landing]);
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
    () => allReports.find((r) => r.key === report) || allReports[0],
    [report, allReports],
  );
  const activeGroup = groups.find((g) => g.key === group) || groups[0];

  // Switching group lands on that group's first report rather than leaving the
  // tab row highlighting nothing.
  const pickGroup = (key) => {
    setGroup(key);
    const first = groups.find((g) => g.key === key)?.reports[0];
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
        {groups.map((g) => (
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
        {report === 'costs' && <CostReport startDate={startDate} endDate={endDate} {...common} />}
        {report === 'counts' && <CountsReport startDate={startDate} endDate={endDate} initialMetric={initialMetric} {...common} />}
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
