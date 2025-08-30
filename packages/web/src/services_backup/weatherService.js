// frontend/src/services/weatherService.js
import axios from 'axios';

const METOCEAN_BASE_URL = 'https://forecast-v2.metoceanapi.com';

// You'll need to store your API key securely
// For development, you can use environment variables
const API_KEY = import.meta.env.VITE_METOCEAN_API_KEY || 'SqGhyt9BnVs3MdZeur3vcx';

// Weather variables we want to fetch
const WEATHER_VARIABLES = [
  'air.humidity.at-2m',
  'air.temperature.at-2m', 
  'cloud.cover',
  'precipitation.rate',
  'radiation.flux.downward.longwave',
  'radiation.flux.downward.shortwave',
  'wind.direction.at-10m',
  'wind.speed.at-10m',
  'wind.speed.gust.at-10m'
];

// Create axios instance for MetOcean API
const metoceanApi = axios.create({
  baseURL: METOCEAN_BASE_URL,
  headers: {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
  }
});

/**
 * Get current weather data for a specific location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object>} Weather data
 */
export const getCurrentWeather = async (lat, lon) => {
  try {
    // For current weather, we need to specify the time
    const now = new Date();
    
    const response = await metoceanApi.get('/point/time', {
      params: {
        lat: lat,
        lon: lon,
        variables: WEATHER_VARIABLES.join(','),
        from: now.toISOString(),
        to: now.toISOString() // Same time for current weather
      }
    });

    console.log('MetOcean API Response:', response.data);
    return processWeatherData(response.data);
  } catch (error) {
    console.error('Error fetching current weather:', error);
    if (error.response) {
      console.error('API Error Response:', error.response.data);
      console.error('API Error Status:', error.response.status);
    }
    throw new Error('Failed to fetch weather data');
  }
};

/**
 * Get weather forecast for the next 24 hours
 * @param {number} lat - Latitude  
 * @param {number} lon - Longitude
 * @returns {Promise<Object>} Forecast data
 */
export const getWeatherForecast = async (lat, lon) => {
  try {
    const now = new Date();
    
    const response = await metoceanApi.get('/point/time', {
      params: {
        lat: lat,
        lon: lon,
        variables: WEATHER_VARIABLES.join(','),
        from: now.toISOString(),
        interval: '3h',
        repeat: 8 // Get 8 data points at 3-hour intervals = 24 hours
      }
    });

    return processForecastData(response.data);
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    throw new Error('Failed to fetch weather forecast');
  }
};

/**
 * Get weather data for a vineyard block using its centroid
 * @param {Object} block - Block object with centroid coordinates
 * @returns {Promise<Object>} Weather data for the block
 */
export const getBlockWeather = async (block) => {
  if (!block.centroid_latitude || !block.centroid_longitude) {
    throw new Error('Block must have centroid coordinates');
  }

  return getCurrentWeather(block.centroid_latitude, block.centroid_longitude);
};

/**
 * Convert temperature from Kelvin to Celsius
 * @param {number} kelvin - Temperature in Kelvin
 * @returns {number} Temperature in Celsius
 */
const kelvinToCelsius = (kelvin) => {
  if (kelvin === null || kelvin === undefined) return null;
  return Math.round((kelvin - 273.15) * 10) / 10; // Round to 1 decimal
};

/**
 * Safely get numeric value and handle null/undefined
 * @param {*} value - Value to check
 * @returns {number|null} Numeric value or null
 */
const safeNumericValue = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return null;
  }
  return Number(value);
};

/**
 * Process raw weather data from MetOcean API
 * @param {Object} rawData - Raw API response
 * @returns {Object} Processed weather data
 */
const processWeatherData = (rawData) => {
  const weather = {};
  
  try {
    // The response structure from MetOcean API v2
    const times = rawData.dimensions?.time?.data || [];
    const currentTimeIndex = 0; // First time point is current
    
    // Process each variable
    Object.entries(rawData.variables || {}).forEach(([varName, varData]) => {
      const data = varData.data;
      const units = varData.units;
      
      // Get the value for current time (first index)
      let value = null;
      if (Array.isArray(data) && data.length > currentTimeIndex) {
        value = safeNumericValue(data[currentTimeIndex]);
      }
      
      // Map variable names and process values
      switch (varName) {
        case 'air.humidity.at-2m':
          weather.humidity = {
            value: value,
            unit: 'percent',
            raw: data?.[currentTimeIndex]
          };
          break;
          
        case 'air.temperature.at-2m':
          // Convert from Kelvin to Celsius if needed
          if (units === 'K' || units === 'degreeK') {
            value = value !== null ? kelvinToCelsius(value) : null;
          }
          weather.temperature = {
            value: value,
            unit: 'degreeC',
            raw: data?.[currentTimeIndex],
            rawUnit: units
          };
          break;
          
        case 'cloud.cover':
          // Convert from fraction to percentage if needed
          if (value !== null && value <= 1) {
            value = value * 100;
          }
          weather.cloudCover = {
            value: value,
            unit: 'percent',
            raw: data?.[currentTimeIndex]
          };
          break;
          
        case 'precipitation.rate':
          weather.precipitation = {
            value: value,
            unit: 'mm/h',
            raw: data?.[currentTimeIndex]
          };
          break;
          
        case 'radiation.flux.downward.longwave':
          weather.longwaveRadiation = {
            value: value,
            unit: 'W/m²',
            raw: data?.[currentTimeIndex]
          };
          break;
          
        case 'radiation.flux.downward.shortwave':
          weather.shortwaveRadiation = {
            value: value,
            unit: 'W/m²',
            raw: data?.[currentTimeIndex]
          };
          break;
          
        case 'wind.direction.at-10m':
          weather.windDirection = {
            value: value,
            unit: 'degrees',
            compass: getWindDirection(value),
            raw: data?.[currentTimeIndex]
          };
          break;
          
        case 'wind.speed.at-10m':
          weather.windSpeed = {
            value: value,
            unit: 'm/s',
            kmh: value !== null ? mpsToKmh(value) : null,
            raw: data?.[currentTimeIndex]
          };
          break;
          
        case 'wind.speed.gust.at-10m':
          weather.windGust = {
            value: value,
            unit: 'm/s',
            kmh: value !== null ? mpsToKmh(value) : null,
            raw: data?.[currentTimeIndex]
          };
          break;
      }
    });

    // Add computed properties
    weather.condition = getWeatherCondition(weather);

    // Get location from dimensions
    const location = {
      lat: rawData.dimensions?.point?.data?.[0]?.lat || lat,
      lon: rawData.dimensions?.point?.data?.[0]?.lon || lon
    };

    return {
      timestamp: times[currentTimeIndex] || new Date().toISOString(),
      location: location,
      weather,
      debug: {
        hasNullValues: Object.values(weather).some(w => w.value === null),
        nullFields: Object.entries(weather)
          .filter(([key, w]) => w.value === null)
          .map(([key, w]) => key),
        rawResponse: process.env.NODE_ENV === 'development' ? rawData : undefined
      }
    };
  } catch (error) {
    console.error('Error processing weather data:', error);
    throw new Error('Failed to process weather data');
  }
};

/**
 * Process forecast data from MetOcean API
 * @param {Object} rawData - Raw API response
 * @returns {Object} Processed forecast data
 */
const processForecastData = (rawData) => {
  const times = rawData.dimensions?.time?.data || [];
  const forecast = [];

  times.forEach((time, index) => {
    const weather = {};
    
    Object.entries(rawData.variables || {}).forEach(([varName, varData]) => {
      const data = varData.data;
      const units = varData.units;
      
      let value = null;
      if (Array.isArray(data) && data.length > index) {
        value = safeNumericValue(data[index]);
      }
      
      // Map variable names
      const mappedName = getVariableMapping(varName);
      
      // Handle temperature conversion
      if (varName === 'air.temperature.at-2m' && (units === 'K' || units === 'degreeK') && value !== null) {
        value = kelvinToCelsius(value);
      }
      
      // Handle cloud cover conversion
      if (varName === 'cloud.cover' && value !== null && value <= 1) {
        value = value * 100;
      }
      
      weather[mappedName] = {
        value: value,
        unit: getUnitMapping(varName, units),
        raw: data?.[index]
      };
    });

    // Add computed properties
    weather.condition = getWeatherCondition(weather);

    forecast.push({
      timestamp: time,
      weather
    });
  });

  const location = {
    lat: rawData.dimensions?.point?.data?.[0]?.lat,
    lon: rawData.dimensions?.point?.data?.[0]?.lon
  };

  return {
    location,
    forecast
  };
};

/**
 * Helper function to map variable names
 * @param {string} varName - API variable name
 * @returns {string} Mapped variable name
 */
const getVariableMapping = (varName) => {
  const mapping = {
    'air.humidity.at-2m': 'humidity',
    'air.temperature.at-2m': 'temperature',
    'cloud.cover': 'cloudCover',
    'precipitation.rate': 'precipitation',
    'radiation.flux.downward.longwave': 'longwaveRadiation',
    'radiation.flux.downward.shortwave': 'shortwaveRadiation',
    'wind.direction.at-10m': 'windDirection',
    'wind.speed.at-10m': 'windSpeed',
    'wind.speed.gust.at-10m': 'windGust'
  };
  
  return mapping[varName] || varName;
};

/**
 * Helper function to map units
 * @param {string} varName - Variable name
 * @param {string} originalUnit - Original unit from API
 * @returns {string} Mapped unit
 */
const getUnitMapping = (varName, originalUnit) => {
  const mapping = {
    'air.humidity.at-2m': 'percent',
    'air.temperature.at-2m': 'degreeC',
    'cloud.cover': 'percent',
    'precipitation.rate': 'mm/h',
    'radiation.flux.downward.longwave': 'W/m²',
    'radiation.flux.downward.shortwave': 'W/m²',
    'wind.direction.at-10m': 'degrees',
    'wind.speed.at-10m': 'm/s',
    'wind.speed.gust.at-10m': 'm/s'
  };
  
  return mapping[varName] || originalUnit;
};

/**
 * Convert wind direction degrees to compass direction
 * @param {number} degrees - Wind direction in degrees
 * @returns {string} Compass direction (N, NE, E, etc.)
 */
export const getWindDirection = (degrees) => {
  if (degrees === null || degrees === undefined) return 'N/A';
  
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                     'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

/**
 * Convert meters per second to km/h
 * @param {number} mps - Speed in meters per second
 * @returns {number} Speed in km/h
 */
export const mpsToKmh = (mps) => {
  if (mps === null || mps === undefined) return null;
  return Math.round(mps * 3.6 * 10) / 10; // Round to 1 decimal place
};

/**
 * Get weather condition based on various parameters
 * @param {Object} weather - Weather data object
 * @returns {string} Weather condition description
 */
export const getWeatherCondition = (weather) => {
  const { cloudCover, precipitation, windSpeed } = weather;
  
  if (precipitation?.value > 1) {
    return 'Rainy';
  } else if (cloudCover?.value > 80) {
    return 'Overcast';
  } else if (cloudCover?.value > 50) {
    return 'Partly Cloudy';
  } else if (cloudCover?.value > 20) {
    return 'Mostly Sunny';
  } else {
    return 'Clear';
  }
};

/**
 * Enhanced debug function to help identify data issues
 * @param {Object} weatherData - Processed weather data
 * @returns {Object} Debug information
 */
export const debugWeatherData = (weatherData) => {
  const debug = {
    timestamp: new Date().toISOString(),
    issues: [],
    summary: {}
  };

  if (!weatherData || !weatherData.weather) {
    debug.issues.push('No weather data provided');
    return debug;
  }

  const weather = weatherData.weather;
  
  // Check for null values
  Object.entries(weather).forEach(([key, value]) => {
    if (value && value.value === null) {
      debug.issues.push(`${key} has null value`);
    }
  });

  // Check temperature specifically
  if (weather.temperature) {
    const temp = weather.temperature;
    if (temp.value !== null) {
      if (temp.value > 50) {
        debug.issues.push(`Temperature seems too high: ${temp.value}°C (might be unconverted Kelvin)`);
      } else if (temp.value < -50) {
        debug.issues.push(`Temperature seems too low: ${temp.value}°C`);
      }
    }
    debug.summary.temperature = {
      value: temp.value,
      unit: temp.unit,
      raw: temp.raw,
      rawUnit: temp.rawUnit
    };
  }

  return debug;
};

export default {
  getCurrentWeather,
  getWeatherForecast,
  getBlockWeather,
  getWindDirection,
  mpsToKmh,
  getWeatherCondition,
  debugWeatherData
};