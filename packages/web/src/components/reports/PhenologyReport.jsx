// components/reports/PhenologyReport.jsx — where each block actually is on the
// E–L scale, from what people recorded in the field.
//
// Sits beside the count pills and deliberately does NOT look like them. A count
// is a number, so that report shows a weighted mean and a spread. A stage is an
// ordered CATEGORY: the mean of EL-2 and EL-9 is not EL-5.5, and a standard
// deviation over stage codes is a number with no meaning. So every block reports
// three things instead:
//
//   Modal          what most of the block is doing
//   Most advanced  what the earliest part is doing — the figure that decides
//                  when work has to start
//   Range          the spread between them, as stages
//
// A block sitting at EL-2 with one spot at EL-9 is a real and important shape —
// one hillside has moved and the rest has not — and a mean would erase it.
//
// This is the OBSERVED track only. What the model says for the same block is
// the phenology panel's job.
import { useState, useEffect, useCallback } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';
import {
  ReportSection, Stat, StatGrid, ReportTable, ReportNote, Pill,
  LoadingBlock, ErrorBlock, fmtDate,
} from './ReportPrimitives';

// The E–L phases, in season order, with a tone each. A grower reading the phase
// column is reading where in the season the block is, so the colours have to
// follow the season rather than a severity scale.
const PHASE_TONE = {
  dormant: 'neutral',
  shoot_development: 'info',
  flowering: 'success',
  berry_development: 'success',
  berry_ripening: 'warning',
  senescence: 'neutral',
};

const PHASE_LABEL = {
  dormant: 'Dormant',
  shoot_development: 'Shoot development',
  flowering: 'Flowering',
  berry_development: 'Berry development',
  berry_ripening: 'Ripening',
  senescence: 'Senescence',
};

const phaseLabel = (p) => PHASE_LABEL[p] || (p ? p.replace(/_/g, ' ') : '');

export default function PhenologyReport({
  startDate, endDate, propertyId, propertyName, companyName,
}) {
  const [view, setView] = useState('blocks');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    reportService.getPhenologySummary(startDate, endDate, propertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [startDate, endDate, propertyId]);

  useEffect(load, [load]);

  if (loading) return <LoadingBlock label="phenology" />;
  if (failed || !data) return <ErrorBlock label="phenology" onRetry={load} />;

  const rows = view === 'runs' ? data.runs : data.blocks;

  const columns = [
    { key: 'label', label: 'Block' },
    { key: 'property_name', label: 'Property' },
    { key: 'variety', label: 'Variety' },
    {
      key: 'observed_on',
      label: 'Last observed',
      render: (r) => fmtDate(r.observed_on),
      text: (r) => fmtDate(r.observed_on),
    },
    {
      key: 'spots',
      label: 'Spots',
      align: 'right',
      // "6 / 7" when some spots could not be read — a BBCH code, or a stage
      // field that is not on the E–L scale. One number would hide the gap.
      render: (r) => (r.readable_spots === r.spots
        ? r.spots
        : `${r.readable_spots} / ${r.spots}`),
      text: (r) => (r.readable_spots === r.spots
        ? r.spots
        : `${r.readable_spots} / ${r.spots}`),
    },
    {
      key: 'modal_stage',
      label: 'Most of the block',
      render: (r) => (r.modal_stage
        ? <span><strong>{r.modal_stage}</strong> {r.modal_stage_name}</span>
        : '—'),
      text: (r) => (r.modal_stage ? `${r.modal_stage} ${r.modal_stage_name || ''}`.trim() : ''),
    },
    {
      key: 'most_advanced_stage',
      label: 'Furthest along',
      // The operational number. Bolded on a non-uniform block because that is
      // exactly when it differs from the modal stage and matters.
      render: (r) => {
        if (!r.most_advanced_stage) return '—';
        const same = r.most_advanced_stage === r.modal_stage;
        return (
          <span style={same ? undefined : { fontWeight: 600 }}>
            {r.most_advanced_stage} {r.most_advanced_stage_name}
          </span>
        );
      },
      text: (r) => (r.most_advanced_stage
        ? `${r.most_advanced_stage} ${r.most_advanced_stage_name || ''}`.trim()
        : ''),
    },
    {
      key: 'stage_range',
      label: 'Range',
      render: (r) => (r.is_uniform
        ? <span className="report-muted">even</span>
        : r.stage_range),
      text: (r) => (r.is_uniform ? 'even' : (r.stage_range || '')),
    },
    {
      key: 'phase',
      label: 'Phase',
      render: (r) => (r.phase
        ? <Pill tone={PHASE_TONE[r.phase] || 'neutral'}>{phaseLabel(r.phase)}</Pill>
        : '—'),
      text: (r) => phaseLabel(r.phase),
    },
    {
      key: 'note',
      label: 'Confidence',
      // Why a row might be thinner than it looks, carried beside the figures
      // rather than in a footnote nobody reads.
      render: (r) => (r.note ? <span className="report-muted">{r.note}</span> : ''),
      text: (r) => r.note || '',
    },
  ];

  const pdf = () => buildReportPdf({
    title: `Phenology by ${view === 'runs' ? 'run' : 'block'}`,
    company: companyName,
    context: contextLines({ startDate, endDate, propertyName }),
    stats: [
      { label: 'Blocks observed', value: data.blocks_observed },
      { label: 'Spots', value: data.total_spots },
      { label: 'Furthest along', value: data.most_advanced_stage || '—' },
      { label: 'Where', value: data.most_advanced_block || '—' },
    ],
    sections: [{ columns, rows, note: data.warnings.join(' ') || undefined }],
    filename: `phenology-by-${view}.pdf`,
  });

  return (
    <ReportSection
      title="Phenology"
      actions={(
        <>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton
            onExport={() => reportService.exportPhenology(startDate, endDate, propertyId, view)}
          />
        </>
      )}
    >
      <StatGrid>
        <Stat value={data.blocks_observed} label="Blocks observed" />
        <Stat value={data.total_spots} label="Spots" />
        <Stat value={data.most_advanced_stage || '—'} label="Furthest along" />
        <Stat value={data.most_advanced_block || '—'} label="Where" />
      </StatGrid>

      {data.warnings.map((w) => <ReportNote key={w}>{w}</ReportNote>)}

      {data.readable_spots > 0 && (
        <ReportNote>
          <strong>There is no average stage here, on purpose.</strong> A stage is a position on a
          scale, not a quantity — the mean of EL-2 and EL-9 is not EL-5.5. So each block shows
          what <em>most</em> of it is doing, what its <em>furthest along</em> part is doing, and
          the range between the two. Where those differ, the block is uneven and the furthest-along
          figure is the one that decides when work starts.
        </ReportNote>
      )}

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
        empty="No phenology observations recorded in this period"
      />
    </ReportSection>
  );
}
