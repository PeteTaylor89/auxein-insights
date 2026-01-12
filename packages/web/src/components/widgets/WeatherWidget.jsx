// frontend/src/components/widgets/WeatherWidget.jsx
import { useState, useEffect } from 'react';
import { weatherCacheService } from '@vineyard/shared';

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
      
      const [weatherData, forecastData] = await Promise.all([
        weatherCacheService.getCachedCurrentWeather(loc.lat, loc.lon, forceRefresh),
        weatherCacheService.getCachedWeatherForecast(loc.lat, loc.lon, forceRefresh)
      ]);

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
    if (location || !location) {
      fetchWeather(false);
    }
  }, [location]);

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
    
    let isNight = false;
    if (timestamp) {
      const hour = new Date(timestamp).getHours();
      isNight = hour >= 18 || hour < 6;
    } else {
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
          <div className="location-info">Weather</div>
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
          <div className="location-info">Weather</div>
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
          <div className="location-info">Weather</div>
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

  const weatherData = weather.weather;
  const condition = weatherData.condition || 'Unknown';
  const windDir = weatherData.windDirection?.compass || 'N/A';
  const locationName = location?.name || defaultLocation.name;
  const showDebug = process.env.NODE_ENV === 'development' && weather.debug?.hasNullValues;

  return (
    <div className={`weather-widget ${className}`}>
      <div className="widget-header">
        <div className="location-info">
          {location ? location.name : locationName}
        </div>
        {weather.location && (
          <div className="coordinates">
            {weather.location.lat?.toFixed(3)}, {weather.location.lon?.toFixed(3)}
          </div>
        )}
      </div>
      
      <div className="widget-content">
        {showDebug && (
          <div className="debug-info">
            <span>⚠️ Some data missing: {weather.debug.nullFields.join(', ')}</span>
          </div>
        )}

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
            <div className="weather-main">
              <div className="weather-condition">
                <span className="weather-icon">{getWeatherIcon(condition)}</span>
                <span className="condition-text">{condition}</span>
              </div>
              <div className="temperature-display">
                {formatTemperature(weatherData.temperature)}
              </div>
            </div>

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
          background: #FFFFFF;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(47, 47, 47, 0.1);
          overflow: hidden;
          border: 1px solid rgba(91, 104, 48, 0.25); /* Olive */
          transition: box-shadow 0.3s ease;
          font-family: Calibri, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          color: #2F2F2F; /* Charcoal */
        }

        .weather-widget:hover {
          box-shadow: 0 4px 12px rgba(47, 47, 47, 0.18);
        }

        .widget-header {
          background: #FDF6E3; /* Warm Sand */
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid rgba(91, 104, 48, 0.25);
        }

        .location-info {
          font-size: 16px;
          font-weight: bold;
          color: #2F2F2F; /* Charcoal */
          margin-bottom: 2px;
        }

        .coordinates {
          font-size: 12px;
          color: #5B6830; /* Olive */
          opacity: 0.9;
        }

        .widget-content {
          padding: 12px 14px;
          background: #FFFFFF;
        }

        .view-toggle {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
          background: #FDF6E3; /* Warm Sand */
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
          color: #5B6830; /* Olive */
        }

        .toggle-button.active {
          background: #D1583B; /* Terracotta */
          color: #FFFFFF;
          box-shadow: 0 1px 3px rgba(47, 47, 47, 0.25);
        }

        .toggle-button:hover:not(.active) {
          background: rgba(209, 88, 59, 0.12); /* light Terracotta tint */
        }

        .debug-info {
          background: #FDF6E3;
          border: 1px solid #D1583B;
          border-radius: 6px;
          padding: 8px 12px;
          margin-bottom: 12px;
          font-size: 12px;
          color: #2F2F2F;
        }

        .weather-main {
          text-align: center;
          margin-bottom: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(91, 104, 48, 0.18);
        }

        .weather-condition {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 6px;
        }

        .weather-icon {
          font-size: 26px;
        }

        .condition-text {
          font-size: 16px;
          font-weight: 500;
          color: #2F2F2F;
        }

        .temperature-display {
          font-size: 28px;
          font-weight: 700;
          color: #5B6830; /* Olive */
          margin-bottom: 4px;
        }

        .weather-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 12px;
        }

        .weather-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
        }

        .weather-item .label {
          font-size: 13px;
          color: #5B6830;
          font-weight: 500;
        }

        .weather-item .value {
          font-size: 13px;
          color: #2F2F2F;
          font-weight: 600;
        }

        .forecast-container {
          max-height: 400px;
          overflow-y: auto;
          padding-right: 6px;
        }

        .forecast-grid {
          display: grid;
          gap: 10px;
        }

        .forecast-item {
          display: grid;
          grid-template-columns: 60px 40px 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: #FDF6E3; /* Warm Sand */
          border-radius: 8px;
          border: 1px solid rgba(91, 104, 48, 0.18);
          transition: background-color 0.2s, box-shadow 0.2s;
        }

        .forecast-item:hover {
          background: #F5EBD5;
          box-shadow: 0 2px 4px rgba(47, 47, 47, 0.15);
        }

        .forecast-time {
          font-size: 13px;
          font-weight: 600;
          color: #2F2F2F;
        }

        .forecast-icon {
          font-size: 22px;
          text-align: center;
        }

        .forecast-temp {
          font-size: 16px;
          font-weight: 600;
          color: #5B6830;
        }

        .forecast-details {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .forecast-detail {
          font-size: 12px;
          color: #2F2F2F;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .no-forecast {
          text-align: center;
          padding: 32px 16px;
          color: #2F2F2F;
        }

        .weather-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 10px;
          border-top: 1px solid rgba(91, 104, 48, 0.18);
        }

        .last-updated {
          font-size: 11px;
          color: #2F2F2F;
          opacity: 0.8;
        }

        .refresh-button {
          background: none;
          border: 1px solid rgba(91, 104, 48, 0.6);
          font-size: 16px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          transition: all 0.2s;
          color: #5B6830;
        }

        .refresh-button:hover:not(:disabled) {
          background-color: #FDF6E3;
        }

        .refresh-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .loading-spinner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: #2F2F2F;
          padding: 18px;
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #FDF6E3;
          border-top: 2px solid #D1583B; /* Terracotta */
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
          color: #D1583B;
          padding: 20px;
        }

        .error-icon {
          font-size: 22px;
        }

        .retry-button {
          background: #D1583B; /* Terracotta */
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .retry-button:hover {
          background: #b1462f;
        }

        .forecast-container::-webkit-scrollbar {
          width: 6px;
        }

        .forecast-container::-webkit-scrollbar-track {
          background: #FDF6E3;
          border-radius: 3px;
        }

        .forecast-container::-webkit-scrollbar-thumb {
          background: #D1D5DB;
          border-radius: 3px;
        }

        .forecast-container::-webkit-scrollbar-thumb:hover {
          background: #9CA3AF;
        }

        @media (max-width: 768px) {
          .weather-details {
            grid-template-columns: 1fr;
          }
          
          .temperature-display {
            font-size: 26px;
          }
          
          .weather-icon {
            font-size: 24px;
          }

          .forecast-item {
            grid-template-columns: 60px 40px 1fr;
          }

          .forecast-details {
            grid-column: 1 / -1;
            margin-top: 6px;
          }
        }
      `}</style>
    </div>
  );
};

export default WeatherWidget;
