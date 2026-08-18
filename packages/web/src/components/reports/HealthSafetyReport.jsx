// components/reports/HealthSafetyReport.jsx — incidents and the risk register.
//
// The one figure this report exists to surface is notifiable events that
// WorkSafe was never told about. It is given its own stat, toned red, and a
// banner when it is non-zero — everything else here is context around it.
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';
import {
  ReportSection, Stat, StatGrid, BarList, ReportTable, Pill,
  LoadingBlock, ErrorBlock, toItems, fmtDate,
} from './ReportPrimitives';

const SEVERITY_TONE = {
  minor: 'neutral', moderate: 'warning', serious: 'danger',
  critical: 'danger', fatal: 'danger',
};
const RISK_TONE = {
  Low: 'success', Medium: 'warning', High: 'danger', Critical: 'danger',
};

export default function HealthSafetyReport({ startDate, endDate, propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    reportService.getHealthSafety(startDate, endDate, propertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [startDate, endDate, propertyId]);

  useEffect(load, [load]);

  if (loading) return <LoadingBlock label="health & safety" />;
  if (failed || !data) return <ErrorBlock label="health & safety" onRetry={load} />;

  const incidentColumns = [
    { key: 'incident_number', label: 'Number' },
    { key: 'title', label: 'Incident' },
    { key: 'incident_date', label: 'Date', render: (r) => fmtDate(r.incident_date), text: (r) => fmtDate(r.incident_date) },
    { key: 'incident_type', label: 'Type', render: (r) => (r.incident_type || '—').replace(/_/g, ' '), text: (r) => (r.incident_type || '').replace(/_/g, ' ') },
    {
      key: 'severity',
      label: 'Severity',
      render: (r) => (r.severity
        ? <Pill tone={SEVERITY_TONE[r.severity] || 'neutral'}>{r.severity}</Pill>
        : '—'),
    },
    { key: 'property_name', label: 'Property' },
    {
      key: 'is_notifiable',
      label: 'WorkSafe',
      // The PDF says the same thing in words; this column is the reason an
      // auditor opens the file, so it must survive losing its colour.
      text: (r) => {
        if (!r.is_notifiable) return 'Not notifiable';
        if (!r.worksafe_notified) return 'NOT NOTIFIED';
        const bits = ['Notified'];
        if (r.days_to_notify != null) bits.push(`after ${r.days_to_notify} d`);
        if (r.worksafe_reference) bits.push(r.worksafe_reference);
        return bits.join(' · ');
      },
      render: (r) => {
        if (!r.is_notifiable) return 'Not notifiable';
        if (r.worksafe_notified) {
          return (
            <Pill tone="success">
              Notified{r.days_to_notify != null ? ` (${r.days_to_notify} d)` : ''}
              {r.worksafe_reference ? ` · ${r.worksafe_reference}` : ''}
            </Pill>
          );
        }
        return <Pill tone="danger">NOT NOTIFIED</Pill>;
      },
    },
    { key: 'status', label: 'Status' },
  ];

  const riskColumns = [
    { key: 'risk_title', label: 'Risk' },
    { key: 'risk_category', label: 'Category', render: (r) => (r.risk_category || '—').replace(/_/g, ' '), text: (r) => (r.risk_category || '').replace(/_/g, ' ') },
    { key: 'inherent_risk_level', label: 'Inherent' },
    {
      key: 'residual_risk_level',
      label: 'Residual',
      text: (r) => r.residual_risk_level || 'Not assessed',
      render: (r) => (r.residual_risk_level
        ? <Pill tone={RISK_TONE[r.residual_risk_level] || 'neutral'}>{r.residual_risk_level}</Pill>
        // An unassessed residual is not "low" — say so rather than let a blank
        // read as controlled.
        : <Pill tone="warning">Not assessed</Pill>),
    },
    { key: 'residual_risk_score', label: 'Score', align: 'right' },
    { key: 'open_actions', label: 'Open actions', align: 'right' },
    {
      key: 'next_review_due',
      label: 'Review due',
      text: (r) => (r.review_overdue_days != null
        ? `${r.review_overdue_days} d overdue`
        : fmtDate(r.next_review_due)),
      render: (r) => (r.review_overdue_days != null
        ? <Pill tone="danger">{r.review_overdue_days} d overdue</Pill>
        : fmtDate(r.next_review_due)),
    },
  ];

  const pdf = () => buildReportPdf({
    title: 'Health & safety register',
    company: companyName,
    context: contextLines({ startDate, endDate, propertyName }),
    stats: [
      { label: 'Incidents', value: data.total_incidents },
      { label: 'Notifiable', value: data.notifiable_count },
      { label: 'Not notified', value: data.notifiable_not_notified, alert: true },
      { label: 'Lost-time injuries', value: data.lost_time_count, alert: true },
      { label: 'Days lost', value: data.lost_time_days },
      { label: 'Active risks', value: data.active_risks },
      { label: 'Overdue review', value: data.risks_overdue_review, alert: true },
      { label: 'Open actions', value: data.open_actions },
    ],
    sections: [
      {
        title: 'Incidents',
        columns: incidentColumns,
        rows: data.incidents,
        note: data.notifiable_not_notified > 0
          ? `${data.notifiable_not_notified} notifiable incident(s) have no record of a WorkSafe notification.`
          : undefined,
      },
      { title: 'Risk register', columns: riskColumns, rows: data.risks },
    ],
    filename: 'health-and-safety.pdf',
  });

  return (
    <ReportSection
      title="Health & safety register"
      actions={(
        <>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton
            label="Incidents CSV"
            onExport={() => reportService.exportHealthSafety(startDate, endDate, propertyId, 'incidents')}
          />
          <ReportExportButton
            label="Risks CSV"
            onExport={() => reportService.exportHealthSafety(startDate, endDate, propertyId, 'risks')}
          />
        </>
      )}
    >
      {data.notifiable_not_notified > 0 && (
        <div className="alert alert--danger" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>{data.notifiable_not_notified}</strong> notifiable
            {data.notifiable_not_notified === 1 ? ' incident has' : ' incidents have'} no record of a
            WorkSafe notification. Notifiable events must be reported as soon as possible.
          </span>
        </div>
      )}

      <StatGrid>
        <Stat value={data.total_incidents} label="Incidents" />
        <Stat value={data.notifiable_count} label="Notifiable" tone="warning" />
        <Stat value={data.notifiable_not_notified} label="Not notified" tone="danger" />
        <Stat value={data.lost_time_count} label="Lost-time injuries" tone="danger" />
        <Stat value={data.lost_time_days} label="Days lost" suffix=" d" />
        <Stat value={data.medical_treatment_count} label="Medical treatment" />
      </StatGrid>

      <BarList title="Incidents by severity" items={toItems(data.by_severity, 'status')} total={data.total_incidents} />
      <BarList title="Incidents by type" items={toItems(data.by_type, 'category')} total={data.total_incidents} accent />

      <ReportTable
        title="Incidents"
        columns={incidentColumns}
        rows={data.incidents}
        empty="No incidents recorded in this period"
      />

      <StatGrid>
        <Stat value={data.active_risks} label="Active risks" />
        <Stat value={data.risks_overdue_review} label="Overdue review" tone="danger" />
        <Stat value={data.open_actions} label="Open actions" />
        <Stat value={data.overdue_actions} label="Overdue actions" tone="danger" />
      </StatGrid>

      <BarList title="Risks by residual level" items={toItems(data.risks_by_residual_level, 'status')} total={data.active_risks} />

      <ReportTable
        title="Risk register"
        columns={riskColumns}
        rows={data.risks}
        empty="No active risks on the register"
      />
    </ReportSection>
  );
}
