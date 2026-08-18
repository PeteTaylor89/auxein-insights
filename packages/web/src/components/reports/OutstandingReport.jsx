// components/reports/OutstandingReport.jsx — open work and what is late.
//
// No date range on purpose: this report answers "what am I behind on", and a
// date filter would hide the oldest, worst offenders. The panel greys its date
// inputs out while this report is showing so the omission reads as a decision
// rather than a bug.
import { useState, useEffect, useCallback } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';
import {
  ReportSection, Stat, StatGrid, BarList, ReportTable, ReportNote,
  LoadingBlock, ErrorBlock, toItems,
} from './ReportPrimitives';

export default function OutstandingReport({ propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    reportService.getOutstanding(propertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [propertyId]);

  useEffect(load, [load]);

  if (loading) return <LoadingBlock label="outstanding work" />;
  if (failed || !data) return <ErrorBlock label="outstanding work" onRetry={load} />;

  const blockColumns = [
    { key: 'block_name', label: 'Block' },
    { key: 'open_count', label: 'Open', align: 'right' },
    { key: 'overdue_count', label: 'Overdue', align: 'right' },
    {
      key: 'oldest_overdue_days',
      label: 'Oldest overdue',
      align: 'right',
      render: (r) => (r.oldest_overdue_days == null ? '—' : `${r.oldest_overdue_days} d`),
      text: (r) => (r.oldest_overdue_days == null ? '' : `${r.oldest_overdue_days} d`),
    },
  ];

  const assigneeColumns = [
    { key: 'name', label: 'Assigned to' },
    { key: 'open_count', label: 'Open', align: 'right' },
    { key: 'overdue_count', label: 'Overdue', align: 'right' },
  ];

  const pdf = () => buildReportPdf({
    title: 'Outstanding & overdue work',
    company: companyName,
    // No date range on this report, so the context line says so rather than
    // leaving the reader to assume the sheet covers some unstated window.
    context: contextLines({ propertyName, extra: 'All open work, any age' }),
    stats: [
      { label: 'Open tasks', value: data.total_open },
      { label: 'Overdue', value: data.total_overdue, alert: true },
      { label: 'Oldest overdue', value: data.oldest_overdue_days == null ? '—' : `${data.oldest_overdue_days} d`, alert: true },
      { label: 'No date set', value: data.unscheduled },
    ],
    sections: [
      { title: 'By block', columns: blockColumns, rows: data.by_block },
      { title: 'By person', columns: assigneeColumns, rows: data.by_assignee },
    ],
    filename: 'outstanding-work.pdf',
    orientation: 'portrait',
  });

  return (
    <ReportSection
      title="Outstanding & overdue"
      actions={(
        <>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton onExport={() => reportService.exportOutstanding(propertyId)} />
        </>
      )}
    >
      <StatGrid>
        <Stat value={data.total_open} label="Open tasks" />
        <Stat value={data.total_overdue} label="Overdue" tone="danger" />
        <Stat
          value={data.oldest_overdue_days == null ? '—' : data.oldest_overdue_days}
          label="Oldest overdue"
          suffix={data.oldest_overdue_days == null ? '' : ' days'}
          tone="danger"
        />
        <Stat value={data.unscheduled} label="No date set" tone="warning" />
      </StatGrid>

      <ReportNote>
        Shows all open work regardless of date — an overdue job from months back is exactly what
        this report is for, so the date range above does not apply to it.
        {data.unassigned_open > 0 && (
          <> <strong>{data.unassigned_open}</strong> open task
          {data.unassigned_open === 1 ? ' has' : 's have'} nobody assigned.</>
        )}
      </ReportNote>

      <BarList title="By priority" items={toItems(data.by_priority, 'status')} />
      <BarList title="By status" items={toItems(data.by_status, 'status')} accent />

      <ReportTable
        title="By block"
        columns={blockColumns}
        rows={data.by_block}
        empty="No open work"
      />
      <ReportTable
        title="By person"
        columns={assigneeColumns}
        rows={data.by_assignee}
        empty="No open work is assigned to anyone"
      />
    </ReportSection>
  );
}
