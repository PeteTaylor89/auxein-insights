import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { trainingService, api } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import CreateModuleModal from '../components/training/CreateModuleModal';
import './Training.css';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function TrainingModules() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ category: '', published_only: false });

  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const canView = canManage || user?.role === 'user';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      if (!canView) { setError('You do not have permission to view training modules'); return; }
      const [modulesData, statsData] = await Promise.all([
        trainingService.modules.getModules(filters),
        canManage ? trainingService.reporting.getTrainingStats() : Promise.resolve(null)
      ]);
      setModules(modulesData || []);
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching training data:', error);
      setError(trainingService.errorHandler.handleApiError(error));
    } finally { setLoading(false); }
  }, [user, filters, canView, canManage]);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const getFilteredModules = useCallback(() => {
    const arr = Array.isArray(modules) ? modules : [];
    let filtered = arr;
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      filtered = arr.filter(m => m.title.toLowerCase().includes(s) || (m.description && m.description.toLowerCase().includes(s)));
    }
    switch (activeTab) {
      case 'published': return filtered.filter(m => m.is_published);
      case 'drafts': return filtered.filter(m => !m.is_published);
      default: return filtered;
    }
  }, [modules, activeTab, searchTerm]);

  const filteredModules = getFilteredModules();

  const handleFilterChange = useCallback((key, value) => setFilters(prev => ({ ...prev, [key]: value })), []);
  const handleSearchChange = useCallback((e) => setSearchTerm(e.target.value), []);
  const handleCreateModule = useCallback(() => { if (!canManage) { alert('You do not have permission to create training modules'); return; } setShowCreateModal(true); }, [canManage]);
  const handleEditModule = useCallback((id) => navigate(`/training/modules/${id}/edit`), [navigate]);

  const handlePublishModule = useCallback(async (id) => {
    try { await trainingService.modules.publishModule(id, false); alert('Training module published successfully!'); fetchData(); }
    catch (e) { alert('Failed to publish module: ' + trainingService.errorHandler.handleApiError(e)); }
  }, [fetchData]);

  const handleArchiveModule = useCallback(async (id) => {
    if (!confirm('Are you sure you want to archive this training module?')) return;
    try { await trainingService.modules.archiveModule(id); alert('Training module archived successfully!'); fetchData(); }
    catch (e) { alert('Failed to archive module: ' + trainingService.errorHandler.handleApiError(e)); }
  }, [fetchData]);

  const handleDeleteModule = useCallback(async (id) => {
    if (!confirm('Are you sure you want to permanently delete this training module? This action cannot be undone.')) return;
    try { await trainingService.modules.archiveModule(id); alert('Training module deleted successfully!'); fetchData(); }
    catch (e) { alert('Failed to delete module: ' + trainingService.errorHandler.handleApiError(e)); }
  }, [fetchData]);

  useEffect(() => { document.body.classList.add("primary-bg"); return () => document.body.classList.remove("primary-bg"); }, []);

  const StatusBadge = ({ module }) => (
    <span className={`tr-badge ${module.is_published ? 'tr-badge--published' : 'tr-badge--draft'}`}>
      {module.is_published ? 'Published' : 'Draft'}
    </span>
  );

  const CategoryBadge = ({ category }) => (
    <span className={`tr-badge tr-badge--${category || 'general'}`}>
      {category?.replace('_', ' ') || 'General'}
    </span>
  );

  if (loading) return <div className="page-container"><div className="tr-loading"><div><h2>Loading Training Modules...</h2><p>Fetching training data...</p></div></div></div>;

  if (error) return (
    <div className="page-container">
      <div className="tr-error"><div className="tr-error-content">
        <h2>Error Loading Training</h2>
        <p>{error}</p>
        <button className="tr-btn-primary" onClick={fetchData}>Retry</button>
      </div></div>
    </div>
  );

  return (
    <div className="page-container">
      {canManage && stats && (
        <div className="tr-stats-card">
          <div className="tr-stats-header">
            <h1>Training Management</h1>
            <button className="tr-btn-primary" onClick={handleCreateModule}>+ Create Module</button>
          </div>
          <div className="tr-stats-grid">
            <div className="tr-stat"><div className="tr-stat-value" style={{ color: 'var(--color-primary)' }}>{stats.total_modules}</div><div className="tr-stat-label">Total Modules</div></div>
            <div className="tr-stat"><div className="tr-stat-value" style={{ color: 'var(--color-success)' }}>{stats.published_modules}</div><div className="tr-stat-label">Published</div></div>
            <div className="tr-stat"><div className="tr-stat-value" style={{ color: 'var(--color-warning)' }}>{stats.active_assignments}</div><div className="tr-stat-label">Active Assignments</div></div>
          </div>
        </div>
      )}

      <div className="tr-tab-card">
        <div className="tr-filters-bar">
          <div className="tr-filters">
            <input className="tr-search" type="text" placeholder="Search modules..." value={searchTerm} onChange={handleSearchChange} />
            <select className="tr-filter-select" value={filters.category} onChange={(e) => handleFilterChange('category', e.target.value)}>
              <option value="">All Categories</option>
              <option value="safety">Safety</option><option value="compliance">Compliance</option>
              <option value="operations">Operations</option><option value="onboarding">Onboarding</option>
              <option value="skills">Skills</option>
            </select>
            {canManage && (
              <label className="tr-filter-checkbox">
                <input type="checkbox" checked={filters.published_only} onChange={(e) => handleFilterChange('published_only', e.target.checked)} />
                Published Only
              </label>
            )}
          </div>
        </div>

        <div className="tr-tab-bar">
          {[
            { id: 'all', label: 'All Modules', count: Array.isArray(modules) ? modules.length : 0 },
            { id: 'published', label: 'Published', count: Array.isArray(modules) ? modules.filter(m => m.is_published).length : 0 },
            ...(canManage ? [{ id: 'drafts', label: 'Drafts', count: Array.isArray(modules) ? modules.filter(m => !m.is_published).length : 0 }] : [])
          ].map(tab => (
            <button key={tab.id} className={`tr-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="tr-tab-content">
          {filteredModules.length > 0 ? (
            <div className="tr-module-grid">
              {filteredModules.map(module => (
                <div key={module.id} className="tr-module-card">
                  <div className="tr-module-card-header">
                    <div style={{ flex: 1 }}>
                      <h3 className="tr-module-card-title">{module.title}</h3>
                      <p className="tr-module-card-desc">{module.description || 'No description provided'}</p>
                    </div>
                    <StatusBadge module={module} />
                  </div>

                  <div className="tr-module-badges">
                    <CategoryBadge category={module.category} />
                    {module.has_questionnaire && <span className="tr-badge tr-badge--quiz">Quiz</span>}
                    {module.estimated_duration_minutes && <span className="tr-badge tr-badge--duration">{module.estimated_duration_minutes}min</span>}
                  </div>

                  <div className="tr-module-meta">
                    <span>{module.slide_count} slides</span>
                    <span>{module.question_count} questions</span>
                  </div>

                  {canManage && (
                    <div className="tr-module-actions">
                      <button className="tr-btn-primary" onClick={() => handleEditModule(module.id)}>Edit</button>
                      {!module.is_published ? (
                        <>
                          <button className="tr-btn-success" onClick={() => handlePublishModule(module.id)}>Publish</button>
                          <button className="tr-btn-danger" onClick={() => handleDeleteModule(module.id)}>Delete</button>
                        </>
                      ) : (
                        <button className="tr-btn-danger" onClick={() => handleArchiveModule(module.id)}>Archive</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="tr-empty">
              <div className="tr-empty-icon">📚</div>
              <h3>No training modules found</h3>
              <p>{canManage ? "Create your first training module to get started" : "No training modules are available yet"}</p>
              {canManage && <button className="tr-btn-primary" onClick={handleCreateModule}>Create First Module</button>}
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateModuleModal onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); fetchData(); }} />
      )}

      <MobileNavigation />
    </div>
  );
}

export default TrainingModules;
