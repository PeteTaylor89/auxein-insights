// frontend/src/components/widgets/WeatherWidget.jsx
import { useState, useEffect } from 'react';
import {weatherCacheService} from '@vineyard/shared';

const WeatherWidget = ({ location = null, className = '' }) => {
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showForecast, setShowForecast] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);

  // Default location (Christchurch, Canterbury, NZ - your location)
  const defaultLocation = {
    lat: -43.5320,
    lon: 172.3103,
    name: 'Christchurch, NZ'
  };

  const fetchWeather = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const loc = location || defaultLocation;
      
      // Fetch both current weather and forecast using cache service
      const [weatherData, forecastData] = await Promise.all([
        weatherCacheService.getCachedCurrentWeather(loc.lat, loc.lon, forceRefresh),
        weatherCacheService.getCachedWeatherForecast(loc.lat, loc.lon, forceRefresh)
      ]);

      // Get cache status for display
      const cacheStatus = weatherCacheService.getCacheStatus();
      setCacheInfo(cacheStatus);
      
      setWeather(weatherData);
      setForecast(forecastData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching weather:', err);
      setError(`Failed to fetch weather data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch weather if we have a location or are using the default
    if (location || !location) {
      // Initial load - use cache if available
      fetchWeather(false);
    }
    
    // Don't set up auto-refresh interval anymore since we're using cache
    // Users can manually refresh if needed
  }, [location]); // Re-fetch when location changes

  // Enhanced formatting functions that handle the new data structure
  const formatTemperature = (temp) => {
    if (temp?.value === null || temp?.value === undefined || isNaN(temp?.value)) {
      return 'N/A';
    }
    return `${Math.round(temp.value)}°C`;
  };

  const formatPercentage = (val) => {
    if (val?.value === null || val?.value === undefined || isNaN(val?.value)) {
      return 'N/A';
    }
    return `${Math.round(val.value)}%`;
  };

  const formatRadiation = (rad) => {
    if (rad?.value === null || rad?.value === undefined || isNaN(rad?.value)) {
      return 'N/A';
    }
    return `${Math.round(rad.value)} W/m²`;
  };

  const formatPrecipitation = (precip) => {
    if (precip?.value === null || precip?.value === undefined || isNaN(precip?.value)) {
      return 'N/A';
    }
    return `${precip.value.toFixed(1)} mm/h`;
  };

  const formatWindSpeed = (speed) => {
    if (speed?.value === null || speed?.value === undefined || isNaN(speed?.value)) {
      return 'N/A';
    }
    // Use pre-calculated km/h value if available, otherwise convert
    const kmh = speed.kmh || (speed.value * 3.6);
    return `${Math.round(kmh * 10) / 10} km/h`;
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}${period}`;
  };

  const getWeatherIcon = (condition, timestamp = null) => {
    if (!condition) return '🌤️';
    
    // Determine if it's nighttime (between 6 PM and 6 AM)
    let isNight = false;
    if (timestamp) {
      const hour = new Date(timestamp).getHours();
      isNight = hour >= 18 || hour < 6;
    } else {
      // For current weather, use current time
      const currentHour = new Date().getHours();
      isNight = currentHour >= 18 || currentHour < 6;
    }
    
    switch (condition.toLowerCase()) {
      case 'clear':
        return isNight ? '🌙' : '☀️';
      case 'mostly sunny':
        return isNight ? '🌙' : '🌤️';
      case 'partly cloudy':
        return isNight ? '☁️' : '⛅';
      case 'overcast':
        return '☁️';
      case 'rainy':
        return '🌧️';
      default:
        return isNight ? '🌙' : '🌤️';
    }
  };

  if (loading) {
    return (
      <div className={`weather-widget loading ${className}`}>
        <div className="widget-header">
          <h3>Weather</h3>
        </div>
        <div className="widget-content">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <span>Loading weather data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`weather-widget error ${className}`}>
        <div className="widget-header">
          <h3>Weather</h3>
        </div>
        <div className="widget-content">
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
            <button onClick={fetchWeather} className="retry-button">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!weather || !weather.weather) {
    return (
      <div className={`weather-widget error ${className}`}>
        <div className="widget-header">
          <h3>Weather</h3>
        </div>
        <div className="widget-content">
          <div className="error-message">
            <span className="error-icon">❌</span>
            <span>No weather data available</span>
            <button onClick={() => fetchWeather(true)} className="retry-button">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get values with enhanced error checking
  const weatherData = weather.weather;
  const condition = weatherData.condition || 'Unknown';
  const windDir = weatherData.windDirection?.compass || 'N/A';
  const locationName = location?.name || defaultLocation.name;

  // Show debug info if there are issues (only in development)
  const showDebug = process.env.NODE_ENV === 'development' && weather.debug?.hasNullValues;

  return (
    <div className={`weather-widget ${className}`}>
      <div className="widget-header">

        <div className="location-info">
          {location ? location.name : (loading ? 'Loading location...' : locationName)}
        </div>
        {weather.location && (
          <div className="coordinates">
            {weather.location.lat?.toFixed(3)}, {weather.location.lon?.toFixed(3)}
          </div>

        )}
      </div>
      
      <div className="widget-content">
        {/* Debug information (development only) */}
        {showDebug && (
          <div className="debug-info">
            <span>⚠️ Some data missing: {weather.debug.nullFields.join(', ')}</span>
          </div>
        )}

        {/* Toggle between current and forecast */}
        <div className="view-toggle">
          <button 
            className={`toggle-button ${!showForecast ? 'active' : ''}`}
            onClick={() => setShowForecast(false)}
          >
            Current
          </button>
          <button 
            className={`toggle-button ${showForecast ? 'active' : ''}`}
            onClick={() => setShowForecast(true)}
          >
            24hr Forecast
          </button>
        </div>

        {!showForecast ? (
          <>
            {/* Main weather display */}
            <div className="weather-main">
              <div className="weather-condition">
                <span className="weather-icon">{getWeatherIcon(condition)}</span>
                <span className="condition-text">{condition}</span>
              </div>
              <div className="temperature-display">
                {formatTemperature(weatherData.temperature)}
              </div>
            </div>

            {/* Weather details grid */}
            <div className="weather-details">
              <div className="weather-item">
                <span className="label">Humidity</span>
                <span className="value">{formatPercentage(weatherData.humidity)}</span>
              </div>
              
              <div className="weather-item">
                <span className="label">Cloud Cover</span>
                <span className="value">{formatPercentage(weatherData.cloudCover)}</span>
              </div>
              
              <div className="weather-item">
                <span className="label">Wind</span>
                <span className="value">
                  {formatWindSpeed(weatherData.windSpeed)} {windDir}
                </span>
              </div>
              
              <div className="weather-item">
                <span className="label">Gusts</span>
                <span className="value">{formatWindSpeed(weatherData.windGust)}</span>
              </div>
              
              <div className="weather-item">
                <span className="label">Precipitation</span>
                <span className="value">{formatPrecipitation(weatherData.precipitation)}</span>
              </div>
              
              <div className="weather-item">
                <span className="label">Solar Radiation</span>
                <span className="value">{formatRadiation(weatherData.shortwaveRadiation)}</span>
              </div>
            </div>
          </>
        ) : (
          /* 24-hour forecast display */
          <div className="forecast-container">
            {forecast && forecast.forecast ? (
              <div className="forecast-grid">
                {forecast.forecast.map((item, index) => (
                  <div key={index} className="forecast-item">
                    <div className="forecast-time">{formatTime(item.timestamp)}</div>
                    <div className="forecast-icon">
                      {getWeatherIcon(item.weather.condition, item.timestamp)}
                    </div>
                    <div className="forecast-temp">
                      {formatTemperature(item.weather.temperature)}
                    </div>
                    <div className="forecast-details">
                      <div className="forecast-detail">
                        💧 {formatPercentage(item.weather.humidity)}
                      </div>
                      <div className="forecast-detail">
                        🌧️ {formatPrecipitation(item.weather.precipitation)}
                      </div>
                      <div className="forecast-detail">
                        💨 {formatWindSpeed(item.weather.windSpeed)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-forecast">
                <span>Forecast data not available</span>
              </div>
            )}
          </div>
        )}

        {/* Last updated timestamp */}
        <div className="weather-footer">
          <div className="last-updated">
            <div>Last updated: {lastUpdated?.toLocaleTimeString()}</div>
            
          </div>
          <button 
            onClick={() => fetchWeather(true)} 
            className="refresh-button" 
            title="Force refresh weather data"
            disabled={loading}
          >
            🔄
          </button>
        </div>
      </div>

      <style jsx>{`
        .weather-widget {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          border: 1px solid #e5e7eb;
          transition: box-shadow 0.3s ease;
        }

        .weather-widget:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .widget-header {
          background:rgb(255, 255, 255);
          color: white;
          padding: 16px;
          text-align: center;
        }

        .widget-header h3 {
          margin: 0 0 4px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .location-info {
          font-size: 14px;
          opacity: 0.9;
          font-size: 18px;
          color:rgb(0, 0, 0);
          margin-bottom: 2px;
        }

        .coordinates {
          font-size: 12px;
          opacity: 0.7;
          font-size: 14px;
          color:rgb(2, 1, 1);
          font-family: 'Courier New', monospace;
        }

        .widget-content {
          padding: 10px;
        }

        .view-toggle {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
          background: #f3f4f6;
          padding: 4px;
          border-radius: 8px;
        }

        .toggle-button {
          flex: 1;
          padding: 8px 16px;
          border: none;
          background: transparent;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          color: #6b7280;
        }

        .toggle-button.active {
          background: white;
          color: #1f2937;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .toggle-button:hover:not(.active) {
          color: #374151;
        }

        .debug-info {
          background: #fef3cd;
          border: 1px solid #fbbf24;
          border-radius: 6px;
          padding: 8px 12px;
          margin-bottom: 16px;
          font-size: 12px;
          color: #92400e;
        }

        .weather-main {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .weather-condition {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .weather-icon {
          font-size: 32px;
        }

        .condition-text {
          font-size: 18px;
          font-weight: 500;
          color: #374151;
        }

        .temperature-display {
          font-size: 36px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 4px;
        }

        .weather-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .weather-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
        }

        .weather-item .label {
          font-size: 14px;
          color: #6b7280;
          font-weight: 500;
        }

        .weather-item .value {
          font-size: 14px;
          color: #1f2937;
          font-weight: 600;
        }

        /* Forecast styles */
        .forecast-container {
          max-height: 400px;
          overflow-y: auto;
          padding-right: 8px;
        }

        .forecast-grid {
          display: grid;
          gap: 12px;
        }

        .forecast-item {
          display: grid;
          grid-template-columns: 60px 40px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
          transition: background-color 0.2s;
        }

        .forecast-item:hover {
          background: #f3f4f6;
        }

        .forecast-time {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .forecast-icon {
          font-size: 24px;
          text-align: center;
        }

        .forecast-temp {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
        }

        .forecast-details {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .forecast-detail {
          font-size: 13px;
          color: #6b7280;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .no-forecast {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
        }

        .weather-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }

        .last-updated {
          font-size: 12px;
          color: #6b7280;
        }

        .cache-info {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 2px;
        }

        .refresh-button {
          background: none;
          border: none;
          font-size: 16px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .refresh-button:hover:not(:disabled) {
          background-color: #f3f4f6;
          transform: rotate(180deg);
        }

        .refresh-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .loading-spinner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: #6b7280;
          padding: 20px;
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error-message {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          text-align: center;
          color: #ef4444;
          padding: 20px;
        }

        .error-icon {
          font-size: 24px;
        }

        .retry-button {
          background: #ef4444;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .retry-button:hover {
          background: #dc2626;
        }

        /* Scrollbar styles for forecast */
        .forecast-container::-webkit-scrollbar {
          width: 6px;
        }

        .forecast-container::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 3px;
        }

        .forecast-container::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }

        .forecast-container::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .weather-details {
            grid-template-columns: 1fr;
          }
          
          .temperature-display {
            font-size: 28px;
          }
          
          .weather-icon {
            font-size: 24px;
          }

          .forecast-item {
            grid-template-columns: 60px 40px 1fr;
          }

          .forecast-details {
            grid-column: 1 / -1;
            margin-top: 8px;
          }
        }
      `}</style>
    </div>
  );
};

export default WeatherWidget;