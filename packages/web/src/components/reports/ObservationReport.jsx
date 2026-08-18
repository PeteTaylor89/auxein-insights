// components/reports/ObservationReport.jsx
import { useState, useEffect } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines } from './reportPdf';

function ObservationReport({ startDate, endDate, propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportService.getObservationSummary(startDate, endDate, propertyId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [startDate, endDate, propertyId]);

  if (loading) return <div className="report-loading">Loading observation report...</div>;
  if (!data) return <div className="report-empty">Unable to load observation report</div>;


  const pdf = () => buildReportPdf({
    title: 'Observation summary',
    company: companyName,
    context: contextLines({ startDate, endDate, propertyName }),
    stats: [
      { label: 'Observation runs', value: data.total_runs },
      { label: 'Completed', value: data.completed_runs },
      { label: 'Avg spots per run', value: data.avg_spots_per_run },
    ],
    sections: [{
      title: 'Runs by month',
      columns: [
        { key: 'key', label: 'Month' },
        { key: 'count', label: 'Runs', align: 'right' },
      ],
      rows: Object.entries(data.runs_by_month || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => ({ key, count })),
    }],
    filename: 'observation-summary.pdf',
    orientation: 'portrait',
  });

  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>Observation Summary</h3>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton onExport={() => reportService.exportObservations(startDate, endDate, propertyId)} />
        </div>
      </div>

      <div className="report-stats-grid">
        <div className="report-stat">
          <div className="report-stat-value">{data.total_runs}</div>
          <div className="report-stat-label">Observations</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.completed_runs}</div>
          <div className="report-stat-label">Completed</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.avg_spots_per_run}</div>
          <div className="report-stat-label">Avg Spots/Run</div>
        </div>
      </div>

      {Object.keys(data.runs_by_month).length > 0 && (
        <div className="report-breakdown">
          <h4>Runs by Month</h4>
          <div className="report-bar-list">
            {Object.entries(data.runs_by_month)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([month, count]) => {
                const maxCount = Math.max(...Object.values(data.runs_by_month));
                return (
                  <div key={month} className="report-bar-item">
                    <span className="report-bar-label">{month}</span>
                    <div className="report-bar-track">
                      <div
                        className="report-bar-fill report-bar-fill--info"
                        style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="report-bar-count">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ObservationReport;
