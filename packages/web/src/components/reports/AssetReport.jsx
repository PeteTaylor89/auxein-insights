// components/reports/AssetReport.jsx
import { useState, useEffect } from 'react';
import { reportService } from '@vineyard/shared';
import ReportExportButton from './ReportExportButton';
import { buildReportPdf, countSection } from './reportPdf';

function AssetReport({ companyName }) {
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


  const pdf = () => buildReportPdf({
    title: 'Asset register',
    company: companyName,
    // Assets are company-level and have no date range, so the context line says
    // what the sheet IS rather than leaving the reader to guess its scope.
    context: ['Company-wide register', 'Current state'],
    stats: [
      { label: 'Assets', value: data.total_assets },
      { label: 'Total value', value: data.total_value },
      { label: 'Maintenance due', value: data.maintenance_due, alert: true },
    ],
    sections: [
      countSection('By status', data.by_status, 'status'),
      countSection('By category', data.by_category, 'category'),
    ],
    filename: 'asset-register.pdf',
    orientation: 'portrait',
  });

  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>Asset Summary</h3>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <ReportExportButton label="PDF" onExport={pdf} />
          <ReportExportButton onExport={() => reportService.exportAssets()} />
        </div>
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
