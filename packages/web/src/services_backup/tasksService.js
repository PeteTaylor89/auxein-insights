// src/services/tasksService.js
import api from './api';

const tasksService = {
  getAllTasks: async (params = {}) => {
    const response = await api.get('/tasks/', { params });
    return response.data;
  },
  
  createTask: async (taskData) => {
    const response = await api.post('/tasks/', taskData);  // Added trailing slash
    return response.data;
  },
  
  getTaskById: async (id) => {
    const response = await api.get(`/tasks/${id}`);
    return response.data;
  },
  
  updateTask: async (id, data) => {
    const response = await api.put(`/tasks/${id}`, data);
    return response.data;
  },
  
  deleteTask: async (id) => {
    const response = await api.delete(`/tasks/${id}`);
    return response.data;
  },
  
  getTasksByBlock: async (blockId, params = {}) => {
    const response = await api.get(`/tasks/block/${blockId}`, { params });
    return response.data;
  },
  
  getTasksByUser: async (userId, params = {}) => {
    const response = await api.get(`/tasks/user/${userId}`, { params });
    return response.data;
  },
  
  // New method for admin users to get tasks by company
  getTasksByCompany: async (companyId, params = {}) => {
    const response = await api.get(`/tasks/company/${companyId}`, { params });
    return response.data;
  },
  
  // Enhanced filtering method with common task filters
  getFilteredTasks: async (filters = {}) => {
    const {
      status,
      priority,
      assignedTo,
      blockId,
      dueBefore,
      dueAfter,
      createdBy,
      completionDate,
      title,
      description,
      ...otherParams
    } = filters;
    
    const params = {
      ...otherParams,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(assignedTo && { assigned_to: assignedTo }),
      ...(blockId && { block_id: blockId }),
      ...(dueBefore && { due_before: dueBefore }),
      ...(dueAfter && { due_after: dueAfter })

    };
    
    const response = await api.get('/tasks', { params });
    return response.data;
  },
  
  // Method to get task statistics
  getTaskStats: async (params = {}) => {
    const response = await api.get('/tasks', { 
      params: { ...params, limit: 1000 } // Get more tasks for statistics
    });
    
    const tasks = response.data;
    const stats = {
      total: tasks.length,
      byStatus: tasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {}),
      byPriority: tasks.reduce((acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
      }, {}),
      overdue: tasks.filter(task => 
        task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
      ).length
    };
    
    return stats;
  }
};

export default tasksService;