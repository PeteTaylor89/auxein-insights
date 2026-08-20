// src/services/proService.js — prices, the Grow comparison, and Pro enquiries.
//
// NO PRICE IS HARDCODED IN THE FRONTEND. `getPricing()` fetches the rates and
// everything on the page renders from what it returns. That is not ceremony:
// a price in two places is a price that eventually disagrees with itself, and
// of all the numbers in this product that is the worst one to get wrong.
//
// The calculator therefore does its instant arithmetic with the SERVER'S rates,
// so the figure on screen and the figure recorded in `insights_pricing_quote`
// cannot drift — they are the same rate applied twice, not two rates.
import publicApi from './publicApi';

const BASE = '/public/insights-pro';

/**
 * The current rates, ex- and inc-GST.
 * @returns {Promise<{currency, gst_rate, pro, grow, grow_includes_pro}>}
 */
export async function getPricing() {
  const { data } = await publicApi.get(`${BASE}/pricing`);
  return data;
}

/**
 * Record one run of the calculator and get the authoritative totals back.
 *
 * Sends INPUTS ONLY — the server recomputes. There is deliberately no way to
 * post a total: the table exists to answer "what are people quoting
 * themselves", and that answer is worthless if the client chooses the numbers.
 *
 * @param {{hectares:number, sites:number, sessionKey?:string}} input
 */
export async function recordPricingQuote({ hectares, sites, sessionKey }) {
  const { data } = await publicApi.post(`${BASE}/pricing-quote`, {
    hectares,
    sites,
    session_key: sessionKey || null,
  });
  return data;
}

/**
 * Submit an Insights Pro enquiry.
 *
 * `companyWebsite` is the honeypot and must stay empty — it is hidden from
 * real users and only a bot fills it. The server accepts and silently discards
 * anything that has it set, because telling a bot it failed teaches it to try
 * again with the field blank.
 */
export async function submitProEnquiry(form) {
  const { data } = await publicApi.post(`${BASE}/enquiry`, {
    name: form.name,
    email: form.email,
    phone: form.phone || null,
    business: form.business || null,
    region: form.region || null,
    hectares: form.hectares === '' || form.hectares == null ? null : Number(form.hectares),
    sites: form.sites === '' || form.sites == null ? null : Number(form.sites),
    message: form.message || null,
    company_website: form.companyWebsite || null,
  });
  return data;
}

/**
 * A per-tab key so repeat calculations by one anonymous visitor can be
 * collapsed when the usage data is read.
 *
 * sessionStorage, NOT localStorage: it dies with the tab. This is a
 * de-duplication aid, not a way to recognise somebody across visits, and
 * storing it for longer would quietly turn it into one.
 */
export function calculatorSessionKey() {
  const KEY = 'insights_calc_session';
  try {
    let existing = sessionStorage.getItem(KEY);
    if (!existing) {
      existing = (crypto?.randomUUID?.() || `k${Date.now()}${Math.random()}`).slice(0, 64);
      sessionStorage.setItem(KEY, existing);
    }
    return existing;
  } catch {
    // Private mode or storage disabled. The quote still records, just without
    // a way to group it — which is strictly better than failing the call.
    return null;
  }
}

/** NZ$ with thousands separators. Money is never rendered raw. */
export function formatNZD(value, { decimals = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-NZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export default { getPricing, recordPricingQuote, submitProEnquiry, calculatorSessionKey, formatNZD };
