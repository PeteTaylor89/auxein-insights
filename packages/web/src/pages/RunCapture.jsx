import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { 
  ClipboardList, 
  MapPin, 
  Plus, 
  ArrowLeft, 
  ArrowRight, 
  Trash2, 
  Image as ImageIcon, 
  Save, 
  CheckCircle, 
  Send,
  PlayCircle,
  Lock,
  AlertCircle
} from 'lucide-react';
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
      setSpots(asArray(sp).map(normalizeSpot));
      setBlocks(asArray(blks));
    } catch (e) {
      console.error(e);
      setError('Failed to load run');
    } finally {
      setLoading(false);
    }
  };

  function normalizeSpot(s) {
    if (!s) return s;
    return {
      ...s,
      values: s?.values ?? s?.data_json ?? {}, // defensive: always provide 'values'
      photo_file_ids: s?.photo_file_ids ?? [],          // keep name stable
      _isNew: false,
      _hasUnsavedChanges: false,
    };
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fields = useMemo(() => readTemplateFields(template), [template]);

  const blockMap = useMemo(() => {
    const m = new Map();
    for (const b of asArray(blocks)) {
      m.set(String(b.id), b.name || `Block ${b.id}`);
    }
    return m;
  }, [blocks]);

  const addSpot = () => {
    const tmpId = `tmp-${Date.now()}`;
    const tmp = {
      id: tmpId,
      run_id: Number(id),
      company_id: companyId,
      observed_at: dayjs().toISOString(),
      values: {},
      photo_file_ids: [],
      block_id: run?.block_id, // Pre-populate with run's block
      _isNew: true,
      _hasUnsavedChanges: false, // Track if there are unsaved changes
    };
    setSpots((prev) => [tmp, ...prev]);
  };

  const updateSpot = (idx, patch) => {
    setSpots((prev) =>
      prev.map((s, i) => {
        if (i === idx) {
          const updated = { 
            ...s, 
            ...patch, 
            values: { ...(s.values || {}), ...(patch.values || {}) },
            _hasUnsavedChanges: true // Mark as having unsaved changes
          };
          return updated;
        }
        return s;
      })
    );
  };

  const removeSpot = async (idx) => {
    const s = spots[idx];
    if (!s) return;
    
    if (s._isNew) {
      // Just remove from frontend if it's new
      setSpots((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    
    // Delete from backend if it exists
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
      
      // Use your original payload structure exactly
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

      console.log('Saving spot with payload:', payload);

      let saved;
      if (s._isNew) {
        saved = await observationService.createSpot(Number(id), payload);
      } else {
        saved = await observationService.updateSpot(s.id, payload);
      }
      const serverSpot = (saved && saved.data) ? saved.data : saved;
      const updated = normalizeSpot(serverSpot || s);
      const matchId = s.id;
      setSpots(prev =>
        prev.map(x => (x.id === matchId ? { ...updated, _isNew: false, _hasUnsavedChanges: false } : x))    
      );


    } catch (e) {
      console.error('Failed to save spot:', e);
      const detail = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Failed to save spot';
      alert(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save spot.' : String(detail));
    } finally {
      setBusy(false);
    }
  };

  // FIXED: Auto-save unsaved spots before completing run
  const saveAllUnsavedSpots = async () => {
    const unsavedSpots = spots
      .map((spot, index) => ({ spot, index }))
      .filter(({ spot }) => spot._hasUnsavedChanges || spot._isNew);
    
    if (unsavedSpots.length === 0) {
      return true; // No unsaved spots
    }

    try {
      setBusy(true);
      console.log(`Saving ${unsavedSpots.length} unsaved spots...`);
      
      // Save all unsaved spots
      for (const { spot, index } of unsavedSpots) {
        await saveSpot(index);
      }
      
      return true;
    } catch (e) {
      console.error('Failed to save all spots:', e);
      alert('Failed to save all spots. Please save them manually before completing the run.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitRun = async () => {
    // First, save any unsaved spots
    const allSaved = await saveAllUnsavedSpots();
    if (!allSaved) return;

    try {
      setBusy(true);
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
    // First, save any unsaved spots
    const allSaved = await saveAllUnsavedSpots();
    if (!allSaved) return;

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

  const completeAndStartNext = async () => {
    if (!run?.plan_id) {
      alert('No plan associated with this run - cannot start another.');
      return;
    }

    // First, save any unsaved spots
    const allSaved = await saveAllUnsavedSpots();
    if (!allSaved) return;

    const confirmed = window.confirm(
      'This will complete the current run and start a new one on a different block. Continue?'
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      await observationService.completeRun(id);
      navigate(`/observations/runstart/${run.plan_id}`);
    } catch (e) {
      console.error(e);
      alert('Failed to complete run and start next.');
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (idx, fileList) => {
    const s = spots[idx];
    if (!s || !fileList?.length) return;
    try {
      setBusy(true);
      const uploadedIds = [];
      for (const f of fileList) {
        const fd = new FormData();
        fd.append('file', f);
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

  const isRunCompleted = run?.observed_at_end != null;
  const hasUnsavedSpots = spots.some(s => s._hasUnsavedChanges || s._isNew);

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 1rem' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => {
            if (run?.plan_id) {
              navigate(`/plandetail/${run.plan_id}`);
            } else {
              navigate('/observations');
            }
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={16} /> {run?.plan_id ? 'Back to Plan' : 'Back'}
        </button>
      </div>

      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Run Capture</span>
        {run?.block_id && (
          <span style={{ fontSize: 14, color: '#666' }}>
            - {blockMap.get(String(run.block_id)) || `Block ${run.block_id}`}
          </span>
        )}
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && run && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          {/* Unsaved changes warning */}
          {hasUnsavedSpots && !isRunCompleted && (
            <section className="stat-card" style={{ background: '#fef3c7', border: '1px solid #fbbf24' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} color="#f59e0b" />
                <div style={{ color: '#92400e' }}>
                  You have {spots.filter(s => s._hasUnsavedChanges || s._isNew).length} unsaved spot(s). 
                  Save them individually or they'll be auto-saved when you complete the run.
                </div>
              </div>
            </section>
          )}

          {/* Run header */}
          <section className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{run.name || `Run #${run.id}`}</div>
              <div style={{ color: '#666', marginTop: 4 }}>
                Template: {template?.name || template?.type || template?.observation_type || `#${run.template_id}`}
              </div>
              <div style={{ color: '#666', fontSize: 14, marginTop: 2 }}>
                Started: {run.observed_at_start ? dayjs(run.observed_at_start).format('YYYY-MM-DD HH:mm') : '—'}
                {isRunCompleted && (
                  <> • Completed: {dayjs(run.observed_at_end).format('YYYY-MM-DD HH:mm')}</>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!isRunCompleted && (
                <>
                  <button 
                    className="btn" 
                    onClick={completeRun} 
                    disabled={busy} 
                    style={{ background: '#e0f2fe', color: '#075985', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <CheckCircle size={16} /> Complete
                  </button>
                  <button 
                    className="btn" 
                    onClick={submitRun} 
                    disabled={busy} 
                    style={{ background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Send size={16} /> Submit
                  </button>
                </>
              )}
              {run?.plan_id && (
                <button
                  className="btn"
                  onClick={completeAndStartNext}
                  disabled={busy}
                  style={{ 
                    background: '#059669', 
                    color: '#fff', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: 6 
                  }}
                  title="Complete this run and start another block"
                >
                  <PlayCircle size={16} /> {isRunCompleted ? 'Start Next Block' : 'Complete & Start Next'}
                </button>
              )}
            </div>
          </section>

          <Summary />

          {/* Spots */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin /> Spots ({spots.length})
              </h3>
              {!isRunCompleted && (
                <button 
                  className="btn" 
                  onClick={addSpot} 
                  disabled={busy} 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff' }}
                >
                  <Plus size={16} /> Add Spot
                </button>
              )}
            </div>

            {spots.length === 0 && (
              <div className="stat-card" style={{ color: '#777' }}>
                {isRunCompleted ? 'No spots recorded in this run.' : 'No spots yet—click "Add Spot" to begin.'}
              </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              {spots.map((s, i) => (
                <SpotEditor
                  key={s.id ?? `tmp-${i}`}
                  idx={i}
                  spot={s}
                  fields={fields}
                  blocks={blocks}
                  runBlockId={run.block_id}
                  isRunCompleted={isRunCompleted}
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
 * Enhanced Spot Editor with save status tracking
 * ----------------------------------- */
function SpotEditor({ idx, spot, fields, blocks = [], runBlockId, isRunCompleted, onChange, onSave, onRemove, onUpload, busy }) {
  const values = spot.values || {};
  const hasUnsavedChanges = spot._hasUnsavedChanges || spot._isNew;

  const setValue = (k, v) => {
    onChange(idx, { values: { ...values, [k]: v } });
  };

  const thumb = (fid) => (
    <div key={fid} style={{ width: 64, height: 64, background: '#f3f4f6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <ImageIcon size={20} />
      <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, color: '#6b7280' }}>#{fid}</div>
    </div>
  );

  const isBlockLocked = runBlockId != null;

  return (
    <div 
      className="stat-card" 
      style={{ 
        padding: 16, 
        border: hasUnsavedChanges ? '2px solid #f59e0b' : '1px solid #eee', 
        borderRadius: 12, 
        background: '#fff',
        opacity: isRunCompleted ? 0.8 : 1
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>
          Spot {spot.id?.toString().startsWith('tmp-') ? '(new)' : `#${spot.id}`}
          {hasUnsavedChanges && (
            <span style={{ color: '#f59e0b', fontSize: 12, marginLeft: 8 }}>• Unsaved changes</span>
          )}
          {isRunCompleted && <span style={{ color: '#666', fontSize: 14, marginLeft: 8 }}>(completed)</span>}
        </div>
        {!isRunCompleted && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              className="btn" 
              onClick={() => onSave(idx)} 
              disabled={busy} 
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: 6, 
                background: hasUnsavedChanges ? '#f59e0b' : '#4e638bff', 
                color: '#fff'
              }}
            >
              <Save size={16} /> Save
            </button>
            <button 
              className="btn" 
              onClick={() => onRemove(idx)} 
              disabled={busy} 
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#7f1d1d' }}
            >
              <Trash2 size={16} /> Remove
            </button>
          </div>
        )}
      </div>

      {/* Basic meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <label>
          <div>Observed at</div>
          <input
            type="datetime-local"
            value={spot.observed_at ? dayjs(spot.observed_at).format('YYYY-MM-DDTHH:mm') : ''}
            onChange={(e) => onChange(idx, { observed_at: new Date(e.target.value).toISOString() })}
            disabled={isRunCompleted}
          />
        </label>

        <label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Block
            {isBlockLocked && <Lock size={14} color="#6b7280" />}
          </div>
          <select
            value={spot.block_id || runBlockId || ''}
            onChange={(e) => onChange(idx, { block_id: e.target.value })}
            disabled={isBlockLocked || isRunCompleted}
            style={{ 
              opacity: isBlockLocked ? 0.6 : 1,
              cursor: isBlockLocked ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">— Select block —</option>
            {(Array.isArray(blocks) ? blocks : []).map(b => (
              <option key={b.id} value={b.id}>{b.name || `Block ${b.id}`}</option>
            ))}
          </select>
          {isBlockLocked && (
            <small style={{ color: '#6b7280', fontSize: 11 }}>
              Block locked to maintain run integrity
            </small>
          )}
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginTop: 12 }}>
        <label>
          <div>Latitude</div>
          <input
            placeholder="-41.28"
            value={spot.latitude ?? ''}
            onChange={(e) => onChange(idx, { latitude: e.target.value })}
            disabled={isRunCompleted}
          />
        </label>
        <label>
          <div>Longitude</div>
          <input
            placeholder="174.77"
            value={spot.longitude ?? ''}
            onChange={(e) => onChange(idx, { longitude: e.target.value })}
            disabled={isRunCompleted}
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
            disabled={isRunCompleted}
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
          {!isRunCompleted && (
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onUpload(idx, e.target.files)}
            />
          )}
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
          <FieldRenderer 
            key={f.key || f.name} 
            field={f} 
            value={values[f.key || f.name]} 
            onChange={(v) => setValue(f.key || f.name, v)}
            disabled={isRunCompleted}
          />
        ))}
      </div>
    </div>
  );
}

/* -----------------------------------
 * Field renderer
 * ----------------------------------- */
function FieldRenderer({ field, value, onChange, disabled = false }) {
  const type = (field?.type || field?.input_type || 'text').toLowerCase();
  const label = field?.label || field?.name || field?.key || 'Field';

  if (type === 'number') {
    return (
      <label>
        <div>{label}</div>
        <input 
          type="number" 
          value={value ?? ''} 
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} 
          disabled={disabled}
        />
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
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
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
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
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
        <input 
          type="checkbox" 
          checked={!!value} 
          onChange={(e) => onChange(e.target.checked)} 
          disabled={disabled}
        />
        <span>{label}</span>
      </label>
    );
  }

  // default text
  return (
    <label>
      <div>{label}</div>
      <input 
        value={value ?? ''} 
        onChange={(e) => onChange(e.target.value)} 
        disabled={disabled}
      />
    </label>
  );
}