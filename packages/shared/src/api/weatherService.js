// shared/src/api/weatherService.js — Forecast client.
//
// Replaces the previous direct MetOcean call (which leaked the API key in the
// web bundle). All calls now go through the backend proxy at /api/v1/forecast.
// The backend handles the upstream key, caches responses for 3 h, and returns
// a normalised shape.
//
// Response shape (current + forecast endpoints):
//   {
//     location: { lat, lon },
//     current:  { timestamp, temperature_c, humidity_pct, cloud_cover_pct,
//                 wind_speed_kmh, wind_gust_kmh, wind_direction_deg,
//                 wind_direction_compass, precipitation_mm_h,
//                 shortwave_radiation_w_m2, condition },
//     forecast: [ ...same-shape items at interval_h spacing ]
//   }
//
// The legacy nested-units shape (temperature.value, humidity.value, etc.) is
// reproduced via `toLegacyShape()` so the existing WeatherWidget keeps working
// without a code change. New code should consume the flat shape directly.

import api from './api';

/**
 * Adapt the new flat shape into the legacy nested { value, unit } shape that
 * older callers (WeatherWidget) expect. Forward-compatible: any new flat
 * field is automatically wrapped without code changes here.
 */
function wrapNested(value, unit) {
  return { value: value ?? null, unit };
}

function adaptCurrent(current) {
  if (!current) return null;
  const windKmh = current.wind_speed_kmh;
  const gustKmh = current.wind_gust_kmh;
  return {
    temperature: wrapNested(current.temperature_c, 'degreeC'),
    humidity: wrapNested(current.humidity_pct, 'percent'),
    cloudCover: wrapNested(current.cloud_cover_pct, 'percent'),
    precipitation: wrapNested(current.precipitation_mm_h, 'mm/h'),
    shortwaveRadiation: wrapNested(current.shortwave_radiation_w_m2, 'W/m²'),
    windDirection: {
      value: current.wind_direction_deg ?? null,
      unit: 'degrees',
      compass: current.wind_direction_compass ?? 'N/A',
    },
    windSpeed: {
      value: windKmh != null ? windKmh / 3.6 : null,  // legacy callers may divide
      unit: 'm/s',
      kmh: windKmh ?? null,
    },
    windGust: {
      value: gustKmh != null ? gustKmh / 3.6 : null,
      unit: 'm/s',
      kmh: gustKmh ?? null,
    },
    condition: current.condition,
  };
}

function toLegacyCurrentResponse(payload) {
  if (!payload) return null;
  return {
    timestamp: payload.current?.timestamp || new Date().toISOString(),
    location: payload.location || {},
    weather: adaptCurrent(payload.current),
    debug: { hasNullValues: false, nullFields: [] },
  };
}

function toLegacyForecastResponse(payload) {
  if (!payload) return null;
  return {
    location: payload.location || {},
    forecast: (payload.forecast || []).map((item) => ({
      timestamp: item.timestamp,
      weather: adaptCurrent(item),
    })),
  };
}

/**
 * Current weather at a coordinate. Returns the legacy nested-units shape.
 */
export const getCurrentWeather = async (lat, lon) => {
  const res = await api.get('/v1/forecast/current', { params: { lat, lon } });
  return toLegacyCurrentResponse(res.data);
};

/**
 * 24-hour forecast (3-hour intervals by default).
 */
export const getWeatherForecast = async (lat, lon, hours = 24, intervalH = 3) => {
  const res = await api.get('/v1/forecast/forecast', {
    params: { lat, lon, hours, interval_h: intervalH },
  });
  return toLegacyForecastResponse(res.data);
};

/**
 * Combined property forecast — returns the FLAT shape directly (current +
 * forecast list together). Mobile hero + new web surfaces should prefer this.
 */
export const getPropertyForecast = async (propertyId, { hours = 24, intervalH = 3 } = {}) => {
  const res = await api.get(`/v1/forecast/property/${propertyId}`, {
    params: { hours, interval_h: intervalH },
  });
  return res.data;
};

/**
 * Block convenience — block.centroid_latitude / centroid_longitude.
 */
export const getBlockWeather = async (block) => {
  if (!block?.centroid_latitude || !block?.centroid_longitude) {
    throw new Error('Block must have centroid coordinates');
  }
  return getCurrentWeather(block.centroid_latitude, block.centroid_longitude);
};

export const getWindDirection = (degrees) => {
  if (degrees === null || degrees === undefined) return 'N/A';
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
};

export const mpsToKmh = (mps) => {
  if (mps === null || mps === undefined) return null;
  return Math.round(mps * 3.6 * 10) / 10;
};

export default {
  getCurrentWeather,
  getWeatherForecast,
  getPropertyForecast,
  getBlockWeather,
  getWindDirection,
  mpsToKmh,
};
