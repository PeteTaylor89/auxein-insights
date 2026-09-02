// components/reports/CountsReport.jsx — what the season's counting found.
//
// Bud counts first, because that is where the observation data actually is:
// when this was built, 36 of the 48 observation spots in the whole database
// were bud counts, 30 of them in a single block. Bunch, flower and shoot counts
// are the same report with a different metric and slot in as their data arrives.
//
// The rule this component exists to hold: **a blank is not a zero, and a mean
// is not an average of a block.** A spread needs at least three spots; below
// that the backend sends `sd: null` with a `sd_note` saying why, and that note
// is rendered rather than swallowed. One reading from one vine is a reading,
// not a block average, and the table has to say so or someone will prune to it.
import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';
import {
  ReportSection, Stat, StatGrid, ReportTable, ReportNote,
  LoadingBlock, ErrorBlock, fmtNum,
} from './ReportPrimitives';

// GROWTH STAGE order, mirroring COUNT_METRICS on the server: buds burst into
// shoots, shoots flower, flowers set into bunches. Reading down the row is
// reading forward through the season, which is how a grower thinks about it —
// alphabetical or build order put bunches before flowers, which is backwards.
const METRICS = [
  { key: 'bud_count', label: 'Bud count' },
  { key: 'shoot_count', label: 'Active shoots' },
  { key: 'flower_set', label: 'Flower / fruit set' },
  { key: 'bunch_count', label: 'Bunch count' },
];

const dash = (n, dp = 2) => (n === null || n === undefined ? '—' : Number(n).toFixed(dp));
const blank = (n, dp = 2) => (n === null || n === undefined ? '' : Number(n).toFixed(dp));

export default function CountsReport({
  startDate, endDate, propertyId, propertyName, companyName, initialMetric,
}) {
  // A deep link from an observation run names its own metric. An unrecognised
  // one falls back to buds rather than requesting a metric the server will
  // reject.
  const [metric, setMetric] = useState(
    () => (METRICS.some((m) => m.key === initialMetric) ? initialMetric : 'bud_count'),
  );
  const [view, setView] = useState('blocks');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // A second link arriving while the report is already open must still move it.
  useEffect(() => {
    if (initialMetric && METRICS.some((m) => m.key === initialMetric)) setMetric(initialMetric);
  }, [initialMetric]);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    reportService.getCountSummary(metric, startDate, endDate, propertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [metric, startDate, endDate, propertyId]);

  useEffect(load, [load]);

  const metricLabel = METRICS.find(m => m.key === metric)?.label || 'Counts';

  const picker = (
    <div className="reports-tabs" style={{ marginBottom: 'var(--space-md)' }}>
      {METRICS.map(m => (
        <button
          key={m.key}
          className={`reports-tab ${metric === m.key ? 'active' : ''}`}
          onClick={() => setMetric(m.key)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  if (loading) return <><ReportSection title="Counts">{picker}<LoadingBlock label="counts" /></ReportSection></>;
  if (failed || !data) {
    return <ReportSection title="Counts">{picker}<ErrorBlock label="counts" onRetry={load} /></ReportSection>;
  }

  const rows = view === 'runs' ? data.runs : data.blocks;
  const o = data.overall;

  const columns = [
    // Both views key on the block. A run's own name is auto-generated and reads
    // "Run - template 4", which tells one run from another not at all; what
    // does is WHERE and WHEN it was counted.
    { key: 'label', label: 'Block' },
    { key: 'property_name', label: 'Property' },
    { key: 'variety', label: 'Variety' },
    ...(view === 'runs' ? [
      {
        key: 'observed_on',
        label: 'Date',
        render: (r) => (r.observed_on ? dayjs(r.observed_on).format('D MMM YYYY') : '—'),
        text: (r) => (r.observed_on ? dayjs(r.observed_on).format('D MMM YYYY') : ''),
      },
      { key: 'template_name', label: 'Template' },
    ] : []),
    { key: 'spots', label: 'Spots', align: 'right' },
    {
      key: 'vines_sampled',
      label: 'Vines',
      align: 'right',
      render: (r) => fmtNum(r.vines_sampled, 0),
      text: (r) => fmtNum(r.vines_sampled, 0),
    },
    {
      key: 'mean',
      label: `Mean${data.unit ? ` (${data.unit})` : ''}`,
      align: 'right',
      render: (r) => dash(r.mean),
      text: (r) => blank(r.mean),
    },
    {
      key: 'sd',
      // A dash here is the report working, not failing — the note column says why.
      label: 'SD',
      align: 'right',
      render: (r) => dash(r.sd),
      text: (r) => blank(r.sd),
    },
    {
      key: 'cv_percent',
      label: 'CV %',
      align: 'right',
      // Spread as a share of the mean — the only version comparable between a
      // block averaging 30 buds and one averaging 12.
      render: (r) => (r.cv_percent === null || r.cv_percent === undefined ? '—' : `${r.cv_percent}%`),
      text: (r) => blank(r.cv_percent, 1),
    },
    { key: 'min', label: 'Min', align: 'right', render: (r) => dash(r.min, 0), text: (r) => blank(r.min, 0) },
    { key: 'max', label: 'Max', align: 'right', render: (r) => dash(r.max, 0), text: (r) => blank(r.max, 0) },
    {
      key: 'target',
      label: 'Target',
      align: 'right',
      render: (r) => dash(r.target),
      text: (r) => blank(r.target),
    },
    {
      key: 'percent_of_target',
      label: '% of target',
      align: 'right',
      render: (r) => (r.percent_of_target === null || r.percent_of_target === undefined
        ? '—'
        : `${r.percent_of_target}%`),
      text: (r) => blank(r.percent_of_target, 1),
    },
    {
      key: 'sd_note',
      label: 'Confidence',
      // The reason a spread is missing, carried beside the number it is missing
      // from. Put anywhere else, nobody reads it.
      render: (r) => (r.sd_note ? <span className="report-muted">{r.sd_note}</span> : ''),
      text: (r) => r.sd_note || '',
    },
  ];

  const pdf = () => buildReportPdf({
    title: `${data.metric_label} by ${view === 'runs' ? 'run' : 'block'}`,
    company: companyName,
    context: contextLines({ startDate, endDate, propertyName }),
    stats: [
      { label: 'Spots', value: o.spots },
      { label: 'Vines sampled', value: fmtNum(o.vines_sampled, 0) },
      { label: `Mean${data.unit ? ` (${data.unit})` : ''}`, value: dash(o.mean) },
      { label: '% of target', value: o.percent_of_target === null ? '—' : `${o.percent_of_target}%` },
    ],
    sections: [{ columns, rows, note: data.warnings.join(' ') || undefined }],
    filename: `${data.metric}-by-${view}.pdf`,
  });

  return (
    <ReportSection
      title={metricLabel}
      actions={(
        <>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton
            onExport={() => reportService.exportCounts(metric, startDate, endDate, propertyId, view)}
          />
        </>
      )}
    >
      {picker}

      <StatGrid>
        <Stat value={o.spots} label="Spots" />
        <Stat value={fmtNum(o.vines_sampled, 0)} label="Vines sampled" />
        <Stat value={dash(o.mean)} label={`Mean${data.unit ? ` ${data.unit}` : ''}`} />
        <Stat
          value={o.percent_of_target === null || o.percent_of_target === undefined
            ? '—'
            : `${o.percent_of_target}%`}
          label="Of target"
        />
      </StatGrid>

      {/* The company mean pools every spot, so a block with two test readings
          pulls it toward them. The per-block table below is the honest view. */}
      {o.sd !== null && o.sd !== undefined && (
        <ReportNote>
          Company mean is <strong>{dash(o.mean)}</strong> with a spread of{' '}
          <strong>{dash(o.sd)}</strong> ({o.cv_percent}% CV) {o.sd_basis}. It pools every spot in
          range, so blocks counted more thoroughly carry more of it — read the per-block rows
          before acting on this figure.
        </ReportNote>
      )}

      {data.warnings.map((w) => <ReportNote key={w}>{w}</ReportNote>)}

      <div className="reports-tabs" style={{ marginTop: 'var(--space-md)' }}>
        <button
          className={`reports-tab ${view === 'blocks' ? 'active' : ''}`}
          onClick={() => setView('blocks')}
        >
          By block
        </button>
        <button
          className={`reports-tab ${view === 'runs' ? 'active' : ''}`}
          onClick={() => setView('runs')}
        >
          By run
        </button>
      </div>

      <ReportTable
        columns={columns}
        rows={rows}
        empty={`No ${metricLabel.toLowerCase()} recorded in this period`}
      />
    </ReportSection>
  );
}
