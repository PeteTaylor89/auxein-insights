// packages/shared/src/api/costsService.js — pay rates and company cost settings.
//
// Everything here sits behind the `costs` permission module, which is
// auxein_admin and company_admin only. It is NOT the `timesheets` permission,
// which company_manager holds — a manager can see hours and cannot see rates.
//
// The read gate is as tight as the write gate on purpose: a task cost plus its
// hours reveals an hourly rate, so anything derived from a rate is behind the
// same door as the rate itself. Do not add a "just the totals" endpoint here
// on the assumption that a total is less sensitive than a rate.
import api from './api';

const costsService = {
  // ---- Company cost settings ----

  // Returns the settings plus a `gaps` array — plain-language descriptions of
  // what is not configured and what each gap costs. Never 404s: an
  // unconfigured company is a normal state with something useful to say.
  getSettings: async () => {
    const response = await api.get('/v1/costs/settings');
    return response.data;
  },

  // Fields absent from the body are left alone; fields sent as null are
  // cleared. Send only what changed.
  updateSettings: async (data) => {
    const response = await api.put('/v1/costs/settings', data);
    return response.data;
  },

  // ---- Equipment operating rates ----
  //
  // Here rather than on the asset form on purpose: an operating rate is a
  // depreciation and maintenance position, and combined with task hours it says
  // what a job cost. Same door as pay rates.
  getEquipmentRates: async () => {
    const response = await api.get('/v1/costs/equipment-rates');
    return response.data;
  },

  // Null clears the rate, returning the asset to UNCOSTED rather than free.
  // Does not restate past task costs — those are snapshots; a recompute on the
  // task is the deliberate act that picks up a new rate.
  setEquipmentRate: async (assetId, hourlyRate) => {
    const response = await api.put(`/v1/costs/equipment-rates/${assetId}`, {
      hourly_operating_rate: hourlyRate,
    });
    return response.data;
  },

  // ---- Pay rates ----

  // One row per active staff member with the rate that applies TODAY, for the
  // admin screen. `source` says whether the figure is their own rate, the
  // company fallback, or nothing at all.
  getStaffRates: async () => {
    const response = await api.get('/v1/costs/rates/staff');
    return response.data;
  },

  // Full rate history, newest first. Pass a user_id to narrow to one person.
  getRates: async (userId = undefined) => {
    const response = await api.get('/v1/costs/rates', {
      params: userId ? { user_id: userId } : undefined,
    });
    return response.data;
  },

  // Records a NEW rate from a date. The previous open-ended rate is closed the
  // day before this one starts, server-side, so exactly one rate covers any
  // date. Use this for a pay change — not updateRate, which rewrites history.
  createRate: async (data) => {
    // data: { user_id, hourly_rate, effective_from, currency?, notes? }
    const response = await api.post('/v1/costs/rates', data);
    return response.data;
  },

  // Corrects an existing row. For a genuine pay CHANGE use createRate instead:
  // editing a row in place rewrites what someone was paid rather than
  // recording that it changed.
  updateRate: async (rateId, data) => {
    const response = await api.patch(`/v1/costs/rates/${rateId}`, data);
    return response.data;
  },

  deleteRate: async (rateId) => {
    const response = await api.delete(`/v1/costs/rates/${rateId}`);
    return response.data;
  },

  // What someone's rate was on a given date, and where the figure came from.
  // For checking a disputed cost without reading the rate history by hand.
  resolveRate: async (userId, onDate) => {
    const response = await api.get('/v1/costs/rates/resolve', {
      params: { user_id: userId, on_date: onDate },
    });
    return response.data;
  },
};

export default costsService;
