import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ClipboardList, MapPin, Plus, ArrowLeft, ArrowRight, Trash2, Image as ImageIcon, Save, CheckCircle, Send } from 'lucide-react';
import { observationService, authService, api, blocksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

// Helpers
const asArray = (v) => Array.isArray(v) ? v : (v?.items ?? v?.results ?? v?.data ?? []);
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function readTemplateFields(template) {
  if (!template) return [];
  let raw =
    template.field_schema ??
    template?.schema?.fields ??
    template?.schema ??
    template.fields_json ??
    [];

  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.fields)) return raw.fields;
    return Array.isArray(raw) ? raw : [];
  }
  return [];
}

export default function RunCapture() {
  const { id } = useParams();
  const navigate = useNavigate();
  const companyId = authService.getCompanyId();

  const [run, setRun] = useState(null);
  const [template, setTemplate] = useState(null);
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [blocks, setBlocks] = useState([]);
  const EL_FALLBACK = [
    { value: 'EL-12', label: 'EL-12 (5 leaves separated)' },
    { value: 'EL-15', label: 'EL-15 (8 leaves separated)' },
    { value: 'EL-18', label: 'EL-18 (10 leaves separated)' },
    { value: 'EL-23', label: 'EL-23 (50% caps off)' },
    { value: 'EL-27', label: 'EL-27 (setting)' },
    { value: 'EL-31', label: 'EL-31 (pea-size berries)' },
    { value: 'EL-38', label: 'EL-38 (harvest ripe)' },
  ];



  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await observationService.getRun(id);
      const tpl = r?.template || (r?.template_id ? await observationService.getTemplate(r.template_id) : null);
      const sp = await observationService.listSpotsForRun(id);
      const blks = await blocksService.getCompanyBlocks().catch(() => []);
      setRun(r);
      setTemplate(tpl || null);
      setSpots(asArray(sp));
      setBlocks(asArray(blks));
    } catch (e) {
      console.error(e);
      setError('Failed to load run');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fields = useMemo(() => readTemplateFields(template), [template]);

  const addSpot = () => {
    const tmp = {
      id: `tmp-${Date.now()}`,
      run_id: Number(id),
      company_id: companyId,
      observed_at: dayjs().toISOString(),
      values: {},
      photo_file_ids: [],
      _isNew: true,
    };
    setSpots((prev) => [tmp, ...prev]);
  };

  const updateSpot = (idx, patch) => {
    setSpots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch, values: { ...(s.values || {}), ...(patch.values || {}) } } : s))
    );
  };

  const removeSpot = async (idx) => {
    const s = spots[idx];
    if (!s) return;
    if (s._isNew) {
      setSpots((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    try {
      setBusy(true);
      await observationService.deleteSpot(s.id);
      setSpots((prev) => prev.filter((_, i) => i !== idx));
    } catch (e) {
      console.error(e);
      alert('Failed to remove spot.');
    } finally {
      setBusy(false);
    }
  };

  const saveSpot = async (idx) => {
    const s = spots[idx];
    if (!s) return;
    try {
      setBusy(true);
      const payload = {
        run_id: Number(id),
        company_id: companyId,
        observed_at: s.observed_at || new Date().toISOString(),
        values: s.values || {},
        photo_file_ids: s.photo_file_ids || [],
        block_id: s.block_id ? Number(s.block_id) : null,
        row_id: s.row_id ? Number(s.row_id) : null,
        latitude: typeof s.latitude === 'string' ? Number(s.latitude) : s.latitude ?? null,
        longitude: typeof s.longitude === 'string' ? Number(s.longitude) : s.longitude ?? null,
      };

      let saved;
      if (s._isNew) {
        saved = await observationService.createSpot(Number(id), payload);
      } else {
        // Some backends also expect run_id on PATCH; harmless if ignored.
        saved = await observationService.updateSpot(s.id, payload);
      }

      setSpots((prev) =>
        prev.map((x, i) => (i === idx ? { ...(saved || s), _isNew: false } : x))
      );
    } catch (e) {
      console.error(e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save spot';
      alert(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save spot' : String(detail));
    } finally {
      setBusy(false);
    }
  };



  const submitRun = async () => {
    try {
      setBusy(true);
      // valid statuses: draft | in_progress | completed | cancelled
      await observationService.updateRun(id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
      await load();
      alert('Run submitted as completed.');
    } catch (e) {
      console.error(e);
      alert('Failed to submit run.');
    } finally {
      setBusy(false);
    }
  };

  const completeRun = async () => {
    try {
      setBusy(true);
      await observationService.completeRun(id);
      await load();
      alert('Run completed (server summary updated).');
    } catch (e) {
      console.error(e);
      alert('Failed to complete run.');
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (idx, fileList) => {
    const s = spots[idx];
    if (!s || !fileList?.length) return;
    try {
      setBusy(true);
      // simple sequential upload to keep it robust
      const uploadedIds = [];
      for (const f of fileList) {
        const fd = new FormData();
        fd.append('file', f);
        // If your files service expects entity linkage, include it here
        // fd.append('entity_type', 'observation_spot');
        // fd.append('entity_id', s.id || '');
        const res = await api.post('/files/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const fileId = res?.data?.id || res?.data?.file_id;
        if (fileId) uploadedIds.push(fileId);
      }
      const nextIds = [...(s.photo_file_ids || []), ...uploadedIds];
      updateSpot(idx, { photo_file_ids: nextIds });
      alert(`${uploadedIds.length} file(s) added to spot.`);
    } catch (e) {
      console.error(e);
      alert('Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const Summary = () => {
    const js = run?.summary_json || run?.summary || null;
    if (!js || (typeof js === 'object' && Object.keys(js).length === 0)) return null;
    return (
      <section className="stat-card">
        <h3 style={{ marginTop: 0 }}>Summary</h3>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, background: '#f9fafb', padding: 12, borderRadius: 8 }}>
          {typeof js === 'string' ? js : JSON.stringify(js, null, 2)}
        </pre>
      </section>
    );
  };

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 1rem' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/observations'))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Run Capture</span>
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && run && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          {/* Run header */}
          <section className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{run.name || `Run #${run.id}`}</div>
              <div style={{ color: '#666', marginTop: 4 }}>
                Template: {template?.name || template?.type || template?.observation_type || `#${run.template_id}`} &nbsp;·&nbsp; Started: {run.started_at ? dayjs(run.started_at).format('YYYY-MM-DD HH:mm') : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={completeRun} disabled={busy} style={{ background: '#e0f2fe', color: '#075985', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={16} /> Complete
              </button>
              <button className="btn" onClick={submitRun} disabled={busy} style={{ background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Send size={16} /> Submit
              </button>
            </div>
          </section>

          <Summary />

          {/* Spots */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin /> Spots ({spots.length})
              </h3>
              <button className="btn" onClick={addSpot} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff' }}>
                <Plus size={16} /> Add Spot
              </button>
            </div>

            {spots.length === 0 && (
              <div className="stat-card" style={{ color: '#777' }}>No spots yet—click “Add Spot” to begin.</div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              {spots.map((s, i) => (
                <SpotEditor
                  key={s.id ?? `tmp-${i}`}
                  idx={i}
                  spot={s}
                  fields={fields}
                  blocks={blocks}            
                  onChange={updateSpot}
                  onSave={saveSpot}
                  onRemove={removeSpot}
                  onUpload={uploadFiles}
                  busy={busy}
                />
              ))}
            </div>
          </section>

          <MobileNavigation />
        </div>
      )}
    </div>
  );
}

/* -----------------------------------
 * Spot Editor
 * ----------------------------------- */
function SpotEditor({ idx, spot, fields, blocks = [], onChange, onSave, onRemove, onUpload, busy }) {
  const values = spot.values || {};

  const setValue = (k, v) => {
    onChange(idx, { values: { ...values, [k]: v } });
  };

  const thumb = (fid) => (
    <div key={fid} style={{ width: 64, height: 64, background: '#f3f4f6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <ImageIcon size={20} />
      <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, color: '#6b7280' }}>#{fid}</div>
    </div>
  );

  return (
    <div className="stat-card" style={{ padding: 16, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>Spot {spot.id?.toString().startsWith('tmp-') ? '(new)' : `#${spot.id}`}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => onSave(idx)} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#4e638bff', color: '#fff' }}>
            <Save size={16} /> Save
          </button>
          <button className="btn" onClick={() => onRemove(idx)} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#7f1d1d' }}>
            <Trash2 size={16} /> Remove
          </button>
        </div>
      </div>

      {/* Basic meta (optional in MVP) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <label>
          <div>Observed at</div>
          <input
            type="datetime-local"
            value={spot.observed_at ? dayjs(spot.observed_at).format('YYYY-MM-DDTHH:mm') : ''}
            onChange={(e) => onChange(idx, { observed_at: new Date(e.target.value).toISOString() })}
          />
        </label>

        <label>
          <div>Block (optional)</div>
          <select
            value={spot.block_id || ''}
            onChange={(e) => onChange(idx, { block_id: e.target.value })}
          >
            <option value="">— Select block —</option>
            {(Array.isArray(blocks) ? blocks : []).map(b => (
              <option key={b.id} value={b.id}>{b.name || `Block ${b.id}`}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginTop: 12 }}>
        <label>
          <div>Latitude</div>
          <input
            placeholder="-41.28"
            value={spot.latitude ?? ''}
            onChange={(e) => onChange(idx, { latitude: e.target.value })}
          />
        </label>
        <label>
          <div>Longitude</div>
          <input
            placeholder="174.77"
            value={spot.longitude ?? ''}
            onChange={(e) => onChange(idx, { longitude: e.target.value })}
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!navigator.geolocation) {
                alert('Geolocation not supported in this browser.');
                return;
              }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const { latitude, longitude } = pos.coords || {};
                  onChange(idx, { latitude, longitude });
                },
                () => alert('Unable to get current location.')
              );
            }}
            style={{ background: '#f3f4f6' }}
            title="Use current location"
          >
            Use current location
          </button>
        </div>
      </div>

      {/* Files */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong>Photos</strong>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onUpload(idx, e.target.files)}
          />
        </div>
        {!isEmpty(spot.photo_file_ids) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {(spot.photo_file_ids || []).map(thumb)}
          </div>
        )}
      </div>

      {/* Dynamic fields from template */}
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {fields.length === 0 && (
          <div style={{ color: '#777' }}>No fields defined for this template.</div>
        )}
        {fields.map((f) => (
          <FieldRenderer key={f.key || f.name} field={f} value={values[f.key || f.name]} onChange={(v) => setValue(f.key || f.name, v)} />
        ))}
      </div>
    </div>
  );
}

/* -----------------------------------
 * Field renderer (text/number/select/boolean)
 * ----------------------------------- */
function FieldRenderer({ field, value, onChange }) {
  const type = (field?.type || field?.input_type || 'text').toLowerCase();
  const label = field?.label || field?.name || field?.key || 'Field';

  if (type === 'number') {
    return (
      <label>
        <div>{label}</div>
        <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      </label>
    );
  }

  if (type === 'el_stage') {
    const options = Array.isArray(field?.options) && field.options.length > 0
      ? field.options
      : [
          { value: 'EL-12', label: 'EL-12 (5 leaves separated)' },
          { value: 'EL-15', label: 'EL-15 (8 leaves separated)' },
          { value: 'EL-18', label: 'EL-18 (10 leaves separated)' },
          { value: 'EL-23', label: 'EL-23 (50% caps off)' },
          { value: 'EL-27', label: 'EL-27 (setting)' },
          { value: 'EL-31', label: 'EL-31 (pea-size berries)' },
          { value: 'EL-38', label: 'EL-38 (harvest ripe)' },
        ];
    return (
      <label>
        <div>{label}</div>
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select EL stage —</option>
          {options.map((opt) => {
            const val = opt?.value ?? opt?.key ?? opt;
            const text = opt?.label ?? String(val);
            return <option key={String(val)} value={String(val)}>{text}</option>;
          })}
        </select>
      </label>
    );
  }

  if (type === 'select' || type === 'single-select') {
    const options = Array.isArray(field?.options) ? field.options : [];
    return (
      <label>
        <div>{label}</div>
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {options.map((opt) => {
            const val = opt?.value ?? opt?.key ?? opt;
            const text = opt?.label ?? String(val);
            return <option key={String(val)} value={String(val)}>{text}</option>;
          })}
        </select>
      </label>
    );
  }

  if (type === 'boolean' || type === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }

  // default text
  return (
    <label>
      <div>{label}</div>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
