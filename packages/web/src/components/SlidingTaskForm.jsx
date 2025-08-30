import React, { useState, useEffect } from 'react';
import * as turf from '@turf/turf';

const SlidingTaskForm = ({ 
  isOpen, 
  onClose, 
  blocks, 
  users, 
  currentLocation, 
  user,
  onSubmit 
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    block_id: '',
    assigned_to: '',
    due_date: '',
    priority: 'medium',
    task_type: 'general'
  });
  
  const [detectedBlock, setDetectedBlock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setError('');
      setFormData({
        title: '',
        description: '',
        block_id: '',
        assigned_to: '',
        due_date: '',
        priority: 'medium',
        task_type: 'general'
      });
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

  const handleSubmit = async () => {
    if (!formData.title || !formData.block_id) {
      setError('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const taskData = {
        ...formData,
        block_id: parseInt(formData.block_id),
        assigned_to: formData.assigned_to ? parseInt(formData.assigned_to) : null
      };

      await onSubmit(taskData);
      onClose();
    } catch (err) {
      console.error('Error creating task:', err);
      setError(err.response?.data?.detail || 'Failed to create task');
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
            Create New Task
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
        
        {detectedBlock && (
          <div style={{
            backgroundColor: '#e8f5e9',
            border: '1px solid #4caf50',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            margin: '1rem 1.25rem',
            color: '#2e7d32',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.125rem' }}>📍</span>
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
              Task Title *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g., Prune rows 1-10"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.875rem',
              color: '#374151'
            }}>
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Add detailed instructions or notes..."
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                resize: 'vertical',
                minHeight: '80px'
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
                Assign To
              </label>
              <select
                name="assigned_to"
                value={formData.assigned_to}
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
                <option value="">Unassigned</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                  </option>
                ))}
              </select>
            </div>
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
                Due Date
              </label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
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
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                Priority
              </label>
              <select
                name="priority"
                value={formData.priority}
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
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
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
              Task Type
            </label>
            <select
              name="task_type"
              value={formData.task_type}
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
              <option value="pruning">Pruning</option>
              <option value="spraying">Spraying</option>
              <option value="harvesting">Harvesting</option>
              <option value="maintenance">Maintenance</option>
              <option value="irrigation">Irrigation</option>
              <option value="canopy">Canopy Management</option>
            </select>
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
              disabled={loading || !formData.block_id}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: loading || !formData.block_id ? 'not-allowed' : 'pointer',
                backgroundColor: '#446145',
                color: 'white',
                opacity: loading || !formData.block_id ? 0.6 : 1
              }}
            >
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SlidingTaskForm;