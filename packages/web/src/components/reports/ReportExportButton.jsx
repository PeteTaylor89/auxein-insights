// components/reports/ReportExportButton.jsx — one export button for every report.
//
// Exports are an authenticated blob fetch now, not a window.open of a URL with
// the token stapled on (see reportService for why). That makes them async and
// makes them capable of failing, so the button has to own a pending state and
// say so when it does — a download that silently does nothing reads as a broken
// app, and CSV export was in exactly that state before.
import { useState } from 'react';
import { Download, Loader, AlertTriangle } from 'lucide-react';

export default function ReportExportButton({ onExport, label = 'Export CSV' }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onExport();
    } catch (err) {
      console.error('Report export failed:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn-ghost" onClick={run} disabled={busy} title={failed ? 'Export failed — try again' : undefined}>
      {busy && <Loader size={16} className="v2-spin" />}
      {!busy && failed && <AlertTriangle size={16} />}
      {!busy && !failed && <Download size={16} />}
      {busy ? 'Exporting…' : failed ? 'Export failed' : label}
    </button>
  );
}
