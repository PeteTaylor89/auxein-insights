import React, { useState, useEffect } from 'react';
import { AlertCircle, Info } from 'lucide-react';

const SlidingEditForm = ({ 
  isOpen, 
  onClose,
  blockData,
  onSubmit,
  onCreateRows
}) => {
  const [formData, setFormData] = useState({
    block_name: '',
    variety: '',
    clone: '',
    rootstock: '',
    planted_date: '',
    removed_date: '',
    row_spacing: '',
    vine_spacing: '',
    row_start: '',
    row_end: '',
    row_count: '',
    training_system: '',
    swnz: false,
    organic: false,
    biodynamic: false,
    regenerative: false,
    winery: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRowCreation, setShowRowCreation] = useState(false);

  // Load block data when opened or blockData changes
  useEffect(() => {
    if (isOpen && blockData) {
      setError('');
      setFormData({
        block_name: blockData.block_name || '',
        variety: blockData.variety || '',
        clone: blockData.clone || '',
        rootstock: blockData.rootstock || '',
        planted_date: blockData.planted_date || '',
        removed_date: blockData.removed_date || '',
        row_spacing: blockData.row_spacing || '',
        vine_spacing: blockData.vine_spacing || '',
        row_start: blockData.row_start || '',
        row_end: blockData.row_end || '',
        row_count: blockData.row_count || '',
        training_system: blockData.training_system || '',
        swnz: blockData.swnz || false,
        organic: blockData.organic || false,
        biodynamic: blockData.biodynamic || false,
        regenerative: blockData.regenerative || false,
        winery: blockData.winery || ''
      });
    }
  }, [isOpen, blockData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async () => {
    if (!formData.block_name) {
      setError('Block name is required');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      // Prepare update data - convert empty strings to null
      const updateData = {
        block_name: formData.block_name || null,
        variety: formData.variety || null,
        clone: formData.clone || null,
        rootstock: formData.rootstock || null,
        planted_date: formData.planted_date || null,
        removed_date: formData.removed_date || null,
        row_spacing: formData.row_spacing ? parseFloat(formData.row_spacing) : null,
        vine_spacing: formData.vine_spacing ? parseFloat(formData.vine_spacing) : null,
        row_start: formData.row_start || null,
        row_end: formData.row_end || null,
        row_count: formData.row_count ? parseInt(formData.row_count) : null,
        training_system: formData.training_system || null,
        swnz: formData.swnz,
        organic: formData.organic,
        biodynamic: formData.biodynamic,
        regenerative: formData.regenerative,
        winery: formData.winery || null
      };

      await onSubmit(blockData.id, updateData);
      onClose();
    } catch (err) {
      console.error('Error updating block:', err);
      setError(err.response?.data?.detail || 'Failed to update block');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRows = async () => {
    if (!formData.row_start || !formData.row_end || !formData.row_count) {
      setError('Row start, end, and count are required to create rows');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const rowCreationData = {
        block_id: blockData.id,
        row_start: formData.row_start,
        row_end: formData.row_end,
        row_count: parseInt(formData.row_count),
        variety: formData.variety || null,
        clone: formData.clone || null,
        rootstock: formData.rootstock || null,
        vine_spacing: formData.vine_spacing ? parseFloat(formData.vine_spacing) : null
      };

      await onCreateRows(rowCreationData);
      setShowRowCreation(false);
      setError('');
      // Show success message
      alert(`Successfully created ${formData.row_count} rows for block ${formData.block_name}`);
    } catch (err) {
      console.error('Error creating rows:', err);
      setError(err.response?.data?.detail || 'Failed to create rows');
    } finally {
      setLoading(false);
    }
  };

  if (!blockData) return null;

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
          top: 0,
          left: 0,
          bottom: 0,
          width: '800px',
          backgroundColor: 'white',
          boxShadow: '2px 0 20px rgba(0, 0, 0, 0.15)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
          zIndex: 1000,
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
            Edit Vineyard Block - {formData.block_name}
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
        
        {/* Block info header */}
        <div style={{
          backgroundColor: '#f3f4f6',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <strong>Block ID:</strong> {blockData.id}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <strong>Area:</strong> {blockData.area?.toFixed(2)} ha
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <strong>Region:</strong> {blockData.region || 'Not specified'}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <strong>GI:</strong> {blockData.gi || 'Not specified'}
          </div>
        </div>
        
        <div style={{ padding: '1.25rem', paddingBottom: '2rem' }}>
          {error && (
            <div style={{
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
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
              Block Name *
            </label>
            <input
              type="text"
              name="block_name"
              value={formData.block_name}
              onChange={handleChange}
              placeholder="Enter block name"
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

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
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
                Variety
              </label>
              <input
                type="text"
                name="variety"
                value={formData.variety}
                onChange={handleChange}
                placeholder="e.g., Pinot Noir"
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
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                <Info size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
                <strong>Note:</strong> If more than one variety planted (except  field blends), please split block using <strong>Split Block</strong> function.
              </div>
            </div>


            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                Clone
              </label>
              <input
                type="text"
                name="clone"
                value={formData.clone}
                onChange={handleChange}
                placeholder="e.g., 667, UCD6"
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
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                <Info size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
              <strong>Note:</strong> Please indicate majority clone and rootstock in the block - row by row editing available under <strong>Insights.</strong>
              </div>
            </div>

          </div>


          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
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
                Rootstock
              </label>
              <input
                type="text"
                name="rootstock"
                value={formData.rootstock}
                onChange={handleChange}
                placeholder="e.g., 3309, 3306"
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
                Training System
              </label>
              <input
                type="text"
                name="training_system"
                value={formData.training_system}
                onChange={handleChange}
                placeholder="e.g., VSP, Scott Henry"
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
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
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
                Planted Date
              </label>
              <input
                type="date"
                name="planted_date"
                value={formData.planted_date}
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
                Removed Date
              </label>
              <input
                type="date"
                name="removed_date"
                value={formData.removed_date}
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
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
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
                Row Spacing (m)
              </label>
              <input
                type="number"
                name="row_spacing"
                value={formData.row_spacing}
                onChange={handleChange}
                step="0.1"
                placeholder="e.g., 2.4"
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
                Vine Spacing (m)
              </label>
              <input
                type="number"
                name="vine_spacing"
                value={formData.vine_spacing}
                onChange={handleChange}
                step="0.1"
                placeholder="e.g., 1.2"
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
          </div>

          {/* Row Management Section */}
          <div style={{
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.25rem'
          }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.75rem'
            }}>
              Row Management
            </h3>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', marginBottom: '0.7rem' }}>
              <Info size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
            <strong>Note:</strong> For <strong>Row Start</strong> and <strong>Row End,</strong> indicate the naming convention on your vineyard, <strong>Row Count,</strong> indicates the number of rows in this block. Once entered, you can bulk create rows for detailed management. 
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  color: '#374151'
                }}>
                  Row Start
                </label>
                <input
                  type="text"
                  name="row_start"
                  value={formData.row_start}
                  onChange={handleChange}
                  placeholder="e.g., 1 or A"
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
                  Row End
                </label>
                <input
                  type="text"
                  name="row_end"
                  value={formData.row_end}
                  onChange={handleChange}
                  placeholder="e.g., 50 or Z"
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
                  Row Count
                </label>
                <input
                  type="number"
                  name="row_count"
                  value={formData.row_count}
                  onChange={handleChange}
                  placeholder="e.g., 50"
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
            </div>

            {formData.row_start && formData.row_end && formData.row_count && (
              <button
                onClick={() => setShowRowCreation(true)}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  opacity: loading ? 0.6 : 1
                }}
              >
                Create Rows for This Block
              </button>
            )}
          </div>

          <div style={{
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.25rem'
          }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '0.75rem'
            }}>
              Sustainable Management
            </h3>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', marginBottom: '0.7rem' }}>
                <Info size={16} style={{ display: 'inline', marginRight: '0.25rem' }} />
              <strong>Note:</strong> For each selection, additional insights, controls, and reporting will be implemented assisting you in your sustainable wine-growing pursuit.  
              </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                <input
                  type="checkbox"
                  name="swnz"
                  checked={formData.swnz}
                  onChange={handleChange}
                  style={{
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontWeight: 500 }}>SWNZ</span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                <input
                  type="checkbox"
                  name="organic"
                  checked={formData.organic}
                  onChange={handleChange}
                  style={{
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontWeight: 500 }}>Organic</span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                <input
                  type="checkbox"
                  name="biodynamic"
                  checked={formData.biodynamic}
                  onChange={handleChange}
                  style={{
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontWeight: 500 }}>Biodynamic</span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                <input
                  type="checkbox"
                  name="regenerative"
                  checked={formData.regenerative}
                  onChange={handleChange}
                  style={{
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontWeight: 500 }}>Regenerative</span>
              </label>
            </div>
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
              disabled={loading || !formData.block_name}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: loading || !formData.block_name ? 'not-allowed' : 'pointer',
                backgroundColor: '#446145',
                color: 'white',
                opacity: loading || !formData.block_name ? 0.6 : 1
              }}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Row Creation Confirmation Modal */}
      {showRowCreation && (
        <>
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={() => setShowRowCreation(false)}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
            zIndex: 1200
          }}>
            <h3 style={{ 
              fontSize: '1.25rem', 
              fontWeight: 600, 
              marginBottom: '1rem',
              color: '#111827'
            }}>
              Create Rows for Block
            </h3>
            
            <div style={{
              backgroundColor: '#f3f4f6',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem'
            }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>
                You are about to create <strong>{formData.row_count} rows</strong> for block <strong>{formData.block_name}</strong>.
              </p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#374151' }}>
                Rows will be numbered from <strong>{formData.row_start}</strong> to <strong>{formData.row_end}</strong>.
              </p>
              {formData.variety && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#374151' }}>
                  Variety: <strong>{formData.variety}</strong>
                </p>
              )}
              {(formData.clone || formData.rootstock) && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#374151' }}>
                  Clone/Rootstock: <strong>{formData.clone || 'N/A'} / {formData.rootstock || 'N/A'}</strong>
                </p>
              )}
            </div>

            <div style={{ 
              backgroundColor: '#fef3c7', 
              border: '1px solid #fbbf24',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem'
            }}>
              <AlertCircle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '0.125rem' }} />
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>
                This action cannot be undone. Any existing rows for this block will need to be deleted first.
              </p>
            </div>

            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowRowCreation(false)}
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
                onClick={handleCreateRows}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? 'Creating Rows...' : 'Create Rows'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default SlidingEditForm;