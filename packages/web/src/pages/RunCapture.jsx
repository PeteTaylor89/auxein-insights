import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
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

// File service for photos
const observationFileService = {
  uploadSpotPhoto: async (spotId, file, onProgress = null) => {
    const formData = new FormData();
    formData.append('entity_type', 'observation_spot');
    formData.append('entity_id', spotId);
    formData.append('file_category', 'photo');
    formData.append('description', `Observation spot photo: ${file.name}`);
    formData.append('file', file);
    
    return await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      }
    });
  },

  getSpotPhotos: async (spotId) => {
    const res = await api.get(`/files/entity/observation_spot/${spotId}?file_category=photo`);
    return res.data;
  },

  deletePhoto: async (fileId) => {
    const res = await api.delete(`/files/${fileId}`);
    return res.data;
  }
};

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
  
  // Photo upload states
  const [photoUploading, setPhotoUploading] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});

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
      
      // Load spots and their photos
      const normalizedSpots = await Promise.all(
        asArray(sp).map(async (spot) => {
          const normalized = normalizeSpot(spot);
          if (!normalized._isNew && normalized.id) {
            try {
              const photos = await observationFileService.getSpotPhotos(normalized.id);
              
              // Convert to blob URLs like training modules do
              const photosWithBlobUrls = await Promise.all(
                photos.map(async (photo) => {
                  try {
                    const resp = await api.get(`/files/${photo.id}/download`, { responseType: 'blob' });
                    const blobUrl = URL.createObjectURL(resp.data);
                    return { ...photo, blob_url: blobUrl };
                  } catch (error) {
                    console.warn('Failed to load photo blob:', photo.id, error);
                    return { ...photo, blob_url: null };
                  }
                })
              );
              
              normalized.photos = photosWithBlobUrls;
            } catch (error) {
              console.warn('Failed to load photos for spot:', normalized.id, error);
              normalized.photos = [];
            }
          }
          return normalized;
        })
      );
      
      setSpots(normalizedSpots);
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
      values: s?.values ?? s?.data_json ?? {},
      photo_file_ids: s?.photo_file_ids ?? [],
      photos: [], // Will be populated by loadSpotPhotos
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
      photos: [],
      block_id: run?.block_id,
      _isNew: true,
      _hasUnsavedChanges: false,
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
            _hasUnsavedChanges: true
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

      console.log('Saving spot with payload:', payload);

      let saved;
      if (s._isNew) {
        saved = await observationService.createSpot(Number(id), payload);
      } else {
        saved = await observationService.updateSpot(s.id, payload);
      }
      
      const serverSpot = (saved && saved.data) ? saved.data : saved;
      const updated = normalizeSpot(serverSpot || s);
      
      // Load photos for the saved spot
      if (!updated._isNew && updated.id) {
        try {
          const photos = await observationFileService.getSpotPhotos(updated.id);
          updated.photos = Array.isArray(photos) ? photos : [];
        } catch (error) {
          console.warn('Failed to load photos after save:', error);
          updated.photos = s.photos || [];
        }
      }
      
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

  const saveAllUnsavedSpots = async () => {
    const unsavedSpots = spots
      .map((spot, index) => ({ spot, index }))
      .filter(({ spot }) => spot._hasUnsavedChanges || spot._isNew);
    
    if (unsavedSpots.length === 0) {
      return true;
    }

    try {
      setBusy(true);
      console.log(`Saving ${unsavedSpots.length} unsaved spots...`);
      
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

  const uploadPhotos = async (spotIndex, fileList) => {
    const spot = spots[spotIndex];
    if (!spot || !fileList?.length) return;
    
    // If spot is new, save it first
    if (spot._isNew) {
      await saveSpot(spotIndex);
      // Get the updated spot after saving
      const savedSpot = spots[spotIndex];
      if (savedSpot._isNew) {
        alert('Please save the spot first before uploading photos.');
        return;
      }
    }
    
    setPhotoUploading(prev => ({ ...prev, [spotIndex]: true }));
    
    try {
      const uploadedFiles = [];
      
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const result = await observationFileService.uploadSpotPhoto(
          spot.id,
          file,
          (progress) => setUploadProgress(prev => ({ 
            ...prev, 
            [`${spotIndex}-${i}`]: progress 
          }))
        );
        uploadedFiles.push(result.data);
      }
      
      // Refresh spot photos
      await refreshSpotPhotos(spotIndex);
      
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Photo upload failed: ' + error.message);
    } finally {
      setPhotoUploading(prev => ({ ...prev, [spotIndex]: false }));
      setUploadProgress(prev => {
        const updated = { ...prev };
        for (let i = 0; i < fileList.length; i++) {
          delete updated[`${spotIndex}-${i}`];
        }
        return updated;
      });
    }
  };

  const refreshSpotPhotos = async (spotIndex) => {
    const spot = spots[spotIndex];
    if (!spot?.id || spot._isNew) return;
    
    try {
      const photos = await observationFileService.getSpotPhotos(spot.id);
      
      // Convert to blob URLs like training modules do
      const photosWithBlobUrls = await Promise.all(
        photos.map(async (photo) => {
          try {
            const resp = await api.get(`/files/${photo.id}/download`, { responseType: 'blob' });
            const blobUrl = URL.createObjectURL(resp.data);
            return { ...photo, blob_url: blobUrl };
          } catch (error) {
            console.warn('Failed to load photo blob:', photo.id, error);
            return { ...photo, blob_url: null };
          }
        })
      );
      
      setSpots(prev => prev.map((s, i) => 
        i === spotIndex ? { ...s, photos: photosWithBlobUrls } : s
      ));
    } catch (error) {
      console.warn('Failed to refresh photos:', error);
    }
  };

  const deletePhoto = async (spotIndex, photoId) => {
    try {
      await observationFileService.deletePhoto(photoId);
      await refreshSpotPhotos(spotIndex);
    } catch (error) {
      console.error('Failed to delete photo:', error);
      alert('Failed to delete photo: ' + error.message);
    }
  };

  const submitRun = async () => {
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
                  template={template}
                  isRunCompleted={isRunCompleted}
                  onChange={updateSpot}
                  onSave={saveSpot}
                  onRemove={removeSpot}
                  onUpload={uploadPhotos}
                  onDeletePhoto={deletePhoto}
                  photoUploading={photoUploading[i]}
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
 * Enhanced Spot Editor with photo management
 * ----------------------------------- */
function SpotEditor({ idx, spot, fields, blocks = [], runBlockId, template, isRunCompleted, onChange, onSave, onRemove, onUpload, onDeletePhoto, photoUploading, busy }) {
  const fileInputRef = useRef(null);
  const values = spot.values || {};
  const hasUnsavedChanges = spot._hasUnsavedChanges || spot._isNew;

  const setValue = (k, v) => {
    onChange(idx, { values: { ...values, [k]: v } });
  };

  const PhotoGallery = ({ photos, onDelete, disabled }) => {
    const [enlargedPhoto, setEnlargedPhoto] = useState(null);
    
    // Handle escape key and body scroll - same pattern as TemplatePreviewModal
    useEffect(() => {
      if (!enlargedPhoto) return;
      
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          setEnlargedPhoto(null);
        }
      };
      
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
     
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = originalOverflow;
      };
    }, [enlargedPhoto]);
    
    if (!photos?.length) return null;
    
    const handleDeleteClick = (photo) => {
      const confirmed = window.confirm(
        `Are you sure you want to delete this photo?\n\nFilename: ${photo.original_filename}\nSize: ${Math.round(photo.file_size / 1024)}KB\n\nThis action cannot be undone.`
      );
      if (confirmed) {
        onDelete(photo.id);
      }
    };

    const handleBackdropClick = (e) => {
      // Same pattern as TemplatePreviewModal
      if (e.target === e.currentTarget) {
        setEnlargedPhoto(null);
      }
    };
    
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
          zIndex: 9999
        }}
        onClick={handleBackdropClick}
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
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 8
            }}
          />
          
          {/* Close button */}
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
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
            }}
          >
            ×
          </button>
          
          {/* Photo info */}
          <div style={{
            position: 'absolute',
            bottom: -50,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 14,
            textAlign: 'center',
            whiteSpace: 'nowrap'
          }}>
            {enlargedPhoto.original_filename} ({Math.round(enlargedPhoto.file_size / 1024)}KB)
          </div>
        </div>
      </div>
    ) : null;
    
    return (
      <>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {photos.map(photo => (
            <div key={photo.id} style={{ 
              position: 'relative',
              width: 80, 
              height: 80, 
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid #e5e7eb'
            }}>
              {photo.blob_url ? (
                <img 
                  src={photo.blob_url}
                  alt={photo.description || 'Observation photo'}
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    cursor: 'pointer'
                  }}
                  onClick={() => setEnlargedPhoto(photo)}
                  title="Click to enlarge"
                />
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  background: '#f3f4f6',
                  color: '#6b7280',
                  fontSize: 12
                }}>
                  Failed to load
                </div>
              )}
              
              {!disabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(photo);
                  }}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    background: 'rgba(220, 38, 38, 0.8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                  title="Delete photo"
                >
                  ×
                </button>
              )}
              
              <div style={{
                position: 'absolute',
                bottom: 2,
                left: 2,
                fontSize: 10,
                color: 'white',
                background: 'rgba(0,0,0,0.6)',
                padding: '2px 4px',
                borderRadius: 2
              }}>
                {Math.round(photo.file_size / 1024)}KB
              </div>
            </div>
          ))}
        </div>

        {/* Render modal using createPortal - same as TemplatePreviewModal */}
        {modalContent && createPortal(modalContent, document.body)}
      </>
    );
  };
  
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

      {/* Photos */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <strong>Photos</strong>
          {!isRunCompleted && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onUpload(idx, e.target.files)}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || photoUploading}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: photoUploading ? 'not-allowed' : 'pointer'
                }}
              >
                {photoUploading ? 'Uploading...' : 'Add Photos'}
              </button>
            </>
          )}
        </div>
        
        <PhotoGallery 
          photos={spot.photos || []}
          onDelete={(photoId) => onDeletePhoto(idx, photoId)}
          disabled={isRunCompleted}
        />
        
        {photoUploading && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
            Uploading photos... Please wait.
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
            template={template}
          />
        ))}
      </div>
    </div>
  );
}

/* -----------------------------------
 * Field renderer with EL stages support
 * ----------------------------------- */
/* -----------------------------------
 * Field renderer with EL stages support - FIXED VERSION
 * ----------------------------------- */
function FieldRenderer({ field, value, onChange, disabled = false, template }) {
  const type = (field?.type || field?.input_type || 'text').toLowerCase();
  const label = field?.label || field?.name || field?.key || 'Field';
  
  // NEW: field-scoped checks
  const optionsCatalog = String(field?.options_source?.catalog || '').toLowerCase();
  const isElStageCatalog = optionsCatalog === 'el_stage';
  const isElStageFieldName = /^(el[_-]?stage)$/i.test(field?.name || field?.key || '');
  const isExplicitPhenologyType = type === 'phenology';

  // When to TREAT the field as an EL-stage field (for loading & select options)
  const isPhenologyField = isElStageCatalog || isElStageFieldName || isExplicitPhenologyType;

  // When to SHOW the visual helpers (description/images)
  // Show images for phenology fields automatically
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

  // If this field is the EL stage selector, render the select wired to elStages;
  // otherwise fall back to the generic type renderers below.
  if (isPhenologyField && (type === 'phenology' || type === 'select' || type === 'single-select')) {
    // Prefer server-provided catalog options; otherwise hydrate from elStages
    const options = Array.isArray(field?.options) && field.options.length > 0
      ? field.options
      : elStages.map(s => ({ value: s.key, label: s.label }));

    // Fix: Get images from files_assoc, not images property
    const stageImages = selectedStage?.files_assoc || [];
    const hasImages = stageImages.length > 0;

    return (
      <div>
        <label>
          <div>{field?.label || 'E–L Stage'}</div>
          <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || loadingStages}
          >
            <option value="">— Select EL stage —</option>
            {options.map(opt => {
              const v = opt?.value ?? opt?.key ?? opt;
              const text = opt?.label ?? String(v);
              return <option key={String(v)} value={String(v)}>{text}</option>;
            })}
          </select>
        </label>

        {/* Show description when stage is selected */}
        {showPhenologyGuides && selectedStage?.description && (
          <div style={{
            fontSize: 13, color: '#6b7280', marginTop: 4, padding: 8,
            background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb'
          }}>
            {selectedStage.description}
          </div>
        )}

        {/* Show images when stage is selected and has images */}
        {showPhenologyGuides && hasImages && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#374151' }}>
              Reference Images:
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {stageImages.map(fileAssoc => (
                <ReferenceImage key={fileAssoc.id} image={fileAssoc} />
              ))}
            </div>
          </div>
        )}

        {/* Show message when stage is selected but no images available */}
        {showPhenologyGuides && selectedStage && !hasImages && (
          <div style={{
            fontSize: 12, color: '#6b7280', marginTop: 8, padding: 8,
            background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb',
            fontStyle: 'italic'
          }}>
            No reference images available for this stage.
          </div>
        )}
      </div>
    );
  }

  // Rest of the field types remain the same...
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

/* -----------------------------------
 * Reference Image Component for EL stages - FIXED VERSION
 * ----------------------------------- */
function ReferenceImage({ image }) {
  const [enlarged, setEnlarged] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  // Handle the file association structure properly
  const fileId = image.file_id || image.file?.id;
  const caption = image.caption || image.file?.original_filename || 'EL stage reference';
  const isPrimary = image.is_primary;

  useEffect(() => {
    if (fileId) {
      loadImage();
    }
  }, [fileId]);

  // Handle escape key for modal
  useEffect(() => {
    if (!enlarged) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setEnlarged(false);
      }
    };
    
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);
   
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [enlarged]);

  const loadImage = async () => {
    try {
      setLoading(true);
      const resp = await api.get(`/files/${fileId}/download`, { 
        responseType: 'blob' 
      });
      const blobUrl = URL.createObjectURL(resp.data);
      setImageUrl(blobUrl);
    } catch (error) {
      console.warn('Failed to load reference image:', fileId, error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      setEnlarged(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        width: '80px',
        height: '80px',
        background: '#f3f4f6',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        color: '#6b7280',
        border: '1px solid #e5e7eb'
      }}>
        Loading...
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div style={{
        width: '80px',
        height: '80px',
        background: '#f3f4f6',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        color: '#6b7280',
        border: '1px solid #e5e7eb'
      }}>
        No image
      </div>
    );
  }

  const modalContent = enlarged ? (
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
        zIndex: 9999
      }}
      onClick={handleBackdropClick}
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
          src={imageUrl}
          alt={caption}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 8
          }}
        />
        
        {/* Close button */}
        <button
          onClick={() => setEnlarged(false)}
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
          }}
        >
          ×
        </button>
        
        {/* Caption */}
        {caption && (
          <div style={{
            position: 'absolute',
            bottom: -50,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 14,
            textAlign: 'center',
            whiteSpace: 'nowrap'
          }}>
            {caption}
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div 
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '2px solid #e5e7eb',
          cursor: 'pointer',
          position: 'relative',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}
        onClick={() => setEnlarged(true)}
        title={`${caption} - Click to enlarge`}
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.05)';
          e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
          e.target.style.boxShadow = 'none';
        }}
      >
        <img 
          src={imageUrl}
          alt={caption}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
        
       
        {/* Hover overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold',
          opacity: 0,
          transition: 'opacity 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.target.style.opacity = 1;
          e.target.style.background = 'rgba(0,0,0,0.4)';
        }}
        onMouseLeave={(e) => {
          e.target.style.opacity = 0;
          e.target.style.background = 'rgba(0,0,0,0)';
        }}>
          🔍 View
        </div>
      </div>
      
      {modalContent && createPortal(modalContent, document.body)}
    </>
  );
}

/* -----------------------------------
 * Generic Helper File (preview + download)
 * ----------------------------------- */
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
        console.debug('[HelperFile] fetching', `/files/${fileLink.file_id}/download`, fileLink);
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
      <div style={{
        width: 84, height: 84, borderRadius: 8,
        background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: '#6b7280'
      }}>
        Loading…
      </div>
    );
  }

  const isImage = typeof mime === 'string' && mime.startsWith('image/');
  const caption = fileLink.caption || 'Reference file';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={() => isImage ? setOpen(true) : window.open(blobUrl, '_blank')}
        title={caption}
        style={{
          width: 84, height: 84, border: '1px solid #e5e7eb', borderRadius: 8,
          background: '#fff', padding: 2, cursor: 'pointer', overflow: 'hidden'
        }}
      >
        {isImage ? (
          <img src={blobUrl} alt={caption} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 12, color: '#6b7280' }}>
            View file
          </div>
        )}
      </button>

      {/* Download control using the same blob URL */}
      {blobUrl && (
        <a
          href={blobUrl}
          download={caption.replace(/\s+/g, '_')}
          style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}
        >
          Download
        </a>
      )}

      {/* Simple lightbox for images */}
      {open && isImage && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'grid', placeItems: 'center', zIndex: 9999, padding: 16
          }}
        >
          <img src={blobUrl} alt={caption} style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, background: '#fff' }} />
        </div>
      )}
    </div>
  );
}
