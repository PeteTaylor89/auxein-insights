import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { trainingService, useTrainingTaking,  api } from '@vineyard/shared';


function TakeTraining() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();  // Just get user, don't overcomplicate
  const [slideImageUrls, setSlideImageUrls] = useState({});
  // Convert recordId to number and rename for clarity
  const trainingRecordId = recordId ? parseInt(recordId, 10) : null;
  const [slidesWithImages, setSlidesWithImages] = useState(null);

  // Training data hooks
  const { 
    trainingRecord, 
    progress, 
    currentAttempt, 
    loading: trainingLoading, 
    error, 
    startTraining, 
    completeSlide, 
    submitAnswer, 
    completeTraining 
  } = useTrainingTaking(trainingRecordId);
  
  // UI state
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showingQuiz, setShowingQuiz] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [slideStartTime, setSlideStartTime] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [finalScore, setFinalScore] = useState(null);
  const [completionStatus, setCompletionStatus] = useState(null);
  
  // Auto-scroll and timing
  const contentRef = useRef(null);
  const slideTimeRef = useRef(0);
  
  // Early validation - check if recordId is valid
  if (!recordId || isNaN(trainingRecordId) || trainingRecordId <= 0) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#fee2e2',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{
          margin: '0 0 1rem 0',
          color: '#dc2626',
          fontSize: '1.5rem'
        }}>
          Invalid Training Record ID
        </h2>
        <p style={{
          margin: '0 0 2rem 0',
          color: '#7f1d1d',
          maxWidth: '400px',
          lineHeight: 1.5
        }}>
          The training record ID "{recordId}" is not valid. Please check the URL and try again.
        </p>
        <button
          onClick={() => navigate('/training')}
          style={{
            background: '#dc2626',
            color: 'white',
            border: 'none',
            padding: '1rem 2rem',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Back to Training
        </button>
      </div>
    );
  }
  
  // Simple authorization check - only if we have training record and user data
  useEffect(() => {
    if (trainingRecord && user) {
      console.log('🔒 Authorization Check:', {
        trainingEntityType: trainingRecord.entity_type,
        trainingEntityId: trainingRecord.entity_id,
        currentUserId: user.id,
        hasAccess: trainingRecord.entity_type === 'user' && trainingRecord.entity_id === user.id
      });
      
      // Check if this training is assigned to the current user
      if (trainingRecord.entity_type === 'user' && trainingRecord.entity_id !== user.id) {
        console.log('🔒 Access denied - training not assigned to user');
        // Could show an error message instead of redirecting
      }
    }
  }, [trainingRecord, user]);
  
  // Initialize training session
  useEffect(() => {
    if (trainingRecord && !currentAttempt && trainingRecord.status === 'assigned') {
      handleStartTraining();
    }
  }, [trainingRecord, currentAttempt]);
  
  // Track slide timing
  useEffect(() => {
    setSlideStartTime(Date.now());
    slideTimeRef.current = Date.now();
    
    // Scroll to top when slide changes
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentSlideIndex, showingQuiz]);
  
  const handleStartTraining = async () => {
    try {
      await startTraining();
    } catch (error) {
      alert('Failed to start training: ' + error.message);
    }
  };
  
  const handleNextSlide = async () => {
    if (!trainingRecord?.module?.slides) return;
    
    try {
      // Track time spent on current slide
      const timeSpent = Math.floor((Date.now() - slideTimeRef.current) / 1000);
      const currentSlide = trainingRecord.module.slides[currentSlideIndex];
      
      if (currentSlide) {
        await completeSlide(currentSlide.id, timeSpent);
      }
      
      const nextIndex = currentSlideIndex + 1;
      
      // Check if we've completed all slides
      if (nextIndex >= trainingRecord.module.slides.length) {
        // Move to quiz if available, otherwise complete training
        if (trainingRecord.module.has_questionnaire && trainingRecord.module.questions?.length > 0) {
          setShowingQuiz(true);
          setCurrentQuestionIndex(0);
        } else {
          await handleCompleteTraining();
        }
      } else {
        setCurrentSlideIndex(nextIndex);
      }
    } catch (error) {
      console.error('Error progressing to next slide:', error);
      alert('Error progressing through training. Please try again.');
    }
  };
  
  const handlePreviousSlide = () => {
    if (showingQuiz && currentQuestionIndex === 0) {
      // Go back to last slide
      setShowingQuiz(false);
      setCurrentSlideIndex(trainingRecord.module.slides.length - 1);
    } else if (showingQuiz) {
      setCurrentQuestionIndex(prev => Math.max(0, prev - 1));
    } else {
      setCurrentSlideIndex(prev => Math.max(0, prev - 1));
    }
  };
  
  const handleAnswerSelection = (questionId, optionId, allowMultiple) => {
    setSelectedAnswers(prev => {
      if (allowMultiple) {
        const currentAnswers = prev[questionId] || [];
        const newAnswers = currentAnswers.includes(optionId)
          ? currentAnswers.filter(id => id !== optionId)
          : [...currentAnswers, optionId];
        return { ...prev, [questionId]: newAnswers };
      } else {
        return { ...prev, [questionId]: [optionId] };
      }
    });
  };
  
  const handleNextQuestion = async () => {
    const currentQuestion = trainingRecord.module.questions[currentQuestionIndex];
    const selectedIds = selectedAnswers[currentQuestion.id] || [];
    
    if (selectedIds.length === 0) {
      alert('Please select an answer before continuing.');
      return;
    }
    
    try {
      // Submit answer
      const timeSpent = Math.floor((Date.now() - slideTimeRef.current) / 1000);
      await submitAnswer(currentQuestion.id, selectedIds, timeSpent);
      
      const nextIndex = currentQuestionIndex + 1;
      
      // Check if we've completed all questions
      if (nextIndex >= trainingRecord.module.questions.length) {
        await handleCompleteTraining();
      } else {
        setCurrentQuestionIndex(nextIndex);
        slideTimeRef.current = Date.now();
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      alert('Error submitting answer. Please try again.');
    }
  };
  useEffect(() => {
    if (trainingRecord?.module?.id) {
      (async () => {
        try {
          const slides = await trainingService.slides.getSlides(trainingRecord.module.id);
          setSlidesWithImages(slides);
        } catch (e) {
          console.error('Failed to load slide images for viewer:', e);
        }
      })();
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
            const fileId =
              s?.image_info?.id ||
              s?.image_file_id ||
              (typeof s?.image_url === 'string'
                ? (s.image_url.match(/\/files\/([^/]+)/)?.[1] ?? null)
                : null);

            if (!fileId) return [s.id, null];

            const resp = await api.get(`/files/${fileId}/download`, { responseType: 'blob' });
            const url = URL.createObjectURL(resp.data);
            objectUrls.push(url);
            return [s.id, url];
          } catch (e) {
            console.warn('Image load failed for slide', s?.id, e);
            return [s?.id, null];
          }
        })
      );

      if (!isCancelled) {
        setSlideImageUrls(Object.fromEntries(entries));
      }
    }

    loadImages();

    return () => {
      isCancelled = true;
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [trainingRecord?.module?.slides]);

  const handleCompleteTraining = async () => {
    try {
      const result = await completeTraining();
      setFinalScore(result.final_score);
      setCompletionStatus(result.status);
      setShowResults(true);
    } catch (error) {
      console.error('Error completing training:', error);
      alert('Error completing training. Please try again.');
    }
  };
  
  const handleFinish = () => {
    navigate('/training');
  };
  
  // Calculate progress
  const calculateProgress = () => {
    if (!trainingRecord?.module) return 0;
    
    const totalSlides = trainingRecord.module.slides?.length || 0;
    const totalQuestions = trainingRecord.module.questions?.length || 0;
    const totalItems = totalSlides + totalQuestions;
    
    if (totalItems === 0) return 0;
    
    let completedItems = 0;
    
    if (showingQuiz) {
      completedItems = totalSlides + currentQuestionIndex;
    } else {
      completedItems = currentSlideIndex;
    }
    
    return Math.round((completedItems / totalItems) * 100);
  };
  
  // Loading state
  if (trainingLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        textAlign: 'center'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          border: '4px solid rgba(255,255,255,0.3)',
          borderTop: '4px solid white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '1.5rem'
        }} />
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>
          Loading Training...
        </h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Training Record ID: {trainingRecordId}
        </p>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#fee2e2',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '1rem'
        }}>
          ⚠️
        </div>
        <h2 style={{
          margin: '0 0 1rem 0',
          color: '#dc2626',
          fontSize: '1.5rem'
        }}>
          Training Not Available
        </h2>
        <p style={{
          margin: '0 0 2rem 0',
          color: '#7f1d1d',
          maxWidth: '400px',
          lineHeight: 1.5
        }}>
          {error}
        </p>
        <button
          onClick={() => navigate('/training')}
          style={{
            background: '#dc2626',
            color: 'white',
            border: 'none',
            padding: '1rem 2rem',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Back to Training
        </button>
      </div>
    );
  }
  
  if (!trainingRecord) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Training not found</h2>
          <p style={{ margin: '1rem 0', color: '#6b7280' }}>
            No training record found with ID: {trainingRecordId}
          </p>
          <button
            onClick={() => navigate('/training')}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '1rem 2rem',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Back to Training
          </button>
        </div>
      </div>
    );
  }
  
  // Results screen
  if (showResults) {
    const passed = completionStatus === 'completed';
    const canRetry = currentAttempt && currentAttempt.attempt_number < trainingRecord.max_attempts;
    
    return (
      <div style={{
        minHeight: '100vh',
        background: passed ? 
          'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 
          'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: 'white',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '5rem',
          marginBottom: '1.5rem'
        }}>
          {passed ? '📚' : '📚'}
        </div>
        
        <h1 style={{
          margin: '0 0 1rem 0',
          fontSize: '2rem',
          fontWeight: '700'
        }}>
          {passed ? 'Training Complete!' : 'Training Incomplete'}
        </h1>

        <div style={{
          maxWidth: '400px',
          marginBottom: '2rem',
          lineHeight: 1.6
        }}>
          {passed ? (
            <p style={{ margin: 0, fontSize: '1.1rem' }}>
              You have completed the training module 
              "<strong>{trainingRecord.module.title}</strong>".
            </p>
          ) : (
            <div>
              <p style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>
                You did not meet the minimum passing score for this training.
              </p>
              {canRetry && (
                <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
                  You have {trainingRecord.max_attempts - currentAttempt.attempt_number} attempts remaining.
                </p>
              )}
            </div>
          )}
        </div>
        
        <div style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          {!passed && canRetry && (
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '2px solid white',
                padding: '1rem 2rem',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)'
              }}
            >
              Retry Training
            </button>
          )}
          
          <button
            onClick={handleFinish}
            style={{
              background: 'white',
              color: passed ? '#059669' : '#dc2626',
              border: 'none',
              padding: '1rem 2rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              minWidth: '120px'
            }}
          >
            Finish
          </button>
        </div>
      </div>
    );
  }
  
  const currentSlide = (slidesWithImages || trainingRecord.module?.slides)?.[currentSlideIndex];
  const currentQuestion = trainingRecord.module?.questions?.[currentQuestionIndex];
  const progressPercent = calculateProgress();
  
  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header with Progress */}
      <div style={{
        background: 'white',
        padding: '1rem',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.1rem',
            fontWeight: '600',
            color: '#1f2937',
            flex: 1
          }}>
            {trainingRecord.module.title}
          </h1>
          
          <div style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            fontWeight: '500'
          }}>
            {progressPercent}%
          </div>
        </div>
        
        {/* Progress Bar */}
        <div style={{
          background: '#e5e7eb',
          borderRadius: '999px',
          height: '6px',
          overflow: 'hidden'
        }}>
          <div style={{
            background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
            height: '100%',
            width: `${progressPercent}%`,
            borderRadius: '999px',
            transition: 'width 0.5s ease'
          }} />
        </div>
        
        {/* Status */}
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: '#6b7280',
          textAlign: 'center'
        }}>
          {showingQuiz ? 
            `Question ${currentQuestionIndex + 1} of ${trainingRecord.module.questions?.length || 0}` :
            `Slide ${currentSlideIndex + 1} of ${trainingRecord.module.slides?.length || 0}`
          }
        </div>
      </div>
      
      {/* Main Content */}
      <div 
        ref={contentRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '2rem 1rem',
          paddingBottom: '100px' // Space for navigation
        }}
      >
        {!showingQuiz && currentSlide ? (
          // Slide Content
          <div style={{
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <h2 style={{
              margin: '0 0 1.5rem 0',
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1f2937',
              lineHeight: 1.3
            }}>
              {currentSlide.title}
            </h2>
            
            {currentSlide.content && (
              <div style={{
                fontSize: '1.1rem',
                color: '#374151',
                lineHeight: 1.6,
                marginBottom: '1.5rem'
              }}>
                {currentSlide.content}
              </div>
            )}
            
            {currentSlide.bullet_points && currentSlide.bullet_points.length > 0 && (
              <ul style={{
                paddingLeft: '1.5rem',
                fontSize: '1.1rem',
                color: '#374151',
                lineHeight: 1.7,
                marginBottom: '1.5rem'
              }}>
                {currentSlide.bullet_points.map((bullet, index) => (
                  bullet && (
                    <li key={index} style={{ marginBottom: '0.75rem' }}>
                      {bullet}
                    </li>
                  )
                ))}
              </ul>
            )}
            
            {(currentSlide?.image_info?.url || currentSlide?.image_url) && (
              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <div
                  style={{
                    position: 'relative',
                    height: '500px',
                    background: '#f9fafb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={currentSlide.image_info?.url || currentSlide.image_url}
                    alt={currentSlide.image_info?.alt_text || currentSlide.image_alt_text || 'Slide image'}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                  <div
                    style={{
                      display: 'none',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      width: '100%',
                      color: '#6b7280',
                      background: '#f3f4f6',
                    }}
                  >
                    Image failed to load
                  </div>
                </div>

                {(currentSlide.image_info?.caption || currentSlide.image_caption) && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    {currentSlide.image_info?.caption || currentSlide.image_caption}
                  </div>
                )}
              </div>
            )}


          </div>
        ) : showingQuiz && currentQuestion ? (
          // Question Content
          <div style={{
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <h2 style={{
              margin: '0 0 1.5rem 0',
              fontSize: '1.3rem',
              fontWeight: '600',
              color: '#1f2937',
              lineHeight: 1.4
            }}>
              {currentQuestion.question_text}
            </h2>
            
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              {currentQuestion.options?.map((option) => {
                const isSelected = selectedAnswers[currentQuestion.id]?.includes(option.id);
                
                return (
                  <button
                    key={option.id}
                    onClick={() => handleAnswerSelection(
                      currentQuestion.id, 
                      option.id, 
                      currentQuestion.allow_multiple_answers
                    )}
                    style={{
                      padding: '1.25rem',
                      border: `2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
                      borderRadius: '12px',
                      background: isSelected ? '#f0f9ff' : 'white',
                      color: isSelected ? '#1e40af' : '#374151',
                      fontSize: '1rem',
                      fontWeight: isSelected ? '500' : '400',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                      lineHeight: 1.5
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem'
                    }}>
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: currentQuestion.allow_multiple_answers ? '4px' : '50%',
                        border: `2px solid ${isSelected ? '#3b82f6' : '#d1d5db'}`,
                        background: isSelected ? '#3b82f6' : 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px'
                      }}>
                        {isSelected && (
                          <div style={{
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            ✓
                          </div>
                        )}
                      </div>
                      <div>{option.option_text}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            
            {currentQuestion.allow_multiple_answers && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: '#92400e'
              }}>
                💡 This question allows multiple answers. Select all that apply.
              </div>
            )}
          </div>
        ) : null}
      </div>
      
      {/* Bottom Navigation */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'white',
        borderTop: '1px solid #e5e7eb',
        padding: '1rem',
        display: 'flex',
        gap: '1rem',
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        {(currentSlideIndex > 0 || showingQuiz) && (
          <button
            onClick={handlePreviousSlide}
            style={{
              flex: 1,
              background: 'white',
              color: '#374151',
              border: '2px solid #e5e7eb',
              padding: '1rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            ← Previous
          </button>
        )}
        
        <button
          onClick={showingQuiz ? handleNextQuestion : handleNextSlide}
          style={{
            flex: 2,
            background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
            color: 'white',
            border: 'none',
            padding: '1rem',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.4)'
          }}
        >
          {showingQuiz ? 
            (currentQuestionIndex >= (trainingRecord.module.questions?.length || 0) - 1 ? 'Complete Training' : 'Next Question') :
            (currentSlideIndex >= (trainingRecord.module.slides?.length || 0) - 1 ? 
              (trainingRecord.module.has_questionnaire ? 'Start Quiz' : 'Complete Training') : 
              'Next Slide')
          } →
        </button>
      </div>
    </div>
  );
}

export default TakeTraining;