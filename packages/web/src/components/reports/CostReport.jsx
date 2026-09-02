// components/reports/CostReport.jsx — what the work cost, by operation and by
// variety.
//
// The only report in the panel behind the `costs` permission rather than
// `reports`. A company_manager holds reports:read and must not see this at all:
// a cost divided by its hours is an hourly rate, so the whole report is gated
// where the pay rates are. ReportsPanel hides the tab; a direct hit still 403s.
//
// The rule this component exists to respect: **a blank is not a zero.** Every
// figure the backend could not resolve arrives as null, and it is rendered as a
// dash with the reason stated above the table. Printing 0.00 for an unpriced
// spray would say the chemical was free.
import { useState, useEffect, useCallback } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';
import {
  ReportSection, Stat, StatGrid, ReportTable, ReportNote,
  LoadingBlock, ErrorBlock, fmtNum,
} from './ReportPrimitives';

/** Money, or an em dash. Never 0.00 for something nobody priced. */
const money = (n, currency) =>
  (n === null || n === undefined) ? '—' : `${currency === 'NZD' ? '$' : ''}${Number(n).toFixed(2)}`;

/** The same figure for a PDF cell, where a dash reads as a printing fault. */
const moneyText = (n) => (n === null || n === undefined) ? '' : Number(n).toFixed(2);

const signed = (n) => {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
};

export default function CostReport({ startDate, endDate, propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState('operations');

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    reportService.getCostSummary(startDate, endDate, propertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [startDate, endDate, propertyId]);

  useEffect(load, [load]);

  if (loading) return <LoadingBlock label="costs" />;
  if (failed || !data) return <ErrorBlock label="costs" onRetry={load} />;

  const currency = data.currency || 'NZD';
  const rows = view === 'varieties' ? data.by_variety : data.by_operation;
  const keyLabel = view === 'varieties' ? 'Variety' : 'Operation';

  const columns = [
    {
      key: 'key',
      label: keyLabel,
      render: (r) => String(r.key).replace(/_/g, ' '),
      text: (r) => String(r.key).replace(/_/g, ' '),
    },
    { key: 'tasks', label: 'Tasks', align: 'right' },
    { key: 'hours', label: 'Hours', align: 'right', render: (r) => fmtNum(r.hours), text: (r) => fmtNum(r.hours) },
    {
      key: 'estimated_hours',
      label: 'Est. hours',
      align: 'right',
      render: (r) => fmtNum(r.estimated_hours),
      text: (r) => (r.estimated_hours === null ? '' : fmtNum(r.estimated_hours)),
    },
    {
      key: 'hours_variance',
      label: 'Variance',
      align: 'right',
      // Only over the tasks that carried an estimate — see the note below.
      render: (r) => signed(r.hours_variance),
      text: (r) => (r.hours_variance === null ? '' : signed(r.hours_variance)),
    },
    {
      key: 'labour',
      label: 'Labour',
      align: 'right',
      render: (r) => money(sumKnown(r.costs.labour_staff, r.costs.labour_contractor), currency),
      text: (r) => moneyText(sumKnown(r.costs.labour_staff, r.costs.labour_contractor)),
    },
    {
      key: 'consumables',
      label: 'Materials',
      align: 'right',
      render: (r) => money(r.costs.consumables, currency),
      text: (r) => moneyText(r.costs.consumables),
    },
    {
      key: 'equipment',
      label: 'Machinery',
      align: 'right',
      render: (r) => money(r.costs.equipment, currency),
      text: (r) => moneyText(r.costs.equipment),
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      render: (r) => money(r.costs.total, currency),
      text: (r) => moneyText(r.costs.total),
    },
    {
      key: 'cost_per_hour',
      label: 'Per hour',
      align: 'right',
      render: (r) => money(r.cost_per_hour, currency),
      text: (r) => moneyText(r.cost_per_hour),
    },
    {
      key: 'cost_per_hectare',
      label: 'Per ha',
      align: 'right',
      render: (r) => money(r.cost_per_hectare, currency),
      text: (r) => moneyText(r.cost_per_hectare),
    },
    {
      key: 'coverage',
      label: 'Costed',
      align: 'right',
      // Reads "8 / 11" — how much of the group the figures actually cover.
      render: (r) => `${r.costs.costed_tasks} / ${r.costs.costed_tasks + r.costs.uncosted_tasks}`,
      text: (r) => `${r.costs.costed_tasks} / ${r.costs.costed_tasks + r.costs.uncosted_tasks}`,
    },
  ];

  const pdf = () => buildReportPdf({
    title: `Costs by ${view === 'varieties' ? 'variety' : 'operation'}`,
    company: companyName,
    context: contextLines({
      startDate,
      endDate,
      propertyName,
      extra: data.costs.is_complete ? undefined : 'Figures are incomplete — see the note below',
    }),
    stats: [
      { label: 'Total cost', value: money(data.costs.total, currency) },
      { label: 'Labour', value: money(sumKnown(data.costs.labour_staff, data.costs.labour_contractor), currency) },
      { label: 'Materials', value: money(data.costs.consumables, currency) },
      { label: 'Machinery', value: money(data.costs.equipment, currency) },
    ],
    sections: [{
      columns,
      rows,
      note: [data.costs.warning, ...data.setup_warnings].filter(Boolean).join(' ') || undefined,
    }],
    filename: `costs-by-${view}.pdf`,
  });

  return (
    <ReportSection
      title="Costs"
      actions={(
        <>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton
            onExport={() => reportService.exportCosts(startDate, endDate, propertyId, view)}
          />
        </>
      )}
    >
      <StatGrid>
        <Stat value={money(data.costs.total, currency)} label="Total cost" />
        <Stat
          value={money(sumKnown(data.costs.labour_staff, data.costs.labour_contractor), currency)}
          label="Labour"
        />
        <Stat value={money(data.costs.consumables, currency)} label="Materials" />
        <Stat value={money(data.costs.equipment, currency)} label="Machinery" />
      </StatGrid>

      {/* Setup first: without rates there is nothing to report, and a page of
          dashes with no explanation reads as a broken report. */}
      {data.setup_warnings.length > 0 && (
        <ReportNote>
          <strong>Costs are not fully set up.</strong>
          <ul style={{ margin: 'var(--space-xs) 0 0', paddingLeft: '1.1rem' }}>
            {data.setup_warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </ReportNote>
      )}

      {data.costs.warning && <ReportNote>{data.costs.warning}</ReportNote>}

      {data.mix.some((m) => m.share_percent !== null) && (
        <div className="report-breakdown">
          <h4>Where the money went</h4>
          <div className="report-bar-list">
            {data.mix.map((m) => (
              <div key={m.key} className="report-bar-item">
                <span className="report-bar-label">{m.key}</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill report-bar-fill--accent"
                    style={{ width: `${m.share_percent || 0}%` }}
                  />
                </div>
                <span className="report-bar-count">
                  {m.share_percent === null ? '—' : `${m.share_percent}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="reports-tabs" style={{ marginTop: 'var(--space-md)' }}>
        <button
          className={`reports-tab ${view === 'operations' ? 'active' : ''}`}
          onClick={() => setView('operations')}
        >
          By operation
        </button>
        <button
          className={`reports-tab ${view === 'varieties' ? 'active' : ''}`}
          onClick={() => setView('varieties')}
        >
          By variety
        </button>
      </div>

      <ReportNote>
        <strong>Variance</strong> compares actual against estimated hours over the tasks that
        carried an estimate, not the whole group — a group where one job in twenty was estimated
        would otherwise read as wildly over. A dash means nothing in that group was estimated.
        Costs follow their task's block, so a job spanning blocks lands whole on the one it names.
      </ReportNote>

      <ReportTable
        columns={columns}
        rows={rows}
        empty="No completed work in this period"
      />
    </ReportSection>
  );
}

/** Staff + contractor, keeping "not known" distinct from "none". */
function sumKnown(...values) {
  const known = values.filter((v) => v !== null && v !== undefined);
  return known.length ? known.reduce((a, b) => a + Number(b), 0) : null;
}
