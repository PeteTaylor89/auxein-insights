// components/reports/AssetReport.jsx
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { reportService } from '@vineyard/shared';

function AssetReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportService.getAssetSummary()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="report-loading">Loading asset report...</div>;
  if (!data) return <div className="report-empty">Unable to load asset report</div>;

  const handleExport = () => {
    const token = localStorage.getItem('accessToken');
    const url = reportService.exportAssets();
    window.open(`${url}?token=${token}`, '_blank');
  };

  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>Asset Summary</h3>
        <button className="btn-ghost" onClick={handleExport}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="report-stats-grid">
        <div className="report-stat">
          <div className="report-stat-value">{data.total_assets}</div>
          <div className="report-stat-label">Total Assets</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">${data.total_value.toLocaleString()}</div>
          <div className="report-stat-label">Total Value</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value report-stat-value--warning">{data.maintenance_due}</div>
          <div className="report-stat-label">Maintenance Due</div>
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
                    style={{ width: `${data.total_assets > 0 ? (s.count / data.total_assets) * 100 : 0}%` }}
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
                <span className="report-bar-label">{c.category}</span>
                <div className="report-bar-track">
                  <div
                    className="report-bar-fill report-bar-fill--accent"
                    style={{ width: `${data.total_assets > 0 ? (c.count / data.total_assets) * 100 : 0}%` }}
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

export default AssetReport;
