// components/reports/ContractorReport.jsx — completed work + site visits
import { useState, useEffect } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';

function ContractorReport({ startDate, endDate, propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportService.getContractorSummary(startDate, endDate, propertyId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [startDate, endDate, propertyId]);

  if (loading) return <div className="report-loading">Loading contractor report...</div>;
  if (!data) return <div className="report-empty">Unable to load contractor report</div>;


  const topMaxHours = (data.top_contractors_by_hours || []).reduce((m, r) => Math.max(m, r.hours_worked || 0), 0);
  const visitMaxCount = (data.visits_by_property || []).reduce((m, r) => Math.max(m, r.visit_count || 0), 0);

  const pdf = () => buildReportPdf({
    title: 'Contractor summary',
    company: companyName,
    context: contextLines({ startDate, endDate, propertyName }),
    stats: [
      { label: 'Active relationships', value: data.total_active_relationships },
      { label: 'Jobs completed', value: data.jobs_completed },
      { label: 'Hours worked', value: data.total_hours_worked },
      { label: 'Site visits', value: data.total_visits },
    ],
    sections: [
      {
        title: 'Top contractors by hours',
        columns: [
          { key: 'contractor_name', label: 'Contractor' },
          { key: 'jobs_completed', label: 'Jobs', align: 'right' },
          { key: 'hours_worked', label: 'Hours', align: 'right' },
        ],
        rows: data.top_contractors_by_hours || [],
      },
      {
        title: 'Visits by property',
        columns: [
          { key: 'property_name', label: 'Property', text: (r) => r.property_name || 'Unassigned' },
          { key: 'visit_count', label: 'Visits', align: 'right' },
        ],
        rows: data.visits_by_property || [],
      },
    ],
    filename: 'contractor-summary.pdf',
    orientation: 'portrait',
  });

  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>Contractor Activity</h3>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton onExport={() => reportService.exportContractors(startDate, endDate, propertyId)} />
        </div>
      </div>

      <div className="report-stats-grid">
        <div className="report-stat">
          <div className="report-stat-value">{data.total_active_relationships}</div>
          <div className="report-stat-label">Active Contractors</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.jobs_completed}</div>
          <div className="report-stat-label">Jobs Completed</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{Number(data.total_hours_worked || 0).toFixed(1)}</div>
          <div className="report-stat-label">Hours Worked</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.total_visits}</div>
          <div className="report-stat-label">Site Visits</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.unique_contractors_visited}</div>
          <div className="report-stat-label">Unique Visitors</div>
        </div>
      </div>

      {(data.top_contractors_by_hours || []).length > 0 && (
        <div className="report-breakdown">
          <h4>Top Contractors by Hours</h4>
          <div className="report-bar-list">
            {data.top_contractors_by_hours.map((row) => (
              <div key={row.contractor_id} className="report-bar-item">
                <span className="report-bar-label">
                  {row.contractor_name}
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: 6 }}>
                    · {row.jobs_completed} job{row.jobs_completed === 1 ? '' : 's'}
                  </span>
                </span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill"
                    style={{ width: `${topMaxHours > 0 ? (row.hours_worked / topMaxHours) * 100 : 0}%` }}
                  />
                </div>
                <span className="report-bar-count">{Number(row.hours_worked || 0).toFixed(1)} h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.visits_by_property || []).length > 0 && (
        <div className="report-breakdown">
          <h4>Visits by Property</h4>
          <div className="report-bar-list">
            {data.visits_by_property.map((row, i) => (
              <div key={`${row.property_id ?? 'na'}-${i}`} className="report-bar-item">
                <span className="report-bar-label">{row.property_name || 'Unassigned'}</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill report-bar-fill--info"
                    style={{ width: `${visitMaxCount > 0 ? (row.visit_count / visitMaxCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="report-bar-count">{row.visit_count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ContractorReport;
