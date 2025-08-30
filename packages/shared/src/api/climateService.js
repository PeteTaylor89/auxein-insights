// src/services/climateService.js
import api from './api';

class ClimateService {
  // Get available seasons for a block
  async getAvailableSeasons(blockId) {
    const response = await api.get(`/climate/seasons/${blockId}/available`);
    return response.data;
  }

  // Get most recent complete season
  async getMostRecentSeason(blockId) {
    const response = await api.get(`/climate/seasons/${blockId}/recent`);
    return response.data;
  }

  // Get single season summary
  async getSeasonSummary(blockId, season) {
    const response = await api.get(`/climate/seasons/${blockId}/summary`, {
      params: { season }
    });
    return response.data;
  }

  // Get season comparison data
  async getSeasonComparison(blockId, seasons, includeLTA = false, chartType = 'gdd') {
    // Properly format the seasons array for the API
    const params = new URLSearchParams();
    
    // Add each season as a separate parameter
    seasons.forEach(season => {
      params.append('seasons', season);
    });
    
    params.append('include_lta', includeLTA.toString());
    params.append('chart_type', chartType);
    params.append('aggregation', 'monthly');
    
    const response = await api.get(`/climate/seasons/${blockId}/comparison?${params.toString()}`);
    return response.data;
  }

  // Get long-term average
  async getLongTermAverage(blockId) {
    const response = await api.get(`/climate/seasons/${blockId}/lta`);
    return response.data;
  }

  // Get historical climate data (existing endpoint)
  async getHistoricalData(blockId, startDate = null, endDate = null, limit = 1000) {
    const params = { limit };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const response = await api.get(`/climate/historical/${blockId}`, { params });
    return response.data;
  }

  // Get climate summary (existing endpoint)
  async getClimateSummary(blockId, aggregation = 'monthly', startDate = null, endDate = null) {
    const params = { aggregation };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const response = await api.get(`/climate/historical/${blockId}/summary`, { params });
    return response.data;
  }

  // Get climate statistics (existing endpoint)
  async getClimateStats(blockId) {
    const response = await api.get(`/climate/historical/${blockId}/stats`);
    return response.data;
  }
}

const climateService = new ClimateService();
export default climateService;