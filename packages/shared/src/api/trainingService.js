// src/services/trainingService.js - Frontend API service for training system
import api from './api'; // Using your existing configured axios instance

const TRAINING_BASE_URL = '/training';

// ===== TRAINING MODULE SERVICES =====

export const trainingModuleService = {
  // Get all training modules with optional filtering
  getModules: async (params = {}) => {
    const { skip = 0, limit = 100, category, published_only = false, search } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
      published_only: published_only.toString(),
      ...(category && { category }),
      ...(search && { search })
    });

    const response = await api.get(`${TRAINING_BASE_URL}/modules?${queryParams}`);
    return response.data;
  },

  // Get single training module by ID
  getModule: async (moduleId) => {
    const response = await api.get(`${TRAINING_BASE_URL}/modules/${moduleId}`);
    return response.data;
  },

  // Create new training module
  createModule: async (moduleData) => {
    const response = await api.post(`${TRAINING_BASE_URL}/modules`, moduleData);
    return response.data;
  },

  // Update existing training module
  updateModule: async (moduleId, updateData) => {
    const response = await api.put(`${TRAINING_BASE_URL}/modules/${moduleId}`, updateData);
    return response.data;
  },

  // Publish training module
  publishModule: async (moduleId, autoAssignExisting = false) => {
    const response = await api.post(`${TRAINING_BASE_URL}/modules/${moduleId}/publish`, {
      training_module_id: moduleId,
      auto_assign_existing: autoAssignExisting
    });
    return response.data;
  },

  // Archive training module
  archiveModule: async (moduleId) => {
    const response = await api.delete(`${TRAINING_BASE_URL}/modules/${moduleId}`);
    return response.data;
  }
};

// ===== TRAINING SLIDE SERVICES =====

export const trainingSlideService = {
  // Get all slides for a module
  getSlides: async (moduleId) => {
    const response = await api.get(`${TRAINING_BASE_URL}/modules/${moduleId}/slides`);
    return response.data;
  },

  // Create new slide
  createSlide: async (moduleId, slideData) => {
    const slidePayload = {
      ...slideData,
      training_module_id: moduleId
    };
    const response = await api.post(`${TRAINING_BASE_URL}/modules/${moduleId}/slides`, slidePayload);
    return response.data;
  },

  // Update existing slide
  updateSlide: async (slideId, updateData) => {
    const response = await api.put(`${TRAINING_BASE_URL}/slides/${slideId}`, updateData);
    return response.data;
  },

  // Delete slide
  deleteSlide: async (slideId) => {
    const response = await api.delete(`${TRAINING_BASE_URL}/slides/${slideId}`);
    return response.data;
  },

  // Reorder slides (helper function)
  reorderSlides: async (slides) => {
    // Update each slide's order
    const updatePromises = slides.map((slide, index) => 
      trainingSlideService.updateSlide(slide.id, { order: index + 1 })
    );
    return Promise.all(updatePromises);
  }
};

// ===== TRAINING QUESTION SERVICES =====

export const trainingQuestionService = {
  // Get all questions for a module
  getQuestions: async (moduleId) => {
    const response = await api.get(`${TRAINING_BASE_URL}/modules/${moduleId}/questions`);
    return response.data;
  },

  // Create new question with options
  createQuestion: async (moduleId, questionData) => {
    const questionPayload = {
      ...questionData,
      training_module_id: moduleId
    };
    const response = await api.post(`${TRAINING_BASE_URL}/modules/${moduleId}/questions`, questionPayload);
    return response.data;
  },

  // Update existing question
  updateQuestion: async (questionId, updateData) => {
    const response = await api.put(`${TRAINING_BASE_URL}/questions/${questionId}`, updateData);
    return response.data;
  },

  // Delete question
  deleteQuestion: async (questionId) => {
    const response = await api.delete(`${TRAINING_BASE_URL}/questions/${questionId}`);
    return response.data;
  }
};

// ===== TRAINING ASSIGNMENT SERVICES =====

export const trainingAssignmentService = {
  // Get training assignments with filtering
  getAssignments: async (params = {}) => {
    const { entity_type, entity_id, status, skip = 0, limit = 100 } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
      ...(entity_type && { entity_type }),
      ...(entity_id && { entity_id: entity_id.toString() }),
      ...(status && { status })
    });

    const response = await api.get(`${TRAINING_BASE_URL}/assignments?${queryParams}`);
    return response.data;
  },

  // Assign training to an entity
  assignTraining: async (assignmentData) => {
    const response = await api.post(`${TRAINING_BASE_URL}/assign`, assignmentData);
    return response.data;
  },

  // Bulk assign training
  bulkAssignTraining: async (bulkAssignmentData) => {
    const response = await api.post(`${TRAINING_BASE_URL}/bulk-assign`, bulkAssignmentData);
    return response.data;
  },

  // Get my training assignments (for current user)
  getMyAssignments: async (status = null) => {
    const params = status ? { status } : {};
    // This would need to be implemented in the backend to filter by current user
    return trainingAssignmentService.getAssignments(params);
  }
};

// ===== TRAINING TAKING SERVICES =====

export const trainingTakingService = {
  // Start a training session
  startTraining: async (trainingRecordId) => {
    console.log('🚀 trainingTakingService.startTraining called with:', trainingRecordId);
    const response = await api.post(`${TRAINING_BASE_URL}/start`, {
      training_record_id: trainingRecordId
    });
    return response.data;
  },

  // Mark slide as viewed
  completeSlide: async (slideId, timeSpentSeconds = 0) => {
    console.log('🚀 trainingTakingService.completeSlide called with:', { slideId, timeSpentSeconds });
    const response = await api.post(`${TRAINING_BASE_URL}/complete-slide`, {
      slide_id: slideId,
      time_spent_seconds: timeSpentSeconds
    });
    return response.data;
  },

  // Submit answer to question
  submitAnswer: async (questionId, selectedOptionIds, timeSpentSeconds = 0) => {
    console.log('🚀 trainingTakingService.submitAnswer called with:', { questionId, selectedOptionIds, timeSpentSeconds });
    const response = await api.post(`${TRAINING_BASE_URL}/submit-answer`, {
      question_id: questionId,
      selected_option_ids: Array.isArray(selectedOptionIds) ? selectedOptionIds : [selectedOptionIds],
      time_spent_seconds: timeSpentSeconds
    });
    return response.data;
  },

  // Complete training
  completeTraining: async (trainingRecordId, completionNotes = null) => {
    console.log('🚀 trainingTakingService.completeTraining called with:', { trainingRecordId, completionNotes });
    const response = await api.post(`${TRAINING_BASE_URL}/complete`, {
      training_record_id: trainingRecordId,
      completion_notes: completionNotes
    });
    return response.data;
  },

  // Get training progress
  getTrainingProgress: async (trainingRecordId) => {
    console.log('🚀 trainingTakingService.getTrainingProgress called with:', trainingRecordId);
    console.log('🚀 Making request to:', `${TRAINING_BASE_URL}/progress/${trainingRecordId}`);
    console.log('🚀 Full URL will be:', `${api.defaults.baseURL || ''}${TRAINING_BASE_URL}/progress/${trainingRecordId}`);
    
    try {
      const response = await api.get(`${TRAINING_BASE_URL}/progress/${trainingRecordId}`);
      console.log('🚀 getTrainingProgress response:', response);
      console.log('🚀 Response status:', response.status);
      console.log('🚀 Response data:', response.data);
      return response.data;
    } catch (error) {
      console.error('🚀 getTrainingProgress error:', error);
      console.error('🚀 Error response:', error.response);
      console.error('🚀 Error request:', error.request);
      console.error('🚀 Error config:', error.config);
      throw error;
    }
  }
};

// ===== TRAINING REPORTING SERVICES =====

export const trainingReportingService = {
  // Get company training statistics
  getTrainingStats: async (days = 30) => {
    const response = await api.get(`${TRAINING_BASE_URL}/stats?days=${days}`);
    return response.data;
  },

  // Get training completion report
  getCompletionReport: async (params = {}) => {
    const { start_date, end_date, module_id, entity_type } = params;
    const queryParams = new URLSearchParams({
      ...(start_date && { start_date }),
      ...(end_date && { end_date }),
      ...(module_id && { module_id: module_id.toString() }),
      ...(entity_type && { entity_type })
    });

    const response = await api.get(`${TRAINING_BASE_URL}/reports/completions?${queryParams}`);
    return response.data;
  },

  // Export training data
  exportTrainingData: async (format = 'csv', params = {}) => {
    const queryParams = new URLSearchParams({
      format,
      ...params
    });

    const response = await api.get(`${TRAINING_BASE_URL}/export?${queryParams}`, {
      responseType: 'blob'
    });
    return response.data;
  }
};

// ===== UTILITY FUNCTIONS =====

export const trainingUtils = {
  // Calculate training progress percentage
  calculateProgress: (slidesViewed, totalSlides, questionsAnswered, totalQuestions) => {
    const slideProgress = totalSlides > 0 ? (slidesViewed / totalSlides) * 70 : 0; // 70% weight for slides
    const questionProgress = totalQuestions > 0 ? (questionsAnswered / totalQuestions) * 30 : 30; // 30% weight for questions
    return Math.round(slideProgress + questionProgress);
  },

  // Format training duration
  formatDuration: (minutes) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  },

  // Get training status badge color
  getStatusColor: (status) => {
    const statusColors = {
      'assigned': 'blue',
      'in_progress': 'yellow',
      'completed': 'green',
      'failed': 'red',
      'expired': 'gray'
    };
    return statusColors[status] || 'gray';
  },

  // Validate training module before publishing
  validateModuleForPublishing: (module, slides, questions) => {
    const errors = [];

    if (!slides || slides.length === 0) {
      errors.push('Module must have at least one slide');
    }

    if (module.has_questionnaire && (!questions || questions.length === 0)) {
      errors.push('Module with questionnaire must have at least one question');
    }

    if (questions && questions.length > 0) {
      questions.forEach((question, index) => {
        if (!question.options || question.options.length < 2) {
          errors.push(`Question ${index + 1} must have at least 2 options`);
        }

        const correctOptions = question.options?.filter(opt => opt.is_correct) || [];
        if (correctOptions.length === 0) {
          errors.push(`Question ${index + 1} must have at least one correct answer`);
        }

        if (!question.allow_multiple_answers && correctOptions.length > 1) {
          errors.push(`Question ${index + 1} has multiple correct answers but doesn't allow multiple selections`);
        }
      });
    }

    return errors;
  },

  // Process slide content for display
  processSlideContent: (slide) => {
    return {
      ...slide,
      image: slide.image_url ? {
        url: slide.image_url,
        alt_text: slide.image_alt_text,
        caption: slide.image_caption,
        position: slide.image_position
      } : null,
      bullet_points: slide.bullet_points || [],
      estimated_time: slide.estimated_read_time_seconds
    };
  }
};

// ===== ERROR HANDLING =====

export const trainingErrorHandler = {
  handleApiError: (error) => {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      switch (status) {
        case 403:
          return 'You do not have permission to perform this action';
        case 404:
          return 'Training content not found';
        case 400:
          return data.detail || 'Invalid request data';
        case 500:
          return 'Server error. Please try again later';
        default:
          return data.detail || 'An error occurred';
      }
    } else if (error.request) {
      // Network error
      return 'Network error. Please check your connection';
    } else {
      // Other error
      return error.message || 'An unexpected error occurred';
    }
  }
};

// ===== DEFAULT EXPORT =====

const trainingService = {
  modules: trainingModuleService,
  slides: trainingSlideService,
  questions: trainingQuestionService,
  assignments: trainingAssignmentService,
  taking: trainingTakingService,
  reporting: trainingReportingService,
  utils: trainingUtils,
  errorHandler: trainingErrorHandler
};

export default trainingService;