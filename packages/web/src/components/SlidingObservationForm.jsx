import React, { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';
import {observationsService} from '@vineyard/shared';


console.log('Imported observationsService:', observationsService);
console.log('Methods available:', Object.getOwnPropertyNames(observationsService));


const SlidingObservationForm = ({ 
  isOpen, 
  onClose, 
  blocks, 
  currentLocation, 
  user,
  onSubmit 
}) => {
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    notes: '',
    block_id: '',
    observation_type: 'general'
  });
  
  const [detectedBlock, setDetectedBlock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setError('');
      setFormData({
        notes: '',
        block_id: '',
        observation_type: 'general'
      });
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      checkLocationInBlock();
    }
  }, [isOpen]);

  const checkLocationInBlock = () => {
    if (!currentLocation || blocks.length === 0) return;

    const point = turf.point([currentLocation.longitude, currentLocation.latitude]);
    
    for (const block of blocks) {
      if (block.geometry && block.geometry.type === 'Polygon') {
        const polygon = turf.polygon(block.geometry.coordinates);
        if (turf.booleanPointInPolygon(point, polygon)) {
          setDetectedBlock(block);
          setFormData(prev => ({
            ...prev,
            block_id: block.properties.id.toString()
          }));
          break;
        }
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    
    // Validate file sizes
    const oversizedFiles = files.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError('One or more files exceed the 10MB limit');
      return;
    }

    // Create file objects with previews for images
    const fileObjects = files.map(file => {
      const fileObj = {
        file,
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type,
        size: file.size,
        preview: null
      };

      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedFiles(prev => prev.map(f => 
            f.id === fileObj.id ? { ...f, preview: reader.result } : f
          ));
        };
        reader.readAsDataURL(file);
      }

      return fileObj;
    });

    setSelectedFiles(prev => [...prev, ...fileObjects]);
  };

  const removeFile = (fileId) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
    // Reset file input if all files removed
    if (selectedFiles.length === 1) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSubmit = async () => {
    if (!formData.notes || !formData.block_id) {
      setError('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      // Prepare observation data
      const observationData = {
        notes: formData.notes,
        block_id: parseInt(formData.block_id),
        observation_type: formData.observation_type,
        location: currentLocation ? {
          type: 'Point',
          coordinates: [currentLocation.longitude, currentLocation.latitude]
        } : null
      };

      // Extract files to upload
      const filesToUpload = selectedFiles.map(fileObj => fileObj.file);

      // Create observation with files in one call
      const newObservation = await observationsService.createObservationWithFiles(
        observationData, 
        filesToUpload
      );

      // Call the onSubmit callback if provided
      if (onSubmit) {
        await onSubmit(newObservation);
      }

      onClose();
    } catch (err) {
      console.error('Error creating observation:', err);
      setError(err.response?.data?.detail || 'Failed to create observation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`backdrop ${isOpen ? 'active' : ''}`}
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isOpen ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0)',
          visibility: isOpen ? 'visible' : 'hidden',
          transition: 'all 0.3s ease',
          zIndex: 999
        }}
      />
      
      {/* Sliding Panel */}
      <div 
        className={`sliding-panel ${isOpen ? 'open' : ''}`}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -2px 20px rgba(0, 0, 0, 0.15)',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease',
          zIndex: 1000,
          maxHeight: '90vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem 1.25rem 1rem',
          borderBottom: '1px solid #f3f4f6',
          position: 'sticky',
          top: 0,
          backgroundColor: 'white',
          zIndex: 10
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
            Create New Observation
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '0.25rem',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>
        
        {currentLocation && (
          <div style={{
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            margin: '1rem 1.25rem 0',
            color: '#1565c0',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.125rem' }}>📍</span>
            <span>Location captured: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}</span>
          </div>
        )}

        {detectedBlock && (
          <div style={{
            backgroundColor: '#e8f5e9',
            border: '1px solid #4caf50',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            margin: '0.5rem 1.25rem',
            color: '#2e7d32',
            fontSize: '0.875rem',
            textAlign: 'center'
          }}>
            <span>You are in block: <strong>{detectedBlock.properties.block_name}</strong></span>
          </div>
        )}
        
        <div style={{ padding: '1.25rem', paddingBottom: '2rem' }}>
          {error && (
            <div style={{
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}
          
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              color: '#374151'
            }}>
              Observation Notes *
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="5"
              placeholder="Describe what you observed in detail..."
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                resize: 'vertical',
                minHeight: '120px'
              }}
            />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: window.innerWidth > 480 ? '1fr 1fr' : '1fr',
            gap: '1rem',
            marginBottom: '1.25rem'
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                Vineyard Block *
              </label>
              <select
                name="block_id"
                value={formData.block_id}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">Select a block</option>
                {blocks.map(block => (
                  <option key={block.properties.id} value={block.properties.id}>
                    {block.properties.block_name} ({block.properties.variety})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                Type
              </label>
              <select
                name="observation_type"
                value={formData.observation_type}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="general">General</option>
                <option value="disease">Disease</option>
                <option value="pests">Pests</option>
                <option value="irrigation">Irrigation</option>
                <option value="weather">Weather</option>
                <option value="development">Development</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              color: '#374151'
            }}>
              Add Files (Optional)
            </label>
            <div style={{
              border: '2px dashed #e5e7eb',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#f9fafb',
              transition: 'all 0.2s'
            }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.txt"
                capture="environment"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '2rem' }}>📎</span>
                <span>Add Photos or Documents</span>
              </button>
            </div>

            {/* File Preview List */}
            {selectedFiles.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Selected files ({selectedFiles.length}):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedFiles.map(fileObj => (
                    <div key={fileObj.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}>
                      {fileObj.preview ? (
                        <img 
                          src={fileObj.preview} 
                          alt="Preview"
                          style={{
                            width: '40px',
                            height: '40px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            flexShrink: 0
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.25rem',
                          flexShrink: 0
                        }}>
                          📄
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: '#374151',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {fileObj.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {formatFileSize(fileObj.size)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(fileObj.id)}
                        style={{
                          backgroundColor: '#dc2626',
                          color: 'white',
                          border: 'none',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          flexShrink: 0
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'flex-end',
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #f3f4f6'
          }}>
            <button 
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                backgroundColor: '#f3f4f6',
                color: '#4b5563',
                opacity: loading ? 0.6 : 1
              }}
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={loading || !formData.block_id || !formData.notes}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: loading || !formData.block_id || !formData.notes ? 'not-allowed' : 'pointer',
                backgroundColor: '#446145',
                color: 'white',
                opacity: loading || !formData.block_id || !formData.notes ? 0.6 : 1
              }}
            >
              {loading ? 'Creating...' : 'Create Observation'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SlidingObservationForm;