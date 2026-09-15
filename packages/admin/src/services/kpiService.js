// src/services/kpiService.js — platform KPI snapshots.
//
// Insights identity (require_admin), so it goes through publicApi.
import publicApi from './publicApi';

const kpiService = {
  /** Every metric with its series, latest value and MoM delta. */
  list: (months = 24) =>
    publicApi.get('/admin/kpis', { params: { months } }).then((r) => r.data),

  /** Recompute one month, YYYY-MM. Manual rows are left alone server-side. */
  recompute: (month) =>
    publicApi.post('/admin/kpis/recompute', null, { params: { month } }).then((r) => r.data),
};

export default kpiService;
