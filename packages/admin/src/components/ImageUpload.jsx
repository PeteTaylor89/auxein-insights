// src/components/ImageUpload.jsx - Drag-and-drop image upload for featured images
import { useState, useRef, useCallback } from 'react';
import { ImagePlus, X, RefreshCw } from 'lucide-react';
import publicApi from '../services/publicApi';
import './ImageUpload.css';

function ImageUpload({ value, onChange, purpose = 'featured' }) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const uploadFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await publicApi.post(`/admin/articles/images?purpose=${purpose}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data.url, res.data.thumbnail_url || null);
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Image upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [onChange, purpose]);

  const handleClick = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
      e.target.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleRemove = () => onChange('', null);

  if (value) {
    return (
      <div className="image-upload-wrapper">
        <div className="image-upload-preview">
          <img src={value} alt="Featured" />
          <div className="image-upload-preview-actions">
            <button type="button" className="image-upload-remove-btn" onClick={handleRemove}>
              <X size={14} /> Remove
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="image-upload-wrapper">
      <div
        className={`image-upload-dropzone ${dragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {uploading ? (
          <>
            <RefreshCw size={24} className="image-upload-spinner" />
            <span className="image-upload-dropzone-text">Uploading...</span>
          </>
        ) : (
          <>
            <ImagePlus size={24} className="image-upload-dropzone-icon" />
            <span className="image-upload-dropzone-text">
              <strong>Click to upload</strong> or drag and drop
            </span>
            <span className="image-upload-dropzone-hint">JPEG, PNG, WebP or GIF (max 10 MB)</span>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}

export default ImageUpload;
