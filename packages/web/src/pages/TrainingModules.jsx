import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import {trainingService, api} from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import CreateModuleModal from '../components/training/CreateModuleModal';

// Custom debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function TrainingModules() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  
  // UI state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  
  // Search state - using only local search for real-time filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    published_only: false
  });

  // Check permissions
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const canView = canManage || user?.role === 'user';

  // Memoize the fetch function to prevent unnecessary re-renders
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!canView) {
        setError('You do not have permission to view training modules');
        return;
      }
      
      console.log('🔄 Fetching training data...');
      
      // Fetch modules and stats in parallel - removed search from API call
      const [modulesData, statsData] = await Promise.all([
        trainingService.modules.getModules(filters),
        canManage ? trainingService.reporting.getTrainingStats() : Promise.resolve(null)
      ]);
      
      console.log('✅ Training modules:', modulesData);
      console.log('✅ Training stats:', statsData);
      
      setModules(modulesData || []);
      setStats(statsData);
      
    } catch (error) {
      console.error('❌ Error fetching training data:', error);
      setError(trainingService.errorHandler.handleApiError(error));
    } finally {
      setLoading(false);
    }
  }, [user, filters, canView, canManage]);

  // Fetch data when dependencies change
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  // Filter modules by search term and tab (client-side filtering)
  const getFilteredModules = useCallback(() => {
    const moduleArray = Array.isArray(modules) ? modules : [];
    
    // Filter by search term locally
    let filteredBySearch = moduleArray;
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filteredBySearch = moduleArray.filter(module => 
        module.title.toLowerCase().includes(searchLower) ||
        (module.description && module.description.toLowerCase().includes(searchLower))
      );
    }
    
    // Then filter by active tab
    switch (activeTab) {
      case 'published':
        return filteredBySearch.filter(m => m.is_published);
      case 'drafts':
        return filteredBySearch.filter(m => !m.is_published);
      case 'with-quiz':
        return filteredBySearch.filter(m => m.has_questionnaire);
      default:
        return filteredBySearch;
    }
  }, [modules, activeTab, searchTerm]);

  const filteredModules = getFilteredModules();

  // Handle filter changes
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Handle search input change (immediate local state update)
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  // Handle module actions
  const handleCreateModule = useCallback(() => {
    if (!canManage) {
      alert('You do not have permission to create training modules');
      return;
    }
    setShowCreateModal(true);
  }, [canManage]);

  const handleEditModule = useCallback((moduleId) => {
    navigate(`/training/modules/${moduleId}/edit`);
  }, [navigate]);

  const handlePublishModule = useCallback(async (moduleId) => {
    try {
      await trainingService.modules.publishModule(moduleId, false);
      alert('Training module published successfully!');
      fetchData();
    } catch (error) {
      alert('Failed to publish module: ' + trainingService.errorHandler.handleApiError(error));
    }
  }, [fetchData]);

  const handleArchiveModule = useCallback(async (moduleId) => {
    if (!confirm('Are you sure you want to archive this training module?')) return;
    
    try {
      await trainingService.modules.archiveModule(moduleId);
      alert('Training module archived successfully!');
      fetchData();
    } catch (error) {
      alert('Failed to archive module: ' + trainingService.errorHandler.handleApiError(error));
    }
  }, [fetchData]);

  // NEW: Handle delete module (for unpublished modules only)
  const handleDeleteModule = useCallback(async (moduleId) => {
    if (!confirm('Are you sure you want to permanently delete this training module? This action cannot be undone.')) return;
    
    try {
      await trainingService.modules.archiveModule(moduleId);
      alert('Training module deleted successfully!');
      fetchData();
    } catch (error) {
      alert('Failed to delete module: ' + trainingService.errorHandler.handleApiError(error));
    }
  }, [fetchData]);

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  const StatusBadge = ({ module }) => {
    if (module.is_published) {
      return (
        <span style={{
          background: '#dcfce7',
          color: '#166534',
          padding: '0.25rem 0.5rem',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: '500'
        }}>
          Published
        </span>
      );
    }
    return (
      <span style={{
        background: '#fef3c7',
        color: '#92400e',
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: '500'
      }}>
        Draft
      </span>
    );
  };

  const CategoryBadge = ({ category }) => {
    const colors = {
      safety: { bg: '#fecaca', color: '#991b1b' },
      compliance: { bg: '#fed7aa', color: '#c2410c' },
      operations: { bg: '#dbeafe', color: '#1e40af' },
      onboarding: { bg: '#dcfce7', color: '#166534' },
      skills: { bg: '#e0f2fe', color: '#0369a1' }
    };
    const style = colors[category] || { bg: '#f3f4f6', color: '#374151' };
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: '500',
        textTransform: 'capitalize'
      }}>
        {category?.replace('_', ' ') || 'General'}
      </span>
    );
  };

  // Loading and error states
  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Loading Training Modules...</h2>
          <p>Fetching training data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc',
        paddingTop: '70px'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
          <h2 style={{ color: '#dc2626' }}>❌ Error Loading Training</h2>
          <p style={{ marginBottom: '1rem' }}>{error}</p>
          <button 
            onClick={fetchData}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '1rem' 
      }}>
        
        {/* Header with Stats */}
        {canManage && stats && (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '1px solid #f3f4f6'
            }}>
              <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
                Training Management
              </h1>
              <button 
                onClick={handleCreateModule}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                + Create Module
              </button>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem'
            }}>
              <div style={{
                textAlign: 'center',
                padding: '0.75rem',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#3b82f6' }}>
                  {stats.total_modules}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total Modules</div>
              </div>
              <div style={{
                textAlign: 'center',
                padding: '0.75rem',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#059669' }}>
                  {stats.published_modules}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Published</div>
              </div>
              <div style={{
                textAlign: 'center',
                padding: '0.75rem',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f59e0b' }}>
                  {stats.active_assignments}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Active Assignments</div>
              </div>
              <div style={{
                textAlign: 'center',
                padding: '0.75rem',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#10b981' }}>
                  {Math.round(stats.completion_rate)}%
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Completion Rate</div>
              </div>
              <div style={{
                textAlign: 'center',
                padding: '0.75rem',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#8b5cf6' }}>
                  {Math.round(stats.average_score)}%
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Average Score</div>
              </div>
            </div>
          </div>
        )}

        {/* Filters and Tabs */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '0',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          {/* Search and Filters */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ 
              display: 'flex', 
              gap: '0.75rem', 
              flexWrap: 'wrap',
              alignItems: 'center'
            }}>
              <input
                type="text"
                placeholder="Search modules..."
                value={searchTerm}
                onChange={handleSearchChange}
                style={{
                  flex: 1,
                  minWidth: '200px',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              />
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="">All Categories</option>
                <option value="safety">Safety</option>
                <option value="compliance">Compliance</option>
                <option value="operations">Operations</option>
                <option value="onboarding">Onboarding</option>
                <option value="skills">Skills</option>
              </select>
              {canManage && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={filters.published_only}
                    onChange={(e) => handleFilterChange('published_only', e.target.checked)}
                  />
                  Published Only
                </label>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #f3f4f6'
          }}>
            {[
              { id: 'all', label: 'All Modules', count: Array.isArray(modules) ? modules.length : 0 },
              { id: 'published', label: 'Published', count: Array.isArray(modules) ? modules.filter(m => m.is_published).length : 0 },
              ...(canManage ? [{ id: 'drafts', label: 'Drafts', count: Array.isArray(modules) ? modules.filter(m => !m.is_published).length : 0 }] : []),
              { id: 'with-quiz', label: 'With Quiz', count: Array.isArray(modules) ? modules.filter(m => m.has_questionnaire).length : 0 }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '1rem',
                  border: 'none',
                  background: activeTab === tab.id ? '#f8fafc' : 'white',
                  borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Module List */}
          <div style={{ padding: '1.25rem' }}>
            {filteredModules.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                gap: '1rem'
              }}>
                {filteredModules.map((module) => (
                  <div
                    key={module.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                      background: '#fafafa',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.borderColor = '#3b82f6';
                      e.target.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.background = '#fafafa';
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.75rem'
                    }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{
                          margin: '0 0 0.5rem 0',
                          fontSize: '1rem',
                          fontWeight: '600',
                          color: '#1f2937'
                        }}>
                          {module.title}
                        </h3>
                        <p style={{
                          margin: '0',
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          lineHeight: '1.4'
                        }}>
                          {module.description || 'No description provided'}
                        </p>
                      </div>
                      <StatusBadge module={module} />
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      marginBottom: '1rem',
                      flexWrap: 'wrap'
                    }}>
                      <CategoryBadge category={module.category} />
                      {module.has_questionnaire && (
                        <span style={{
                          background: '#f3e8ff',
                          color: '#7c3aed',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          📝 Quiz
                        </span>
                      )}
                      {module.estimated_duration_minutes && (
                        <span style={{
                          background: '#ecfdf5',
                          color: '#059669',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          ⏱️ {module.estimated_duration_minutes}min
                        </span>
                      )}
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      marginBottom: '1rem'
                    }}>
                      <span>{module.slide_count} slides</span>
                      <span>{module.question_count} questions</span>
                    </div>

                    {canManage && (
                      <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap'
                      }}>
                        <button
                          onClick={() => handleEditModule(module.id)}
                          style={{
                            flex: 1,
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}
                        >
                          ✏️ Edit
                        </button>
                        {!module.is_published ? (
                          <>
                            <button
                              onClick={() => handlePublishModule(module.id)}
                              style={{
                                flex: 1,
                                background: '#059669',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              🚀 Publish
                            </button>
                            <button
                              onClick={() => handleDeleteModule(module.id)}
                              style={{
                                flex: 1,
                                background: '#dc2626',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleArchiveModule(module.id)}
                            style={{
                              flex: 1,
                              background: '#dc2626',
                              color: 'white',
                              border: 'none',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}
                          >
                            🗄️ Archive
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center',
                padding: '3rem 1rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '600' }}>
                  No training modules found
                </h3>
                <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.875rem' }}>
                  {canManage 
                    ? "Create your first training module to get started" 
                    : "No training modules are available yet"
                  }
                </p>
                {canManage && (
                  <button
                    onClick={handleCreateModule}
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
                    Create First Module
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Module Modal */}
      {showCreateModal && (
        <CreateModuleModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchData();
          }}
        />
      )}

      <MobileNavigation />
    </div>
  );
}

export default TrainingModules;