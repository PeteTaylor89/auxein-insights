// src/api/propertyService.js - Property API service
import api from './api';

const propertyService = {
  async adminListAll(params = {}) {
    const { skip = 0, limit = 100, search, company_id } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
      ...(search && { search }),
      ...(company_id && { company_id: company_id.toString() }),
    });
    const response = await api.get(`/admin/properties?${queryParams}`);
    return response.data;
  },

  async listProperties(params = {}) {
    const { skip = 0, limit = 100 } = params;
    const queryParams = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    const response = await api.get(`/v1/properties/?${queryParams}`);
    return response.data;
  },

  async createProperty(data) {
    const response = await api.post('/v1/properties/', data);
    return response.data;
  },

  async updateProperty(id, data) {
    const response = await api.patch(`/v1/properties/${id}`, data);
    return response.data;
  },

  // Save (or clear, pass null) a GeoJSON polygon as the property boundary.
  async updatePropertyGeometry(id, geometry) {
    const response = await api.patch(`/v1/properties/${id}`, { geometry });
    return response.data;
  },

  // --- Insights site -------------------------------------------------------
  // A property's own point in the Insights climate archive. Without one, This
  // Season shows the property its REGION's climate, which is somebody else's.

  // Never 404s on an absent site: "no site yet" is a normal answer the UI
  // renders as a button, and a 404 would be indistinguishable from a property
  // that does not exist.
  async getInsightsSite(id) {
    const response = await api.get(`/v1/properties/${id}/insights-site`);
    return response.data;
  },

  // 202 — the row exists straight away, its climate record does not. A 422
  // carries `{code, message}` naming what the user has to fix: no forecast
  // point set, or a point that falls outside the land mask (in which case the
  // detail carries the distance to the nearest usable cell).
  async provisionInsightsSite(id) {
    const response = await api.post(`/v1/properties/${id}/insights-site`);
    return response.data;
  },

  // Re-place an existing site at the property's CURRENT forecast point. Saving
  // a point does not move the site — the record is rebuilt from scratch, so it
  // is a deliberate press, not a side effect of an edit. The response carries
  // `moved` (false when the two already agree), and `zone_warning` when the new
  // point falls outside every wine zone and so loses its regional figures.
  async moveInsightsSite(id) {
    const response = await api.post(`/v1/properties/${id}/insights-site/move`);
    return response.data;
  },

  // Regional / site / observed growth stages for this property, per variety.
  // Every track can be absent and each absence carries its own reason — see
  // backend/services/grow_phenology.
  async getPropertyPhenology(id, vintage) {
    const response = await api.get(`/v1/properties/${id}/phenology`, {
      params: vintage ? { vintage } : undefined,
    });
    return response.data;
  },

  // Weather to date and disease pressure for this property — regional and, when
  // it has a climate site, its own point. Both halves are assembled server-side
  // so the panel does not need a second HTTP client for the public realtime
  // endpoints. See backend/services/grow_season.
  async getPropertySeason(id, days) {
    const response = await api.get(`/v1/properties/${id}/season`, {
      params: days ? { days } : undefined,
    });
    return response.data;
  },

  // --- the property's own climate record -----------------------------------
  // The same views Insights renders on My Site, for a Grow property, off its
  // `insights_site`. Built by backend/services/insights_site_views, which the
  // Insights routes also call, so the two products cannot disagree about the
  // same 500 m cell.
  //
  // NONE OF THESE THROW WHEN THERE IS NO SITE. They answer 200 with
  // `available: false` and a `reason` to render — a property with no climate
  // site is a normal state, and most properties are in it. Check `available`
  // before reading anything else.

  // Season by season, 1986-2023, against the spread of the property's region.
  async getClimateSeasons(id, metrics) {
    const response = await api.get(`/v1/properties/${id}/climate/seasons`, {
      params: metrics ? { metrics } : undefined,
    });
    return response.data;
  },

  // Month by month as an anomaly against this site's own normal. `variable` is
  // `temp_mean` or `rainfall`, and the statistic must match it (`mean` / `sum`)
  // or the site holds no such band and the answer is available:false.
  async getClimateMonthly(id, { variable, statistic, baseline } = {}) {
    const response = await api.get(`/v1/properties/${id}/climate/monthly`, {
      params: { variable, statistic, baseline },
    });
    return response.data;
  },

  // Tiles, the season in progress and the last completed season. Three
  // different scales in one payload — each block says which it is.
  async getClimateOverview(id, baseline) {
    const response = await api.get(`/v1/properties/${id}/climate/overview`, {
      params: baseline ? { baseline } : undefined,
    });
    return response.data;
  },

  // The season in progress, day by day. `series.baseline` and `series.zone` are
  // null rather than empty when there is nothing to compare against.
  async getClimateSeasonSeries(id, vintage) {
    const response = await api.get(`/v1/properties/${id}/climate/season-series`, {
      params: vintage ? { vintage } : undefined,
    });
    return response.data;
  },

  // The disease models' own numbers over the last N days, with each model's own
  // bands. Unlike the rest of /climate/*, this does NOT need a climate site: a
  // property without one gets its region's models, labelled as regional.
  async getClimateDisease(id, days) {
    const response = await api.get(`/v1/properties/${id}/climate/disease`, {
      params: days ? { days } : undefined,
    });
    return response.data;
  },

  // Scenario deltas at this site's cell. ANN by default — only gdd10 is
  // published for the growing season, so SEPAPR returns one band.
  async getClimateProjections(id, season) {
    const response = await api.get(`/v1/properties/${id}/climate/projections`, {
      params: season ? { season } : undefined,
    });
    return response.data;
  },

  async getPropertyBlocks(id) {
    const response = await api.get(`/v1/properties/${id}/blocks`);
    return response.data;
  },

  async createManagementRelationship(propertyId, data) {
    const response = await api.post(`/v1/properties/${propertyId}/management-relationships`, data);
    return response.data;
  },
};

export default propertyService;
