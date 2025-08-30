import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import AppBar from '../components/AppBar';
import SlidingObservationForm from '../components/SlidingObservationForm';
import {observationsService, blocksService} from '@vineyard/shared';

function Observations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [observations, setObservations] = useState([]);
  const [blocks, setBlocks] = useState({});
  const [blocksArray, setBlocksArray] = useState([]);
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [showMapView, setShowMapView] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [showObservationForm, setShowObservationForm] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [fileUrls, setFileUrls] = useState({});
  const [loadingFiles, setLoadingFiles] = useState(new Set());

  useEffect(() => {
    loadObservationsAndBlocks();
    getCurrentLocation();
  }, []);



  const getCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.warn("Could not get location:", error.message);
        }
      );
    }
  };

  const loadObservationsAndBlocks = async () => {
    try {
      setLoading(true);
      console.log('Loading observations and blocks...');
      
      const allObservations = await observationsService.getAllObservations();
      console.log('All observations received:', allObservations.length);
      
      const blocksData = await blocksService.getCompanyBlocks();
      const blocksMap = {};
      const companyBlockIds = [];
      const blocksForForm = [];
      
      if (blocksData.blocks) {
        blocksData.blocks.forEach(block => {
          blocksMap[block.id] = block;
          companyBlockIds.push(block.id);
          blocksForForm.push({
            properties: {
              id: block.id,
              block_name: block.block_name,
              variety: block.variety || 'Unknown'
            },
            geometry: block.geometry
          });
        });
      }
      
      const companyObservations = allObservations
        .filter(obs => companyBlockIds.includes(obs.block_id))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      console.log('Company observations filtered:', companyObservations.length);
      
      setObservations(companyObservations);
      setBlocks(blocksMap);
      setBlocksArray(blocksForForm);

      if (companyObservations.length > 0) {
        await loadFilesForObservations(companyObservations);
      }
      
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load observations');
    } finally {
      setLoading(false);
    }
  };

  const loadFilesForObservations = async (observations) => {
    console.log('Loading files for', observations.length, 'observations');
    const filesMap = {};
    
    const filePromises = observations.map(async (observation) => {
      try {
        console.log(`Loading files for observation ${observation.id}`);
        const observationFiles = await observationsService.getObservationFiles(observation.id);
        console.log(`Found ${observationFiles.length} files for observation ${observation.id}`);
        filesMap[observation.id] = observationFiles;
      } catch (err) {
        console.error(`Error loading files for observation ${observation.id}:`, err);
        filesMap[observation.id] = [];
      }
    });

    await Promise.all(filePromises);
    console.log('All files loaded:', filesMap);
    setFiles(filesMap);
  };

  // Load file URL for display (images) or download (other files)
  const loadFileUrl = async (fileId, observationId) => {
    const cacheKey = `${observationId}-${fileId}`;
    
    // Return cached URL if available
    if (fileUrls[cacheKey]) {
      return fileUrls[cacheKey];
    }

    // Don't load if already loading
    if (loadingFiles.has(cacheKey)) {
      return null;
    }

    try {
      setLoadingFiles(prev => new Set(prev).add(cacheKey));
      const url = await observationsService.getFileUrl(fileId, observationId);
      
      if (url) {
        setFileUrls(prev => ({ ...prev, [cacheKey]: url }));
        return url;
      }
    } catch (error) {
      console.error(`Failed to load file URL for ${cacheKey}:`, error);
    } finally {
      setLoadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(cacheKey);
        return newSet;
      });
    }
    
    return null;
  };

  // Load file URLs for images when observations change
  useEffect(() => {
    const loadAllImageUrls = async () => {
      const imagePromises = [];
      
      observations.forEach(observation => {
        const imageFile = getImageFileForObservation(observation.id);
        if (imageFile) {
          imagePromises.push(loadFileUrl(imageFile.id, observation.id));
        }
      });

      await Promise.all(imagePromises);
    };

    if (observations.length > 0) {
      loadAllImageUrls();
    }
  }, [observations, files]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewOnMap = (observation) => {
    setSelectedObservation(observation);
    setShowMapView(true);
    navigate('/maps', { 
      state: { 
        observation: observation,
        showObservationPin: true 
      }
    });
  };

  const getImageFileForObservation = (observationId) => {
    const observationFiles = files[observationId] || [];
    return observationFiles.find(file => 
      file.mime_type && file.mime_type.startsWith('image/')
    ) || null;
  };

  const isImageFile = (file) => {
    return file.mime_type && file.mime_type.startsWith('image/');
  };

  const getFileIcon = (file) => {
    if (!file.mime_type) return '📄';
    
    if (file.mime_type.startsWith('image/')) return '🖼️';
    if (file.mime_type.startsWith('video/')) return '🎥';
    if (file.mime_type.startsWith('audio/')) return '🎵';
    if (file.mime_type.includes('pdf')) return '📕';
    if (file.mime_type.includes('word') || file.mime_type.includes('document')) return '📝';
    if (file.mime_type.includes('excel') || file.mime_type.includes('spreadsheet')) return '📊';
    if (file.mime_type.includes('zip') || file.mime_type.includes('archive')) return '🗜️';
    
    return '📄';
  };

  const handleFileClick = async (file, observationId) => {
    if (isImageFile(file)) {
      // Open image in viewer
      setSelectedFile({ fileId: file.id, observationId });
      setShowFileViewer(true);
    } else {
      // Download file
      try {
        await observationsService.downloadFile(file.id, observationId, file.file_name);
      } catch (error) {
        console.error('Failed to download file:', error);
        alert('Failed to download file. Please try again.');
      }
    }
  };

  // Debug function
  const debugObservation = async (observationId) => {
    console.log(`Debug mode for observation ${observationId}`);
    const result = await observationsService.debugFileEndpoints(observationId);
    console.log('Debug result:', result);
  };

  const toggleDebugMode = () => {
    setDebugMode(!debugMode);
    console.log(`Debug mode: ${!debugMode ? 'ON' : 'OFF'}`);
  };

  const closeFileViewer = () => {
    setSelectedFile(null);
    setShowFileViewer(false);
  };

  const handleObservationSubmit = async (newObservation) => {
    console.log('New observation created:', newObservation);
    await loadObservationsAndBlocks();
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && showFileViewer) {
        closeFileViewer();
      }
    };

    if (showFileViewer) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [showFileViewer]);

  // AsyncImage component for handling loading states
  const AsyncImage = ({ fileId, observationId, onClick, className = "", alt = "File" }) => {
    const cacheKey = `${observationId}-${fileId}`;
    const imageUrl = fileUrls[cacheKey];
    const isLoading = loadingFiles.has(cacheKey);

    useEffect(() => {
      if (!imageUrl && !isLoading) {
        loadFileUrl(fileId, observationId);
      }
    }, [fileId, observationId, imageUrl, isLoading]);

    if (isLoading) {
      return (
        <div className="file-loading">
          <div className="loading-spinner">Loading...</div>
        </div>
      );
    }

    if (!imageUrl) {
      return (
        <div className="file-error">
          <span>Failed to load</span>
        </div>
      );
    }

    return (
      <img
        src={imageUrl}
        alt={alt}
        className={className}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
        onError={(e) => {
          console.error(`File failed to display: ${cacheKey}`);
          e.target.style.display = 'none';
          const errorDiv = e.target.nextSibling;
          if (errorDiv) errorDiv.style.display = 'block';
        }}
      />
    );
  };

  return (
    <div className="observations-page">
      <AppBar/>
      <div className="page-header">
        <h1>Observations</h1>
        <div className="header-buttons">
          <button 
            className="create-observation-button"
            onClick={() => setShowObservationForm(true)}
          >
            + New Observation
          </button>
          <button 
            className="debug-toggle-button"
            onClick={toggleDebugMode}
            style={{ 
              background: debugMode ? '#ef4444' : '#6b7280',
              marginLeft: '0.5rem'
            }}
          >
            🔍
          </button>
        </div>
      </div>

      <div className="observations-content">
        {loading ? (
          <div className="loading-state">Loading observations...</div>
        ) : error ? (
          <div className="error-state">
            {error}
            <button onClick={loadObservationsAndBlocks} style={{ marginLeft: '1rem' }}>
              Retry
            </button>
          </div>
        ) : observations.length === 0 ? (
          <div className="empty-state">
            <p>No observations yet</p>
            <button onClick={() => setShowObservationForm(true)} className="create-button">
              Create Your First Observation
            </button>
            <button onClick={() => navigate('/maps')} className="create-button secondary">
              Create from Map
            </button>
          </div>
        ) : (
          <div className="observations-grid">
            {observations.map(observation => {
              const firstImageFile = getImageFileForObservation(observation.id);
              const observationFiles = files[observation.id] || [];
              
              return (
                <div key={observation.id} className="observation-card">
                  <div className="observation-image">
                    {firstImageFile ? (
                      <AsyncImage
                        fileId={firstImageFile.id}
                        observationId={observation.id}
                        onClick={() => handleFileClick(firstImageFile, observation.id)}
                        alt="Observation"
                      />
                    ) : (
                      <div className="no-image">📷 No Image</div>
                    )}
                  </div>
                  <div className="observation-details">
                    <div className="observation-header">
                      <h3>{observation.observation_type}</h3>
                      <div className="header-actions">
                        {debugMode && (
                          <button 
                            className="debug-btn"
                            onClick={() => debugObservation(observation.id)}
                            title="Debug this observation"
                          >
                            🔍
                          </button>
                        )}
                        <button 
                          className="map-pin-btn"
                          onClick={() => handleViewOnMap(observation)}
                          title="View on map"
                        >
                          📍
                        </button>
                      </div>
                    </div>
                    <div className="observation-meta">
                      <div className="observation-date">{formatDate(observation.created_at)}</div>
                      <div className="observation-block">
                        {blocks[observation.block_id]?.block_name || `Block ${observation.block_id}`}
                      </div>
                    </div>
                    <div className="observation-notes">{observation.notes}</div>
                    {observation.location && (
                      <div className="observation-coords">
                        📍 Location captured
                      </div>
                    )}
                    
                    {/* File attachments */}
                    {observationFiles.length > 0 && (
                      <div className="file-attachments">
                        <div className="file-count">{observationFiles.length} file{observationFiles.length !== 1 ? 's' : ''} attached</div>
                        <div className="file-list">
                          {observationFiles.slice(0, 3).map(file => (
                            <button
                              key={file.id}
                              className="file-button"
                              onClick={() => handleFileClick(file, observation.id)}
                              title={`${isImageFile(file) ? 'View' : 'Download'} ${file.file_name}`}
                            >
                              <span className="file-icon">{getFileIcon(file)}</span>
                              <span className="file-name">{file.file_name}</span>
                            </button>
                          ))}
                          {observationFiles.length > 3 && (
                            <span className="file-more">+{observationFiles.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    {debugMode && (
                      <div className="debug-info">
                        Obs ID: {observation.id} | Files: {observationFiles.length} | Images: {observationFiles.filter(f => f.mime_type?.startsWith('image/')).length}
                        {firstImageFile && ` | Image File ID: ${firstImageFile.id}`}
                        {firstImageFile && (
                          <div style={{ fontSize: '0.6rem', wordBreak: 'break-all' }}>
                            Cached URL: {fileUrls[`${observation.id}-${firstImageFile.id}`] || 'Loading...'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SlidingObservationForm
        isOpen={showObservationForm}
        onClose={() => setShowObservationForm(false)}
        blocks={blocksArray}
        currentLocation={currentLocation}
        user={user}
        onSubmit={handleObservationSubmit}
      />

      <MobileNavigation />

      {/* File Viewer Modal - Only for images */}
      {showFileViewer && selectedFile && (
        <div className="file-viewer-overlay" onClick={closeFileViewer}>
          <div className="file-viewer-container">
            <button 
              className="file-viewer-close" 
              onClick={closeFileViewer}
              aria-label="Close file viewer"
            >
              ✕
            </button>
            <AsyncImage
              fileId={selectedFile.fileId}
              observationId={selectedFile.observationId}
              className="file-viewer-image"
              alt="Observation File - Full Size"
            />
            <div className="file-viewer-info">
              <p>Observation File</p>
              <p className="file-viewer-hint">Tap outside to close</p>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .observations-page {
          min-height: 100vh;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
        }

        .page-header {
          padding: 1rem;
          padding-top: 70px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .page-header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #111827;
        }

        .header-buttons {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .create-observation-button {
          background: #446145;
          color: white;
          border: none;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .create-observation-button:hover {
          background: #374532;
        }

        .observations-content {
          flex: 1;
          padding: 1rem;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          padding-bottom: 80px;
        }

        .observations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.5rem;
        }

        .observation-card {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          display: flex;
          height: 150px;
        }

        .observation-image {
          width: 150px;
          flex-shrink: 0;
          background: #f3f4f6;
        }

        .observation-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          cursor: pointer;
          transition: opacity 0.2s ease;
        }

        .observation-image img:hover {
          opacity: 0.9;
        }

        .observation-image img:active {
          opacity: 0.8;
        }

        .no-image {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .observation-details {
          flex: 1;
          padding: 1rem;
          display: flex;
          flex-direction: column;
        }

        .observation-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }

        .observation-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        .header-actions {
          display: flex;
          gap: 0.25rem;
        }

        .map-pin-btn, .debug-btn {
          background: #3b82f6;
          color: white;
          border: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
        }

        .debug-btn {
          background: #ef4444;
        }

        .observation-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.75rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }

        .observation-notes {
          font-size: 0.875rem;
          color: #4b5563;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          flex: 1;
        }

        .observation-coords {
          font-size: 0.75rem;
          color: #3b82f6;
          margin-top: 0.5rem;
        }

        .loading-state, .error-state, .empty-state {
          text-align: center;
          padding: 3rem;
          color: #6b7280;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .create-button {
          background: #446145;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .create-button:hover {
          background: #374532;
        }

        .create-button.secondary {
          background: #3b82f6;
        }

        .create-button.secondary:hover {
          background: #2563eb;
        }

        @media (max-width: 768px) {
          .observations-grid {
            grid-template-columns: 1fr;
          }
          
          .page-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          
          .header-buttons {
            width: 100%;
            justify-content: flex-start;
          }
        }

        /* Image Viewer Styles */
        .image-viewer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
          backdrop-filter: blur(4px);
        }

        .image-viewer-container {
          position: relative;
          max-width: 95vw;
          max-height: 95vh;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .image-viewer-close {
          position: absolute;
          top: -3rem;
          right: 0;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 50%;
          font-size: 1.25rem;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #374151;
          backdrop-filter: blur(4px);
          z-index: 1001;
        }

        .image-viewer-close:hover {
          background: rgba(255, 255, 255, 1);
        }

        .image-viewer-image {
          max-width: 100%;
          max-height: 80vh;
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        }

        .image-viewer-info {
          margin-top: 1rem;
          color: white;
          text-align: center;
        }

        .image-viewer-info p {
          margin: 0.25rem 0;
          font-size: 0.875rem;
        }

        .image-viewer-hint {
          opacity: 0.7;
          font-size: 0.75rem !important;
        }

        /* Mobile optimizations for image viewer */
        @media (max-width: 768px) {
          .image-viewer-overlay {
            padding: 0.5rem;
          }

          .image-viewer-close {
            top: -2.5rem;
            width: 2rem;
            height: 2rem;
            font-size: 1rem;
          }

          .image-viewer-image {
            max-height: 85vh;
          }

          .image-viewer-info {
            margin-top: 0.5rem;
          }
        }

        /* Touch-friendly hover effects on mobile */
        @media (hover: none) and (pointer: coarse) {
          .observation-image img:hover {
            opacity: 1;
          }
          
          .observation-image img:active {
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}

export default Observations;