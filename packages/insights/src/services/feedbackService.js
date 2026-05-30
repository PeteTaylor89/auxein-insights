// packages/insights/src/services/feedbackService.js
// Public Insights feedback form — POSTs to the backend, which emails the
// response to insights@auxein.co.nz. Persists nothing.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const submitFeedback = async (payload) => {
  const response = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Feedback submission failed: ${response.status}`);
  }
  return response.json();
};
