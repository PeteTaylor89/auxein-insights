// components/reports/TimesheetReport.jsx
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { reportService } from '@vineyard/shared';

function TimesheetReport({ startDate, endDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportService.getTimesheetSummary(startDate, endDate)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  if (loading) return <div className="report-loading">Loading timesheet report...</div>;
  if (!data) return <div className="report-empty">Unable to load timesheet report</div>;

  const handleExport = () => {
    const token = localStorage.getItem('accessToken');
    const url = reportService.exportTimesheets(startDate, endDate);
    window.open(`${url}&token=${token}`, '_blank');
  };

  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>Timesheet Summary</h3>
        <button className="btn-ghost" onClick={handleExport}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="report-stats-grid">
        <div className="report-stat">
          <div className="report-stat-value">{data.total_days}</div>
          <div className="report-stat-label">Total Days</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.total_hours}h</div>
          <div className="report-stat-label">Total Hours</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.avg_hours_per_day}h</div>
          <div className="report-stat-label">Avg Hours/Day</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value report-stat-value--warning">{data.uncoded_hours}h</div>
          <div className="report-stat-label">Uncoded Hours</div>
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
                    className="report-bar-fill report-bar-fill--success"
                    style={{ width: `${data.total_days > 0 ? (s.count / data.total_days) * 100 : 0}%` }}
                  />
                </div>
                <span className="report-bar-count">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TimesheetReport;
