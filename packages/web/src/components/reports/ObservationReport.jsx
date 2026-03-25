// components/reports/ObservationReport.jsx
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { reportService } from '@vineyard/shared';

function ObservationReport({ startDate, endDate, propertyId }) {
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

  const handleExport = () => {
    const token = localStorage.getItem('accessToken');
    const url = reportService.exportObservations(startDate, endDate, propertyId);
    window.open(`${url}&token=${token}`, '_blank');
  };

  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>Observation Summary</h3>
        <button className="btn-ghost" onClick={handleExport}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="report-stats-grid">
        <div className="report-stat">
          <div className="report-stat-value">{data.total_plans}</div>
          <div className="report-stat-label">Plans</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{data.total_runs}</div>
          <div className="report-stat-label">Runs</div>
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
