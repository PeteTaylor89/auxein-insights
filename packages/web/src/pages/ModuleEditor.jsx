

import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { useTrainingModule, useTrainingSlides, useTrainingQuestions } from '@vineyard/shared';
import {trainingService, api} from '@vineyard/shared';

function ModuleEditor() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  useEffect(() => {
    console.log('=== MODULE EDITOR DEBUG ===');
    console.log('trainingService:', trainingService);
    console.log('trainingService.slides methods:', Object.keys(trainingService.slides || {}));
    console.log('Has uploadSlideImage?', typeof trainingService.slides?.uploadSlideImage);
    console.log('===========================');
  }, []);
  // Hooks for data management
  const { module, loading: moduleLoading, error: moduleError, updateModule } = useTrainingModule(moduleId);
  const { slides, loading: slidesLoading, createSlide, updateSlide, deleteSlide, reorderSlides } = useTrainingSlides(moduleId);
  const { questions, loading: questionsLoading, createQuestion, updateQuestion, deleteQuestion } = useTrainingQuestions(moduleId);
  
  // UI state
  const [activeTab, setActiveTab] = useState('slides');
  const [selectedSlide, setSelectedSlide] = useState(null);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  
  // Auto-save functionality
  const autoSaveTimeoutRef = useRef(null);
  
  // Check permissions
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  
  useEffect(() => {
    if (!canManage) {
      navigate('/training');
      return;
    }
    
    // Select first slide if available
    if (slides.length > 0 && !selectedSlide) {
      setSelectedSlide(slides[0]);
    }
  }, [canManage, navigate, slides, selectedSlide]);

  // Auto-save when content changes
  const triggerAutoSave = (slideData) => {
    setUnsavedChanges(true);
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        setAutoSaving(true);
        if (selectedSlide?.id) {
          await updateSlide(selectedSlide.id, slideData);
          setUnsavedChanges(false);
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setAutoSaving(false);
      }
    }, 2000); // Auto-save after 2 seconds of inactivity
  };

  // Cleanup auto-save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Handle slide content changes
  const handleSlideChange = (field, value) => {
    const updatedSlide = { ...selectedSlide, [field]: value };
    setSelectedSlide(updatedSlide);
    
    // Trigger auto-save
    triggerAutoSave({ [field]: value });
  };

  // Handle slide reordering
  const handleSlideReorder = async (dragIndex, hoverIndex) => {
    try {
      const draggedSlide = slides[dragIndex];
      const newSlides = [...slides];
      
      // Remove dragged item and insert it at new position
      newSlides.splice(dragIndex, 1);
      newSlides.splice(hoverIndex, 0, draggedSlide);
      
      // Update order property for all slides
      const updatedSlides = newSlides.map((slide, index) => ({
        ...slide,
        order: index + 1
      }));
      
      // Update server with new order
      await reorderSlides(updatedSlides);
      
    } catch (error) {
      console.error('Failed to reorder slides:', error);
      alert('Failed to reorder slides: ' + error.message);
    }
  };

  // Drag and drop handlers
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
    e.dataTransfer.setDragImage(e.target, 0, 0);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItem(index);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    
    if (draggedItem !== null && draggedItem !== dropIndex) {
      await handleSlideReorder(draggedItem, dropIndex);
    }
    
    handleDragEnd();
  };

  // Handle bullet point changes
  const handleBulletPointChange = (index, value) => {
    const updatedBulletPoints = [...(selectedSlide.bullet_points || [])];
    updatedBulletPoints[index] = value;
    
    const updatedSlide = { ...selectedSlide, bullet_points: updatedBulletPoints };
    setSelectedSlide(updatedSlide);
    
    triggerAutoSave({ bullet_points: updatedBulletPoints });
  };

  const addBulletPoint = () => {
    const updatedBulletPoints = [...(selectedSlide.bullet_points || []), ''];
    const updatedSlide = { ...selectedSlide, bullet_points: updatedBulletPoints };
    setSelectedSlide(updatedSlide);
    
    triggerAutoSave({ bullet_points: updatedBulletPoints });
  };

  const removeBulletPoint = (index) => {
    const updatedBulletPoints = selectedSlide.bullet_points?.filter((_, i) => i !== index) || [];
    const updatedSlide = { ...selectedSlide, bullet_points: updatedBulletPoints };
    setSelectedSlide(updatedSlide);
    
    triggerAutoSave({ bullet_points: updatedBulletPoints });
  };

  // Create new slide
  const handleCreateSlide = async () => {
    try {
      const newSlide = await createSlide({
        title: 'New Slide',
        content: '',
        bullet_points: [],
        order: slides.length + 1
      });
      setSelectedSlide(newSlide);
    } catch (error) {
      alert('Failed to create slide: ' + error.message);
    }
  };

  // Delete slide
  const handleDeleteSlide = async (slideId) => {
    if (!confirm('Are you sure you want to delete this slide?')) return;
    
    try {
      await deleteSlide(slideId);
      
      // Select another slide if the current one was deleted
      if (selectedSlide?.id === slideId) {
        const remainingSlides = slides.filter(s => s.id !== slideId);
        setSelectedSlide(remainingSlides.length > 0 ? remainingSlides[0] : null);
      }
    } catch (error) {
      alert('Failed to delete slide: ' + error.message);
    }
  };

  // Validate content for mobile
  const validateSlideForMobile = (slide) => {
    if (!slide) return {};
    
    return {
      titleLength: slide.title?.length < 50,
      contentLength: (slide.content?.length || 0) < 200,
      bulletCount: (slide.bullet_points?.length || 0) <= 5,
      hasContent: slide.title && (slide.content || (slide.bullet_points?.length > 0))
    };
  };

const SlideImageUpload = ({ slide, onImageUploaded, onImageRemoved }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large. Please use an image under 10MB.');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await trainingService.slides.uploadSlideImage(
        slide.id, 
        file,
        (progress) => setUploadProgress(progress)
      );
      
      const updatedSlides = await trainingService.slides.getSlides(moduleId);
      const updatedSlide = updatedSlides.find(s => s.id === slide.id);
      
      if (updatedSlide) {
        setSelectedSlide(updatedSlide);
        onImageUploaded(updatedSlide.image_url);
      }
      
    } catch (error) {
      const errorMessage = trainingService.errorHandler.handleApiError(error);
      setError(errorMessage);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async () => {
    if (!confirm('Remove this image from the slide?')) return;

    try {
      await trainingService.slides.removeSlideImage(slide.id, slide.image_info?.id);
      
      const updatedSlides = await trainingService.slides.getSlides(moduleId);
      const updatedSlide = updatedSlides.find(s => s.id === slide.id);
      
      if (updatedSlide) {
        setSelectedSlide(updatedSlide);
      }
      
      onImageRemoved();
    } catch (error) {
      const errorMessage = trainingService.errorHandler.handleApiError(error);
      alert('Failed to remove image: ' + errorMessage);
    }
  };

  if (slide.has_image && slide.image_info) {
    return (
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'relative',
          height: '300px',
          background: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <img 
            src={slide.image_info.url}
            alt={slide.image_info.alt_text || 'Slide image'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block'
            }}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div style={{
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            height: '200px',
            color: '#6b7280',
            background: '#f3f4f6'
          }}>
            Image failed to load
          </div>
        </div>
        
        <div style={{
          padding: '1rem',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {slide.image_info.filename} ({Math.round(slide.image_info.file_size / 1024)}KB)
          </div>
          <button
            onClick={handleRemoveImage}
            style={{
              background: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem'
            }}
          >
            Remove Image
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        border: '2px dashed #d1d5db',
        borderRadius: '8px',
        padding: '2rem',
        textAlign: 'center',
        background: uploading ? '#f0f9ff' : '#fafafa'
      }}>
        {uploading ? (
          <div>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📤</div>
            <div style={{
              background: '#e5e7eb',
              borderRadius: '999px',
              height: '8px',
              marginBottom: '1rem',
              overflow: 'hidden'
            }}>
              <div style={{
                background: '#3b82f6',
                height: '100%',
                width: `${uploadProgress}%`,
                borderRadius: '999px',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#3b82f6' }}>
              Uploading... {uploadProgress}%
            </p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🖼️</div>
            <p style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              margin: '0 0 1rem 0'
            }}>
              Click to upload an image
            </p>
            <p style={{
              fontSize: '0.75rem',
              color: '#9ca3af',
              margin: '0 0 1rem 0'
            }}>
              JPEG, PNG, GIF or WebP (max 10MB)
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Choose Image
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.75rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#dc2626',
          fontSize: '0.875rem'
        }}>
          {typeof error === 'string' ? error : JSON.stringify(error)}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
};


  const validation = validateSlideForMobile(selectedSlide);

  // Character counters
  const CharacterCounter = ({ current, max, warn }) => (
    <span style={{
      fontSize: '0.75rem',
      color: current > max ? '#dc2626' : current > warn ? '#f59e0b' : '#6b7280'
    }}>
      {current}/{max} {current > warn && '⚠️'}
    </span>
  );

  // Mobile preview component
  const MobilePreview = () => {
    if (!selectedSlide) return <div>Select a slide to preview</div>;
    
    return (
      <div style={{
        width: '320px',
        height: '568px',
        background: 'white',
        border: '8px solid #1f2937',
        borderRadius: '24px',
        padding: '20px',
        overflow: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Mobile slide content */}
        <div style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Title */}
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '1rem',
            lineHeight: '1.3'
          }}>
            {selectedSlide.title || 'Slide Title'}
          </h2>
          
          {/* Content */}
          {selectedSlide.content && (
            <div style={{
              fontSize: '1rem',
              color: '#374151',
              lineHeight: '1.5',
              marginBottom: '1rem'
            }}>
              {selectedSlide.content}
            </div>
          )}
          
          {/* Bullet points */}
          {selectedSlide.bullet_points && selectedSlide.bullet_points.length > 0 && (
            <ul style={{
              paddingLeft: '1.5rem',
              fontSize: '1rem',
              color: '#374151',
              lineHeight: '1.6'
            }}>
              {selectedSlide.bullet_points.map((bullet, index) => (
                bullet && <li key={index} style={{ marginBottom: '0.5rem' }}>{bullet}</li>
              ))}
            </ul>
          )}
          
          {/* Real Image Display */}
          {selectedSlide.has_image && selectedSlide.image_info && (
            <div style={{
              marginTop: '1rem',
              borderRadius: '8px',
              overflow: 'hidden',
              
            }}>
              <img 
                src={selectedSlide.image_info.url}
                alt={selectedSlide.image_info.alt_text || 'Slide image'}
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '200px',
                  objectFit: 'cover'
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              {selectedSlide.image_caption && (
                <div style={{
                  padding: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  background: '#f9fafb',
                  textAlign: 'center'
                }}>
                  {selectedSlide.image_caption}
                </div>
              )}
            </div>
          )}
          
          {/* Mobile-specific warnings */}
          <div style={{
            marginTop: 'auto',
            paddingTop: '1rem',
            borderTop: '1px solid #e5e7eb',
            fontSize: '0.75rem'
          }}>
            {!validation.titleLength && (
              <div style={{ color: '#dc2626', marginBottom: '0.25rem' }}>
                ⚠️ Title too long for mobile
              </div>
            )}
            {!validation.contentLength && (
              <div style={{ color: '#dc2626', marginBottom: '0.25rem' }}>
                ⚠️ Content too long for mobile
              </div>
            )}
            {!validation.bulletCount && (
              <div style={{ color: '#dc2626', marginBottom: '0.25rem' }}>
                ⚠️ Too many bullet points for mobile
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Loading state
  if (moduleLoading || slidesLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Loading Module Editor...</h2>
          <p>Setting up your training module...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (moduleError) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
          <h2 style={{ color: '#dc2626' }}>❌ Error Loading Module</h2>
          <p style={{ marginBottom: '1rem' }}>{moduleError}</p>
          <button 
            onClick={() => navigate('/training')} 
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Back to Training
          </button>
        </div>
      </div>
    );
  }

  if (!module) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Module not found</h2>
          <button 
            onClick={() => navigate('/training')} 
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Back to Training
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/training')}
            style={{
              background: 'none',
              border: '1px solid #d1d5db',
              padding: '0.5rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            ← Back
          </button>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1f2937'
            }}>
              {module.title}
            </h1>
            <p style={{
              margin: 0,
              fontSize: '0.875rem',
              color: '#6b7280'
            }}>
              {slides.length} slides • {questions.length} questions
              {autoSaving && <span style={{ color: '#f59e0b' }}> • Saving...</span>}
              {unsavedChanges && <span style={{ color: '#dc2626' }}> • Unsaved changes</span>}
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setShowMobilePreview(!showMobilePreview)}
            style={{
              background: showMobilePreview ? '#3b82f6' : 'white',
              color: showMobilePreview ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            📱 Mobile Preview
          </button>
          
          <button
            onClick={() => navigate(`/training`)}
            style={{
              background: showMobilePreview ? '#3b82f6' : 'white',
              color: showMobilePreview ? 'white' : '#374151',
              border: '1px solid #d1d5db',
              padding: '0.6rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Save and Close
          </button>
          
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden'
      }}>
        {/* Left Sidebar - Slide List */}
        <div style={{
          width: '300px',
          background: 'white',
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <button
              onClick={() => setActiveTab('slides')}
              style={{
                flex: 1,
                padding: '1rem',
                border: 'none',
                background: activeTab === 'slides' ? '#f8fafc' : 'white',
                borderBottom: activeTab === 'slides' ? '2px solid #3b82f6' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: activeTab === 'slides' ? '#3b82f6' : '#6b7280'
              }}
            >
              Slides ({slides.length})
            </button>
            {module.has_questionnaire && (
              <button
                onClick={() => setActiveTab('questions')}
                style={{
                  flex: 1,
                  padding: '1rem',
                  border: 'none',
                  background: activeTab === 'questions' ? '#f8fafc' : 'white',
                  borderBottom: activeTab === 'questions' ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: activeTab === 'questions' ? '#3b82f6' : '#6b7280'
                }}
              >
                Quiz ({questions.length})
              </button>
            )}
          </div>

          {/* Slide List */}
          {activeTab === 'slides' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: '1rem' }}>
                <button
                  onClick={handleCreateSlide}
                  style={{
                    width: '100%',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    marginBottom: '1rem'
                  }}
                >
                  + Add Slide
                </button>
              </div>
              
              <div style={{ padding: '0 1rem 1rem' }}>
                {slides.map((slide, index) => (
                  <div
                    key={slide.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={() => setSelectedSlide(slide)}
                    style={{
                      padding: '0.75rem',
                      border: selectedSlide?.id === slide.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                      borderRadius: '6px',
                      marginBottom: '0.5rem',
                      cursor: 'pointer',
                      background: selectedSlide?.id === slide.id ? '#f0f9ff' : 
                                 dragOverItem === index ? '#fef3c7' : 'white',
                      transition: 'all 0.2s ease',
                      opacity: draggedItem === index ? 0.5 : 1,
                      transform: dragOverItem === index && draggedItem !== null && draggedItem !== index ? 
                                'translateY(-2px)' : 'translateY(0)',
                      boxShadow: dragOverItem === index && draggedItem !== null && draggedItem !== index ? 
                                '0 4px 8px rgba(0, 0, 0, 0.1)' : 'none',
                      position: 'relative'
                    }}
                  >
                    {/* Drag handle */}
                    <div 
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        left: '0.5rem',
                        top: '0.75rem',
                        cursor: 'grab',
                        color: '#6b7280',
                        padding: '0.25rem',
                        background: '#f9fafb',
                        borderRadius: '4px',
                        border: '1px solid #e5e7eb',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        userSelect: 'none',
                        zIndex: 5,
                        fontSize: '14px'
                      }}
                      title="Drag to reorder"
                    >
                      ≡
                    </div>
                    
                    <div style={{ paddingLeft: '3rem' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            fontWeight: '500'
                          }}>
                            Slide {index + 1}
                          </span>
                          <span style={{
                            fontSize: '0.625rem',
                            color: '#9ca3af',
                            fontStyle: 'italic'
                          }}>
                            (drag to reorder)
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSlide(slide.id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            padding: '0.25rem'
                          }}
                        >
                          ×
                        </button>
                      </div>
                      
                      <h4 style={{
                        margin: '0 0 0.25rem 0',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#1f2937'
                      }}>
                        {slide.title || 'Untitled Slide'}
                      </h4>
                      
                      <p style={{
                        margin: 0,
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        lineHeight: '1.3'
                      }}>
                        {slide.content ? 
                          (slide.content.length > 50 ? `${slide.content.substring(0, 50)}...` : slide.content) :
                          `${slide.bullet_points?.length || 0} bullet points`
                        }
                      </p>
                      
                      {/* Mobile validation indicators */}
                      <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        gap: '0.25rem'
                      }}>
                        {validateSlideForMobile(slide).hasContent && (
                          <span style={{ fontSize: '0.625rem', color: '#059669' }}>✓</span>
                        )}
                        {!validateSlideForMobile(slide).titleLength && (
                          <span style={{ fontSize: '0.625rem', color: '#dc2626' }}>📏</span>
                        )}
                        {!validateSlideForMobile(slide).contentLength && (
                          <span style={{ fontSize: '0.625rem', color: '#dc2626' }}>📝</span>
                        )}
                        {!validateSlideForMobile(slide).bulletCount && (
                          <span style={{ fontSize: '0.625rem', color: '#dc2626' }}>📋</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Drop indicator */}
                    {dragOverItem === index && draggedItem !== null && draggedItem !== index && (
                      <div style={{
                        position: 'absolute',
                        top: draggedItem < index ? '100%' : '-2px',
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: '#3b82f6',
                        borderRadius: '1px',
                        zIndex: 10
                      }} />
                    )}
                  </div>
                ))}
                
                {slides.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    color: '#6b7280'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}>
                      No slides yet. Create your first slide to get started.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Question List */}
          {activeTab === 'questions' && module.has_questionnaire && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: '1rem' }}>
                <button
                  onClick={() => alert('Question builder coming soon!')}
                  style={{
                    width: '100%',
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    marginBottom: '1rem'
                  }}
                >
                  + Add Question
                </button>
              </div>
              
              <div style={{
                textAlign: 'center',
                padding: '2rem 1rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>❓</div>
                <p style={{ fontSize: '0.875rem', margin: 0 }}>
                  Question builder will be available in the next update.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Main Editor Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden'
        }}>
          {/* Content Editor */}
          <div style={{
            flex: showMobilePreview ? 2 : 1,
            background: 'white',
            padding: '2rem',
            overflow: 'auto'
          }}>
            {selectedSlide ? (
              <div>
                {/* Basic Formatting Toolbar */}
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '1.5rem',
                  padding: '0.75rem',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  alignItems: 'center'
                }}>
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Mobile-Optimized Editor
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={{
                    fontSize: '0.75rem',
                    color: validation.hasContent ? '#059669' : '#dc2626'
                  }}>
                    {validation.hasContent ? '✓ Ready for mobile' : '⚠️ Needs content'}
                  </span>
                </div>

                {/* Slide Title */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Slide Title *
                    <CharacterCounter 
                      current={selectedSlide.title?.length || 0} 
                      max={50} 
                      warn={40} 
                    />
                  </label>
                  <input
                    type="text"
                    value={selectedSlide.title || ''}
                    onChange={(e) => handleSlideChange('title', e.target.value)}
                    placeholder="Enter slide title (keep under 50 characters for mobile)"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: `1px solid ${validation.titleLength ? '#d1d5db' : '#f59e0b'}`,
                      borderRadius: '6px',
                      fontSize: '1rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  {!validation.titleLength && (
                    <p style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      ⚠️ Title is too long for mobile display
                    </p>
                  )}
                </div>

                {/* Slide Content */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Content Text (Optional)
                    <CharacterCounter 
                      current={selectedSlide.content?.length || 0} 
                      max={200} 
                      warn={150} 
                    />
                  </label>
                  <textarea
                    value={selectedSlide.content || ''}
                    onChange={(e) => handleSlideChange('content', e.target.value)}
                    placeholder="Enter slide content (2-3 sentences maximum for mobile)"
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: `1px solid ${validation.contentLength ? '#d1d5db' : '#f59e0b'}`,
                      borderRadius: '6px',
                      fontSize: '1rem',
                      resize: 'vertical',
                      boxSizing: 'border-box'
                    }}
                  />
                  {!validation.contentLength && (
                    <p style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      ⚠️ Content is too long for mobile display
                    </p>
                  )}
                </div>

                {/* Bullet Points */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Bullet Points (Max 5 for mobile)
                    <span style={{
                      fontSize: '0.75rem',
                      color: validation.bulletCount ? '#6b7280' : '#f59e0b'
                    }}>
                      {' '}{selectedSlide.bullet_points?.length || 0}/5
                      {!validation.bulletCount && ' ⚠️'}
                    </span>
                  </label>
                  
                  {selectedSlide.bullet_points?.map((bullet, index) => (
                    <div key={index} style={{
                      display: 'flex',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      alignItems: 'center'
                    }}>
                      <span style={{
                        fontSize: '0.875rem',
                        color: '#6b7280',
                        minWidth: '20px'
                      }}>
                        •
                      </span>
                      <input
                        type="text"
                        value={bullet}
                        onChange={(e) => handleBulletPointChange(index, e.target.value)}
                        placeholder="Enter bullet point (30 characters max for mobile)"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}
                      />
                      <button
                        onClick={() => removeBulletPoint(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          padding: '0.25rem'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  
                  {(selectedSlide.bullet_points?.length || 0) < 5 && (
                    <button
                      onClick={addBulletPoint}
                      style={{
                        background: 'none',
                        border: '1px dashed #d1d5db',
                        color: '#6b7280',
                        padding: '0.5rem 1rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        width: '100%'
                      }}
                    >
                      + Add Bullet Point
                    </button>
                  )}
                </div>

                {/* Image Upload */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    Slide Image (Optional)
                  </label>
                  
                  <SlideImageUpload 
                    slide={selectedSlide}
                    onImageUploaded={(imageUrl) => {
                      const updatedSlide = { ...selectedSlide, image_url: imageUrl };
                      setSelectedSlide(updatedSlide);
                    }}
                    onImageRemoved={() => {
                      const updatedSlide = { 
                        ...selectedSlide, 
                        image_url: null, 
                        image_alt_text: null, 
                        image_caption: null 
                      };
                      setSelectedSlide(updatedSlide);
                    }}
                  />
                </div>

                {/* Mobile Optimization Tips */}
                <div style={{
                  background: '#f0f9ff',
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  padding: '1rem'
                }}>
                  <h4 style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: '#1e40af'
                  }}>
                    📱 Mobile Optimization Tips
                  </h4>
                  <ul style={{
                    margin: 0,
                    paddingLeft: '1rem',
                    fontSize: '0.75rem',
                    color: '#1e40af'
                  }}>
                    <li>Keep titles under 50 characters</li>
                    <li>Limit content to 2-3 sentences (200 characters)</li>
                    <li>Use maximum 5 bullet points</li>
                    <li>Each bullet point should be under 30 characters</li>
                    <li>Images should be landscape and load quickly</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                <h3 style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '1.25rem',
                  fontWeight: '600'
                }}>
                  Select a slide to edit
                </h3>
                <p style={{
                  margin: '0 0 2rem 0',
                  fontSize: '0.875rem'
                }}>
                  Choose a slide from the left panel or create a new one to start editing.
                </p>
                <button
                  onClick={handleCreateSlide}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  Create First Slide
                </button>
              </div>
            )}
          </div>

          {/* Mobile Preview Panel */}
          {showMobilePreview && (
            <div style={{
              width: '400px',
              background: '#1f2937',
              padding: '2rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              borderLeft: '1px solid #e5e7eb'
            }}>
              <MobilePreview />
            </div>
          )}
        </div>
      </div>

      {/* Mobile Preview Modal */}
      {showMobilePreview && window.innerWidth < 1200 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1f2937',
            borderRadius: '12px',
            padding: '2rem',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowMobilePreview(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
            <MobilePreview />
          </div>
        </div>
      )}

      {/* Unsaved Changes Warning */}
      {unsavedChanges && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem',
          color: '#92400e'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            background: '#f59e0b',
            borderRadius: '50%'
          }} />
          Unsaved changes - Auto-saving...
        </div>
      )}
    </div>
  );
}

export default ModuleEditor;