// maps-v2/components/print/PrintDialog.jsx — Export the current map view.
import { useState, useMemo, useEffect } from 'react';
import { X, Printer, Loader, AlertTriangle } from 'lucide-react';
import {
  PAPER_SIZES, DPI_OPTIONS, paperPixels, clampToCanvasLimit, effectiveDpi,
  renderMapToCanvas, canvasToBlob, downloadBlob, exportFilename,
} from '../../utils/mapExport';
import { drawChrome } from '../../utils/mapChrome';
import { jpegToPdfBlob, canvasToJpegBytes } from '../../utils/pdfExport';
import { visibleLayersForViewer } from '../managementLayerRegistry';

const PAPER_ORDER = ['A0', 'A1', 'A2', 'A3', 'A4'];

export default function PrintDialog({
  isOpen,
  map,
  layerVisibility,
  isAdmin = false,
  defaultTitle = '',
  onClose,
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState('');
  const [paper, setPaper] = useState('A3');
  const [orientation, setOrientation] = useState('landscape');
  const [dpi, setDpi] = useState(150);
  const [format, setFormat] = useState('png');
  const [showLegend, setShowLegend] = useState(true);
  const [showScale, setShowScale] = useState(true);
  const [showNorth, setShowNorth] = useState(true);
  const [includeDate, setIncludeDate] = useState(true);

  // Print layers start as a COPY of what's on screen, then diverge. Printing a
  // different set to the one you're looking at is the main reason this dialog
  // exists, so it must not write back to the live map.
  const [printLayers, setPrintLayers] = useState(layerVisibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setPrintLayers(layerVisibility);
      setTitle((t) => t || defaultTitle);
      setError(null);
    }
  }, [isOpen, layerVisibility, defaultTitle]);

  const layers = useMemo(() => visibleLayersForViewer(isAdmin), [isAdmin]);

  const sizing = useMemo(() => {
    const raw = paperPixels(paper, dpi, orientation);
    const clamped = clampToCanvasLimit(raw);
    return { raw, ...clamped, dpiOut: effectiveDpi(dpi, clamped.scale) };
  }, [paper, dpi, orientation]);

  if (!isOpen) return null;

  const toggle = (id) => setPrintLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const canvas = await renderMapToCanvas(map, {
        width: sizing.width,
        height: sizing.height,
        layerVisibility: printLayers,
      });

      const centre = map.getCenter();
      drawChrome(canvas, {
        title,
        subtitle,
        date: includeDate ? new Date() : null,
        layerVisibility: printLayers,
        latitude: centre.lat,
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        showLegend,
        showScale,
        showNorth,
      });

      if (format === 'pdf') {
        const jpeg = await canvasToJpegBytes(canvas, 0.92);
        const p = PAPER_SIZES[paper];
        const mmW = orientation === 'portrait' ? p.w : p.h;
        const mmH = orientation === 'portrait' ? p.h : p.w;
        const blob = jpegToPdfBlob(jpeg, canvas.width, canvas.height, mmW, mmH);
        downloadBlob(blob, exportFilename(title, 'pdf'));
      } else {
        const blob = await canvasToBlob(canvas, 'image/png');
        downloadBlob(blob, exportFilename(title, 'png'));
      }
      onClose?.();
    } catch (err) {
      console.error('Map export failed:', err);
      setError(err.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v2-form-panel">
      <div className="v2-form-header">
        <h3 className="v2-form-title">Print / export map</h3>
        <button className="v2-form-close" onClick={onClose} disabled={busy}>
          <X size={18} />
        </button>
      </div>

      <div className="v2-form-body">
        {error && <div className="v2-form-error">{error}</div>}

        <div className="v2-form-group">
          <label className="v2-form-label">Title</label>
          <input
            className="v2-form-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Home Block — spray plan"
          />
        </div>

        <div className="v2-form-group">
          <label className="v2-form-label">Subtitle</label>
          <input
            className="v2-form-input"
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
          <div className="v2-form-group">
            <label className="v2-form-label">Paper</label>
            <select className="v2-form-select" value={paper} onChange={(e) => setPaper(e.target.value)}>
              {PAPER_ORDER.map((k) => (
                <option key={k} value={k}>
                  {PAPER_SIZES[k].label} ({PAPER_SIZES[k].w}×{PAPER_SIZES[k].h} mm)
                </option>
              ))}
            </select>
          </div>
          <div className="v2-form-group">
            <label className="v2-form-label">Orientation</label>
            <select
              className="v2-form-select"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
          <div className="v2-form-group">
            <label className="v2-form-label">Resolution</label>
            <select className="v2-form-select" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
              {DPI_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} dpi</option>
              ))}
            </select>
          </div>
          <div className="v2-form-group">
            <label className="v2-form-label">Format</label>
            <select className="v2-form-select" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="png">PNG (lossless)</option>
              <option value="pdf">PDF (page-sized)</option>
            </select>
          </div>
        </div>

        <div className="v2-form-info">
          Output: <strong>{sizing.width} × {sizing.height} px</strong>
          {format === 'pdf' && ' · fills the page'}
        </div>

        {/* Never hand back a quietly-downgraded file. A0 at 300 dpi is
            9933 × 14043 px, which no browser will allocate. */}
        {sizing.clamped && (
          <div className="v2-form-error" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {paper} at {dpi} dpi needs {sizing.raw.width} × {sizing.raw.height} px, beyond what
              browsers will allocate. It will be rendered at <strong>{sizing.dpiOut} dpi</strong> instead.
              Choose a lower resolution to remove this warning.
            </span>
          </div>
        )}

        <div className="v2-form-group">
          <label className="v2-form-label">Layers on the print</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {layers.map((l) => {
              const Icon = l.icon;
              return (
                <label
                  key={l.id}
                  className="v2-form-checkbox-label"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={!!printLayers[l.id]}
                    onChange={() => toggle(l.id)}
                  />
                  <Icon size={14} style={{ color: l.color }} />
                  {l.label}
                </label>
              );
            })}
          </div>
          <div className="v2-form-hint">
            Starts from what is on screen. Changing it here does not change the map.
          </div>
        </div>

        <div className="v2-form-group">
          <label className="v2-form-label">Map furniture</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="v2-form-checkbox-label">
              <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} /> Legend
            </label>
            <label className="v2-form-checkbox-label">
              <input type="checkbox" checked={showScale} onChange={(e) => setShowScale(e.target.checked)} /> Scale bar
            </label>
            <label className="v2-form-checkbox-label">
              <input type="checkbox" checked={showNorth} onChange={(e) => setShowNorth(e.target.checked)} /> North arrow
            </label>
            <label className="v2-form-checkbox-label">
              <input type="checkbox" checked={includeDate} onChange={(e) => setIncludeDate(e.target.checked)} /> Date
            </label>
          </div>
          <div className="v2-form-hint">
            Mapbox attribution is always included — it is a licence condition, not a preference.
          </div>
        </div>

        <div className="v2-form-actions">
          <button
            type="button"
            className="v2-form-btn v2-form-btn--ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="v2-form-btn v2-form-btn--primary"
            onClick={handleExport}
            disabled={busy}
          >
            {busy
              ? <><Loader size={14} className="v2-spin" /> Rendering...</>
              : <><Printer size={14} /> Export {format.toUpperCase()}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
