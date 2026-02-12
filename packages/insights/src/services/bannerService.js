// packages/insights/src/services/bannerService.js
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const getActiveBanners = async () => {
  const url = `${API_BASE}/public/banners/active`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
};
