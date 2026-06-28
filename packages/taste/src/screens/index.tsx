// Route screens. Most are P1 stubs labelling their target phase.
// Settings carries a P2 storage-diagnostics panel so the Dexie layer is verifiable.
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { TASTE_EXPORT_SCHEMA, exportToFile } from '@/export/exportData';
import { SyncPanel } from '@/features/sync/SyncPanel';

// Home launcher (default landing).
export { HomeScreen } from '@/features/home/HomeScreen';

// Real capture grid lives in features/capture (P4).
export { CaptureScreen } from '@/features/capture/CaptureScreen';

// P5 features.
export { WinesScreen } from '@/features/wines/WinesScreen';
export { EventsScreen } from '@/features/events/EventsScreen';
export { FlightsScreen } from '@/features/flights/FlightsScreen';

// P6 dashboard + blind accuracy.
export { StatsScreen } from '@/features/stats/StatsScreen';

// Real builder lives in features/templates (P3).
export { TemplatesScreen } from '@/features/templates/TemplatesScreen';

export const SettingsScreen = (): ReactNode => {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const doExport = useCallback(async (includePhotoData: boolean) => {
    setExporting(true);
    setExportMsg('');
    try {
      const { notes, photos } = await exportToFile({ includePhotoData });
      setExportMsg(`Exported ${notes} notes · ${photos} photos${includePhotoData ? ' (with image data)' : ''}.`);
    } catch (e) {
      setExportMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <section className="screen">
      <h1 className="screen-title">Settings</h1>
      <p className="screen-blurb">Your notes are synced to your Auxein account and load on any device you sign in on.</p>

      <SyncPanel />

      <h2 className="screen-subtitle">Export</h2>
      <p className="screen-blurb">Versioned JSON ({TASTE_EXPORT_SCHEMA}) — notes keep both the raw entry and its reconciled value.</p>
      <div className="settings-actions">
        <button className="btn" disabled={exporting} onClick={() => void doExport(false)}>
          {exporting ? 'Exporting…' : 'Export JSON'}
        </button>
        <button className="btn btn--ghost" disabled={exporting} onClick={() => void doExport(true)}>
          Export with photos
        </button>
      </div>
      {exportMsg && <p className="form-help">{exportMsg}</p>}
    </section>
  );
};
