import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import {
  ClipboardList,
  MapPin,
  Plus,
  ArrowLeft,
  CheckCircle,
  Send,
  PlayCircle,
  AlertCircle,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Trash2,
  Lock,
  Save
} from 'lucide-react';
import { observationService, authService, api, blocksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import SpotLocationMap from '../components/SpotLocationMap';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = 'pk.eyJ1IjoicGV0ZXRheWxvciIsImEiOiJjbTRtaHNxcHAwZDZ4MmxwbjZkeXNneTZnIn0.RJ9B3Q3-t_-gFrEkgshH9Q';

// Helpers
const asArray = (v) => Array.isArray(v) ? v : (v?.items ?? v?.results ?? v?.data ?? []);
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

// Unified file service
const filesApi = {
  async uploadToSpot(spotId, file, category, onProgress) {
    const formData = new FormData();
    formData.append('entity_type', 'observation_spot');
    formData.append('entity_id', spotId);
    formData.append('file_category', category);
    formData.append('description', `${category} upload: ${file.name}`);
    formData.append('file', file);

    return await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (!onProgress || !evt.total) return;
        onProgress(Math.round((evt.loaded * 100) / evt.total));
      }
    });
  },

  async listForSpot(spotId, category) {
    const res = await api.get(`/files/entity/observation_spot/${spotId}?file_category=${encodeURIComponent(category)}`);
    return res.data || [];
  },

  async delete(fileId) {
    return await api.delete(`/files/${fileId}`);
  },

  async downloadBlob(fileId) {
    const res = await api.get(`/files/${fileId}/download`, { responseType: 'blob' });
    return res.data;
  }
};

function readTemplateFields(template) {
  if (!template) return [];
  let raw = template.field_schema ?? template?.schema?.fields ?? template?.schema ?? template.fields_json ?? [];
  if (Array.isArray(raw)) return raw;
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

  const [uploadingPhoto, setUploadingPhoto] = useState({});
  const [uploadingVideo, setUploadingVideo] = useState({});
  const [uploadingDoc, setUploadingDoc] = useState({});

  const fields = useMemo(() => readTemplateFields(template), [template]);
  const blockMap = useMemo(() => {
    const m = new Map();
    for (const b of asArray(blocks)) m.set(String(b.id), b.name || `Block ${b.id}`);
    return m;
  }, [blocks]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const r = await observationService.getRun(id);
      const tpl = r?.template || (r?.template_id ? await observationService.getTemplate(r.template_id) : null);
      const sp = await observationService.listSpotsForRun(id);
      const blks = await blocksService.getCompanyBlocks().catch(() => []);

      setRun(r);
      setTemplate(tpl || null);
      setBlocks(asArray(blks));

      const normalized = await Promise.all(
        asArray(sp).map(async (spot) => {
          const n = normalizeSpot(spot);
          if (!n._isNew && n.id) {
            try {
              const [photos, videos, documents] = await Promise.all([
                filesApi.listForSpot(n.id, 'photo'),
                filesApi.listForSpot(n.id, 'video'),
                filesApi.listForSpot(n.id, 'document')
              ]);

              const withPhotoUrls = await Promise.all(
                photos.map(async (p) => {
                  try {
                    const blob = await filesApi.downloadBlob(p.id);
                    return { ...p, blob_url: URL.createObjectURL(blob) };
                  } catch { return { ...p, blob_url: null }; }
                })
              );
              const withVideoUrls = await Promise.all(
                videos.map(async (v) => {
                  try {
                    const blob = await filesApi.downloadBlob(v.id);
                    return { ...v, blob_url: URL.createObjectURL(blob) };
                  } catch { return { ...v, blob_url: null }; }
                })
              );

              n.photos = withPhotoUrls;
              n.videos = withVideoUrls;
              n.documents = documents;
              n.photo_file_ids = withPhotoUrls.map((x) => x.id);
              n.video_file_ids = withVideoUrls.map((x) => x.id);
              n.document_file_ids = documents.map((x) => x.id);
            } catch (e) {
              console.warn('Failed to load media for spot', n.id, e);
              n.photos = []; n.videos = []; n.documents = [];
            }
          }
          return n;
        })
      );
      setSpots(normalized);
    } catch (e) {
      console.error(e);
      setError('Failed to load run');
    } finally {
      setLoading(false);
    }
  }

  function normalizeSpot(s) {
    if (!s) return s;
    return {
      ...s,
      values: s?.values ?? s?.data_json ?? {},
      photos: [], videos: [], documents: [],
      photo_file_ids: s?.photo_file_ids ?? [],
      video_file_ids: s?.video_file_ids ?? [],
      document_file_ids: s?.document_file_ids ?? [],
      _isNew: false,
      _hasUnsavedChanges: false
    };
  }

  const isRunCompleted = run?.observed_at_end != null;
  const hasUnsavedSpots = spots.some((s) => s._hasUnsavedChanges || s._isNew);

  const addSpot = () => {
    const tmpId = `tmp-${Date.now()}`;
    const tmp = {
      id: tmpId,
      run_id: Number(id),
      company_id: companyId,
      observed_at: dayjs().toISOString(),
      values: {},
      photos: [], videos: [], documents: [],
      photo_file_ids: [], video_file_ids: [], document_file_ids: [],
      block_id: run?.block_id,
      _isNew: true,
      _hasUnsavedChanges: false
    };
    setSpots((prev) => [tmp, ...prev]);
  };

  const updateSpot = (idx, patch) => {
    setSpots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch, values: { ...(s.values || {}), ...(patch.values || {}) }, _hasUnsavedChanges: true } : s))
    );
  };

  const removeSpot = async (idx) => {
    const s = spots[idx];
    if (!s) return;
    if (s._isNew) return setSpots((prev) => prev.filter((_, i) => i !== idx));
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
        video_file_ids: s.video_file_ids || [],
        document_file_ids: s.document_file_ids || [],
        block_id: s.block_id ? Number(s.block_id) : null,
        row_id: s.row_id ? Number(s.row_id) : null,
        latitude: typeof s.latitude === 'string' ? Number(s.latitude) : s.latitude ?? null,
        longitude: typeof s.longitude === 'string' ? Number(s.longitude) : s.longitude ?? null
      };

      let saved;
      if (s._isNew) saved = await observationService.createSpot(Number(id), payload);
      else saved = await observationService.updateSpot(s.id, payload);

      const serverSpot = (saved && saved.data) ? saved.data : saved;
      const updated = normalizeSpot(serverSpot || s);

      if (!updated._isNew && updated.id) {
        try {
          const [photos, videos, documents] = await Promise.all([
            filesApi.listForSpot(updated.id, 'photo'),
            filesApi.listForSpot(updated.id, 'video'),
            filesApi.listForSpot(updated.id, 'document')
          ]);
          const withPhotoUrls = await Promise.all(photos.map(async (p) => {
            try { const blob = await filesApi.downloadBlob(p.id); return { ...p, blob_url: URL.createObjectURL(blob) }; }
            catch { return { ...p, blob_url: null }; }
          }));
          const withVideoUrls = await Promise.all(videos.map(async (v) => {
            try { const blob = await filesApi.downloadBlob(v.id); return { ...v, blob_url: URL.createObjectURL(blob) }; }
            catch { return { ...v, blob_url: null }; }
          }));
          updated.photos = withPhotoUrls;
          updated.videos = withVideoUrls;
          updated.documents = documents;
          updated.photo_file_ids = withPhotoUrls.map((x) => x.id);
          updated.video_file_ids = withVideoUrls.map((x) => x.id);
          updated.document_file_ids = documents.map((x) => x.id);
        } catch (e) {
          console.warn('Failed to reload media after save', e);
        }
      }

      const matchId = s.id;
      setSpots((prev) => prev.map((x) => (x.id === matchId ? { ...updated, _isNew: false, _hasUnsavedChanges: false } : x)));
    } catch (e) {
      console.error('Failed to save spot:', e);
      const detail = e?.response?.data?.detail || e?.response?.data?.message || e?.message || 'Failed to save spot';
      alert(Array.isArray(detail) ? detail[0]?.msg || 'Failed to save spot' : detail);
    } finally {
      setBusy(false);
    }
  };

  const saveAllUnsavedSpots = async () => {
    const toSave = spots.map((s, i) => ({ s, i })).filter(({ s }) => s._hasUnsavedChanges || s._isNew);
    if (toSave.length === 0) return true;
    try {
      setBusy(true);
      for (const { i } of toSave) {
        // eslint-disable-next-line no-await-in-loop
        await saveSpot(i);
      }
      return true;
    } catch (e) {
      console.error(e);
      alert('Some spots failed to save. Please save them manually before completing the run.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const completeRun = async () => {
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

  const submitRun = async () => {
    const allSaved = await saveAllUnsavedSpots();
    if (!allSaved) return;
    try {
      setBusy(true);
      await observationService.updateRun(id, { status: 'completed', completed_at: new Date().toISOString() });
      await load();
      alert('Run submitted as completed.');
    } catch (e) {
      console.error(e);
      alert('Failed to submit run.');
    } finally {
      setBusy(false);
    }
  };

  const completeAndStartNext = async () => {
    if (!run?.plan_id) return alert('No plan associated with this run - cannot start another.');
    const allSaved = await saveAllUnsavedSpots();
    if (!allSaved) return;
    const confirmed = window.confirm('This will complete the current run and start a new one on a different block. Continue?');
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

  const refreshSpotMedia = async (spotId) => {
    try {
      const [photos, videos, documents] = await Promise.all([
        filesApi.listForSpot(spotId, 'photo'),
        filesApi.listForSpot(spotId, 'video'),
        filesApi.listForSpot(spotId, 'document')
      ]);
      const withPhotoUrls = await Promise.all(photos.map(async (p) => {
        try { const blob = await filesApi.downloadBlob(p.id); return { ...p, blob_url: URL.createObjectURL(blob) }; }
        catch { return { ...p, blob_url: null }; }
      }));
      const withVideoUrls = await Promise.all(videos.map(async (v) => {
        try { const blob = await filesApi.downloadBlob(v.id); return { ...v, blob_url: URL.createObjectURL(blob) }; }
        catch { return { ...v, blob_url: null }; }
      }));
      setSpots((prev) =>
        prev.map((s) =>
          s.id === spotId ? {
            ...s,
            photos: withPhotoUrls,
            videos: withVideoUrls,
            documents,
            photo_file_ids: withPhotoUrls.map((x) => x.id),
            video_file_ids: withVideoUrls.map((x) => x.id),
            document_file_ids: documents.map((x) => x.id)
          } : s
        )
      );
    } catch (e) {
      console.warn('Failed to refresh media:', e);
    }
  };

  const handleUploadByCategory = async (spot, files, category, setUploadingMap) => {
    if (!spot || !files?.length) return;
    if (spot._isNew) {
      const idx = spots.findIndex((x) => x.id === spot.id);
      await saveSpot(idx);
      const saved = spots[idx];
      if (saved._isNew) {
        alert('Please save the spot first before uploading files.');
        return;
      }
    }

    const idx = spots.findIndex((x) => x.id === spot.id);
    setUploadingMap((p) => ({ ...p, [idx]: true }));
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.size > MAX_FILE_BYTES) {
          alert(`${f.name} exceeds 50MB limit`);
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await filesApi.uploadToSpot(spot.id, f, category);
      }
      await refreshSpotMedia(spot.id);
    } catch (e) {
      console.error('Upload failed:', e);
      alert(`${category} upload failed: ` + (e?.message || 'Error'));
    } finally {
      setUploadingMap((p) => ({ ...p, [idx]: false }));
    }
  };

  const deleteFileAndRefresh = async (spotId, fileId) => {
    try {
      await filesApi.delete(fileId);
      await refreshSpotMedia(spotId);
    } catch (e) {
      console.error('Failed to delete file', e);
      alert('Failed to delete file: ' + e.message);
    }
  };

  const downloadFile = async (fileId, filename) => {
    try {
      const blob = await filesApi.downloadBlob(fileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 1rem' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn" onClick={() => { if (run?.plan_id) navigate(`/plandetail/${run.plan_id}`); else navigate('/observations'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> {run?.plan_id ? 'Back to Plan' : 'Back'}
        </button>
      </div>

      <div className="container-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList /> <span>Run Capture</span>
        {run?.block_id && <span style={{ fontSize: 14, color: '#666' }}>- {blockMap.get(String(run.block_id)) || `Block ${run.block_id}`}</span>}
      </div>

      {loading && <div className="stat-card">Loading…</div>}
      {error && <div className="stat-card" style={{ borderColor: 'red' }}>{error}</div>}

      {!loading && !error && run && (
        <div className="grid" style={{ display: 'grid', gap: 16 }}>
          {hasUnsavedSpots && !isRunCompleted && (
            <section className="stat-card" style={{ background: '#fef3c7', border: '1px solid #fbbf24' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} color="#f59e0b" />
                <div style={{ color: '#92400e' }}>
                  You have {spots.filter((s) => s._hasUnsavedChanges || s._isNew).length} unsaved spot(s). Save them individually or they'll be auto-saved when you complete the run.
                </div>
              </div>
            </section>
          )}

          <section className="stat-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{run.name || `Run #${run.id}`}</div>
              <div style={{ color: '#666', marginTop: 4 }}>Template: {template?.name || template?.type || template?.observation_type || `#${run.template_id}`}</div>
              <div style={{ color: '#666', fontSize: 14, marginTop: 2 }}>
                Started: {run.observed_at_start ? dayjs(run.observed_at_start).format('YYYY-MM-DD HH:mm') : '—'}
                {isRunCompleted && <> • Completed: {dayjs(run.observed_at_end).format('YYYY-MM-DD HH:mm')}</>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!isRunCompleted && (
                <>
                  <button className="btn" onClick={completeRun} disabled={busy} style={{ background: '#e0f2fe', color: '#075985', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle size={16} /> Complete
                  </button>
                  <button className="btn" onClick={submitRun} disabled={busy} style={{ background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Send size={16} /> Submit
                  </button>
                </>
              )}
              {run?.plan_id && (
                <button className="btn" onClick={completeAndStartNext} disabled={busy} style={{ background: '#059669', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Complete this run and start another block">
                  <PlayCircle size={16} /> {isRunCompleted ? 'Start Next Block' : 'Complete & Start Next'}
                </button>
              )}
            </div>
          </section>

          <Summary run={run} />

          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><MapPin /> Spots ({spots.length})</h3>
              {!isRunCompleted && (
                <button className="btn" onClick={addSpot} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff' }}>
                  <Plus size={16} /> Add Spot
                </button>
              )}
            </div>

            {spots.length === 0 && (
              <div className="stat-card" style={{ color: '#777' }}>{isRunCompleted ? 'No spots recorded in this run.' : 'No spots yet—click "Add Spot" to begin.'}</div>
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
                  template={template}
                  isRunCompleted={isRunCompleted}
                  onChange={updateSpot}
                  onSave={saveSpot}
                  onRemove={removeSpot}
                  uploadingPhoto={!!uploadingPhoto[i]}
                  uploadingVideo={!!uploadingVideo[i]}
                  uploadingDoc={!!uploadingDoc[i]}
                  onUploadPhotos={(spot, files) => handleUploadByCategory(spot, files, 'photo', setUploadingPhoto)}
                  onUploadVideos={(spot, files) => handleUploadByCategory(spot, files, 'video', setUploadingVideo)}
                  onUploadDocuments={(spot, files) => handleUploadByCategory(spot, files, 'document', setUploadingDoc)}
                  onDeleteFile={deleteFileAndRefresh}
                  onDownloadFile={downloadFile}
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

function Summary({ run }) {
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
}

/**
 * Spot Editor with media & phenology helpers
 */
function SpotEditor({ idx, spot, fields, blocks = [], runBlockId, template, isRunCompleted, onChange, onSave, onRemove, uploadingPhoto, uploadingVideo, uploadingDoc, onUploadPhotos, onUploadVideos, onUploadDocuments, onDeleteFile, onDownloadFile, busy }) {
  const filePhotoRef = useRef(null);
  const fileVideoRef = useRef(null);
  const fileDocRef = useRef(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showLocationMap, setShowLocationMap] = useState(false);

  const values = spot.values || {};
  const hasUnsavedChanges = spot._hasUnsavedChanges || spot._isNew;
  const isLocked = runBlockId != null;

  const setValue = (k, v) => onChange(idx, { values: { ...(values || {}), [k]: v } });

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange(idx, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setGettingLocation(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        alert(`Failed to get location: ${error.message}`);
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handleLocationFromMap = (coords) => {
    onChange(idx, {
      latitude: coords.latitude,
      longitude: coords.longitude
    });
  };

  return (
    <div className="stat-card" style={{ padding: 16, border: hasUnsavedChanges ? '2px solid #f59e0b' : '1px solid #eee', borderRadius: 12, background: '#fff', opacity: isRunCompleted ? 0.9 : 1 }}>
      <div style={{ display: 'grid', gap: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>Spot {spot.id?.toString().startsWith('tmp-') ? '(unsaved)' : `#${spot.id}`}</span>
            {isLocked && <span title="Block locked" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6b7280' }}><Lock size={14} /></span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isRunCompleted && (
              <>
                <button className="btn" onClick={() => onSave(idx)} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Save size={16} /> Save
                </button>
                <button className="btn" onClick={() => onRemove(idx)} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#991b1b' }}>
                  <Trash2 size={16} /> Remove
                </button>
              </>
            )}
          </div>
        </div>

        {/* GPS Coordinates Section */}
        <div style={{ 
          padding: 12, 
          background: '#f0f9ff', 
          border: '1px solid #bae6fd', 
          borderRadius: 8 
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={16} color="#0284c7" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0c4a6e' }}>
                Location
              </span>
            </div>
            {!isRunCompleted && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  type="button"
                  className="btn"
                  onClick={getCurrentLocation}
                  disabled={gettingLocation || busy}
                  style={{ 
                    fontSize: 12,
                    padding: '4px 8px',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: gettingLocation || busy ? 'not-allowed' : 'pointer'
                  }}
                >
                  {gettingLocation ? 'Getting...' : '📍 Current'}
                </button>
                <button 
                  type="button"
                  className="btn"
                  onClick={() => setShowLocationMap(true)}
                  disabled={busy}
                  style={{ 
                    fontSize: 12,
                    padding: '4px 8px',
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: busy ? 'not-allowed' : 'pointer'
                  }}
                >
                  🗺️ Map
                </button>
              </div>
            )}
          </div>
          
          {/* Show location status or coordinates */}
          {spot.latitude && spot.longitude ? (
            <div style={{
              background: '#dcfce7',
              border: '1px solid #22c55e',
              borderRadius: '6px',
              padding: '8px 12px',
              marginBottom: 8
            }}>
              <div style={{ fontWeight: 500, color: '#166534', fontSize: 13, marginBottom: 2 }}>
                ✅ Location Set
              </div>
              <div style={{ fontSize: 12, color: '#166534' }}>
                Coordinates: {spot.latitude.toFixed(6)}, {spot.longitude.toFixed(6)}
              </div>
            </div>
          ) : (
            <div style={{
              fontSize: 12,
              color: '#6b7280',
              marginBottom: 8,
              padding: '8px 12px',
              background: 'white',
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              No location set. Click "Current" or "Map" to add a location.
            </div>
          )}
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: 8 
          }}>
            <label>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Latitude</div>
              <input 
                type="number" 
                step="any"
                value={spot.latitude ?? ''} 
                onChange={(e) => onChange(idx, { latitude: e.target.value ? Number(e.target.value) : null })}
                disabled={isRunCompleted}
                placeholder="-41.2865"
                style={{ 
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #d1d5db',
                  borderRadius: '4px'
                }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Longitude</div>
              <input 
                type="number" 
                step="any"
                value={spot.longitude ?? ''} 
                onChange={(e) => onChange(idx, { longitude: e.target.value ? Number(e.target.value) : null })}
                disabled={isRunCompleted}
                placeholder="174.7762"
                style={{ 
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #d1d5db',
                  borderRadius: '4px'
                }}
              />
            </label>
          </div>
        </div>

        {/* Location Map Modal */}
        {showLocationMap && (
          <SpotLocationMap
            isOpen={showLocationMap}
            onClose={() => setShowLocationMap(false)}
            onLocationSet={handleLocationFromMap}
            initialCoordinates={spot.latitude && spot.longitude ? { latitude: spot.latitude, longitude: spot.longitude } : null}
          />
        )}

        {/* Dynamic fields */}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {fields.map((f) => (
            <FieldRenderer key={String(f.key || f.name)} field={f} value={values?.[f.key || f.name]} onChange={(v) => setValue(f.key || f.name, v)} disabled={isRunCompleted} template={template} />
          ))}
        </div>

        {/* Photos */}
        <MediaSection title="Photos" icon={<ImageIcon size={16} />} disabled={isRunCompleted} accept="image/*" inputRef={filePhotoRef} onPick={(files) => onUploadPhotos(spot, files)} uploading={uploadingPhoto} content={<PhotoGallery photos={spot.photos} disabled={isRunCompleted} onDelete={(fileId) => onDeleteFile(spot.id, fileId)} />} />

        {/* Videos */}
        <MediaSection title="Videos" icon={<VideoIcon size={16} />} disabled={isRunCompleted} accept="video/*" inputRef={fileVideoRef} onPick={(files) => onUploadVideos(spot, files)} uploading={uploadingVideo} content={<VideoList items={spot.videos} disabled={isRunCompleted} onDownload={onDownloadFile} onDelete={(fileId) => onDeleteFile(spot.id, fileId)} />} />

        {/* Documents */}
        <MediaSection title="Documents" icon={<FileText size={16} />} disabled={isRunCompleted} accept=".pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.csv" inputRef={fileDocRef} onPick={(files) => onUploadDocuments(spot, files)} uploading={uploadingDoc} content={<DocumentList items={spot.documents} disabled={isRunCompleted} onDownload={onDownloadFile} onDelete={(fileId) => onDeleteFile(spot.id, fileId)} />} />
      </div>
    </div>
  );
}

function MediaSection({ title, icon, disabled, accept, inputRef, onPick, uploading, content }) {
  return (
    <div className="spot-section">
      <div className="spot-section__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>{icon} {title}</h4>
        {!disabled && (
          <>
            <input ref={inputRef} type="file" accept={accept} multiple style={{ display: 'none' }} onChange={(e) => onPick(Array.from(e.target.files || []))} />
            <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : `Add ${title}`}
            </button>
          </>
        )}
      </div>
      <div style={{ marginTop: 8 }}>{content}</div>
    </div>
  );
}

function PhotoGallery({ photos, onDelete, disabled }) {
  const [enlargedPhoto, setEnlargedPhoto] = useState(null);

  useEffect(() => {
    if (!enlargedPhoto) return;
    const onEsc = (e) => e.key === 'Escape' && setEnlargedPhoto(null);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = origOverflow;
    };
  }, [enlargedPhoto]);

  if (!photos?.length) return <div className="spot-empty">No photos uploaded</div>;

  const modalContent = enlargedPhoto ? (
    <div 
      role="dialog" 
      aria-modal="true" 
      style={{ 
        position: 'fixed', 
        inset: 0, 
        background: 'rgba(0,0,0,0.9)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: 20, 
        zIndex: 9999,
        overflow: 'auto'
      }} 
      onClick={(e) => e.target === e.currentTarget && setEnlargedPhoto(null)}
    >
      <div 
        style={{ 
          position: 'relative', 
          maxWidth: '90vw', 
          maxHeight: '90vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <img 
          src={enlargedPhoto.blob_url} 
          alt={enlargedPhoto.description || 'Observation photo'} 
          style={{ 
            maxWidth: '90vw', 
            maxHeight: '90vh', 
            width: 'auto',
            height: 'auto',
            objectFit: 'contain', 
            borderRadius: 8,
            display: 'block'
          }} 
        />
        <button 
          onClick={() => setEnlargedPhoto(null)} 
          style={{ 
            position: 'absolute', 
            top: -15, 
            right: -15, 
            width: 40, 
            height: 40, 
            backgroundColor: '#dc2626', 
            color: 'white', 
            border: 'none', 
            borderRadius: '50%', 
            fontSize: 20, 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            zIndex: 10000
          }}
        >
          ×
        </button>
        <div 
          style={{ 
            position: 'absolute', 
            bottom: -50, 
            left: '50%', 
            transform: 'translateX(-50%)', 
            background: 'rgba(0,0,0,0.8)', 
            color: 'white', 
            padding: '8px 16px', 
            borderRadius: 6, 
            fontSize: 14, 
            whiteSpace: 'nowrap',
            maxWidth: '90vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {enlargedPhoto.original_filename} ({Math.round(enlargedPhoto.file_size / 1024)}KB)
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {photos.map((photo) => (
          <div key={photo.id} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            {photo.blob_url ? (
              <img src={photo.blob_url} alt={photo.description || 'Observation photo'} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} onClick={() => setEnlargedPhoto(photo)} title="Click to enlarge" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f3f4f6', color: '#6b7280', fontSize: 12 }}>Failed to load</div>
            )}
            {!disabled && (
              <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete this photo?`)) onDelete(photo.id); }} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(220, 38, 38, 0.8)', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer' }} title="Delete photo">×</button>
            )}
            <div style={{ position: 'absolute', bottom: 2, left: 2, fontSize: 10, color: 'white', background: 'rgba(0,0,0,0.6)', padding: '2px 4px', borderRadius: 2 }}>
              {Math.round((photo.file_size || 0) / 1024)}KB
            </div>
          </div>
        ))}
      </div>
      {modalContent && createPortal(modalContent, document.body)}
    </>
  );
}

function VideoList({ items, onDownload, onDelete, disabled }) {
  if (!items?.length) return <div className="spot-empty">No videos uploaded</div>;
  return (
    <div className="spot-videos-grid" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((v) => (
        <div key={v.id} className="spot-video-item" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
          <div className="spot-video-thumb" style={{ width: 240, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 6, overflow: 'hidden' }}>
            {v.blob_url ? (
              <video src={v.blob_url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280' }}>
                <VideoIcon size={16} /> {v.original_filename || 'Video'}
              </div>
            )}
          </div>
          <div className="spot-file-actions" style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => onDownload(v.id, v.original_filename)}>Download</button>
            {!disabled && <button type="button" className="danger" onClick={() => onDelete(v.id)}>Delete</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentList({ items, onDownload, onDelete, disabled }) {
  if (!items?.length) return <div className="spot-empty">No documents uploaded</div>;
  return (
    <div className="spot-docs-list" style={{ display: 'grid', gap: 6 }}>
      {items.map((d) => (
        <div key={d.id} className="spot-doc-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
          <div className="spot-doc-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} />
            <div>
              <div className="spot-doc-name" style={{ fontWeight: 600 }}>{d.original_filename || 'Document'}</div>
              <div className="spot-doc-sub" style={{ color: '#6b7280', fontSize: 12 }}>
                {d.mime_type || 'unknown'}{d.file_size ? ` • ${(d.file_size / 1024).toFixed(0)} KB` : ''}
              </div>
            </div>
          </div>
          <div className="spot-file-actions" style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => onDownload(d.id, d.original_filename)}>Download</button>
            {!disabled && <button type="button" className="danger" onClick={() => onDelete(d.id)}>Delete</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Field Renderer with EL Phenology Support
 */
function FieldRenderer({ field, value, onChange, disabled = false, template }) {
  const type = (field?.type || field?.input_type || 'text').toLowerCase();
  const label = field?.label || field?.name || field?.key || 'Field';

  const optionsCatalog = String(field?.options_source?.catalog || '').toLowerCase();
  const isElStageCatalog = optionsCatalog === 'el_stage';
  const isElStageFieldName = /^(el[_-]?stage)$/i.test(field?.name || field?.key || '');
  const isExplicitPhenologyType = type === 'phenology';
  const isPhenologyField = isElStageCatalog || isElStageFieldName || isExplicitPhenologyType;
  const showPhenologyGuides = isPhenologyField;

  const [elStages, setElStages] = useState([]);
  const [selectedStage, setSelectedStage] = useState(null);
  const [loadingStages, setLoadingStages] = useState(false);

  useEffect(() => {
    if (isPhenologyField) {
      loadElStages();
    }
  }, [isPhenologyField]);

  useEffect(() => {
    if (value && elStages.length > 0) {
      setSelectedStage(elStages.find(s => s.key === value) || null);
    } else {
      setSelectedStage(null);
    }
  }, [value, elStages]);

  const loadElStages = async () => {
    try {
      setLoadingStages(true);
      const res = await api.get('/observations/api/reference/el-stages');
      setElStages(res.data);
    } catch (error) {
      console.error('Failed to load EL stages:', error);
    } finally {
      setLoadingStages(false);
    }
  };

  if (isPhenologyField && (type === 'phenology' || type === 'select' || type === 'single-select')) {
    const options = Array.isArray(field?.options) && field.options.length > 0 ? field.options : elStages.map(s => ({ value: s.key, label: s.label }));
    const helperFiles = Array.isArray(selectedStage?.files_assoc) ? selectedStage.files_assoc : (Array.isArray(selectedStage?.images) ? selectedStage.images : []);

    return (
      <div>
        <label>
          <div>{field?.label || 'E–L Stage'}</div>
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled || loadingStages}>
            <option value="">— Select EL stage —</option>
            {options.map(opt => {
              const v = opt?.value ?? opt?.key ?? opt;
              const text = opt?.label ?? String(v);
              return <option key={String(v)} value={String(v)}>{text}</option>;
            })}
          </select>
        </label>

        {showPhenologyGuides && selectedStage?.description && (
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, padding: 8, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
            {selectedStage.description}
          </div>
        )}

        {showPhenologyGuides && helperFiles.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Reference Files:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {helperFiles.map(link => <HelperFile key={link.id} fileLink={link} />)}
            </div>
          </div>
        )}

        {showPhenologyGuides && selectedStage && helperFiles.length === 0 && (
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8, padding: 8, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', fontStyle: 'italic' }}>
            No reference files available for this stage.
          </div>
        )}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <label>
        <div>{label}</div>
        <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} disabled={disabled} />
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
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span>{label}</span>
      </label>
    );
  }

  return (
    <label>
      <div>{label}</div>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </label>
  );
}

/**
 * Helper File Component for EL Stage References
 */
function HelperFile({ fileLink }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [mime, setMime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const resp = await api.get(`/files/${fileLink.file_id}/download`, { responseType: 'blob' });
        if (cancelled) return;
        const url = URL.createObjectURL(resp.data);
        setBlobUrl(url);
        setMime(resp?.data?.type || null);
      } catch (err) {
        console.error('[HelperFile] failed to fetch file', fileLink.file_id, err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [fileLink.file_id]);

  if (loading) {
    return (
      <div style={{ width: 84, height: 84, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#6b7280' }}>
        Loading…
      </div>
    );
  }

  const isImage = typeof mime === 'string' && mime.startsWith('image/');
  const caption = fileLink.caption || 'Reference file';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={() => isImage ? setOpen(true) : window.open(blobUrl, '_blank')} title={caption} style={{ width: 84, height: 84, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: 2, cursor: 'pointer', overflow: 'hidden' }}>
        {isImage ? (
          <img src={blobUrl} alt={caption} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 12, color: '#6b7280' }}>View file</div>
        )}
      </button>

      {blobUrl && (
        <a href={blobUrl} download={caption.replace(/\s+/g, '_')} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>
          Download
        </a>
      )}

      {open && isImage && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 9999, padding: 16 }}>
          <img src={blobUrl} alt={caption} style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, background: '#fff' }} />
        </div>
      )}
    </div>
  );
}