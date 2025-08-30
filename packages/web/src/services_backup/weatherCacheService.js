// frontend/src/services/weatherCacheService.js
import weatherService from './weatherService';

const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
const CACHE_KEY_PREFIX = 'weather_cache_';

/**
 * Generate cache key based on coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} type - 'current' or 'forecast'
 * @returns {string} Cache key
 */
const getCacheKey = (lat, lon, type = 'current') => {
  // Round coordinates to 3 decimal places to avoid tiny differences creating new cache entries
  const roundedLat = Math.round(lat * 1000) / 1000;
  const roundedLon = Math.round(lon * 1000) / 1000;
  return `${CACHE_KEY_PREFIX}${type}_${roundedLat}_${roundedLon}`;
};

/**
 * Check if cached data is still valid
 * @param {Object} cachedData - Cached data object
 * @returns {boolean} True if cache is valid
 */
const isCacheValid = (cachedData) => {
  if (!cachedData || !cachedData.timestamp) {
    return false;
  }
  
  const now = Date.now();
  const cacheAge = now - cachedData.timestamp;
  
  return cacheAge < CACHE_DURATION;
};

/**
 * Get data from cache
 * @param {string} key - Cache key
 * @returns {Object|null} Cached data or null
 */
const getFromCache = (key) => {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const parsedCache = JSON.parse(cached);
    
    if (isCacheValid(parsedCache)) {
      console.log(`[Weather Cache] Using cached data for ${key}`);
      return parsedCache.data;
    } else {
      console.log(`[Weather Cache] Cache expired for ${key}`);
      // Clean up expired cache
      localStorage.removeItem(key);
      return null;
    }
  } catch (error) {
    console.error('[Weather Cache] Error reading from cache:', error);
    // If there's an error parsing, remove the corrupted cache
    localStorage.removeItem(key);
    return null;
  }
};

/**
 * Save data to cache
 * @param {string} key - Cache key
 * @param {Object} data - Data to cache
 */
const saveToCache = (key, data) => {
  try {
    const cacheData = {
      timestamp: Date.now(),
      data: data
    };
    
    localStorage.setItem(key, JSON.stringify(cacheData));
    console.log(`[Weather Cache] Saved data to cache for ${key}`);
  } catch (error) {
    console.error('[Weather Cache] Error saving to cache:', error);
    // If localStorage is full, try to clear old weather caches
    clearOldCaches();
  }
};

/**
 * Clear old weather caches
 */
const clearOldCaches = () => {
  try {
    const keys = Object.keys(localStorage);
    const weatherKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
    
    weatherKeys.forEach(key => {
      try {
        const cached = JSON.parse(localStorage.getItem(key));
        if (!isCacheValid(cached)) {
          localStorage.removeItem(key);
          console.log(`[Weather Cache] Removed expired cache: ${key}`);
        }
      } catch (e) {
        // If we can't parse it, remove it
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('[Weather Cache] Error clearing old caches:', error);
  }
};

/**
 * Get current weather with caching
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {boolean} forceRefresh - Force refresh from API
 * @returns {Promise<Object>} Weather data
 */
export const getCachedCurrentWeather = async (lat, lon, forceRefresh = false) => {
  const cacheKey = getCacheKey(lat, lon, 'current');
  
  // Check cache first unless force refresh is requested
  if (!forceRefresh) {
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }
  }
  
  // Fetch fresh data from API
  console.log('[Weather Cache] Fetching fresh current weather data from API');
  const freshData = await weatherService.getCurrentWeather(lat, lon);
  
  // Save to cache
  saveToCache(cacheKey, freshData);
  
  return freshData;
};

/**
 * Get weather forecast with caching
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {boolean} forceRefresh - Force refresh from API
 * @returns {Promise<Object>} Forecast data
 */
export const getCachedWeatherForecast = async (lat, lon, forceRefresh = false) => {
  const cacheKey = getCacheKey(lat, lon, 'forecast');
  
  // Check cache first unless force refresh is requested
  if (!forceRefresh) {
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }
  }
  
  // Fetch fresh data from API
  console.log('[Weather Cache] Fetching fresh forecast data from API');
  const freshData = await weatherService.getWeatherForecast(lat, lon);
  
  // Save to cache
  saveToCache(cacheKey, freshData);
  
  return freshData;
};

/**
 * Get cache status for debugging
 * @returns {Object} Cache status information
 */
export const getCacheStatus = () => {
  const keys = Object.keys(localStorage);
  const weatherKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
  
  const status = {
    totalCaches: weatherKeys.length,
    caches: []
  };
  
  weatherKeys.forEach(key => {
    try {
      const cached = JSON.parse(localStorage.getItem(key));
      const age = Date.now() - cached.timestamp;
      const ageMinutes = Math.round(age / 1000 / 60);
      
      status.caches.push({
        key: key.replace(CACHE_KEY_PREFIX, ''),
        ageMinutes: ageMinutes,
        isValid: isCacheValid(cached),
        expiresInMinutes: Math.max(0, Math.round((CACHE_DURATION - age) / 1000 / 60))
      });
    } catch (e) {
      status.caches.push({
        key: key.replace(CACHE_KEY_PREFIX, ''),
        error: 'Invalid cache data'
      });
    }
  });
  
  return status;
};

/**
 * Clear all weather caches
 */
export const clearAllCaches = () => {
  const keys = Object.keys(localStorage);
  const weatherKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
  
  weatherKeys.forEach(key => {
    localStorage.removeItem(key);
  });
  
  console.log(`[Weather Cache] Cleared ${weatherKeys.length} weather caches`);
};

// Clean up old caches on module load
clearOldCaches();

export default {
  getCachedCurrentWeather,
  getCachedWeatherForecast,
  getCacheStatus,
  clearAllCaches,
  CACHE_DURATION
};