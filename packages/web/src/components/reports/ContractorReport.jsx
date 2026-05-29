// components/reports/ContractorReport.jsx — completed work + site visits
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { reportService } from '@vineyard/shared';

function ContractorReport({ startDate, endDate, propertyId }) {
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

  const handleExport = () => {
    const token = localStorage.getItem('accessToken');
    const url = reportService.exportContractors(startDate, endDate, propertyId);
    window.open(`${url}&token=${token}`, '_blank');
  };

  const topMaxHours = (data.top_contractors_by_hours || []).reduce((m, r) => Math.max(m, r.hours_worked || 0), 0);
  const visitMaxCount = (data.visits_by_property || []).reduce((m, r) => Math.max(m, r.visit_count || 0), 0);

  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>Contractor Activity</h3>
        <button className="btn-ghost" onClick={handleExport}>
          <Download size={16} /> Export CSV
        </button>
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
