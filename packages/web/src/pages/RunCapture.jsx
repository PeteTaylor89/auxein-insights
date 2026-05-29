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
  AlertCircle,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Trash2,
  Lock,
  Save,
  Upload,
  Download,
  Maximize2,
  X as XIcon,
  BarChart3,
  AlertOctagon
} from 'lucide-react';
import { observationService, authService, api, blocksService } from '@vineyard/shared';
import SpotLocationMap from '../components/SpotLocationMap';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './vineyard-pages.css';

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

  const [runLabConfig, setRunLabConfig] = useState({
    analyses_requested: [],
    harvest_date: '',
    collected_by: '',
    lab_ref: ''
  });
  const runLabReportRef = useRef(null);

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

      if (r?.metadata_json?.lab_config) {
        setRunLabConfig(r.metadata_json.lab_config);
      }

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

  const saveRunLabConfig = async (config) => {
    try {
      setBusy(true);
      await observationService.updateRun(id, {
        metadata_json: {
          ...(run.metadata_json || {}),
          lab_config: config
        }
      });
      setRunLabConfig(config);
      // Reload to get updated run
      const r = await observationService.getRun(id);
      setRun(r);
    } catch (e) {
      console.error('Failed to save lab config', e);
      alert('Failed to save lab configuration');
    } finally {
      setBusy(false);
    }
  };

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

  const handleRunLabReportUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Upload to first spot
    const firstSpot = spots[0];
    if (!firstSpot || firstSpot._isNew) {
      alert('Please save at least one sample before uploading the lab report');
      return;
    }

    try {
      setBusy(true);
      await filesApi.uploadToSpot(firstSpot.id, file, 'document');
      await refreshSpotMedia(firstSpot.id);
      alert('Lab report uploaded successfully!');
    } catch (e) {
      console.error('Upload failed:', e);
      alert('Failed to upload lab report: ' + (e?.message || 'Error'));
    } finally {
      setBusy(false);
      // Clear input
      if (runLabReportRef.current) {
        runLabReportRef.current.value = '';
      }
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
    <div className="vp-container" style={{ maxWidth: 1100, paddingTop: '5rem' }}>
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
        <button className="vp-back" onClick={() => navigate('/observations?tab=runs')}>
          <ArrowLeft size={16} /> Back to Observations
        </button>
      </div>

      <div className="vp-card-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <ClipboardList /> <span>Run Capture</span>
          {run?.block_id && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>- {blockMap.get(String(run.block_id)) || `Block ${run.block_id}`}</span>}
        </h1>
      </div>

      {loading && <div className="vp-loading">Loading…</div>}
      {error && <div className="vp-error-alert">{error}</div>}

      {!loading && !error && run && (
        <div style={{ display: 'grid', gap: 'var(--space-base)' }}>
          {hasUnsavedSpots && !isRunCompleted && (
            <section className="vp-warning-banner" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <AlertCircle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              <div>
                You have {spots.filter((s) => s._hasUnsavedChanges || s._isNew).length} unsaved spot(s). Save them individually or they'll be auto-saved when you complete the run.
              </div>
            </section>
          )}

          <section className="vp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
            <div>
              <div className="vp-card-title">{run.name || `Run #${run.id}`}</div>
              <div style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-xs)' }}>Template: {template?.name || template?.type || template?.observation_type || `#${run.template_id}`}</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: 2 }}>
                Started: {run.observed_at_start ? dayjs(run.observed_at_start).format('YYYY-MM-DD HH:mm') : '—'}
                {isRunCompleted && <> • Completed: {dayjs(run.observed_at_end).format('YYYY-MM-DD HH:mm')}</>}
              </div>
            </div>
            <div className="vp-actions" style={{ flexWrap: 'wrap' }}>
              {!isRunCompleted && (
                <>
                  <button className="btn-ghost" onClick={completeRun} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)', background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
                    <CheckCircle size={16} /> Complete
                  </button>
                  <button className="btn-primary" onClick={submitRun} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <Send size={16} /> Submit
                  </button>
                </>
              )}
            </div>
          </section>

          <SummaryCard run={run} template={template} blockName={run?.block_id ? (blockMap.get(String(run.block_id)) || null) : null} />

          {spots.length > 0 && (
            <RunSpotsMap
              spots={spots}
              runBlockId={run?.block_id}
              companyId={companyId}
              onPinClick={(spotId) => {
                const el = document.getElementById(`rc-spot-${spotId}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          )}

          {/* NEW: Add these three sections */}
          <LabConfigSection
            template={template}
            runLabConfig={runLabConfig}
            onSave={saveRunLabConfig}
            disabled={isRunCompleted}
          />

          <LabSamplingSummary spots={spots} template={template} />

          <LabReportUploadSection
            spots={spots}
            isLabTemplate={template?.observation_type === 'lab_sampling_pre_winery' ||
                          template?.type === 'lab_sampling_pre_winery' ||
                          template?.name?.toLowerCase().includes('lab sampling')}
            runLabReportRef={runLabReportRef}
            onUpload={handleRunLabReportUpload}
            busy={busy}
          />

          <section>
            <div className="vp-card-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <MapPin />
                {(template?.observation_type === 'lab_sampling_pre_winery' ||
                  template?.type === 'lab_sampling_pre_winery' ||
                  template?.name?.toLowerCase().includes('lab sampling')) ? 'Samples' : 'Spots'} ({spots.length})
              </h2>
              {!isRunCompleted && (
                <button className="btn-primary" onClick={addSpot} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <Plus size={16} />
                  {(template?.observation_type === 'lab_sampling_pre_winery' ||
                    template?.type === 'lab_sampling_pre_winery' ||
                    template?.name?.toLowerCase().includes('lab sampling')) ? 'Add Sample' : 'Add Spot'}
                </button>
              )}
            </div>

            {spots.length === 0 && (
              <div className="vp-empty">{isRunCompleted ? 'No spots recorded in this run.' : 'No spots yet—click "Add Spot" to begin.'}</div>
            )}

            <div className="rc-spots-grid">
              {spots.map((s, i) => (
                <SpotEditor
                  key={s.id ?? `tmp-${i}`}
                  idx={i}
                  spot={s}
                  fields={fields}
                  blocks={blocks}
                  runBlockId={run.block_id}
                  template={template}
                  runLabConfig={runLabConfig}  // NEW: Add this prop
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

        </div>
      )}
    </div>
  );
}

function LabConfigSection({ template, runLabConfig, onSave, disabled }) {
  const isLabTemplate = template?.observation_type === 'lab_sampling_pre_winery' ||
                        template?.type === 'lab_sampling_pre_winery' ||
                        template?.name?.toLowerCase().includes('lab sampling');

  if (!isLabTemplate) return null;

  const [localConfig, setLocalConfig] = useState(runLabConfig);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLocalConfig(runLabConfig);
  }, [runLabConfig]);

  const analysesOptions = [
    { label: "Brix (°Bx)", value: "brix" },
    { label: "pH", value: "ph" },
    { label: "TA (g/L)", value: "ta_gpl" },
    { label: "YAN (mg N/L)", value: "yan" },
    { label: "Malic (g/L)", value: "malic" },
    { label: "Glucose/Fructose (g/L)", value: "glu_fru" },
    { label: "Turbidity (NTU)", value: "ntu" },
    { label: "Smoke markers", value: "smoke_markers" },
    { label: "Minerals/metals", value: "minerals" }
  ];

  const handleSave = async () => {
    await onSave(localConfig);
    setEditing(false);
  };

  return (
    <section className="vp-card" style={{ background: 'var(--color-info-bg)', border: '1px solid var(--color-info)' }}>
      <div className="vp-card-header" style={{ borderBottom: 'none' }}>
        <h2>Lab Submission Configuration</h2>
        {!disabled && (
          <button
            className="btn-primary"
            onClick={() => editing ? handleSave() : setEditing(true)}
          >
            {editing ? 'Save Configuration' : 'Edit Configuration'}
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
          <div className="vp-form-group">
            <label className="vp-label">Analyses Requested (for all samples)</label>
            <select
              className="vp-select"
              multiple
              value={localConfig.analyses_requested || []}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                setLocalConfig({ ...localConfig, analyses_requested: selected });
              }}
              style={{ minHeight: 120 }}
            >
              {analysesOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="vp-hint">
              Hold Ctrl/Cmd to select multiple
            </div>
          </div>

          <div className="vp-grid-2">
            <div className="vp-form-group">
              <label className="vp-label">Harvest Date (planned/actual)</label>
              <input
                className="vp-input"
                type="date"
                value={localConfig.harvest_date || ''}
                onChange={(e) => setLocalConfig({ ...localConfig, harvest_date: e.target.value })}
              />
            </div>
            <div className="vp-form-group">
              <label className="vp-label">Collected By</label>
              <input
                className="vp-input"
                type="text"
                value={localConfig.collected_by || ''}
                onChange={(e) => setLocalConfig({ ...localConfig, collected_by: e.target.value })}
                placeholder="Name or initials"
              />
            </div>
          </div>

          <div className="vp-form-group">
            <label className="vp-label">Lab Reference</label>
            <input
              className="vp-input"
              type="text"
              value={localConfig.lab_ref || ''}
              onChange={(e) => setLocalConfig({ ...localConfig, lab_ref: e.target.value })}
              placeholder="Lab job number or reference"
            />
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
          <div>
            <span style={{ fontWeight: 600 }}>Analyses Requested:</span>{' '}
            {localConfig.analyses_requested?.length > 0
              ? localConfig.analyses_requested.map(a =>
                  analysesOptions.find(opt => opt.value === a)?.label || a
                ).join(', ')
              : <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Not configured</span>
            }
          </div>
          {localConfig.harvest_date && (
            <div><span style={{ fontWeight: 600 }}>Harvest Date:</span> {localConfig.harvest_date}</div>
          )}
          {localConfig.collected_by && (
            <div><span style={{ fontWeight: 600 }}>Collected By:</span> {localConfig.collected_by}</div>
          )}
          {localConfig.lab_ref && (
            <div><span style={{ fontWeight: 600 }}>Lab Reference:</span> {localConfig.lab_ref}</div>
          )}
        </div>
      )}
    </section>
  );
}

function LabSamplingSummary({ spots, template }) {
  const isLabTemplate = template?.observation_type === 'lab_sampling_pre_winery' ||
                        template?.type === 'lab_sampling_pre_winery' ||
                        template?.name?.toLowerCase().includes('lab sampling');

  if (!isLabTemplate || spots.length === 0) return null;

  const spotsWithReports = spots.filter(s => s.documents?.length > 0);
  const spotsWithoutReports = spots.filter(s => !s.documents || s.documents.length === 0);

  return (
    <section className="vp-card" style={{ background: 'var(--color-info-bg)', border: '1px solid var(--color-info)' }}>
      <div className="vp-section-header">
        <FileText size={18} />
        <h3>Lab Sampling Status</h3>
      </div>

      <div className="vp-grid-auto">
        <div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-info)' }}>
            {spots.length}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Total Samples</div>
        </div>

        <div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-success)' }}>
            {spotsWithReports.length}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Reports Uploaded</div>
        </div>

        <div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-danger)' }}>
            {spotsWithoutReports.length}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Awaiting Reports</div>
        </div>

        <div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-info)' }}>
            {spots.length > 0 ? Math.round((spotsWithReports.length / spots.length) * 100) : 0}%
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Complete</div>
        </div>
      </div>

      {spotsWithoutReports.length > 0 && (
        <div className="vp-warning-banner" style={{ marginTop: 'var(--space-base)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
            Samples awaiting lab reports:
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)' }}>
            {spotsWithoutReports.map(s => s.values?.sample_id || `Spot #${s.id}`).join(', ')}
          </div>
        </div>
      )}
    </section>
  );
}

function LabReportUploadSection({ spots, isLabTemplate, runLabReportRef, onUpload, busy }) {
  if (!isLabTemplate || spots.length === 0) return null;

  const firstSpot = spots[0];
  const hasLabReport = firstSpot?.documents?.length > 0;

  return (
    <section className="vp-card">
      <div className="vp-section-header">
        <FileText size={18} />
        <h3>Lab Report Upload</h3>
      </div>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-md)' }}>
        Upload the lab report PDF for this entire submission. It will be attached to all samples.
      </p>
      <input
        ref={runLabReportRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={onUpload}
      />
      <button
        type="button"
        className="btn-accent"
        onClick={() => runLabReportRef.current?.click()}
        disabled={busy || spots.length === 0 || firstSpot?._isNew}
      >
        Upload Lab Report
      </button>

      {hasLabReport && (
        <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--color-success-bg)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-md)' }}>
          Lab report uploaded ({firstSpot.documents.length} document{firstSpot.documents.length > 1 ? 's' : ''})
        </div>
      )}
    </section>
  );
}



function confidenceTone(score) {
  if (score == null) return 'mod';
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'good';
  if (score >= 0.3) return 'mod';
  return 'low';
}

function SummaryCard({ run, template, blockName }) {
  const js = run?.summary_json || run?.summary || null;
  if (!js || (typeof js === 'object' && Object.keys(js).length === 0)) return null;

  const n_spots = js.n_spots ?? 0;
  const date_range = js.date_range || {};
  const block_info = js.block_info || null;
  const confidence = js.confidence || null;
  const statistics = js.statistics || {};
  const derived_metrics = js.derived_metrics || {};
  const categorical = js.categorical_distribution || {};
  const flag_summary = js.flag_summary || null;
  const severity_summary = js.severity_summary || null;
  const numeric_summary = js.numeric_summary || null;
  const biosecurity = js.biosecurity_alerts || null;
  const notes_digest = js.notes_digest || [];

  const tone = confidenceTone(confidence?.score);
  const startedAt = date_range.first ? dayjs(date_range.first).format('DD MMM YYYY') : null;
  const endedAt = date_range.last ? dayjs(date_range.last).format('DD MMM YYYY') : null;

  const numericStats = { ...statistics, ...(numeric_summary || {}) };
  const numericEntries = Object.entries(numericStats);
  const derivedEntries = Object.entries(derived_metrics);
  const categoricalEntries = Object.entries(categorical).filter(([k]) => !k.endsWith('_uniformity'));

  return (
    <section className="rc-summary">
      <div className="rc-summary-head">
        <div>
          <h3 className="rc-summary-title">
            <BarChart3 size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />
            Run Summary
          </h3>
          <div className="rc-summary-sub">
            {template?.name || run?.name || `Run #${run?.id}`}
            {blockName && <> · {blockName}</>}
            {startedAt && <> · {startedAt}{endedAt && endedAt !== startedAt ? ` → ${endedAt}` : ''}</>}
          </div>
        </div>
        {confidence?.interpretation && (
          <span className={`rc-confidence-pill ${tone}`}>
            {confidence.interpretation}
            {confidence.score != null && <> · {Math.round(confidence.score * 100)}%</>}
          </span>
        )}
      </div>

      <div className="rc-summary-stats">
        <div className="rc-stat">
          <div className="rc-stat-label">Spots</div>
          <div className="rc-stat-value">{n_spots}</div>
          {confidence?.details?.spots_per_ha != null && (
            <div className="rc-stat-sub">{confidence.details.spots_per_ha}/ha</div>
          )}
        </div>
        {block_info?.area_ha != null && (
          <div className="rc-stat">
            <div className="rc-stat-label">Block area</div>
            <div className="rc-stat-value">{block_info.area_ha} ha</div>
          </div>
        )}
        {confidence?.details?.target_spots_per_ha != null && (
          <div className="rc-stat">
            <div className="rc-stat-label">Target density</div>
            <div className="rc-stat-value">{confidence.details.target_spots_per_ha}/ha</div>
            {confidence?.details?.coverage_ratio != null && (
              <div className="rc-stat-sub">{Math.round(confidence.details.coverage_ratio * 100)}% covered</div>
            )}
          </div>
        )}
        {severity_summary?.mean != null && (
          <div className="rc-stat">
            <div className="rc-stat-label">Severity</div>
            <div className="rc-stat-value">{severity_summary.mean} avg</div>
            <div className="rc-stat-sub">max {severity_summary.max}</div>
          </div>
        )}
      </div>

      {numericEntries.length > 0 && (
        <div className="rc-summary-section">
          <div className="rc-summary-section-title">Measurements</div>
          <div className="rc-summary-stats">
            {numericEntries.map(([key, s]) => (
              <div key={key} className="rc-stat">
                <div className="rc-stat-label">{key.replace(/_/g, ' ')}</div>
                <div className="rc-stat-value">{s.mean ?? '—'}</div>
                <div className="rc-stat-sub">
                  n={s.n} · {s.min}–{s.max}
                  {s.ci95 && Array.isArray(s.ci95) && <> · ±{Math.round(((s.ci95[1] - s.ci95[0]) / 2) * 100) / 100}</>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {derivedEntries.length > 0 && (
        <div className="rc-summary-section">
          <div className="rc-summary-section-title">Derived metrics</div>
          <div className="rc-summary-stats">
            {derivedEntries.map(([key, m]) => (
              <div key={key} className="rc-stat">
                <div className="rc-stat-label">{key.replace(/_/g, ' ')}</div>
                <div className="rc-stat-value">{m.value ?? '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {flag_summary && Object.keys(flag_summary).length > 0 && (
        <div className="rc-summary-section">
          <div className="rc-summary-section-title">Flags</div>
          <div style={{ display: 'grid', gap: 4, fontSize: 'var(--font-size-xs)' }}>
            {Object.entries(flag_summary).map(([flag, count]) => (
              <div key={flag}>
                <strong style={{ textTransform: 'capitalize' }}>{flag.replace(/_/g, ' ')}:</strong> {count}
              </div>
            ))}
          </div>
        </div>
      )}

      {categoricalEntries.length > 0 && (
        <div className="rc-summary-section">
          <div className="rc-summary-section-title">Distribution</div>
          <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            {categoricalEntries.map(([field, dist]) => (
              <div key={field}>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, textTransform: 'capitalize', marginBottom: 2 }}>
                  {field.replace(/_/g, ' ')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {dist.slice(0, 5).map((d) => (
                    <span key={d.value} className="vp-badge" style={{ fontSize: 11, background: 'rgba(255,255,255,0.7)', border: '1px solid var(--color-border)' }}>
                      {d.label || d.value}: {d.count} ({d.percent}%)
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {biosecurity?.detected && (
        <div className="rc-bio-alert">
          <AlertOctagon size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          Biosecurity alert: {biosecurity.species.map(s => s.label).join(', ')}
        </div>
      )}

      {notes_digest.length > 0 && (
        <div className="rc-summary-section">
          <div className="rc-summary-section-title">Notes ({notes_digest.length})</div>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: 'var(--font-size-xs)', color: 'var(--color-text)' }}>
            {notes_digest.slice(0, 5).map((n) => (
              <li key={n.spot_id}>{n.text}</li>
            ))}
            {notes_digest.length > 5 && <li style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>+ {notes_digest.length - 5} more…</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Spot Editor with media & phenology helpers
 */
function SpotEditor({ idx, spot, fields, blocks = [], runBlockId, template, runLabConfig, isRunCompleted, onChange, onSave, onRemove, uploadingPhoto, uploadingVideo, uploadingDoc, onUploadPhotos, onUploadVideos, onUploadDocuments, onDeleteFile, onDownloadFile, busy }) {
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showLocationMap, setShowLocationMap] = useState(false);

  const values = spot.values || {};
  const hasUnsavedChanges = spot._hasUnsavedChanges || spot._isNew;
  const isLocked = runBlockId != null;

  const isLabSamplingSpot = template?.observation_type === 'lab_sampling_pre_winery' ||
                            template?.type === 'lab_sampling_pre_winery' ||
                            template?.name?.toLowerCase().includes('lab sampling');
  const hasLabReport = isLabSamplingSpot && (spot.documents?.length > 0);
  const sampleId = values?.sample_id;
  const hasCoords = spot.latitude != null && spot.longitude != null;
  const isUploading = !!(uploadingPhoto || uploadingVideo || uploadingDoc);

  const setValue = (k, v) => onChange(idx, { values: { ...(values || {}), [k]: v } });

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange(idx, { latitude: position.coords.latitude, longitude: position.coords.longitude });
        setGettingLocation(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        alert(`Failed to get location: ${error.message}`);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleLocationFromMap = (coords) => {
    onChange(idx, { latitude: coords.latitude, longitude: coords.longitude });
  };

  const handleUnifiedUpload = (files) => {
    if (!files?.length) return;
    const photos = [], videos = [], docs = [];
    for (const f of files) {
      const kind = categorizeFile(f);
      if (kind === 'photo') photos.push(f);
      else if (kind === 'video') videos.push(f);
      else docs.push(f);
    }
    if (photos.length) onUploadPhotos(spot, photos);
    if (videos.length) onUploadVideos(spot, videos);
    if (docs.length) onUploadDocuments(spot, docs);
  };

  const spotIdLabel = spot.id?.toString().startsWith('tmp-') ? '(unsaved)' : `#${spot.id}`;
  const elementId = `rc-spot-${spot.id}`;

  return (
    <div id={elementId} className={`rc-spot-card${hasUnsavedChanges ? ' unsaved' : ''}`} style={{ opacity: isRunCompleted ? 0.95 : 1 }}>
      {/* Header */}
      <div className="rc-spot-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div className="rc-spot-title">
            {isLabSamplingSpot ? 'Sample' : 'Spot'} {spotIdLabel}
            {isLocked && <Lock size={12} style={{ color: 'var(--color-text-muted)' }} title="Block locked" />}
          </div>
          <div className="rc-spot-badges">
            {sampleId && <span className="vp-badge vp-badge--info" style={{ fontSize: 11 }}>ID: {sampleId}</span>}
            {isLabSamplingSpot && (
              hasLabReport
                ? <span className="vp-badge vp-badge--success" style={{ fontSize: 11 }}>Lab report ✓</span>
                : <span className="vp-badge vp-badge--danger" style={{ fontSize: 11 }}>Awaiting lab</span>
            )}
            {hasUnsavedChanges && <span className="vp-badge" style={{ fontSize: 11, background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>Unsaved</span>}
          </div>
        </div>
        {!isRunCompleted && (
          <div className="rc-spot-actions">
            <button className="btn-ghost" onClick={() => onSave(idx)} disabled={busy} title="Save spot">
              <Save size={13} /> Save
            </button>
            <button className="btn-ghost" onClick={() => onRemove(idx)} disabled={busy} title="Remove spot" style={{ color: 'var(--color-danger)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Compact location row */}
      <div className={`rc-loc-row ${hasCoords ? 'set' : 'unset'}`}>
        <span className="rc-loc-status">
          <MapPin size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {hasCoords
            ? `${Number(spot.latitude).toFixed(5)}, ${Number(spot.longitude).toFixed(5)}`
            : 'No location set'}
        </span>
        {!isRunCompleted && (
          <div className="rc-loc-buttons">
            <button className="btn-ghost" onClick={getCurrentLocation} disabled={gettingLocation || busy}>
              {gettingLocation ? '…' : 'Current'}
            </button>
            <button className="btn-ghost" onClick={() => setShowLocationMap(true)} disabled={busy}>
              Map
            </button>
            {hasCoords && (
              <button className="btn-ghost" onClick={() => onChange(idx, { latitude: null, longitude: null })} disabled={busy} title="Clear" style={{ color: 'var(--color-danger)' }}>
                <XIcon size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {showLocationMap && (
        <SpotLocationMap
          isOpen={showLocationMap}
          onClose={() => setShowLocationMap(false)}
          onLocationSet={handleLocationFromMap}
          initialCoordinates={hasCoords ? { latitude: spot.latitude, longitude: spot.longitude } : null}
        />
      )}

      {/* Dynamic fields */}
      <div className="rc-fields">
        {fields.map((f) => (
          <FieldRenderer
            key={String(f.key || f.name)}
            field={f}
            value={values?.[f.key || f.name]}
            onChange={(v) => setValue(f.key || f.name, v)}
            disabled={isRunCompleted}
            template={template}
            runLabConfig={runLabConfig}
          />
        ))}
      </div>

      {/* Unified uploads */}
      <UnifiedUploads
        spot={spot}
        disabled={isRunCompleted}
        uploading={isUploading}
        onPick={handleUnifiedUpload}
        onDelete={(fileId) => onDeleteFile(spot.id, fileId)}
        onDownload={onDownloadFile}
      />
    </div>
  );
}

function categorizeFile(file) {
  const t = (file?.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'photo';
  if (t.startsWith('video/')) return 'video';
  return 'document';
}

function RunSpotsMap({ spots, runBlockId, companyId, onPinClick }) {
  const [expanded, setExpanded] = useState(false);
  const previewRef = useRef(null);
  const modalRef = useRef(null);
  const previewMap = useRef(null);
  const modalMap = useRef(null);

  const spotPins = useMemo(
    () => spots.filter((s) => s.latitude != null && s.longitude != null && !s._isNew),
    [spots]
  );

  const loadBlocks = async (mapInstance) => {
    try {
      const data = await blocksService.getBlocksGeoJSON();
      if (!data?.features) return null;
      const filtered = {
        ...data,
        features: data.features.filter((f) => Number(f.properties.company_id) === Number(companyId))
      };
      if (filtered.features.length === 0) return null;
      mapInstance.addSource('rc-blocks', { type: 'geojson', data: filtered });
      mapInstance.addLayer({
        id: 'rc-blocks-fill', type: 'fill', source: 'rc-blocks',
        paint: { 'fill-color': '#5B6830', 'fill-opacity': 0.18 }
      });
      mapInstance.addLayer({
        id: 'rc-blocks-line', type: 'line', source: 'rc-blocks',
        paint: { 'line-color': '#5B6830', 'line-width': 1.5, 'line-opacity': 0.8 }
      });
      mapInstance.addLayer({
        id: 'rc-blocks-active', type: 'fill', source: 'rc-blocks',
        filter: ['==', ['get', 'id'], runBlockId ?? -1],
        paint: { 'fill-color': '#D1583B', 'fill-opacity': 0.25 }
      });
      return filtered;
    } catch (e) {
      console.warn('rc-spots-map blocks load failed', e);
      return null;
    }
  };

  const addSpotPins = (mapInstance, withClickHandler) => {
    spotPins.forEach((s, i) => {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 26px; height: 26px; border-radius: 50%;
        background: #D1583B; border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        color: white; font-size: 11px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
      `;
      el.textContent = String(i + 1);
      if (withClickHandler) {
        el.onclick = () => onPinClick?.(s.id);
      }
      new mapboxgl.Marker(el)
        .setLngLat([Number(s.longitude), Number(s.latitude)])
        .addTo(mapInstance);
    });
  };

  const fitBounds = (mapInstance) => {
    if (spotPins.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    spotPins.forEach((s) => bounds.extend([Number(s.longitude), Number(s.latitude)]));
    mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 });
  };

  // Preview map
  useEffect(() => {
    if (!previewRef.current || previewMap.current) return;
    const m = new mapboxgl.Map({
      container: previewRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [172.6148, -43.5272],
      zoom: 8,
      interactive: false,
      attributionControl: false
    });
    previewMap.current = m;
    m.on('load', async () => {
      await loadBlocks(m);
      addSpotPins(m, false);
      fitBounds(m);
    });
    return () => { m.remove(); previewMap.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotPins.length, runBlockId, companyId]);

  // Modal map
  useEffect(() => {
    if (!expanded || !modalRef.current || modalMap.current) return;
    const m = new mapboxgl.Map({
      container: modalRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [172.6148, -43.5272],
      zoom: 8
    });
    m.addControl(new mapboxgl.NavigationControl(), 'top-right');
    modalMap.current = m;
    m.on('load', async () => {
      await loadBlocks(m);
      addSpotPins(m, true);
      fitBounds(m);
    });
    return () => { m.remove(); modalMap.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  return (
    <section className="rc-map-card">
      <div className="rc-map-card-head">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', margin: 0, fontSize: 'var(--font-size-base)' }}>
          <MapPin size={16} /> Spot locations
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>
            ({spotPins.length} of {spots.length} with coords)
          </span>
        </h3>
        <button className="btn-ghost" onClick={() => setExpanded(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)' }}>
          <Maximize2 size={14} /> Expand
        </button>
      </div>
      <div className="rc-map-preview" onClick={() => setExpanded(true)} ref={previewRef} />

      {expanded && createPortal(
        <div className="rc-map-modal" onClick={() => setExpanded(false)}>
          <div className="rc-map-modal-frame" onClick={(e) => e.stopPropagation()}>
            <div className="rc-map-modal-head">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <MapPin size={18} /> All spots
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                  Click a pin to jump to its card
                </span>
              </h3>
              <button className="btn-ghost" onClick={() => setExpanded(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <XIcon size={16} /> Close
              </button>
            </div>
            <div className="rc-map-modal-body" ref={modalRef} />
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

function UnifiedUploads({ spot, disabled, uploading, onPick, onDelete, onDownload }) {
  const fileRef = useRef(null);
  const items = useMemo(() => {
    const photos = (spot.photos || []).map((p) => ({ ...p, _kind: 'photo' }));
    const videos = (spot.videos || []).map((v) => ({ ...v, _kind: 'video' }));
    const docs = (spot.documents || []).map((d) => ({ ...d, _kind: 'document' }));
    return [...photos, ...videos, ...docs];
  }, [spot.photos, spot.videos, spot.documents]);

  const [enlarged, setEnlarged] = useState(null);

  useEffect(() => {
    if (!enlarged) return;
    const onEsc = (e) => e.key === 'Escape' && setEnlarged(null);
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [enlarged]);

  return (
    <div className="rc-uploads">
      <div className="rc-uploads-head">
        <span className="rc-uploads-title">
          <Upload size={12} /> Uploads ({items.length})
        </span>
        {!disabled && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.csv"
              style={{ display: 'none' }}
              onChange={(e) => onPick(Array.from(e.target.files || []))}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}
            >
              {uploading ? 'Uploading…' : '+ Add files'}
            </button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rc-upload-empty">No files uploaded</div>
      ) : (
        <div className="rc-uploads-list">
          {items.map((it) => (
            <div
              key={`${it._kind}-${it.id}`}
              className="rc-upload-tile"
              title={it.original_filename || it._kind}
              onClick={() => {
                // Photos with a preview open in the lightbox. Photos whose
                // blob fetch failed (blob_url null) fall through to download
                // so the user still gets the file rather than a silent
                // nothing. Videos + docs always download.
                if (it._kind === 'photo' && it.blob_url) setEnlarged(it);
                else onDownload(it.id, it.original_filename);
              }}
              style={{ cursor: 'pointer' }}
            >
              {it._kind === 'photo' && it.blob_url && (
                <img src={it.blob_url} alt={it.original_filename || 'photo'} />
              )}
              {it._kind === 'video' && it.blob_url && (
                <video src={it.blob_url} muted />
              )}
              {it._kind === 'video' && !it.blob_url && (
                <VideoIcon size={20} style={{ color: 'var(--color-text-muted)' }} />
              )}
              {it._kind === 'document' && (
                <div className="rc-upload-doc">
                  <FileText size={18} />
                  <span>{(it.original_filename || 'doc').slice(0, 12)}</span>
                </div>
              )}
              {it._kind === 'photo' && !it.blob_url && (
                <ImageIcon size={20} style={{ color: 'var(--color-text-muted)' }} />
              )}
              {!disabled && (
                <button
                  className="rc-upload-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete this file?')) onDelete(it.id);
                  }}
                  title="Delete"
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {enlarged && createPortal(
        <div
          onClick={() => setEnlarged(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: 20, cursor: 'zoom-out',
          }}
        >
          <img
            src={enlarged.blob_url}
            alt={enlarged.original_filename}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', cursor: 'default' }}
          />

          {/* Filename + actions strip */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', top: 16, left: 16, right: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 12, pointerEvents: 'none',
            }}
          >
            <span style={{
              color: '#fff', fontSize: 14, fontWeight: 500,
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {enlarged.original_filename || 'Photo'}
            </span>
            <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
              <button
                onClick={() => onDownload(enlarged.id, enlarged.original_filename)}
                title="Download original"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.92)', color: '#111',
                  border: 'none', borderRadius: 6, padding: '6px 12px',
                  cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}
              >
                <Download size={14} /> Download
              </button>
              <button
                onClick={() => setEnlarged(null)}
                title="Close (Esc)"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.92)', color: '#111',
                  border: 'none', borderRadius: 6, width: 32, height: 32,
                  cursor: 'pointer',
                }}
              >
                <XIcon size={16} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Field Renderer with EL Phenology Support
 */
function FieldRenderer({ field, value, onChange, disabled = false, template, runLabConfig }) {
  const fieldName = field?.key || field?.name;
  const runLevelFields = ['analyses_requested', 'harvest_date', 'collected_by', 'lab_ref'];

  if (runLevelFields.includes(fieldName) && runLabConfig?.analyses_requested?.length > 0) {
    return null; // Field is configured at run level, don't show on individual spots
  }

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
      <div className="vp-form-group rc-field-phenology">
        <label className="vp-label">{field?.label || 'E–L Stage'}</label>
        <select className="vp-select" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled || loadingStages}>
          <option value="">— Select EL stage —</option>
          {options.map(opt => {
            const v = opt?.value ?? opt?.key ?? opt;
            const text = opt?.label ?? String(v);
            return <option key={String(v)} value={String(v)}>{text}</option>;
          })}
        </select>

        {showPhenologyGuides && selectedStage?.description && (
          <div className="vp-hint" style={{ padding: 'var(--space-sm)', background: 'var(--color-surface-warm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginTop: 'var(--space-xs)' }}>
            {selectedStage.description}
          </div>
        )}

        {showPhenologyGuides && helperFiles.length > 0 && (
          <div style={{ marginTop: 'var(--space-sm)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, marginBottom: 'var(--space-xs)', color: 'var(--color-text)' }}>Reference Files:</div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
              {helperFiles.map(link => <HelperFile key={link.id} fileLink={link} />)}
            </div>
          </div>
        )}

        {showPhenologyGuides && selectedStage && helperFiles.length === 0 && (
          <div className="vp-hint" style={{ padding: 'var(--space-sm)', background: 'var(--color-surface-warm)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontStyle: 'italic', marginTop: 'var(--space-sm)' }}>
            No reference files available for this stage.
          </div>
        )}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div className="vp-form-group">
        <label className="vp-label">{label}</label>
        <input className="vp-input" type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} disabled={disabled} />
      </div>
    );
  }

if (type === 'select' || type === 'single-select') {
    const options = Array.isArray(field?.options) ? field.options : [];
    const isMultiple = field?.multiple === true;

    if (isMultiple) {
      // Multi-select handling
      const selectedValues = Array.isArray(value) ? value : (value ? [value] : []);
      return (
        <div className="vp-form-group rc-field-wide">
          <label className="vp-label">{label}</label>
          <select
            className="vp-select"
            multiple
            value={selectedValues}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, opt => opt.value);
              onChange(selected);
            }}
            disabled={disabled}
            style={{ minHeight: 80 }}
          >
            {options.map((opt) => {
              const val = opt?.value ?? opt?.key ?? opt;
              const text = opt?.label ?? String(val);
              return <option key={String(val)} value={String(val)}>{text}</option>;
            })}
          </select>
          <div className="vp-hint">
            Hold Ctrl/Cmd to select multiple
          </div>
        </div>
      );
    }

    // Single-select handling
    return (
      <div className="vp-form-group">
        <label className="vp-label">{label}</label>
        <select className="vp-select" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">— Select —</option>
          {options.map((opt) => {
            const val = opt?.value ?? opt?.key ?? opt;
            const text = opt?.label ?? String(val);
            return <option key={String(val)} value={String(val)}>{text}</option>;
          })}
        </select>
      </div>
    );
  }

  if (type === 'boolean' || type === 'checkbox') {
    return (
      <label className="vp-checkbox">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span>{label}</span>
      </label>
    );
  }

  // Text field — wide because comments/addresses can be long
  return (
    <div className="vp-form-group rc-field-wide">
      <label className="vp-label">{label}</label>
      <input className="vp-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
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
      <div style={{ width: 84, height: 84, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-warm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }

  const isImage = typeof mime === 'string' && mime.startsWith('image/');
  const caption = fileLink.caption || 'Reference file';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)' }}>
      <button type="button" onClick={() => isImage ? setOpen(true) : window.open(blobUrl, '_blank')} title={caption} style={{ width: 84, height: 84, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 2, cursor: 'pointer', overflow: 'hidden' }}>
        {isImage ? (
          <img src={blobUrl} alt={caption} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>View file</div>
        )}
      </button>

      {blobUrl && (
        <a href={blobUrl} download={caption.replace(/\s+/g, '_')} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-info)', textDecoration: 'none' }}>
          Download
        </a>
      )}

      {open && isImage && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 9999, padding: 'var(--space-base)' }}>
          <img src={blobUrl} alt={caption} style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }} />
        </div>
      )}
    </div>
  );
}
