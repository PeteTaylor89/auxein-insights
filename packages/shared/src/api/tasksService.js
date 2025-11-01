// packages/shared/src/api/tasksService.js
import api from './api';

const tasksService = {
  // ============================================================================
  // TASK TEMPLATES
  // ============================================================================
  
  getTemplates: async (params = {}) => {
    const res = await api.get('/tasks/task-templates', { params });
    return res.data;
  },

  getQuickCreateTemplates: async (taskCategory = null) => {
    const params = taskCategory ? { task_category: taskCategory } : {};
    const res = await api.get('/tasks/task-templates/quick-create', { params });
    return res.data;
  },

  getTemplate: async (templateId) => {
    const res = await api.get(`/tasks/task-templates/${templateId}`);
    return res.data;
  },

  createTemplate: async (payload) => {
    const res = await api.post('/tasks/task-templates', payload);
    return res.data;
  },

  updateTemplate: async (templateId, payload) => {
    const res = await api.patch(`/tasks/task-templates/${templateId}`, payload);
    return res.data;
  },

  deleteTemplate: async (templateId) => {
    const res = await api.delete(`/tasks/task-templates/${templateId}`);
    return res.data;
  },

  // ============================================================================
  // TASKS - CRUD
  // ============================================================================

  listTasks: async (params = {}) => {
    const res = await api.get('/tasks/tasks', { params });
    return res.data;
  },

  getTask: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}`);
    return res.data;
  },

  createTask: async (payload) => {
    const res = await api.post('/tasks/tasks', payload);
    return res.data;
  },

  quickCreateTask: async (payload) => {
    const res = await api.post('/tasks/tasks/quick-create', payload);
    return res.data;
  },

  updateTask: async (taskId, payload) => {
    const res = await api.patch(`/tasks/tasks/${taskId}`, payload);
    return res.data;
  },

  deleteTask: async (taskId) => {
    const res = await api.delete(`/tasks/tasks/${taskId}`);
    return res.data;
  },

  addTaskAsset: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/assets`, payload);
    return res.data;
  },

  // ============================================================================
  // TASKS - ACTIONS
  // ============================================================================

  startTask: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/start`, payload);
    return res.data;
  },

  pauseTask: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/pause`, payload);
    return res.data;
  },

  resumeTask: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/resume`, payload);
    return res.data;
  },

  completeTask: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/complete`, payload);
    return res.data;
  },

  cancelTask: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/cancel`, payload);
    return res.data;
  },

  // ============================================================================
  // TASK ASSIGNMENTS
  // ============================================================================

  assignUser: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/assignments`, payload);
    return res.data;
  },

  assignMultipleUsers: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/assignments/bulk`, payload);
    return res.data;
  },

  listAssignments: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/assignments`);
    return res.data;
  },

  removeAssignment: async (taskId, assignmentId) => {
    const res = await api.delete(`/tasks/tasks/${taskId}/assignments/${assignmentId}`);
    return res.data;
  },

  acceptAssignment: async (taskId, assignmentId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/assignments/${assignmentId}/accept`, payload);
    return res.data;
  },

  declineAssignment: async (taskId, assignmentId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/assignments/${assignmentId}/decline`, payload);
    return res.data;
  },

  // ============================================================================
  // TASK ROWS
  // ============================================================================

  addRow: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/rows`, payload);
    return res.data;
  },

  addRowsBulk: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/rows/bulk`, payload);
    return res.data;
  },

  listRows: async (taskId, status = null) => {
    const params = status ? { status } : {};
    const res = await api.get(`/tasks/tasks/${taskId}/rows`, { params });
    return res.data;
  },

  completeRow: async (taskId, rowId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/rows/${rowId}/complete`, payload);
    return res.data;
  },

  skipRow: async (taskId, rowId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/rows/${rowId}/skip`, payload);
    return res.data;
  },

  getRowProgress: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/rows/progress`);
    return res.data;
  },

  // ============================================================================
  // GPS TRACKING
  // ============================================================================

  startGpsTracking: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/start`, payload);
    return res.data;
  },

  addGpsPoint: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/points`, payload);
    return res.data;
  },

  addGpsPointsBulk: async (taskId, payload) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/points/bulk`, payload);
    return res.data;
  },

  pauseGpsTracking: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/pause`, payload);
    return res.data;
  },

  resumeGpsTracking: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/resume`, payload);
    return res.data;
  },

  stopGpsTracking: async (taskId, payload = {}) => {
    const res = await api.post(`/tasks/tasks/${taskId}/gps/stop`, payload);
    return res.data;
  },

  getGpsTrack: async (taskId, params = {}) => {
    const res = await api.get(`/tasks/tasks/${taskId}/gps/track`, { params });
    return res.data;
  },

  getGpsStats: async (taskId) => {
    const res = await api.get(`/tasks/tasks/${taskId}/gps/stats`);
    return res.data;
  },

  // ============================================================================
  // TASK VIEWS & REPORTS
  // ============================================================================

  getMyTasks: async (params = {}) => {
    const res = await api.get('/tasks/tasks/my-tasks', { params });
    return res.data;
  },

  getCalendarTasks: async (startDate, endDate) => {
    const res = await api.get('/tasks/tasks/calendar', {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    });
    return res.data;
  },

  getStats: async () => {
    const res = await api.get('/tasks/tasks/stats');
    return res.data;
  },

  // ============================================================================
  // FILE ATTACHMENTS
  // ============================================================================

  uploadTaskPhoto: async (taskId, file, description = null, onProgress = null) => {
    const formData = new FormData();
    formData.append('entity_type', 'task');
    formData.append('entity_id', String(taskId));
    formData.append('file_category', 'photo');
    if (description) formData.append('description', description);
    formData.append('file', file);

    const res = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    });
    return res.data;
  },

  uploadTaskDocument: async (taskId, file, description = null, onProgress = null) => {
    const formData = new FormData();
    formData.append('entity_type', 'task');
    formData.append('entity_id', String(taskId));
    formData.append('file_category', 'document');
    if (description) formData.append('description', description);
    formData.append('file', file);

    const res = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    });
    return res.data;
  },

  uploadTaskFile: async (taskId, file, fileCategory = 'document', description = null, onProgress = null) => {
    const formData = new FormData();
    formData.append('entity_type', 'task');
    formData.append('entity_id', String(taskId));
    formData.append('file_category', fileCategory);
    if (description) formData.append('description', description);
    formData.append('file', file);

    const res = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    });
    return res.data;
  },

  listTaskPhotos: async (taskId) => {
    const res = await api.get(`/files/entity/task/${taskId}`, {
      params: { file_category: 'photo' }
    });
    return res.data;
  },

  listTaskDocuments: async (taskId) => {
    const res = await api.get(`/files/entity/task/${taskId}`, {
      params: { file_category: 'document' }
    });
    return res.data;
  },

  listTaskFiles: async (taskId, fileCategory = null) => {
    const params = fileCategory ? { file_category: fileCategory } : {};
    const res = await api.get(`/files/entity/task/${taskId}`, { params });
    return res.data;
  },

  deleteTaskFile: async (fileId) => {
    const res = await api.delete(`/files/${fileId}`);
    return res.data;
  },

  getFileDownloadUrl: (file) => {
    return file?.download_url || file?.file_url || `/files/${file.id}/download`;
  },

  // ============================================================================
  // HELPER UTILITIES
  // ============================================================================

  // Format task for display
  formatTask: (task) => {
    return {
      ...task,
      statusLabel: tasksService.getStatusLabel(task.status),
      priorityLabel: tasksService.getPriorityLabel(task.priority),
      categoryLabel: tasksService.getCategoryLabel(task.task_category),
      durationDisplay: tasksService.formatDuration(task.duration_minutes),
      progressDisplay: `${task.progress_percentage}%`
    };
  },

  // Get human-readable status label
  getStatusLabel: (status) => {
    const labels = {
      draft: 'Draft',
      scheduled: 'Scheduled',
      ready: 'Ready',
      in_progress: 'In Progress',
      paused: 'Paused',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    return labels[status] || status;
  },

  // Get priority label
  getPriorityLabel: (priority) => {
    const labels = {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      urgent: 'Urgent'
    };
    return labels[priority] || priority;
  },

  // Get category label
  getCategoryLabel: (category) => {
    const labels = {
      vineyard: 'Vineyard',
      land_management: 'Land Management',
      asset_management: 'Asset Management',
      compliance: 'Compliance',
      general: 'General'
    };
    return labels[category] || category;
  },

  // Format duration in minutes to human-readable
  formatDuration: (minutes) => {
    if (!minutes) return '0 min';
    if (minutes < 60) return `${minutes} min`;
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  },

  // Get status color/badge
  getStatusColor: (status) => {
    const colors = {
      draft: 'gray',
      scheduled: 'blue',
      ready: 'green',
      in_progress: 'yellow',
      paused: 'orange',
      completed: 'green',
      cancelled: 'red'
    };
    return colors[status] || 'gray';
  },

  // Get priority color
  getPriorityColor: (priority) => {
    const colors = {
      low: 'gray',
      medium: 'blue',
      high: 'orange',
      urgent: 'red'
    };
    return colors[priority] || 'gray';
  },

  // Check if task can be started
  canStartTask: (task) => {
    return task?.can_start === true || 
           ['draft', 'scheduled', 'ready'].includes(task?.status);
  },

  // Check if task can be paused
  canPauseTask: (task) => {
    return task?.status === 'in_progress';
  },

  // Check if task can be resumed
  canResumeTask: (task) => {
    return task?.status === 'paused';
  },

  // Check if task can be completed
  canCompleteTask: (task) => {
    return ['in_progress', 'paused', 'ready', 'scheduled'].includes(task?.status);
  },

  // Check if task can be cancelled
  canCancelTask: (task) => {
    return !['completed', 'cancelled'].includes(task?.status);
  },

  // Get file type from mime type
  getFileType: (file) => {
    const mime = file.mime_type || '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.includes('excel') || mime.includes('spreadsheet') || file.original_filename?.endsWith('.xlsx')) return 'excel';
    if (mime === 'text/csv' || file.original_filename?.endsWith('.csv')) return 'csv';
    if (mime.includes('word') || file.original_filename?.endsWith('.docx')) return 'word';
    return 'document';
  },

  // Get appropriate icon for file type
  getFileIcon: (file) => {
    const type = tasksService.getFileType(file);
    const icons = {
      image: '🖼️',
      video: '🎥',
      pdf: '📄',
      excel: '📊',
      csv: '📈',
      word: '📝',
      document: '📎'
    };
    return icons[type] || '📎';
  },

  // Format file size
  formatFileSize: (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Calculate task progress percentage
  calculateProgress: (task) => {
    if (task.status === 'completed') return 100;
    if (task.status === 'cancelled') return task.progress_percentage || 0;
    
    // Use rows if available
    if (task.rows_total && task.rows_total > 0) {
      return Math.round((task.rows_completed / task.rows_total) * 100);
    }
    
    // Use area if available
    if (task.area_total_hectares && task.area_completed_hectares) {
      return Math.round((task.area_completed_hectares / task.area_total_hectares) * 100);
    }
    
    return task.progress_percentage || 0;
  },

  // Check if task is overdue
  isOverdue: (task) => {
    if (!task.scheduled_start_date) return false;
    if (['completed', 'cancelled'].includes(task.status)) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduledDate = new Date(task.scheduled_start_date);
    scheduledDate.setHours(0, 0, 0, 0);
    
    return scheduledDate < today;
  },

  // Get days until/overdue
  getDaysUntil: (task) => {
    if (!task.scheduled_start_date) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduledDate = new Date(task.scheduled_start_date);
    scheduledDate.setHours(0, 0, 0, 0);
    
    const diffTime = scheduledDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  },

  // Format days until display
  formatDaysUntil: (task) => {
    const days = tasksService.getDaysUntil(task);
    
    if (days === null) return 'No date set';
    if (days < 0) return `${Math.abs(days)} days overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
  }
};

// Separate file service object (similar to observationFileService)
const taskFileService = {
  uploadPhoto: async (taskId, file, onProgress = null) => {
    return tasksService.uploadTaskPhoto(taskId, file, `Task photo: ${file.name}`, onProgress);
  },

  uploadDocument: async (taskId, file, onProgress = null) => {
    return tasksService.uploadTaskDocument(taskId, file, `Task document: ${file.name}`, onProgress);
  },

  uploadFile: async (taskId, file, fileCategory = 'document', onProgress = null) => {
    return tasksService.uploadTaskFile(taskId, file, fileCategory, `Task ${fileCategory}: ${file.name}`, onProgress);
  },

  getPhotos: async (taskId) => {
    return tasksService.listTaskPhotos(taskId);
  },

  getDocuments: async (taskId) => {
    return tasksService.listTaskDocuments(taskId);
  },

  getFiles: async (taskId, fileCategory = null) => {
    return tasksService.listTaskFiles(taskId, fileCategory);
  },

  deleteFile: async (fileId) => {
    return tasksService.deleteTaskFile(fileId);
  },

  getDownloadUrl: (file) => {
    return tasksService.getFileDownloadUrl(file);
  },

  getFileType: (file) => {
    return tasksService.getFileType(file);
  },

  getFileIcon: (file) => {
    return tasksService.getFileIcon(file);
  },

  formatFileSize: (bytes) => {
    return tasksService.formatFileSize(bytes);
  }
};

// Export with file service nested (same pattern as observationService)
export default {
  ...tasksService,
  files: taskFileService
};