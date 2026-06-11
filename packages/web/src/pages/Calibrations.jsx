// pages/Calibrations.jsx — Calibrations tab body for /assets?tab=calibrations.
// Pending rows come from /calibration-schedules (status=pending); completed rows
// come from /calibrations. Merged client-side because the shapes differ enough
// that unioning at the API would just shift the same complexity to the backend.
// The legacy /calibrations route is preserved as a redirect (App.jsx).
// Owns: tab body + filter bar + detail modal + photo thumbnail.

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Sliders, Search, AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink, X, Camera, Thermometer, User, FileText, Wrench, Save, Upload } from 'lucide-react';
import { assetService, useAuth } from '@vineyard/shared';
import HelpTip from '../components/HelpTip';
import './Calibrations.css';
import '../components/asset-components.css';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due', label: 'Due' },
  { value: 'pass', label: 'Passed' },
  { value: 'out_of_tolerance', label: 'Failed' },
];

export default function CalibrationsTab() {
  const [schedules, setSchedules] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Detail modal
  const [selectedEvent, setSelectedEvent] = useState(null);
  // Complete-pending modal
  const [pendingToComplete, setPendingToComplete] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [s, e] = await Promise.all([
          assetService.calibration.listSchedules({ pending_only: true, limit: 500 }),
          assetService.calibration.listCalibrations({ limit: 500 }),
        ]);
        if (cancelled) return;
        setSchedules(Array.isArray(s) ? s : []);
        setEvents(Array.isArray(e) ? e : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load calibrations:', err);
        setError('Failed to load calibrations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Build a unified list. Each row carries a `kind` discriminator and a `sortDate`
  // (due_date for pending, calibration_date for completed) for sorting.
  const rows = useMemo(() => {
    const today = dayjs().startOf('day');
    const pending = schedules.map(s => {
      const due = dayjs(s.due_date);
      const isOverdue = due.isBefore(today);
      return {
        kind: 'pending',
        id: `s-${s.id}`,
        scheduleId: s.id,
        assetId: s.asset_id,
        assetName: s.asset_name || `Asset #${s.asset_id}`,
        type: s.calibration_type,
        parameter: s.parameter_name,
        unit: s.unit_of_measure,
        target: s.target_value,
        toleranceMin: s.tolerance_min,
        toleranceMax: s.tolerance_max,
        date: s.due_date,
        sortDate: s.due_date,
        status: isOverdue ? 'overdue' : 'due',
        reading: null,
        within: null,
      };
    });
    const completed = events.map(e => ({
      kind: 'completed',
      id: `e-${e.id}`,
      eventId: e.id,
      assetId: e.asset_id,
      assetName: e.asset_name || e.asset?.name || `Asset #${e.asset_id}`,
      type: e.calibration_type,
      parameter: e.parameter_name,
      unit: e.unit_of_measure,
      target: e.target_value,
      toleranceMin: e.tolerance_min,
      toleranceMax: e.tolerance_max,
      date: e.calibration_date,
      sortDate: e.calibration_date,
      status: e.status,
      reading: e.measured_value,
      within: e.within_tolerance,
    }));

    let merged = [...pending, ...completed];

    // Filter — search across asset name + parameter
    const q = search.trim().toLowerCase();
    if (q) {
      merged = merged.filter(r =>
        (r.assetName || '').toLowerCase().includes(q) ||
        (r.parameter || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      merged = merged.filter(r => r.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      merged = merged.filter(r => r.type === typeFilter);
    }

    // Sort: overdue first, then due (soonest first), then completed (most recent first)
    const statusRank = { overdue: 0, due: 1, out_of_tolerance: 2, pass: 3 };
    merged.sort((a, b) => {
      const ra = statusRank[a.status] ?? 9;
      const rb = statusRank[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      // Within same status group: pending sorts ASC by date (oldest overdue first),
      // completed sorts DESC (most recent first).
      const da = dayjs(a.sortDate);
      const db = dayjs(b.sortDate);
      if (a.kind === 'pending' && b.kind === 'pending') return da.diff(db);
      return db.diff(da);
    });

    return merged;
  }, [schedules, events, search, statusFilter, typeFilter]);

  // Build a list of unique types for the type filter dropdown
  const allTypes = useMemo(() => {
    const set = new Set();
    schedules.forEach(s => s.calibration_type && set.add(s.calibration_type));
    events.forEach(e => e.calibration_type && set.add(e.calibration_type));
    return Array.from(set).sort();
  }, [schedules, events]);

  const overdueCount = rows.filter(r => r.status === 'overdue').length;
  const dueCount = rows.filter(r => r.status === 'due').length;
  const failCount = rows.filter(r => r.status === 'out_of_tolerance').length;

  return (
    <div className="cal-tab">
      <div className="cal-tab-stats">
        <StatChip color="danger" icon={AlertTriangle} label="Overdue" value={overdueCount} />
        <StatChip color="warning" icon={Clock} label="Due" value={dueCount} />
        <StatChip color="danger" icon={XCircle} label="Failed (history)" value={failCount} />
        <StatChip color="muted" icon={CheckCircle} label="Total events" value={events.length} />
      </div>

      <div className="cal-filter-bar">
        <div className="cal-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by asset or parameter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="cal-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="cal-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {allTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><HelpTip topic="assets.calibrations" /></span>
      </div>

      {error && <div className="cal-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="cal-table-wrap">
        <table className="cal-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Parameter</th>
              <th>Tolerance</th>
              <th>Date</th>
              <th>Status</th>
              <th>Reading</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="cal-empty">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="cal-empty">No calibrations match.</td></tr>
            ) : rows.map(r => {
              const isCompleted = r.kind === 'completed';
              const isPending = r.kind === 'pending';
              const isClickable = isCompleted || isPending;
              const handleRowClick = isCompleted
                ? () => setSelectedEvent(events.find(e => e.id === r.eventId) || null)
                : isPending
                  ? () => setPendingToComplete(schedules.find(s => s.id === r.scheduleId) || null)
                  : undefined;
              return (
              <tr
                key={r.id}
                className={`cal-row cal-row--${r.status}${isClickable ? ' cal-row--clickable' : ''}`}
                onClick={handleRowClick}
                title={isCompleted ? 'View calibration details' : isPending ? 'Complete this calibration' : undefined}
              >
                <td>
                  <Link
                    to={`/assets/equipment/${r.assetId}/edit`}
                    className="cal-asset-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.assetName} <ExternalLink size={12} />
                  </Link>
                </td>
                <td>{(r.type || '').replace(/_/g, ' ') || '—'}</td>
                <td>{r.parameter || '—'}</td>
                <td>
                  {r.toleranceMin != null && r.toleranceMax != null
                    ? `${r.toleranceMin} – ${r.toleranceMax} ${r.unit || ''}`.trim()
                    : '—'}
                </td>
                <td>
                  {dayjs(r.date).format('DD MMM YYYY')}
                  {r.kind === 'pending' && r.status === 'overdue' && (
                    <span className="cal-overdue-tag"> · {dayjs().diff(dayjs(r.date), 'day')}d</span>
                  )}
                </td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  {r.reading != null
                    ? <span className={r.within === false ? 'cal-reading cal-reading--bad' : 'cal-reading'}>
                        {r.reading} {r.unit || ''}
                      </span>
                    : '—'}
                </td>
                <td>
                  {r.kind === 'pending'
                    ? <span className="cal-hint">Click to complete</span>
                    : <span className="cal-hint">Click to view</span>}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedEvent && (
        <CalibrationDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {pendingToComplete && (
        <CompleteCalibrationModal
          schedule={pendingToComplete}
          onClose={() => setPendingToComplete(null)}
          onSaved={() => {
            setPendingToComplete(null);
            setReloadKey(k => k + 1);
          }}
        />
      )}

      <p className="cal-footnote">
        Pending rows come from scheduled calibration tickets. Completed rows are immutable event history.
        Click a pending row to complete on desktop, or use the mobile app — either path consumes the
        schedule and auto-spawns the next one (asset interval on pass, 7-day recheck on fail).
      </p>
    </div>
  );
}

function StatChip({ color, icon: Icon, label, value }) {
  return (
    <div className={`cal-stat cal-stat--${color}`}>
      <Icon size={14} />
      <span className="cal-stat-value">{value}</span>
      <span className="cal-stat-label">{label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    overdue:          { label: 'Overdue',  cls: 'cal-badge--danger' },
    due:              { label: 'Due',      cls: 'cal-badge--warning' },
    pass:             { label: 'Pass',     cls: 'cal-badge--success' },
    out_of_tolerance: { label: 'Failed',   cls: 'cal-badge--danger' },
  };
  const m = map[status] || { label: status, cls: 'cal-badge--default' };
  return <span className={`cal-badge ${m.cls}`}>{m.label}</span>;
}

function CalibrationDetailModal({ event, onClose }) {
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState(null);
  const [photosLoading, setPhotosLoading] = useState(true);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const loadPhotos = async () => {
      try {
        setPhotosLoading(true);
        setPhotoError(null);
        const files = await assetService.files.listCalibrationFiles(event.id, 'photo');
        if (cancelled) return;
        setPhotos(Array.isArray(files) ? files.filter(f => f.file_category === 'photo') : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load calibration photos:', err);
        setPhotoError('Failed to load photos');
      } finally {
        if (!cancelled) setPhotosLoading(false);
      }
    };
    loadPhotos();
    return () => { cancelled = true; };
  }, [event.id]);

  const unit = event.unit_of_measure || '';
  const toleranceStr = (event.tolerance_min != null && event.tolerance_max != null)
    ? `${event.tolerance_min} – ${event.tolerance_max} ${unit}`.trim()
    : '—';
  const targetStr = event.target_value != null
    ? `${event.target_value} ${unit}`.trim()
    : '—';
  const readingStr = event.measured_value != null
    ? `${event.measured_value} ${unit}`.trim()
    : '—';
  const conditions = [
    event.temperature != null ? `${event.temperature}°C` : null,
    event.humidity != null ? `${event.humidity}% RH` : null,
    event.weather_conditions || null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="ac-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal--full" onClick={(e) => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3>
            <Sliders size={18} />
            {event.asset_name || event.asset?.name || `Asset #${event.asset_id}`} — Calibration
          </h3>
          <button className="ac-modal-close" onClick={onClose} aria-label="Close"><X size={24} /></button>
        </div>

        <div className="ac-modal-body">
          <div className="cal-detail-summary">
            <StatusBadge status={event.status} />
            <span className="cal-detail-date">{dayjs(event.calibration_date).format('DD MMM YYYY')}</span>
            <span className={`cal-detail-reading${event.within_tolerance === false ? ' cal-detail-reading--bad' : ''}`}>
              Reading: <strong>{readingStr}</strong>
            </span>
          </div>

          <div className="cal-detail-grid">
            <DetailItem label="Type" value={(event.calibration_type || '').replace(/_/g, ' ') || '—'} />
            <DetailItem label="Parameter" value={event.parameter_name || '—'} />
            <DetailItem label="Target" value={targetStr} />
            <DetailItem label="Tolerance" value={toleranceStr} />
            <DetailItem label="Calibrated by" value={event.calibrated_by || '—'} icon={User} />
            <DetailItem label="Within tolerance" value={event.within_tolerance == null ? '—' : (event.within_tolerance ? 'Yes' : 'No')} />
          </div>

          {conditions && (
            <div className="cal-detail-row">
              <Thermometer size={14} />
              <span>{conditions}</span>
            </div>
          )}

          {event.adjustment_made && (
            <div className="cal-detail-section">
              <div className="cal-detail-section-title"><Wrench size={14} /> Adjustment made</div>
              <div className="cal-detail-section-body">
                {event.adjustment_details || 'No details recorded.'}
              </div>
            </div>
          )}

          {event.notes && (
            <div className="cal-detail-section">
              <div className="cal-detail-section-title"><FileText size={14} /> Notes</div>
              <div className="cal-detail-section-body">{event.notes}</div>
            </div>
          )}

          <div className="cal-detail-section">
            <div className="cal-detail-section-title"><Camera size={14} /> Photos ({photos.length})</div>
            {photosLoading ? (
              <div className="cal-detail-empty">Loading photos…</div>
            ) : photoError ? (
              <div className="cal-error"><AlertTriangle size={16} /> {photoError}</div>
            ) : photos.length === 0 ? (
              <div className="cal-detail-empty">No photos attached.</div>
            ) : (
              <div className="ac-photos-grid">
                {photos.map(photo => (
                  <CalPhotoThumbnail key={photo.id} photo={photo} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ac-modal-footer">
          <Link
            to={`/assets/equipment/${event.asset_id}/edit`}
            className="cal-btn-secondary"
            onClick={onClose}
          >
            <ExternalLink size={14} /> Open asset
          </Link>
          <button className="cal-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, icon: Icon }) {
  return (
    <div className="cal-detail-item">
      <div className="cal-detail-label">{Icon ? <Icon size={12} /> : null} {label}</div>
      <div className="cal-detail-value">{value}</div>
    </div>
  );
}

function CalPhotoThumbnail({ photo }) {
  const [enlarged, setEnlarged] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let alive = true;
    let createdUrl = null;
    (async () => {
      try {
        const url = await assetService.files.getObjectUrl(photo.id);
        if (alive) {
          createdUrl = url;
          setPreviewUrl(url);
        } else {
          assetService.files.revokeObjectUrl(url);
        }
      } catch (err) {
        console.error('[Calibration photo] download failed', {
          photoId: photo.id,
          filename: photo.original_filename,
          status: err?.response?.status,
          data: err?.response?.data,
          message: err?.message,
        });
        if (alive) setLoadError(err?.response?.status || err?.message || 'failed');
      }
    })();
    return () => {
      alive = false;
      if (createdUrl) assetService.files.revokeObjectUrl(createdUrl);
    };
  }, [photo.id]);

  const fileLabel = photo.original_filename || `photo ${photo.id?.slice?.(0, 8)}`;

  if (loadError) {
    return (
      <div className="ac-photo-thumb cal-photo-thumb--error" title={`Failed: ${loadError}`}>
        <div className="cal-photo-thumb-error-body">
          <AlertTriangle size={18} />
          <div className="cal-photo-thumb-error-filename">{fileLabel}</div>
          <div className="cal-photo-thumb-error-detail">load failed ({String(loadError)})</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="ac-photo-thumb">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={photo.description || fileLabel}
            onClick={() => setEnlarged(true)}
            onError={() => {
              console.error('[Calibration photo] img.onerror — blob decoded but image element rejected it', {
                photoId: photo.id,
                filename: photo.original_filename,
                mime: photo.mime_type,
              });
              setLoadError('decode');
            }}
            title="Click to enlarge"
          />
        ) : (
          <div className="cal-photo-thumb-loading">Loading…</div>
        )}
      </div>
      {enlarged && previewUrl && (
        <div className="ac-lightbox" onClick={() => setEnlarged(false)}>
          <img
            src={previewUrl}
            alt={photo.description || fileLabel}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// Modal to complete a pending calibration on desktop. Mirrors the mobile
// FeedItemModal flow: reading + auto pass/fail from tolerance + notes +
// optional photo upload. POSTs to /calibrations with schedule_id, which
// consumes the schedule and auto-spawns the next pending one server-side.
function CompleteCalibrationModal({ schedule, onClose, onSaved }) {
  const { user } = useAuth();
  const [reading, setReading] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]); // Array<File>
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const unit = schedule.unit_of_measure || '';
  const target = schedule.target_value;
  const tMin = schedule.tolerance_min;
  const tMax = schedule.tolerance_max;

  // Live pass/fail derivation matching backend logic (tolerance_min <= reading <= tolerance_max)
  const readingNum = reading === '' ? null : Number(reading);
  const readingValid = readingNum != null && !Number.isNaN(readingNum);
  let withinTolerance = null;
  if (readingValid && tMin != null && tMax != null) {
    withinTolerance = readingNum >= Number(tMin) && readingNum <= Number(tMax);
  }

  const callerName = (() => {
    if (!user) return 'Unknown';
    const fn = (user.first_name || '').trim();
    const ln = (user.last_name || '').trim();
    const combined = `${fn} ${ln}`.trim();
    return combined || user.email || 'Unknown';
  })();

  const onPickPhotos = (files) => {
    setPhotos((prev) => [...prev, ...Array.from(files || [])]);
  };

  const removePhoto = (idx) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!readingValid) {
      setError('Reading is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        asset_id: schedule.asset_id,
        schedule_id: schedule.id,
        calibration_type: schedule.calibration_type || 'general',
        parameter_name: schedule.parameter_name || '',
        unit_of_measure: schedule.unit_of_measure || '',
        target_value: target != null ? Number(target) : null,
        measured_value: readingNum,
        tolerance_min: tMin != null ? Number(tMin) : null,
        tolerance_max: tMax != null ? Number(tMax) : null,
        calibrated_by: callerName,
        calibrated_by_user_id: user?.id || null,
        calibration_date: dayjs().format('YYYY-MM-DD'),
        notes: notes || null,
      };
      const saved = await assetService.calibration.createCalibration(payload);
      const eventId = saved?.id;
      // Upload photos against the new event row id
      if (eventId && photos.length) {
        for (const file of photos) {
          try {
            await assetService.files.uploadCalibrationFile({
              calibrationId: eventId,
              file,
              fileCategory: 'photo',
              description: `Photo: ${file.name}`
            });
          } catch (uploadErr) {
            console.warn('Photo upload failed:', uploadErr);
          }
        }
      }
      onSaved?.();
    } catch (err) {
      console.error('Failed to save calibration:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Failed to save calibration';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
      setSaving(false);
    }
  };

  return createPortal(
    <div className="ac-overlay" onClick={() => !saving && onClose()}>
      <div className="ac-modal ac-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3>
            <Sliders size={18} />
            Complete calibration — {schedule.asset_name || `Asset #${schedule.asset_id}`}
          </h3>
          <button className="ac-modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="ac-modal-body">
          {error && (
            <div className="ac-error" style={{ marginBottom: 'var(--space-base)' }}>
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {/* Spec snapshot */}
          <div className="cal-detail-summary" style={{ marginBottom: 'var(--space-base)' }}>
            <span className="cal-badge cal-badge--warning">Due {dayjs(schedule.due_date).format('DD MMM YYYY')}</span>
            <span>
              <strong>{(schedule.calibration_type || '').replace(/_/g, ' ') || 'General'}</strong>
              {schedule.parameter_name && <> · {schedule.parameter_name}</>}
            </span>
            {target != null && (
              <span>Target: <strong>{target} {unit}</strong></span>
            )}
            {tMin != null && tMax != null && (
              <span>Tolerance: <strong>{tMin} – {tMax} {unit}</strong></span>
            )}
          </div>

          {/* Reading + auto pass/fail */}
          <div className="ac-form-grid">
            <label>
              <div className="ac-field-label">Measured value <span className="ac-required">*</span></div>
              <div className="ac-input-with-unit">
                <input
                  className="ac-input"
                  type="number"
                  step="0.0001"
                  value={reading}
                  onChange={(e) => setReading(e.target.value)}
                  placeholder={target != null ? String(target) : '0.00'}
                  disabled={saving}
                  autoFocus
                />
                <span className="ac-unit-label">{unit || 'units'}</span>
              </div>
              {readingValid && withinTolerance != null && (
                <div style={{ marginTop: 6 }}>
                  {withinTolerance ? (
                    <span className="cal-badge cal-badge--success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={12} /> Within tolerance — will record as Pass
                    </span>
                  ) : (
                    <span className="cal-badge cal-badge--danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <XCircle size={12} /> Out of tolerance — will record as Fail (7-day recheck auto-spawned)
                    </span>
                  )}
                </div>
              )}
            </label>

            <label>
              <div className="ac-field-label">Notes</div>
              <textarea
                className="ac-textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Conditions, adjustments made, anything worth noting…"
                disabled={saving}
              />
            </label>

            {/* Photo dropzone */}
            <div>
              <div className="ac-field-label">Photos (optional)</div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => { onPickPhotos(e.target.files); e.target.value = ''; }}
              />
              <button
                type="button"
                className="ac-btn-cancel"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Upload size={14} /> Add photos
              </button>
              {photos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {photos.map((file, i) => (
                    <div key={`${file.name}-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-warm)', fontSize: 'var(--font-size-xs)' }}>
                      <Camera size={12} /> {file.name.length > 24 ? file.name.slice(0, 21) + '…' : file.name}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        disabled={saving}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-danger)', display: 'inline-flex' }}
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Recorded by <strong>{callerName}</strong> on {dayjs().format('DD MMM YYYY')}
            </div>
          </div>
        </div>

        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="ac-btn-success"
            onClick={handleSubmit}
            disabled={saving || !readingValid}
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save calibration'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
