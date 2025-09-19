import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import dayjs from 'dayjs';
import {
  MapPin,
  Image as ImageIcon,
  Save,
  Send,
  ArrowLeft,
  Plus,
  Trash2,
  ClipboardList,
} from 'lucide-react';
import {
  observationService,
  api,
  useImageUpload,  // from @vineyard/shared hooks (falls back below if unavailable)
} from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import { SpotHelperPanel } from './RunCaptureHelpers';

/** ---------- helpers ---------- */

const asArray = (v) =>
  Array.isArray(v) ? v :
  v?.items ?? v?.results ?? v?.data ?? v?.rows ?? [];

const safe = (v, d = '—') => (v ?? v === 0 ? v : d);

const readTemplateFields = (tpl) =>
  tpl?.fields_json?.fields || tpl?.schema?.fields || tpl?.fields || [];

// simple geo util
const getGeolocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      return resolve(null);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });

// fallback uploader if useImageUpload isn’t wired yet
const useUploadFallback = () => {
  const [uploading, setUploading] = useState(false);
  const uploadFiles = async (files) => {
    // Expect your shared hook to handle auth + multipart.
    // Fallback does: POST /files/upload (one by one), returns array of { id, url, name }
    setUploading(true);
    try {
      const results = [];
      for (const f of files) {
        const form = new FormData();
        form.append('file', f);
        // Adjust if your API needs company_id, visibility, etc.
        const res = await api.post('/files/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        results.push(res.data);
      }
      return results;
    } finally {
      setUploading(false);
    }
  };
  return { uploadFiles, uploading, progress: null };
};

// small field renderer
const Field = ({ f, value, onChange }) => {
  const common = {
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
  };

  switch (f.type) {
    case 'text':
      return <input placeholder={f.label} {...common} />;
    case 'textarea':
      return <textarea placeholder={f.label} rows={3} {...common} />;
    case 'number':
      return (
        <input
          type="number"
          step="any"
          placeholder={f.label}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
    case 'integer':
      return (
        <input
          type="number"
          step="1"
          placeholder={f.label}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
        />
      );
    case 'boolean':
      return (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{f.label}</span>
        </label>
      );
    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={value ? dayjs(value).format('YYYY-MM-DDTHH:mm') : ''}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        />
      );
    case 'select': {
      const options = f.options || [];
      return (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{f.label}</option>
          {options.map((opt, i) => (
            <option key={i} value={opt.value ?? opt.label}>{opt.label}</option>
          ))}
        </select>
      );
    }
    case 'json':
      return (
        <textarea
          placeholder={f.label}
          rows={4}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(e) => {
            const v = e.target.value;
            // Don’t parse on every keystroke; store as string; parse on submit.
            onChange(v);
          }}
        />
      );
    case 'photo_multi':
      return (
        <div style={{ fontSize: 12, color: '#666' }}>
          Photos handled above (see SpotEditor uploader)
        </div>
      );
    // entity_ref / block_id etc. will usually come from context UI (plan targets); keep as text to allow quick entry:
    case 'entity_ref':
      return <input placeholder={f.label} {...common} />;
    default:
      return <input placeholder={f.label} {...common} />;
  }
};

/** ---------- spot editor ---------- */

function SpotEditor({
  idx,
  fields,
  spot,
  onChange,
  onRemove,
  uploadImpl, // { uploadFiles, uploading, progress }
}) {
  const fileInputRef = useRef(null);

  const setGeo = async () => {
    const geo = await getGeolocation();
    onChange(idx, { ...spot, gps: geo || null });
  };

  const addPhotos = async (files) => {
    if (!files || files.length === 0) return;
    const uploaded = await uploadImpl.uploadFiles(Array.from(files));
    const newFileObjs = uploaded.map((u) => ({
      id: u.id,
      name: u.name || u.filename || 'photo',
      url: u.url || u.public_url || null,
    }));
    onChange(idx, {
      ...spot,
      photos: [...(spot.photos || []), ...newFileObjs],
    });
  };

  const removePhoto = (id) => {
    onChange(idx, {
      ...spot,
      photos: (spot.photos || []).filter((p) => (p.id ?? p.file_id) !== id),
    });
  };

  const onFieldChange = (name, val) => {
    onChange(idx, {
      ...spot,
      values: { ...(spot.values || {}), [name]: val },
    });
  };

  return (
    <div className="stat-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Spot #{idx + 1}</div>
        <button className="btn" onClick={() => onRemove(idx)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Trash2 size={16} /> Remove
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 10 }}>
        {/* Controls row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={setGeo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={16} /> {spot?.gps ? 'Update GPS' : 'Set GPS'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) addPhotos(files);
              // reset input so the same file can be selected again
              e.target.value = '';
            }}
          />
          <button
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadImpl.uploading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ImageIcon size={16} />
            {uploadImpl.uploading ? 'Uploading…' : 'Add Photos'}
          </button>
        </div>

        {/* GPS display */}
        <div style={{ fontSize: 12, color: '#555' }}>
          GPS:&nbsp;
          {spot?.gps
            ? `${spot.gps.lat?.toFixed(6)}, ${spot.gps.lon?.toFixed(6)} (±${Math.round(spot.gps.accuracy_m || 0)} m)`
            : 'not set'}
        </div>

        {/* Photos */}
        {spot?.photos?.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {spot.photos.map((p) => {
              const id = p.id ?? p.file_id;
              return (
                <div key={id} style={{ position: 'relative', width: 100, height: 100, borderRadius: 6, overflow: 'hidden', border: '1px solid #eee' }}>
                  <img
                    src={p.url || p.public_url || '#'}
                    alt={p.name || 'photo'}
                    style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                  />
                  <button
                    onClick={() => removePhoto(id)}
                    style={{ position: 'absolute', right: 2, top: 2, background: 'rgba(0,0,0,0.5)', color: 'white', border: 0, borderRadius: 4, padding: '2px 4px', cursor: 'pointer', fontSize: 11 }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Dynamic fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {fields.map((f, i) => {
            // simple conditional support: visible_if: { key: value }
            const visible = (() => {
              if (!f.visible_if) return true;
              return Object.entries(f.visible_if).every(([k, v]) => (spot.values || {})[k] === v);
            })();
            if (!visible) return null;

            const val = (spot.values || {})[f.name];
            return (
              <label key={f.name || i} style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 13, color: '#444' }}>
                  {f.label || f.name}
                  {f.required ? <span style={{ color: '#d00' }}> *</span> : null}
                </div>
                <Field f={f} value={val} onChange={(v) => onFieldChange(f.name, v)} />
                {f.help_text && <div style={{ fontSize: 11, color: '#777' }}>{f.help_text}</div>}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** ---------- page ---------- */

export default function RunCapture() {
  const { id } = useParams(); // run id
  const navigate = useNavigate();
  const [activeIdx, setActiveIdx] = useState(0);
  const activeSpot = spots[activeIdx];
  const [run, setRun] = useState(null);
  const [template, setTemplate] = useState(null);
  const [spots, setSpots] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // prefer shared hook, fallback otherwise
  let uploadImpl = null;
  try {
    uploadImpl = useImageUpload?.() ?? null;
  } catch {
    // ignore
  }
  const { uploadFiles, uploading, progress } = uploadImpl || useUploadFallback();

  const fields = useMemo(() => readTemplateFields(template), [template]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);

      // 1) load run
      const runData = (await (observationService?.getRun
        ? observationService.getRun(id)
        : api.get(`/observations/api/observation-runs/${id}`).then(r => r.data)
      ));

      setRun(runData);

      // 2) load template (by id)
      const tplId = runData?.template_id || runData?.template?.id;
      const tpl = tplId
        ? await (observationService?.getTemplate
            ? observationService.getTemplate(tplId)
            : api.get(`/observations/api/observation-templates/${tplId}`).then(r => r.data))
        : null;
      setTemplate(tpl);

      // 3) load existing spots (if any)
      const spotsRes = await (observationService?.listSpotsForRun
        ? observationService.listSpotsForRun(id)
        : api.get(`/observations/api/observation-runs/${id}/spots`).then(r => r.data).catch(() => []));
      const s = asArray(spotsRes).map(spt => ({
        id: spt.id,
        gps: spt.gps || spt.gps_json || null,
        photos: asArray(spt.photos || spt.files || spt.file_links).map((fl) => ({
          id: fl.id ?? fl.file_id ?? fl.file?.id,
          url: fl.url ?? fl.public_url ?? fl.file?.public_url ?? null,
          name: fl.name ?? fl.file?.filename ?? 'photo',
        })),
        values: spt.values_json || spt.values || {},
      }));
      setSpots(s);
    } catch (e) {
      console.error(e);
      setErr('Failed to load run');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const addSpot = async () => {
    setSpots((prev) => [
      ...prev,
      { id: null, gps: null, photos: [], values: {} },
    ]);
  };

  const updateSpot = (idx, newSpot) => {
    setSpots((prev) => prev.map((s, i) => (i === idx ? newSpot : s)));
  };

  const removeSpot = (idx) => {
    setSpots((prev) => prev.filter((_, i) => i !== idx));
  };

  // persist a single spot (create or update)
  const saveSpot = async (spot) => {
    // Photos: we already have uploaded file IDs in photos[].id
    // Values: parse JSON fields that are strings
    const parsedValues = { ...(spot.values || {}) };
    for (const f of fields) {
      if (f.type === 'json' && typeof parsedValues[f.name] === 'string') {
        try {
          parsedValues[f.name] = JSON.parse(parsedValues[f.name]);
        } catch {
          // keep raw string; backend can 422 if needed
        }
      }
    }

    const payload = {
      run_id: run.id,
      gps_json: spot.gps || null,
      values_json: parsedValues,
      photo_file_ids: (spot.photos || []).map((p) => p.id ?? p.file_id).filter(Boolean),
    };

    if (spot.id) {
      return (await (observationService?.updateSpot
        ? observationService.updateSpot(spot.id, payload)
        : api.patch(`/observations/api/observation-spots/${spot.id}`, payload).then(r => r.data)
      ));
    } else {
      return (await (observationService?.createSpot
        ? observationService.createSpot(payload)
        : api.post('/observations/api/observation-spots', payload).then(r => r.data)
      ));
    }
  };

  const onSaveDraft = async () => {
    try {
      setBusy(true);
      // save all spots (create new / update existing)
      const newSpots = [];
      for (const s of spots) {
        const saved = await saveSpot(s);
        newSpots.push({
          id: saved.id,
          gps: saved.gps || saved.gps_json || s.gps || null,
          photos: asArray(saved.photos || saved.file_links).map((fl) => ({
            id: fl.id ?? fl.file_id ?? fl.file?.id,
            url: fl.url ?? fl.public_url ?? fl.file?.public_url ?? null,
            name: fl.name ?? fl.file?.filename ?? 'photo',
          })),
          values: saved.values_json || saved.values || s.values || {},
        });
      }
      setSpots(newSpots);
      alert('Draft saved');
    } catch (e) {
      console.error(e);
      alert('Failed to save draft');
    } finally {
      setBusy(false);
    }
  };

  const onSubmitRun = async () => {
    if (!window.confirm('Submit this run for review? You may not be able to edit afterwards.')) return;
    try {
      setBusy(true);
      // ensure current spots are saved before submit
      for (const s of spots) await saveSpot(s);

      await (observationService?.submitRun
        ? observationService.submitRun(run.id)
        : api.post(`/observations/api/observation-runs/${run.id}/submit`, {}).then(r => r.data));

      alert('Run submitted');
      navigate('/observations/plans'); // or to Insights; tweak to your flow
    } catch (e) {
      console.error(e);
      alert('Failed to submit run');
    } finally {
      setBusy(false);
    }
  };

  const badge = (s) => {
    const base = {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      border: '1px solid #ddd'
    };
    const colors = {
      in_progress: { background: '#f6f9ff', border: '1px solid #cfe0ff' },
      submitted: { background: '#fffaf3', border: '1px solid #ffe2a8' },
      approved: { background: '#f4fff6', border: '1px solid #cdeccd' },
      rejected: { background: '#fff6f6', border: '1px solid #ffd6d6' },
      default: { background: '#f8f8f8' },
    };
    return <span style={{ ...base, ...(colors[s] || colors.default) }}>{s || '—'}</span>;
  };

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn" onClick={() => navigate('/observations/plans')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> Back to Plans
        </button>
      </div>

      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Run Capture</span>
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {err && <div className="stat-card" style={{ borderColor: 'red' }}>{err}</div>}

      {!loading && !err && run && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          {/* Run summary */}
          <section className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {run?.plan?.name || `Run #${run.id}`}
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>
                {badge(run.status)} &nbsp;·&nbsp; Template: {safe(run?.template?.type || run?.template_type || '—')}
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>
                Created: {run.created_at ? dayjs(run.created_at).format('YYYY-MM-DD HH:mm') : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                disabled={busy || uploading}
                onClick={onSaveDraft}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Save size={16} /> Save Draft
              </button>
              <button
                className="btn"
                disabled={busy || uploading}
                onClick={onSubmitRun}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Send size={16} /> Submit
              </button>
            </div>
          </section>

          {/* Spots */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin /> Spots ({spots.length})
              </h3>
              <button
                className="btn"
                onClick={addSpot}
                disabled={busy || uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={16} /> Add Spot
              </button>
            </div>

            {spots.length === 0 && (
              <div className="stat-card" style={{ color: '#777' }}>
                No spots yet—click “Add Spot” to begin.
              </div>
            )}

            {/* Helper targets the active spot only, stays above the list */}
            {activeSpot && (
              <SpotHelperPanel
                templateType={template?.type} // e.g. 'phenology', 'irrigation', etc.
                values={activeSpot.values_json ?? activeSpot}
                onSuggest={(next) => {
                  // merge derived values back into the active spot
                  const merged = { ...(activeSpot.values_json ?? activeSpot), ...next };
                  // if your updateSpot signature is (index, nextSpot)
                  updateSpot(activeIdx, { ...activeSpot, ...(activeSpot.values_json ? { values_json: merged } : merged) });
                }}
              />
            )}

            {spots.map((s, i) => (
              <div key={s.id ?? `tmp-${i}`} onClick={() => setActiveIdx(i)}>
                <SpotEditor
                  idx={i}
                  fields={fields}
                  spot={s}
                  onChange={updateSpot}
                  onRemove={removeSpot}
                  uploadImpl={{ uploadFiles, uploading, progress }}
                />
              </div>
            ))}
          </section>


          <MobileNavigation />
        </div>
      )}
    </div>
  );
}
