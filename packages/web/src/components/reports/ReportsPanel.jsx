// components/reports/ReportsPanel.jsx — the Reports tab on Insights.
//
// Absorbed from CompanyAdmin's ReportsTab, which is where reporting used to
// live. A vineyard manager does not go to Company Admin to find out what
// happened last week, and the five reports in there were effectively invisible.
//
// Twelve reports is too many for one flat row, so they are grouped by the
// question being asked:
//
//   Operations   — what got done, what is late
//   Observations — where the season is, and what was counted
//   Compliance   — the audit pack: H&S, who was on site, what is planted
//   Resources    — people, kit and contractors (HIDDEN, see `hidden` below)
//
// The groups label the pills, they do not hide them: every report is visible
// without a click, so the panel answers "what can this tell me?" on sight.
//
// A pill is not always a whole report. The counts report is one component with
// four metrics, and four pills that open it on a metric read better than one
// pill and a second row of tabs underneath. So an entry names `report` (which
// component) separately from `key` (which pill), and may carry a `metric`.
//
// Not every report takes the same filters, and pretending otherwise is how a
// date range ends up silently ignored. Each entry declares what it uses and the
// filter bar disables the rest with a reason.
import { useState, useEffect, useMemo } from 'react';
import { propertyService, useAuth } from '@vineyard/shared';
import HelpTip from '../HelpTip';
import TaskReport from './TaskReport';
import ContractorReport from './ContractorReport';
import TimesheetReport from './TimesheetReport';
import AssetReport from './AssetReport';
import WorkByBlockReport from './WorkByBlockReport';
import OutstandingReport from './OutstandingReport';
import HealthSafetyReport from './HealthSafetyReport';
import SiteAccessReport from './SiteAccessReport';
import VineyardCensusReport from './VineyardCensusReport';
import CostReport from './CostReport';
import CountsReport, { METRICS as COUNT_METRICS } from './CountsReport';
import PhenologyReport from './PhenologyReport';
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
    // Its own group rather than entries under Operations: what was counted is a
    // different question from what got done.
    //
    // One pill per metric, built from the counts report's OWN metric list, so a
    // fifth metric appears here the moment it is added there. "Runs & coverage"
    // used to sit alongside them and was dropped — it counted runs and spots
    // without saying anything about what was found, which is the part anyone
    // opening this group came for. `/reports/observations/*` is still served.
    key: 'observations',
    label: 'Observations',
    reports: [
      // Phenology first: it is the one that says where the season IS, and the
      // counts only make sense against it. It is also not a count — a stage is
      // an ordered category, so it has its own report rather than a fifth
      // metric pill that would promise a mean it cannot produce.
      { key: 'phenology', label: 'Phenology', dates: true, property: true },
      ...COUNT_METRICS.map((m) => ({
        key: `counts:${m.key}`,
        label: m.label,
        report: 'counts',
        metric: m.key,
        dates: true,
        property: true,
      })),
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
    // HIDDEN. Timesheets, assets and contractors all have a fuller home of their
    // own elsewhere in Grow, and these three read as thin next to them. Kept
    // whole rather than deleted: drop the `hidden` flag and the group, its
    // reports and their render cases below all come back untouched.
    key: 'resources',
    label: 'Resources',
    hidden: true,
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
      .filter((g) => !g.hidden)
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

  // A deep link names a report, not a pill — an observation run sends
  // `?report=counts&metric=bud_count` and knows nothing about how the pills are
  // arranged. So match on the COMPONENT and, when the link names one, the
  // metric. A link that is unknown, forbidden or now hidden falls back to the
  // default rather than showing an empty panel.
  const landing = useMemo(() => {
    if (!initialReport) return null;
    const candidates = allReports.filter((r) => (r.report || r.key) === initialReport);
    if (candidates.length === 0) return null;
    return candidates.find((r) => r.metric === initialMetric) || candidates[0];
  }, [initialReport, initialMetric, allReports]);

  const [report, setReport] = useState(landing?.key || 'work-by-block');

  // A second link arriving while the panel is already open must still move it.
  useEffect(() => {
    if (!landing) return;
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

  // The pill's own key identifies the pill; `report` names the component behind
  // it. They differ only where several pills share one component.
  const shown = active.report || active.key;

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

      {/* Every report is on screen at once. Clicking a group heading to find out
          what is under it costs a click and hides the answer to "what can this
          thing tell me?", so the groups are dashed clusters with a faded
          heading and all their pills showing. */}
      <div className="reports-nav">
        {groups.map((g) => (
          <div key={g.key} className="reports-nav-group">
            <span className="reports-nav-label">{g.label}</span>
            <div className="reports-nav-pills">
              {g.reports.map((r) => (
                <button
                  key={r.key}
                  className={`reports-pill ${report === r.key ? 'active' : ''}`}
                  onClick={() => setReport(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Which COMPONENT to show, which is not the same as which pill is lit:
          the four count pills all open CountsReport on their own metric. */}
      <div className="reports-content">
        {shown === 'work-by-block' && <WorkByBlockReport startDate={startDate} endDate={endDate} {...common} />}
        {shown === 'outstanding' && <OutstandingReport {...common} />}
        {shown === 'tasks' && <TaskReport startDate={startDate} endDate={endDate} {...common} />}
        {shown === 'costs' && <CostReport startDate={startDate} endDate={endDate} {...common} />}
        {shown === 'phenology' && <PhenologyReport startDate={startDate} endDate={endDate} {...common} />}
        {shown === 'counts' && (
          <CountsReport
            startDate={startDate}
            endDate={endDate}
            // The pill IS the picker, so the report's own metric row would be a
            // second copy of it directly underneath.
            initialMetric={active.metric || initialMetric}
            showMetricPicker={false}
            {...common}
          />
        )}

        {shown === 'health-safety' && <HealthSafetyReport startDate={startDate} endDate={endDate} {...common} />}
        {shown === 'site-access' && <SiteAccessReport startDate={startDate} endDate={endDate} {...common} />}
        {shown === 'census' && <VineyardCensusReport {...common} />}

        {/* The Resources group is hidden, so nothing lights these today. Left in
            place so unhiding the group is a one-line change. */}
        {shown === 'timesheets' && <TimesheetReport startDate={startDate} endDate={endDate} {...common} />}
        {/* Assets take no property or date filter — only the name for the PDF header. */}
        {shown === 'assets' && <AssetReport companyName={companyName} />}
        {shown === 'contractors' && <ContractorReport startDate={startDate} endDate={endDate} {...common} />}
      </div>
    </div>
  );
}
