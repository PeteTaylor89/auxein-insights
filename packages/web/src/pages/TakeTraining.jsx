import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { trainingService, useTrainingTaking, api } from '@vineyard/shared';
import './Training.css';

function TakeTraining() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [slideImageUrls, setSlideImageUrls] = useState({});
  const trainingRecordId = recordId ? parseInt(recordId, 10) : null;
  const [slidesWithImages, setSlidesWithImages] = useState(null);

  const { trainingRecord, progress, currentAttempt, loading: trainingLoading, error, startTraining, completeSlide, submitAnswer, completeTraining } = useTrainingTaking(trainingRecordId);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showingQuiz, setShowingQuiz] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [slideStartTime, setSlideStartTime] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [finalScore, setFinalScore] = useState(null);
  const [completionStatus, setCompletionStatus] = useState(null);

  const contentRef = useRef(null);
  const slideTimeRef = useRef(0);

  if (!recordId || isNaN(trainingRecordId) || trainingRecordId <= 0) {
    return (
      <div className="tr-results">
        <div className="tr-results-card" style={{ background: 'var(--color-danger-bg)' }}>
          <div className="tr-results-icon">⚠️</div>
          <h2 className="tr-results-title" style={{ color: 'var(--color-danger)' }}>Invalid Training Record ID</h2>
          <p className="tr-results-message">The training record ID "{recordId}" is not valid. Please check the URL and try again.</p>
          <button className="tr-btn-danger" onClick={() => navigate('/training')}>Back to Training</button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (trainingRecord && user) {
      if (trainingRecord.entity_type === 'user' && trainingRecord.entity_id !== user.id) {
        console.log('Access denied - training not assigned to user');
      }
    }
  }, [trainingRecord, user]);

  useEffect(() => {
    if (trainingRecord && !currentAttempt && trainingRecord.status === 'assigned') handleStartTraining();
  }, [trainingRecord, currentAttempt]);

  useEffect(() => {
    setSlideStartTime(Date.now());
    slideTimeRef.current = Date.now();
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [currentSlideIndex, showingQuiz]);

  const handleStartTraining = async () => {
    try { await startTraining(); } catch (e) { alert('Failed to start training: ' + e.message); }
  };

  const handleNextSlide = async () => {
    if (!trainingRecord?.module?.slides) return;
    try {
      const timeSpent = Math.floor((Date.now() - slideTimeRef.current) / 1000);
      const currentSlide = trainingRecord.module.slides[currentSlideIndex];
      if (currentSlide) await completeSlide(currentSlide.id, timeSpent);
      const nextIndex = currentSlideIndex + 1;
      if (nextIndex >= trainingRecord.module.slides.length) {
        if (trainingRecord.module.has_questionnaire && trainingRecord.module.questions?.length > 0) { setShowingQuiz(true); setCurrentQuestionIndex(0); }
        else await handleCompleteTraining();
      } else setCurrentSlideIndex(nextIndex);
    } catch (e) { console.error('Error progressing to next slide:', e); alert('Error progressing through training. Please try again.'); }
  };

  const handlePreviousSlide = () => {
    if (showingQuiz && currentQuestionIndex === 0) { setShowingQuiz(false); setCurrentSlideIndex(trainingRecord.module.slides.length - 1); }
    else if (showingQuiz) setCurrentQuestionIndex(prev => Math.max(0, prev - 1));
    else setCurrentSlideIndex(prev => Math.max(0, prev - 1));
  };

  const handleAnswerSelection = (questionId, optionId, allowMultiple) => {
    setSelectedAnswers(prev => {
      if (allowMultiple) {
        const curr = prev[questionId] || [];
        return { ...prev, [questionId]: curr.includes(optionId) ? curr.filter(id => id !== optionId) : [...curr, optionId] };
      }
      return { ...prev, [questionId]: [optionId] };
    });
  };

  const handleNextQuestion = async () => {
    const currentQuestion = trainingRecord.module.questions[currentQuestionIndex];
    const selectedIds = selectedAnswers[currentQuestion.id] || [];
    if (selectedIds.length === 0) { alert('Please select an answer before continuing.'); return; }
    try {
      const timeSpent = Math.floor((Date.now() - slideTimeRef.current) / 1000);
      await submitAnswer(currentQuestion.id, selectedIds, timeSpent);
      const nextIndex = currentQuestionIndex + 1;
      if (nextIndex >= trainingRecord.module.questions.length) await handleCompleteTraining();
      else { setCurrentQuestionIndex(nextIndex); slideTimeRef.current = Date.now(); }
    } catch (e) { console.error('Error submitting answer:', e); alert('Error submitting answer. Please try again.'); }
  };

  useEffect(() => {
    if (trainingRecord?.module?.id) {
      (async () => { try { const slides = await trainingService.slides.getSlides(trainingRecord.module.id); setSlidesWithImages(slides); } catch (e) { console.error('Failed to load slide images:', e); } })();
    }
  }, [trainingRecord?.module?.id]);

  useEffect(() => {
    let isCancelled = false;
    const objectUrls = [];
    async function loadImages() {
      const slides = trainingRecord?.module?.slides;
      if (!slides || slides.length === 0) return;
      const entries = await Promise.all(
        slides.map(async (s) => {
          try {
            const fileId = s?.image_info?.id || s?.image_file_id || (typeof s?.image_url === 'string' ? (s.image_url.match(/\/files\/([^/]+)/)?.[1] ?? null) : null);
            if (!fileId) return [s.id, null];
            const resp = await api.get(`/files/${fileId}/download`, { responseType: 'blob' });
            const url = URL.createObjectURL(resp.data);
            objectUrls.push(url);
            return [s.id, url];
          } catch (e) { return [s?.id, null]; }
        })
      );
      if (!isCancelled) setSlideImageUrls(Object.fromEntries(entries));
    }
    loadImages();
    return () => { isCancelled = true; objectUrls.forEach(u => URL.revokeObjectURL(u)); };
  }, [trainingRecord?.module?.slides]);

  const handleCompleteTraining = async () => {
    try { const result = await completeTraining(); setFinalScore(result.final_score); setCompletionStatus(result.status); setShowResults(true); }
    catch (e) { console.error('Error completing training:', e); alert('Error completing training. Please try again.'); }
  };

  const handleFinish = () => navigate('/training');

  const calculateProgress = () => {
    if (!trainingRecord?.module) return 0;
    const totalSlides = trainingRecord.module.slides?.length || 0;
    const totalQuestions = trainingRecord.module.questions?.length || 0;
    const totalItems = totalSlides + totalQuestions;
    if (totalItems === 0) return 0;
    let completedItems = showingQuiz ? totalSlides + currentQuestionIndex : currentSlideIndex;
    return Math.round((completedItems / totalItems) * 100);
  };

  // Loading state — immersive gradient
  if (trainingLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', textAlign: 'center' }}>
        <div className="tr-spinner" style={{ width: 60, height: 60, border: '4px solid rgba(255,255,255,0.3)', borderTop: '4px solid white', borderRadius: '50%', marginBottom: '1.5rem' }} />
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>Loading Training...</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>Training Record ID: {trainingRecordId}</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="tr-results" style={{ background: 'var(--color-danger-bg)' }}>
        <div className="tr-results-card">
          <div className="tr-results-icon">⚠️</div>
          <h2 className="tr-results-title" style={{ color: 'var(--color-danger)' }}>Training Not Available</h2>
          <p className="tr-results-message">{error}</p>
          <button className="tr-btn-danger" onClick={() => navigate('/training')}>Back to Training</button>
        </div>
      </div>
    );
  }

  if (!trainingRecord) {
    return (
      <div className="tr-results">
        <div className="tr-results-card">
          <h2 className="tr-results-title">Training not found</h2>
          <p className="tr-results-message">No training record found with ID: {trainingRecordId}</p>
          <button className="tr-btn-primary" onClick={() => navigate('/training')}>Back to Training</button>
        </div>
      </div>
    );
  }

  // Results screen — immersive gradient
  if (showResults) {
    const passed = completionStatus === 'completed';
    const canRetry = currentAttempt && currentAttempt.attempt_number < trainingRecord.max_attempts;
    return (
      <div style={{ minHeight: '100vh', background: passed ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'white', textAlign: 'center' }}>
        <div style={{ fontSize: '5rem', marginBottom: '1.5rem' }}>📚</div>
        <h1 style={{ margin: '0 0 1rem 0', fontSize: '2rem', fontWeight: 700 }}>{passed ? 'Training Complete!' : 'Training Incomplete'}</h1>
        <div style={{ maxWidth: 400, marginBottom: '2rem', lineHeight: 1.6 }}>
          {passed ? (
            <p style={{ margin: 0, fontSize: '1.1rem' }}>You have completed the training module "<strong>{trainingRecord.module.title}</strong>".</p>
          ) : (
            <div>
              <p style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>You did not meet the minimum passing score for this training.</p>
              {canRetry && <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>You have {trainingRecord.max_attempts - currentAttempt.attempt_number} attempts remaining.</p>}
            </div>
          )}
        </div>
        <div className="tr-results-actions">
          {!passed && canRetry && (
            <button onClick={() => window.location.reload()} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '2px solid white', padding: '1rem 2rem', borderRadius: 'var(--radius-md)', fontSize: '1rem', fontWeight: 500, cursor: 'pointer', backdropFilter: 'blur(10px)' }}>Retry Training</button>
          )}
          <button onClick={handleFinish} style={{ background: 'white', color: passed ? '#059669' : '#dc2626', border: 'none', padding: '1rem 2rem', borderRadius: 'var(--radius-md)', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', minWidth: 120 }}>Finish</button>
        </div>
      </div>
    );
  }

  const currentSlide = (slidesWithImages || trainingRecord.module?.slides)?.[currentSlideIndex];
  const currentQuestion = trainingRecord.module?.questions?.[currentQuestionIndex];
  const progressPercent = calculateProgress();

  return (
    <div className="tr-take-page">
      {/* Header with Progress */}
      <div className="tr-take-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-base)' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>{trainingRecord.module.title}</h1>
          <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)', fontWeight: 500 }}>{progressPercent}%</div>
        </div>
        <div className="tr-progress-bar">
          <div className="tr-progress-fill" style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-hover))' }} />
        </div>
        <div className="tr-progress-text">
          {showingQuiz ? `Question ${currentQuestionIndex + 1} of ${trainingRecord.module.questions?.length || 0}` : `Slide ${currentSlideIndex + 1} of ${trainingRecord.module.slides?.length || 0}`}
        </div>
      </div>

      {/* Main Content */}
      <div ref={contentRef} className="tr-take-content" style={{ paddingBottom: 100 }}>
        {!showingQuiz && currentSlide ? (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <h2 className="tr-slide-title">{currentSlide.title}</h2>
            {currentSlide.content && <div className="tr-slide-content">{currentSlide.content}</div>}
            {currentSlide.bullet_points?.length > 0 && (
              <ul className="tr-slide-content">
                {currentSlide.bullet_points.map((bullet, i) => bullet && <li key={i} style={{ marginBottom: 'var(--space-md)' }}>{bullet}</li>)}
              </ul>
            )}
            {(currentSlide?.image_info?.url || currentSlide?.image_url) && (
              <div className="tr-slide-image-container">
                <img src={currentSlide.image_info?.url || currentSlide.image_url} alt={currentSlide.image_info?.alt_text || 'Slide image'} style={{ width: '100%', maxHeight: 500, objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                {(currentSlide.image_info?.caption || currentSlide.image_caption) && (
                  <div className="tr-slide-caption">{currentSlide.image_info?.caption || currentSlide.image_caption}</div>
                )}
              </div>
            )}
          </div>
        ) : showingQuiz && currentQuestion ? (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <h2 className="tr-question-title">{currentQuestion.question_text}</h2>
            <div className="tr-options-list">
              {currentQuestion.options?.map(option => {
                const isSelected = selectedAnswers[currentQuestion.id]?.includes(option.id);
                return (
                  <button key={option.id} className={`tr-option-btn ${isSelected ? 'selected' : ''}`} onClick={() => handleAnswerSelection(currentQuestion.id, option.id, currentQuestion.allow_multiple_answers)}>
                    <div className={`tr-option-indicator ${currentQuestion.allow_multiple_answers ? 'tr-option-indicator--checkbox' : ''}`}>
                      {isSelected && <span style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>✓</span>}
                    </div>
                    <div>{option.option_text}</div>
                  </button>
                );
              })}
            </div>
            {currentQuestion.allow_multiple_answers && (
              <div className="tr-info" style={{ marginTop: 'var(--space-base)', background: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)', color: '#92400e' }}>
                This question allows multiple answers. Select all that apply.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Bottom Navigation */}
      <div className="tr-take-nav">
        {(currentSlideIndex > 0 || showingQuiz) && (
          <button className="tr-btn-ghost" onClick={handlePreviousSlide} style={{ flex: 1, padding: 'var(--space-base)' }}>← Previous</button>
        )}
        <button className="tr-btn-primary" onClick={showingQuiz ? handleNextQuestion : handleNextSlide} style={{ flex: 2, padding: 'var(--space-base)', justifyContent: 'center' }}>
          {showingQuiz ? (currentQuestionIndex >= (trainingRecord.module.questions?.length || 0) - 1 ? 'Complete Training' : 'Next Question') : (currentSlideIndex >= (trainingRecord.module.slides?.length || 0) - 1 ? (trainingRecord.module.has_questionnaire ? 'Start Quiz' : 'Complete Training') : 'Next Slide')} →
        </button>
      </div>
    </div>
  );
}

export default TakeTraining;
