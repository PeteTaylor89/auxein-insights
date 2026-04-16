import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { useTrainingModule, useTrainingSlides, useTrainingQuestions } from '@vineyard/shared';
import { trainingService, api } from '@vineyard/shared';
import './Training.css';

function ModuleEditor() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { module, loading: moduleLoading, error: moduleError, updateModule } = useTrainingModule(moduleId);
  const { slides, loading: slidesLoading, createSlide, updateSlide, deleteSlide, reorderSlides } = useTrainingSlides(moduleId);
  const { questions, loading: questionsLoading, createQuestion, updateQuestion, deleteQuestion } = useTrainingQuestions(moduleId);

  const [activeTab, setActiveTab] = useState('slides');
  const [selectedSlide, setSelectedSlide] = useState(null);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const autoSaveTimeoutRef = useRef(null);

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    if (!canManage) { navigate('/training'); return; }
    if (slides.length > 0 && !selectedSlide) setSelectedSlide(slides[0]);
  }, [canManage, navigate, slides, selectedSlide]);

  const triggerAutoSave = (slideData) => {
    setUnsavedChanges(true);
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        setAutoSaving(true);
        if (selectedSlide?.id) { await updateSlide(selectedSlide.id, slideData); setUnsavedChanges(false); }
      } catch (e) { console.error('Auto-save failed:', e); }
      finally { setAutoSaving(false); }
    }, 2000);
  };

  useEffect(() => () => { if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); }, []);

  const handleSlideChange = (field, value) => {
    const updated = { ...selectedSlide, [field]: value };
    setSelectedSlide(updated);
    triggerAutoSave({ [field]: value });
  };

  // Drag and drop
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);

  const handleSlideReorder = async (dragIndex, hoverIndex) => {
    try {
      const newSlides = [...slides];
      const [dragged] = newSlides.splice(dragIndex, 1);
      newSlides.splice(hoverIndex, 0, dragged);
      await reorderSlides(newSlides.map((s, i) => ({ ...s, order: i + 1 })));
    } catch (e) { console.error('Failed to reorder slides:', e); alert('Failed to reorder slides: ' + e.message); }
  };

  const handleDragStart = (e, index) => { setDraggedItem(index); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, index) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverItem(index); };
  const handleDragEnd = () => { setDraggedItem(null); setDragOverItem(null); };
  const handleDrop = async (e, dropIndex) => { e.preventDefault(); if (draggedItem !== null && draggedItem !== dropIndex) await handleSlideReorder(draggedItem, dropIndex); handleDragEnd(); };

  const handleBulletPointChange = (index, value) => {
    const bp = [...(selectedSlide.bullet_points || [])]; bp[index] = value;
    setSelectedSlide({ ...selectedSlide, bullet_points: bp }); triggerAutoSave({ bullet_points: bp });
  };
  const addBulletPoint = () => { const bp = [...(selectedSlide.bullet_points || []), '']; setSelectedSlide({ ...selectedSlide, bullet_points: bp }); triggerAutoSave({ bullet_points: bp }); };
  const removeBulletPoint = (index) => { const bp = selectedSlide.bullet_points?.filter((_, i) => i !== index) || []; setSelectedSlide({ ...selectedSlide, bullet_points: bp }); triggerAutoSave({ bullet_points: bp }); };

  const handleCreateSlide = async () => {
    try { const ns = await createSlide({ title: 'New Slide', content: '', bullet_points: [], order: slides.length + 1 }); setSelectedSlide(ns); }
    catch (e) { alert('Failed to create slide: ' + e.message); }
  };

  const handleDeleteSlide = async (slideId) => {
    if (!confirm('Are you sure you want to delete this slide?')) return;
    try { await deleteSlide(slideId); if (selectedSlide?.id === slideId) { const rem = slides.filter(s => s.id !== slideId); setSelectedSlide(rem.length > 0 ? rem[0] : null); } }
    catch (e) { alert('Failed to delete slide: ' + e.message); }
  };

  const validateSlideForMobile = (slide) => {
    if (!slide) return {};
    return { titleLength: slide.title?.length < 50, contentLength: (slide.content?.length || 0) < 200, bulletCount: (slide.bullet_points?.length || 0) <= 5, hasContent: slide.title && (slide.content || (slide.bullet_points?.length > 0)) };
  };

  // Slide Image Upload sub-component
  const SlideImageUpload = ({ slide, onImageUploaded, onImageRemoved }) => {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) { setError('Please select a valid image file (JPEG, PNG, GIF, or WebP)'); return; }
      if (file.size > 10 * 1024 * 1024) { setError('Image too large. Please use an image under 10MB.'); return; }
      setError(null); setUploading(true); setUploadProgress(0);
      try {
        await trainingService.slides.uploadSlideImage(slide.id, file, (progress) => setUploadProgress(progress));
        const updatedSlides = await trainingService.slides.getSlides(moduleId);
        const updated = updatedSlides.find(s => s.id === slide.id);
        if (updated) { setSelectedSlide(updated); onImageUploaded(updated.image_url); }
      } catch (e) { setError(trainingService.errorHandler.handleApiError(e)); }
      finally { setUploading(false); setUploadProgress(0); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleRemoveImage = async () => {
      if (!confirm('Remove this image from the slide?')) return;
      try {
        await trainingService.slides.removeSlideImage(slide.id, slide.image_info?.id);
        const updatedSlides = await trainingService.slides.getSlides(moduleId);
        const updated = updatedSlides.find(s => s.id === slide.id);
        if (updated) setSelectedSlide(updated);
        onImageRemoved();
      } catch (e) { alert('Failed to remove image: ' + trainingService.errorHandler.handleApiError(e)); }
    };

    if (slide.has_image && slide.image_info) {
      return (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ position: 'relative', height: 300, background: 'var(--color-surface-warm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={slide.image_info.url} alt={slide.image_info.alt_text || 'Slide image'} className="tr-image-preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
          <div style={{ padding: 'var(--space-base)', background: 'var(--color-surface-warm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)' }}>{slide.image_info.filename} ({Math.round(slide.image_info.file_size / 1024)}KB)</span>
            <button className="tr-btn-danger tr-btn-sm" onClick={handleRemoveImage}>Remove Image</button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="tr-image-upload" style={{ background: uploading ? 'var(--color-info-bg)' : 'var(--color-surface-warm)' }}>
          {uploading ? (
            <div>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-base)' }}>📤</div>
              <div className="tr-progress-bar" style={{ marginBottom: 'var(--space-base)' }}><div className="tr-progress-fill" style={{ width: `${uploadProgress}%` }} /></div>
              <p style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--color-primary)' }}>Uploading... {uploadProgress}%</p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>🖼️</div>
              <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)', margin: '0 0 var(--space-base) 0' }}>Click to upload an image</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--space-base) 0' }}>JPEG, PNG, GIF or WebP (max 10MB)</p>
              <button className="tr-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>Choose Image</button>
            </div>
          )}
        </div>
        {error && <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-md)', background: 'var(--color-danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)', fontSize: 'var(--font-size-base)' }}>{typeof error === 'string' ? error : JSON.stringify(error)}</div>}
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleFileSelect} style={{ display: 'none' }} />
      </div>
    );
  };

  const validation = validateSlideForMobile(selectedSlide);

  const CharacterCounter = ({ current, max, warn }) => (
    <span style={{ fontSize: 'var(--font-size-xs)', color: current > max ? 'var(--color-danger)' : current > warn ? 'var(--color-warning)' : 'var(--color-text-muted)', marginLeft: 'var(--space-sm)' }}>
      {current}/{max} {current > warn && '⚠️'}
    </span>
  );

  const MobilePreview = () => {
    if (!selectedSlide) return <div>Select a slide to preview</div>;
    return (
      <div style={{ width: 320, height: 568, background: 'white', border: '8px solid var(--color-charcoal)', borderRadius: 24, padding: 20, overflow: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 'var(--space-base)', lineHeight: 1.3 }}>{selectedSlide.title || 'Slide Title'}</h2>
          {selectedSlide.content && <div style={{ fontSize: '1rem', color: 'var(--color-text)', lineHeight: 1.5, marginBottom: 'var(--space-base)' }}>{selectedSlide.content}</div>}
          {selectedSlide.bullet_points?.length > 0 && <ul style={{ paddingLeft: '1.5rem', fontSize: '1rem', color: 'var(--color-text)', lineHeight: 1.6 }}>{selectedSlide.bullet_points.map((b, i) => b && <li key={i} style={{ marginBottom: 'var(--space-sm)' }}>{b}</li>)}</ul>}
          {selectedSlide.has_image && selectedSlide.image_info && (
            <div style={{ marginTop: 'var(--space-base)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <img src={selectedSlide.image_info.url} alt={selectedSlide.image_info.alt_text || 'Slide image'} style={{ width: '100%', height: 'auto', maxHeight: 200, objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
              {selectedSlide.image_caption && <div style={{ padding: 'var(--space-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', background: 'var(--color-surface-warm)', textAlign: 'center' }}>{selectedSlide.image_caption}</div>}
            </div>
          )}
          <div style={{ marginTop: 'auto', paddingTop: 'var(--space-base)', borderTop: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}>
            {!validation.titleLength && <div style={{ color: 'var(--color-danger)', marginBottom: 2 }}>⚠️ Title too long for mobile</div>}
            {!validation.contentLength && <div style={{ color: 'var(--color-danger)', marginBottom: 2 }}>⚠️ Content too long for mobile</div>}
            {!validation.bulletCount && <div style={{ color: 'var(--color-danger)' }}>⚠️ Too many bullet points for mobile</div>}
          </div>
        </div>
      </div>
    );
  };

  if (moduleLoading || slidesLoading) return <div className="page-container"><div className="tr-loading"><div><h2>Loading Module Editor...</h2><p>Setting up your training module...</p></div></div></div>;
  if (moduleError) return <div className="page-container"><div className="tr-error"><div className="tr-error-content"><h2>Error Loading Module</h2><p>{moduleError}</p><button className="tr-btn-primary" onClick={() => navigate('/training')}>Back to Training</button></div></div></div>;
  if (!module) return <div className="page-container"><div className="tr-loading"><div><h2>Module not found</h2><button className="tr-btn-primary" onClick={() => navigate('/training')}>Back to Training</button></div></div></div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface-warm)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: 'var(--space-base) var(--space-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-base)' }}>
          <button className="tr-btn-ghost" onClick={() => navigate('/training')}>← Back</button>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 600, color: 'var(--color-text)' }}>{module.title}</h1>
            <p style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)' }}>
              {slides.length} slides • {questions.length} questions
              {autoSaving && <span className="tr-autosave tr-autosave--saving"> • Saving...</span>}
              {unsavedChanges && !autoSaving && <span className="tr-autosave tr-autosave--unsaved"> • Unsaved changes</span>}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <button className={showMobilePreview ? 'tr-btn-primary' : 'tr-btn-ghost'} onClick={() => setShowMobilePreview(!showMobilePreview)}>📱 Mobile Preview</button>
          <button className="tr-btn-ghost" onClick={() => navigate('/training')}>Save and Close</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <div className="tr-editor-sidebar" style={{ borderTop: 'none', borderRadius: 0, borderRight: '1px solid var(--color-border)' }}>
          <div className="tr-tab-bar">
            <button className={`tr-tab ${activeTab === 'slides' ? 'active' : ''}`} onClick={() => setActiveTab('slides')}>Slides ({slides.length})</button>
            {module.has_questionnaire && <button className={`tr-tab ${activeTab === 'questions' ? 'active' : ''}`} onClick={() => setActiveTab('questions')}>Quiz ({questions.length})</button>}
          </div>

          {activeTab === 'slides' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: 'var(--space-base)' }}>
                <button className="tr-btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 'var(--space-base)' }} onClick={handleCreateSlide}>+ Add Slide</button>
              </div>
              <div style={{ padding: '0 var(--space-base) var(--space-base)' }}>
                {slides.map((slide, index) => (
                  <div key={slide.id} draggable onDragStart={(e) => handleDragStart(e, index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={handleDragEnd} onDrop={(e) => handleDrop(e, index)} onClick={() => setSelectedSlide(slide)}
                    className={`tr-slide-item ${selectedSlide?.id === slide.id ? 'active' : ''}`}
                    style={{ padding: 'var(--space-md)', border: selectedSlide?.id === slide.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-sm)', opacity: draggedItem === index ? 0.5 : 1, transform: dragOverItem === index && draggedItem !== null && draggedItem !== index ? 'translateY(-2px)' : 'translateY(0)', position: 'relative', display: 'block', background: selectedSlide?.id === slide.id ? 'var(--color-olive-light)' : dragOverItem === index ? 'var(--color-warning-bg)' : 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 500 }}>Slide {index + 1}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteSlide(slide.id); }} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 'var(--font-size-xs)', padding: 'var(--space-xs)' }}>×</button>
                    </div>
                    <h4 style={{ margin: '0 0 var(--space-xs) 0', fontSize: 'var(--font-size-base)', fontWeight: 500, color: selectedSlide?.id === slide.id ? 'var(--color-primary)' : 'var(--color-text)' }}>{slide.title || 'Untitled Slide'}</h4>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
                      {slide.content ? (slide.content.length > 50 ? `${slide.content.substring(0, 50)}...` : slide.content) : `${slide.bullet_points?.length || 0} bullet points`}
                    </p>
                  </div>
                ))}
                {slides.length === 0 && <div className="tr-empty" style={{ padding: 'var(--space-xl) var(--space-base)' }}><div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>📄</div><p style={{ fontSize: 'var(--font-size-base)', margin: 0 }}>No slides yet. Create your first slide.</p></div>}
              </div>
            </div>
          )}

          {activeTab === 'questions' && module.has_questionnaire && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: 'var(--space-base)' }}>
                <button className="tr-btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 'var(--space-base)' }} onClick={() => alert('Question builder coming soon!')}>+ Add Question</button>
              </div>
              <div className="tr-empty" style={{ padding: 'var(--space-xl) var(--space-base)' }}><div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>❓</div><p style={{ fontSize: 'var(--font-size-base)', margin: 0 }}>Question builder will be available in the next update.</p></div>
            </div>
          )}
        </div>

        {/* Main Editor Area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: showMobilePreview ? 2 : 1, background: 'var(--color-surface)', padding: 'var(--space-xl)', overflow: 'auto' }}>
            {selectedSlide ? (
              <div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--color-surface-warm)', borderRadius: 'var(--radius-md)', alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 500, color: 'var(--color-text)' }}>Mobile-Optimized Editor</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: validation.hasContent ? 'var(--color-success)' : 'var(--color-danger)' }}>{validation.hasContent ? '✓ Ready for mobile' : '⚠️ Needs content'}</span>
                </div>

                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <label className="tr-field-label">Slide Title * <CharacterCounter current={selectedSlide.title?.length || 0} max={50} warn={40} /></label>
                  <input className="tr-input" type="text" value={selectedSlide.title || ''} onChange={(e) => handleSlideChange('title', e.target.value)} placeholder="Enter slide title (keep under 50 characters)" style={!validation.titleLength ? { borderColor: 'var(--color-warning)' } : undefined} />
                  {!validation.titleLength && <p style={{ color: 'var(--color-warning)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-xs)' }}>⚠️ Title is too long for mobile display</p>}
                </div>

                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <label className="tr-field-label">Content Text (Optional) <CharacterCounter current={selectedSlide.content?.length || 0} max={200} warn={150} /></label>
                  <textarea className="tr-textarea" value={selectedSlide.content || ''} onChange={(e) => handleSlideChange('content', e.target.value)} placeholder="Enter slide content (2-3 sentences for mobile)" rows={4} style={!validation.contentLength ? { borderColor: 'var(--color-warning)' } : undefined} />
                  {!validation.contentLength && <p style={{ color: 'var(--color-warning)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-xs)' }}>⚠️ Content is too long for mobile display</p>}
                </div>

                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <label className="tr-field-label">
                    Bullet Points (Max 5)
                    <span style={{ fontSize: 'var(--font-size-xs)', color: validation.bulletCount ? 'var(--color-text-muted)' : 'var(--color-warning)', marginLeft: 'var(--space-sm)' }}>{selectedSlide.bullet_points?.length || 0}/5 {!validation.bulletCount && '⚠️'}</span>
                  </label>
                  <div className="tr-bullet-list">
                    {selectedSlide.bullet_points?.map((bullet, index) => (
                      <div key={index} className="tr-bullet-item">
                        <span style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)', minWidth: 20 }}>•</span>
                        <input className="tr-input" type="text" value={bullet} onChange={(e) => handleBulletPointChange(index, e.target.value)} placeholder="Enter bullet point" />
                        <button onClick={() => removeBulletPoint(index)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1rem', padding: 'var(--space-xs)' }}>×</button>
                      </div>
                    ))}
                  </div>
                  {(selectedSlide.bullet_points?.length || 0) < 5 && (
                    <button onClick={addBulletPoint} style={{ background: 'none', border: '1px dashed var(--color-border)', color: 'var(--color-text-muted)', padding: 'var(--space-sm) var(--space-base)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)', width: '100%', marginTop: 'var(--space-sm)' }}>+ Add Bullet Point</button>
                  )}
                </div>

                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <label className="tr-field-label">Slide Image (Optional)</label>
                  <SlideImageUpload slide={selectedSlide} onImageUploaded={(url) => setSelectedSlide({ ...selectedSlide, image_url: url })} onImageRemoved={() => setSelectedSlide({ ...selectedSlide, image_url: null, image_alt_text: null, image_caption: null })} />
                </div>

                <div className="tr-info">
                  <h4 style={{ margin: '0 0 var(--space-sm) 0', fontSize: 'var(--font-size-base)', fontWeight: 600 }}>📱 Mobile Optimization Tips</h4>
                  <ul style={{ margin: 0, paddingLeft: 'var(--space-base)', fontSize: 'var(--font-size-xs)' }}>
                    <li>Keep titles under 50 characters</li><li>Limit content to 2-3 sentences (200 characters)</li>
                    <li>Use maximum 5 bullet points</li><li>Each bullet point should be under 30 characters</li>
                    <li>Images should be landscape and load quickly</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="tr-empty">
                <div className="tr-empty-icon">📝</div>
                <h3>Select a slide to edit</h3>
                <p>Choose a slide from the left panel or create a new one to start editing.</p>
                <button className="tr-btn-primary" onClick={handleCreateSlide}>Create First Slide</button>
              </div>
            )}
          </div>

          {showMobilePreview && (
            <div style={{ width: 400, background: 'var(--color-charcoal)', padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center', alignItems: 'center', borderLeft: '1px solid var(--color-border)' }}>
              <MobilePreview />
            </div>
          )}
        </div>
      </div>

      {unsavedChanges && (
        <div style={{ position: 'fixed', bottom: 'var(--space-base)', right: 'var(--space-base)', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md) var(--space-base)', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: 'var(--font-size-base)', color: '#92400e' }}>
          <div style={{ width: 8, height: 8, background: 'var(--color-warning)', borderRadius: '50%' }} />
          Unsaved changes - Auto-saving...
        </div>
      )}
    </div>
  );
}

export default ModuleEditor;
