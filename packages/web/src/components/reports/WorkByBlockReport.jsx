// components/reports/WorkByBlockReport.jsx — completed work rolled up by block.
import { useState, useEffect, useCallback } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';
import {
  ReportSection, Stat, StatGrid, ReportTable, ReportNote,
  LoadingBlock, ErrorBlock, fmtNum,
} from './ReportPrimitives';

export default function WorkByBlockReport({ startDate, endDate, propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    reportService.getWorkByBlock(startDate, endDate, propertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [startDate, endDate, propertyId]);

  useEffect(load, [load]);

  if (loading) return <LoadingBlock label="work by block" />;
  if (failed || !data) return <ErrorBlock label="work by block" onRetry={load} />;

  // `text` is what the PDF prints; `render` is what the screen shows. Both hang
  // off the same column so the printed table cannot drift from the rendered one.
  const columns = [
    { key: 'block_name', label: 'Block' },
    { key: 'property_name', label: 'Property' },
    { key: 'variety', label: 'Variety' },
    {
      key: 'area_hectares',
      label: 'Area (ha)',
      align: 'right',
      render: (r) => fmtNum(r.area_hectares, 2),
      text: (r) => fmtNum(r.area_hectares, 2),
    },
    { key: 'tasks_completed', label: 'Tasks', align: 'right' },
    { key: 'hours', label: 'Hours', align: 'right', render: (r) => fmtNum(r.hours), text: (r) => fmtNum(r.hours) },
    { key: 'rows_completed', label: 'Rows', align: 'right' },
    {
      key: 'area_worked_hectares',
      label: 'Area worked (ha)',
      align: 'right',
      render: (r) => fmtNum(r.area_worked_hectares, 2),
      text: (r) => fmtNum(r.area_worked_hectares, 2),
    },
    {
      key: 'hours_per_hectare',
      label: 'Hours / ha',
      align: 'right',
      // Blank rather than 0 when the block has no recorded area — a per-hectare
      // figure with no hectares is not a zero, it is unknown.
      render: (r) => (r.hours_per_hectare === null ? '—' : fmtNum(r.hours_per_hectare)),
      text: (r) => (r.hours_per_hectare === null ? '' : fmtNum(r.hours_per_hectare)),
    },
  ];

  const pdf = () => buildReportPdf({
    title: 'Work completed by block',
    company: companyName,
    context: contextLines({ startDate, endDate, propertyName }),
    stats: [
      { label: 'Tasks completed', value: data.total_tasks },
      { label: 'Hours', value: fmtNum(data.total_hours) },
      { label: 'Area worked (ha)', value: fmtNum(data.total_area_worked, 2) },
      { label: 'Blocks worked', value: data.blocks.length },
    ],
    sections: [{
      columns,
      rows: data.blocks,
      note: data.total_hours === 0 && data.total_tasks > 0
        ? 'No hours are recorded against these tasks. Labour comes from timesheet entries and contractor assignments linked to a task; until time is logged that way the hours columns stay at zero.'
        : undefined,
    }],
    filename: 'work-by-block.pdf',
  });

  return (
    <ReportSection
      title="Work completed by block"
      actions={(
        <>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton onExport={() => reportService.exportWorkByBlock(startDate, endDate, propertyId)} />
        </>
      )}
    >
      <StatGrid>
        <Stat value={data.total_tasks} label="Tasks completed" />
        <Stat value={fmtNum(data.total_hours)} label="Hours" suffix="h" />
        <Stat value={fmtNum(data.total_area_worked, 2)} label="Area worked" suffix=" ha" />
        <Stat value={data.blocks.length} label="Blocks worked" />
      </StatGrid>

      {data.total_hours === 0 && data.total_tasks > 0 && (
        <ReportNote>
          <strong>No hours are recorded against these tasks.</strong> Labour comes from timesheet
          entries and contractor assignments linked to a task; until time is logged that way the
          hours and hours-per-hectare columns stay at zero. The task and area figures are unaffected.
        </ReportNote>
      )}

      {(data.unallocated_tasks > 0 || data.unallocated_hours > 0) && (
        <ReportNote>
          {data.unallocated_tasks} task{data.unallocated_tasks === 1 ? '' : 's'} and{' '}
          {fmtNum(data.unallocated_hours)} h are not attached to a block, so they are counted in the
          totals above but do not appear in any row below.
        </ReportNote>
      )}

      <ReportTable
        columns={columns}
        rows={data.blocks}
        empty="No completed work in this period"
      />
    </ReportSection>
  );
}
