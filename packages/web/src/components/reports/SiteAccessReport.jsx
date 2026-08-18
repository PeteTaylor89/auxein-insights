// components/reports/SiteAccessReport.jsx — who was on site, and were they inducted.
import { useState, useEffect, useCallback } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';
import {
  ReportSection, Stat, StatGrid, BarList, ReportTable, Pill, ReportNote,
  LoadingBlock, ErrorBlock, toItems, fmtDate,
} from './ReportPrimitives';

// Not-applicable stays blank rather than becoming "No" — a visitor has no
// equipment to clean, and printing "No" would read as a compliance failure.
const yesNoText = (v) => (v === null || v === undefined ? '' : (v ? 'Yes' : 'No'));

const yesNo = (v) => {
  if (v === null || v === undefined) return '—';
  return v ? <Pill tone="success">Yes</Pill> : <Pill tone="danger">No</Pill>;
};

export default function SiteAccessReport({ startDate, endDate, propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    reportService.getSiteAccess(startDate, endDate, propertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [startDate, endDate, propertyId]);

  useEffect(load, [load]);

  if (loading) return <LoadingBlock label="site access" />;
  if (failed || !data) return <ErrorBlock label="site access" onRetry={load} />;

  const columns = [
    {
      key: 'kind',
      label: 'Type',
      render: (r) => <Pill tone={r.kind === 'contractor' ? 'info' : 'neutral'}>{r.kind}</Pill>,
      text: (r) => r.kind,
    },
    { key: 'name', label: 'Name' },
    { key: 'organisation', label: 'Organisation' },
    { key: 'visit_date', label: 'Date', render: (r) => fmtDate(r.visit_date), text: (r) => fmtDate(r.visit_date) },
    { key: 'purpose', label: 'Purpose' },
    { key: 'property_name', label: 'Property' },
    { key: 'host', label: 'Host' },
    {
      key: 'signed_out',
      label: 'Signed out',
      // Signed in and never out is someone unaccounted for in an evacuation,
      // which is the single thing a register is for.
      text: (r) => (r.signed_in && !r.signed_out ? 'STILL ON SITE' : fmtDate(r.signed_out)),
      render: (r) => (r.signed_in && !r.signed_out
        ? <Pill tone="danger">Still on site</Pill>
        : fmtDate(r.signed_out)),
    },
    { key: 'inducted', label: 'Inducted', render: (r) => yesNo(r.inducted), text: (r) => yesNoText(r.inducted) },
    { key: 'equipment_cleaned', label: 'Kit cleaned', render: (r) => yesNo(r.equipment_cleaned), text: (r) => yesNoText(r.equipment_cleaned) },
  ];

  const pdf = () => buildReportPdf({
    title: 'Site access log',
    company: companyName,
    context: contextLines({ startDate, endDate, propertyName }),
    stats: [
      { label: 'Visits', value: data.total_visits },
      { label: 'Unique people', value: data.unique_people },
      { label: 'Not inducted', value: data.not_inducted, alert: true },
      { label: 'Never signed out', value: data.never_signed_out, alert: true },
      { label: 'Kit not cleaned', value: data.equipment_not_cleaned, alert: true },
      { label: 'Training expired', value: data.training_expired, alert: true },
    ],
    sections: [{
      columns,
      rows: data.visits,
      note: 'The visitor register is company-wide and carries no property, so a property filter narrows the contractor side only.',
    }],
    filename: 'site-access-log.pdf',
  });

  return (
    <ReportSection
      title="Site access log"
      actions={(
        <>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton onExport={() => reportService.exportSiteAccess(startDate, endDate, propertyId)} />
        </>
      )}
    >
      <StatGrid>
        <Stat value={data.total_visits} label="Visits" />
        <Stat value={data.unique_people} label="Unique people" />
        <Stat value={data.not_inducted} label="Not inducted" tone="danger" />
        <Stat value={data.never_signed_out} label="Never signed out" tone="danger" />
        <Stat value={data.equipment_not_cleaned} label="Kit not cleaned" tone="warning" />
        <Stat value={data.training_expired} label="Training expired" tone="warning" />
      </StatGrid>

      <ReportNote>
        {data.visitor_visits} visitor and {data.contractor_visits} contractor movement
        {data.contractor_visits === 1 ? '' : 's'}. The visitor register is company-wide — it carries
        no property — so a property filter narrows the contractor side only. Training currency
        counts completed inductions held by visitors and contractors:{' '}
        <strong>{data.training_current}</strong> current, <strong>{data.training_expired}</strong> expired.
      </ReportNote>

      <BarList title="By purpose" items={toItems(data.by_purpose, 'category')} total={data.total_visits} />

      {data.by_property.length > 0 && (
        <BarList
          title="Contractor movements by property"
          items={data.by_property.map((p) => ({ key: p.property_name || 'Unassigned', count: p.visit_count }))}
          accent
        />
      )}

      <ReportTable
        columns={columns}
        rows={data.visits}
        empty="No site access recorded in this period"
      />
    </ReportSection>
  );
}
