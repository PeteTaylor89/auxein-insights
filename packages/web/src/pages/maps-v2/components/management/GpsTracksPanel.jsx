// maps-v2/components/management/GpsTracksPanel.jsx — Sidebar panel for the
// recent GPS tracks layer + the disabled spray-heatmap placeholder.
import { Loader2, Lock, Activity } from 'lucide-react';

const STATUS_LABELS = {
  in_progress: 'In progress',
  ready:       'Ready',
  scheduled:   'Scheduled',
  paused:      'Paused',
  completed:   'Completed',
  cancelled:   'Cancelled',
  draft:       'Draft',
};
const STATUS_COLORS = {
  in_progress: '#D1583B',
  ready:       '#5B6830',
  scheduled:   '#3b82f6',
  paused:      '#f59e0b',
  completed:   '#5B6830',
  cancelled:   '#6b7280',
  draft:       '#9ca3af',
};

export default function GpsTracksPanel({
  tracksData,
  trackCount,
  loading,
  error,
  visible,
}) {
  // Group counts by status for the legend.
  const counts = {};
  (tracksData?.features || []).forEach((f) => {
    const s = f.properties?.status || 'completed';
    counts[s] = (counts[s] || 0) + 1;
  });
  const statusEntries = Object.entries(counts);

  return (
    <>
      {loading && (
        <div className="v2-panel-loading">
          <Loader2 size={14} className="v2-spin" /> Loading tracks…
        </div>
      )}
      {error && <div className="v2-panel-error">{error}</div>}

      {visible && !loading && trackCount === 0 && !error && (
        <div className="v2-block-empty" style={{ padding: 'var(--space-md)' }}>
          No GPS tracks in the last 30 days.
        </div>
      )}

      {visible && !loading && trackCount > 0 && (
        <div style={{ padding: '0 var(--space-md) var(--space-sm)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 6 }}>
            Last 30 days · {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {statusEntries.map(([status, count]) => (
              <span
                key={status}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text)',
                  background: 'rgba(0,0,0,0.04)',
                  padding: '2px 6px',
                  borderRadius: 999,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_COLORS[status] || STATUS_COLORS.completed,
                  }}
                />
                {STATUS_LABELS[status] || status} · {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spray Heatmap — disabled placeholder */}
      <div
        style={{
          margin: 'var(--space-sm) var(--space-md) 0',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'rgba(0,0,0,0.02)',
          border: '1px dashed var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        title="Spray Heatmap is in design. Will combine spray task tracks with swath width to render coverage density and gaps."
      >
        <Activity size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
            Spray Heatmap
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Coverage density from sprayer GPS + swath width.
          </div>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#5B6830',
            background: 'rgba(91,104,48,0.14)',
            padding: '2px 6px',
            borderRadius: 999,
          }}
        >
          <Lock size={10} />
          Coming soon
        </span>
      </div>
    </>
  );
}
