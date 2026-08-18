// components/reports/TaskReport.jsx
import { useState, useEffect } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, contextLines, countSection } from './reportPdf';

function TaskReport({ startDate, endDate, propertyId, propertyName, companyName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportService.getTaskSummary(startDate, endDate, propertyId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [startDate, endDate, propertyId]);

  if (loading) return <div className="report-loading">Loading task report...</div>;
  if (!data) return <div className="report-empty">Unable to load task report</div>;


  const pdf = () => buildReportPdf({
    title: 'Task summary',
    company: companyName,
    context: contextLines({ startDate, endDate, propertyName }),
    stats: [
      { label: 'Total tasks', value: data.total },
      { label: 'Completion rate', value: `${data.completion_rate}%` },
      { label: 'Hours', value: data.total_hours },
      { label: 'Overdue', value: data.overdue_count, alert: true },
    ],
    sections: [
      countSection('By status', data.by_status, 'status'),
      countSection('By priority', data.by_priority, 'status'),
      countSection('By category', data.by_category, 'category'),
    ],
    filename: 'task-summary.pdf',
    orientation: 'portrait',
  });

  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>Task Summary</h3>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton onExport={() => reportService.exportTasks(startDate, endDate, propertyId)} />
        </div>
      </div>

      <div className="report-stats-grid">
        <div className="report-stat">
          <div className="report-stat-value">{data.total}</div>
          <div className="report-stat-label">Total Tasks</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.completion_rate}%</div>
          <div className="report-stat-label">Completion Rate</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.total_hours}h</div>
          <div className="report-stat-label">Total Hours</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value report-stat-value--danger">{data.overdue_count}</div>
          <div className="report-stat-label">Overdue</div>
        </div>
      </div>

      {data.by_status.length > 0 && (
        <div className="report-breakdown">
          <h4>By Status</h4>
          <div className="report-bar-list">
            {data.by_status.map((s) => (
              <div key={s.status} className="report-bar-item">
                <span className="report-bar-label">{s.status}</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill"
                    style={{ width: `${data.total > 0 ? (s.count / data.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="report-bar-count">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.by_category.length > 0 && (
        <div className="report-breakdown">
          <h4>By Category</h4>
          <div className="report-bar-list">
            {data.by_category.map((c) => (
              <div key={c.category} className="report-bar-item">
                <span className="report-bar-label">{c.category.replace(/_/g, ' ')}</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill report-bar-fill--accent"
                    style={{ width: `${data.total > 0 ? (c.count / data.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="report-bar-count">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskReport;
