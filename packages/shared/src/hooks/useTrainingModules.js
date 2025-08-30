import { useState, useEffect, useCallback } from 'react';
import trainingService from '../api/trainingService';

export const useTrainingModules = (initialFilters = {}) => {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    category: '',
    published_only: false,
    search: '',
    skip: 0,
    limit: 100,
    ...initialFilters
  });

  // Fetch modules with current filters
  const fetchModules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Fetching modules with filters:', filters);
      
      const data = await trainingService.modules.getModules(filters);
      setModules(data || []);
      
      console.log('✅ Modules fetched:', data?.length || 0);
      
    } catch (err) {
      console.error('❌ Error fetching modules:', err);
      setError(trainingService.errorHandler.handleApiError(err));
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial fetch
  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  // Update filters
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Create module
  const createModule = useCallback(async (moduleData) => {
    try {
      const newModule = await trainingService.modules.createModule(moduleData);
      
      // Add to local state
      setModules(prev => [newModule, ...prev]);
      
      return newModule;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  // Update module
  const updateModule = useCallback(async (moduleId, updateData) => {
    try {
      const updatedModule = await trainingService.modules.updateModule(moduleId, updateData);
      
      // Update local state
      setModules(prev => prev.map(module => 
        module.id === moduleId ? { ...module, ...updatedModule } : module
      ));
      
      return updatedModule;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  // Publish module
  const publishModule = useCallback(async (moduleId, autoAssignExisting = false) => {
    try {
      await trainingService.modules.publishModule(moduleId, autoAssignExisting);
      
      // Update local state
      setModules(prev => prev.map(module => 
        module.id === moduleId ? { ...module, is_published: true } : module
      ));
      
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  // Archive module
  const archiveModule = useCallback(async (moduleId) => {
    try {
      await trainingService.modules.archiveModule(moduleId);
      
      // Remove from local state
      setModules(prev => prev.filter(module => module.id !== moduleId));
      
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  // Refresh data
  const refresh = useCallback(() => {
    fetchModules();
  }, [fetchModules]);

  return {
    modules,
    loading,
    error,
    filters,
    updateFilters,
    createModule,
    updateModule,
    publishModule,
    archiveModule,
    refresh
  };
};

export const useTrainingModule = (moduleId) => {
  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchModule = useCallback(async () => {
    if (!moduleId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Fetching module:', moduleId);
      
      const data = await trainingService.modules.getModule(moduleId);
      setModule(data);
      
      console.log('✅ Module fetched:', data);
      
    } catch (err) {
      console.error('❌ Error fetching module:', err);
      setError(trainingService.errorHandler.handleApiError(err));
      setModule(null);
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchModule();
  }, [fetchModule]);

  const updateModule = useCallback(async (updateData) => {
    try {
      const updatedModule = await trainingService.modules.updateModule(moduleId, updateData);
      setModule(prev => ({ ...prev, ...updatedModule }));
      return updatedModule;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [moduleId]);

  const refresh = useCallback(() => {
    fetchModule();
  }, [fetchModule]);

  return {
    module,
    loading,
    error,
    updateModule,
    refresh
  };
};

export const useTrainingSlides = (moduleId) => {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSlides = useCallback(async () => {
    if (!moduleId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await trainingService.slides.getSlides(moduleId);
      setSlides(data || []);
      
    } catch (err) {
      console.error('❌ Error fetching slides:', err);
      setError(trainingService.errorHandler.handleApiError(err));
      setSlides([]);
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchSlides();
  }, [fetchSlides]);

  const createSlide = useCallback(async (slideData) => {
    try {
      const newSlide = await trainingService.slides.createSlide(moduleId, slideData);
      setSlides(prev => [...prev, newSlide].sort((a, b) => a.order - b.order));
      return newSlide;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [moduleId]);

  const updateSlide = useCallback(async (slideId, updateData) => {
    try {
      const updatedSlide = await trainingService.slides.updateSlide(slideId, updateData);
      setSlides(prev => prev.map(slide => 
        slide.id === slideId ? { ...slide, ...updatedSlide } : slide
      ));
      return updatedSlide;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  const deleteSlide = useCallback(async (slideId) => {
    try {
      await trainingService.slides.deleteSlide(slideId);
      setSlides(prev => prev.filter(slide => slide.id !== slideId));
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  const reorderSlides = useCallback(async (newOrder) => {
    try {
      // Optimistically update local state
      setSlides(newOrder);
      
      // Update server
      await trainingService.slides.reorderSlides(newOrder);
      
    } catch (err) {
      // Revert on error
      fetchSlides();
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [fetchSlides]);

  const refresh = useCallback(() => {
    fetchSlides();
  }, [fetchSlides]);

  return {
    slides,
    loading,
    error,
    createSlide,
    updateSlide,
    deleteSlide,
    reorderSlides,
    refresh
  };
};

export const useTrainingQuestions = (moduleId) => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQuestions = useCallback(async () => {
    if (!moduleId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await trainingService.questions.getQuestions(moduleId);
      setQuestions(data || []);
      
    } catch (err) {
      console.error('❌ Error fetching questions:', err);
      setError(trainingService.errorHandler.handleApiError(err));
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const createQuestion = useCallback(async (questionData) => {
    try {
      const newQuestion = await trainingService.questions.createQuestion(moduleId, questionData);
      setQuestions(prev => [...prev, newQuestion].sort((a, b) => a.order - b.order));
      return newQuestion;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [moduleId]);

  const updateQuestion = useCallback(async (questionId, updateData) => {
    try {
      const updatedQuestion = await trainingService.questions.updateQuestion(questionId, updateData);
      setQuestions(prev => prev.map(question => 
        question.id === questionId ? { ...question, ...updatedQuestion } : question
      ));
      return updatedQuestion;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  const deleteQuestion = useCallback(async (questionId) => {
    try {
      await trainingService.questions.deleteQuestion(questionId);
      setQuestions(prev => prev.filter(question => question.id !== questionId));
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  const refresh = useCallback(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  return {
    questions,
    loading,
    error,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    refresh
  };
};

export const useTrainingStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async (days = 30) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await trainingService.reporting.getTrainingStats(days);
      setStats(data);
      
    } catch (err) {
      console.error('❌ Error fetching training stats:', err);
      setError(trainingService.errorHandler.handleApiError(err));
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const refresh = useCallback((days = 30) => {
    fetchStats(days);
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refresh
  };
};

export const useTrainingAssignments = (initialFilters = {}) => {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    entity_type: '',
    entity_id: null,
    status: '',
    skip: 0,
    limit: 100,
    ...initialFilters
  });

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await trainingService.assignments.getAssignments(filters);
      setAssignments(data || []);
      
    } catch (err) {
      console.error('❌ Error fetching assignments:', err);
      setError(trainingService.errorHandler.handleApiError(err));
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const assignTraining = useCallback(async (assignmentData) => {
    try {
      const newAssignment = await trainingService.assignments.assignTraining(assignmentData);
      setAssignments(prev => [newAssignment, ...prev]);
      return newAssignment;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, []);

  const bulkAssignTraining = useCallback(async (bulkData) => {
    try {
      const result = await trainingService.assignments.bulkAssignTraining(bulkData);
      // Refresh assignments after bulk operation
      fetchAssignments();
      return result;
    } catch (err) {
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [fetchAssignments]);

  const refresh = useCallback(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return {
    assignments,
    loading,
    error,
    filters,
    updateFilters,
    assignTraining,
    bulkAssignTraining,
    refresh
  };
};

// Hook for taking training (user perspective)
export const useTrainingTaking = (trainingRecordId) => {
  const [trainingRecord, setTrainingRecord] = useState(null);
  const [progress, setProgress] = useState(null);
  const [currentAttempt, setCurrentAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  console.log('🎯 useTrainingTaking Hook Debug:', {
    trainingRecordId,
    trainingRecordIdType: typeof trainingRecordId,
    isValid: !!(trainingRecordId && !isNaN(trainingRecordId) && trainingRecordId > 0)
  });

  const fetchProgress = useCallback(async () => {
    console.log('🎯 fetchProgress called with:', {
      trainingRecordId,
      shouldFetch: !!trainingRecordId
    });

    if (!trainingRecordId) {
      console.log('🎯 No trainingRecordId, skipping fetch');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('🎯 About to call trainingService.taking.getTrainingProgress with:', trainingRecordId);
      
      // Test if the service exists first
      console.log('🎯 trainingService.taking exists:', !!trainingService.taking);
      console.log('🎯 getTrainingProgress exists:', !!trainingService.taking?.getTrainingProgress);
      
      const progressData = await trainingService.taking.getTrainingProgress(trainingRecordId);
      
      console.log('🎯 Progress data received:', progressData);
      
      setProgress(progressData);
      setTrainingRecord(progressData.training_record);
      setCurrentAttempt(progressData.current_attempt);
      
    } catch (err) {
      console.error('🎯 Error in fetchProgress:', err);
      console.error('🎯 Error response:', err.response);
      console.error('🎯 Error status:', err.response?.status);
      console.error('🎯 Error data:', err.response?.data);
      
      setError(trainingService.errorHandler.handleApiError(err));
    } finally {
      setLoading(false);
      console.log('🎯 fetchProgress completed');
    }
  }, [trainingRecordId]);

  useEffect(() => {
    console.log('🎯 useEffect triggered for fetchProgress');
    fetchProgress();
  }, [fetchProgress]);

  const startTraining = useCallback(async () => {
    try {
      console.log('🎯 Starting training for record:', trainingRecordId);
      const attempt = await trainingService.taking.startTraining(trainingRecordId);
      setCurrentAttempt(attempt);
      return attempt;
    } catch (err) {
      console.error('🎯 Error starting training:', err);
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [trainingRecordId]);

  const completeSlide = useCallback(async (slideId, timeSpent = 0) => {
    try {
      console.log('🎯 Completing slide:', slideId, 'time:', timeSpent);
      await trainingService.taking.completeSlide(slideId, timeSpent);
      // Refresh progress
      fetchProgress();
    } catch (err) {
      console.error('🎯 Error completing slide:', err);
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [fetchProgress]);

  const submitAnswer = useCallback(async (questionId, selectedOptionIds, timeSpent = 0) => {
    try {
      console.log('🎯 Submitting answer:', { questionId, selectedOptionIds, timeSpent });
      const response = await trainingService.taking.submitAnswer(questionId, selectedOptionIds, timeSpent);
      // Refresh progress
      fetchProgress();
      return response;
    } catch (err) {
      console.error('🎯 Error submitting answer:', err);
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [fetchProgress]);

  const completeTraining = useCallback(async (completionNotes = null) => {
    try {
      console.log('🎯 Completing training for record:', trainingRecordId);
      const result = await trainingService.taking.completeTraining(trainingRecordId, completionNotes);
      // Refresh progress
      fetchProgress();
      return result;
    } catch (err) {
      console.error('🎯 Error completing training:', err);
      throw new Error(trainingService.errorHandler.handleApiError(err));
    }
  }, [trainingRecordId, fetchProgress]);

  const refresh = useCallback(() => {
    console.log('🎯 Manual refresh called');
    fetchProgress();
  }, [fetchProgress]);

  // Debug effect to log state changes
  useEffect(() => {
    console.log('🎯 Hook state changed:', {
      hasTrainingRecord: !!trainingRecord,
      trainingRecordId: trainingRecord?.id,
      hasProgress: !!progress,
      hasCurrentAttempt: !!currentAttempt,
      loading,
      error
    });
  }, [trainingRecord, progress, currentAttempt, loading, error]);

  return {
    trainingRecord,
    progress,
    currentAttempt,
    loading,
    error,
    startTraining,
    completeSlide,
    submitAnswer,
    completeTraining,
    refresh
  };
};

// Hook for image upload functionality
export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const uploadImage = useCallback(async (file, entityType = 'training_slide', entityId) => {
    try {
      setUploading(true);
      setUploadError(null);

      // Validate file
      if (!file) {
        throw new Error('No file selected');
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        throw new Error('File size must be less than 5MB');
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('File must be an image (JPEG, PNG, GIF, or WebP)');
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', entityType);
      formData.append('entity_id', entityId);

      // Upload to training-specific endpoint
      const response = await fetch('/api/v1/training/upload-image', {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type, let browser set it for FormData
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      return result;

    } catch (err) {
      setUploadError(err.message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const deleteImage = useCallback(async (imageId) => {
    try {
      const response = await fetch(`/api/v1/training/images/${imageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Delete failed: ${response.status}`);
      }

      return true;
    } catch (err) {
      throw new Error(`Failed to delete image: ${err.message}`);
    }
  }, []);

  return {
    uploading,
    uploadError,
    uploadImage,
    deleteImage
  };
};

export default {
  useTrainingModules,
  useTrainingModule,
  useTrainingSlides,
  useTrainingQuestions,
  useTrainingStats,
  useTrainingAssignments,
  useTrainingTaking,
  useImageUpload
};