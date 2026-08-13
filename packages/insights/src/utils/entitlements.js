// utils/entitlements.js — who gets what, on the client.
//
// Tiers (docs/plans/INSIGHTS_SITE_MAP_2026-08-13.md §5a):
//   anonymous   articles, and ONE surface load on the Atlas before a prompt
//   registered  regional stats and all five explorers
//   pro         saved site vs regional background, AI assistant, point sampling
//
// **This is presentation only.** Everything here decides what UI to show. It
// decides nothing about access — the server enforces with 401/402
// (backend/core/entitlements.py). Anyone can edit localStorage or a JS object;
// if a check here is the only thing standing between a user and a paid
// response, the feature is not gated.
//
// Read `user.is_pro`, which the server computes. Do NOT re-derive entitlement
// from `subscription_tier`: 'grow' also counts as Pro (Grow customers already
// pay), and an expired 'pro' does not — and the auth response deliberately
// does not carry `pro_expires_at`, so the client cannot tell the difference.

export function isRegistered(user) {
  return Boolean(user);
}

export function isPro(user) {
  if (!user) return false;
  if (typeof user.is_pro === 'boolean') return user.is_pro;
  // Fallback for a token minted before `is_pro` was added to the response.
  // Deliberately conservative on expiry: it cannot see `pro_expires_at`, so a
  // lapsed subscriber may briefly look Pro here until they re-authenticate.
  // The server still says no, which is the outcome that matters.
  const tier = String(user.subscription_tier || 'free').trim().toLowerCase();
  return tier === 'pro' || tier === 'grow';
}

/** 'anonymous' | 'registered' | 'pro' — for analytics and copy selection. */
export function accessLevel(user) {
  if (!user) return 'anonymous';
  return isPro(user) ? 'pro' : 'registered';
}

/**
 * Did a request fail because of entitlement rather than breakage?
 * 401 → offer sign-in. 402 → offer upgrade. Contract §5.5.
 */
export function entitlementError(error) {
  const status = error?.response?.status;
  if (status === 401) return 'signin';
  if (status === 402) return 'upgrade';
  return null;
}

export default { isRegistered, isPro, accessLevel, entitlementError };
