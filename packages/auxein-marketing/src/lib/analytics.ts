// src/lib/analytics.ts
// Umami analytics helper functions

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, unknown>) => void;
    };
  }
}

/**
 * Track a custom event in Umami
 * @param eventName - Name of the event (e.g., 'contact-form-submitted')
 * @param eventData - Optional data to attach to the event
 */
export function trackEvent(
  eventName: string,
  eventData?: Record<string, unknown>
): void {
  if (typeof window !== 'undefined' && window.umami) {
    window.umami.track(eventName, eventData);
  }
}

/**
 * Track page view (usually automatic, but can be called manually for SPAs)
 * @param url - Optional URL to track (defaults to current page)
 */
export function trackPageView(url?: string): void {
  if (typeof window !== 'undefined' && window.umami) {
    window.umami.track(url || window.location.pathname);
  }
}

// Pre-defined event helpers for consistency

export function trackContactFormSubmitted(product: string, hasCompany: boolean): void {
  trackEvent('contact-form-submitted', { product, hasCompany });
}

export function trackContactFormError(product: string): void {
  trackEvent('contact-form-error', { product });
}

export function trackSolutionViewed(solutionId: string): void {
  trackEvent('solution-viewed', { solutionId });
}

export function trackCTAClicked(ctaName: string, location: string): void {
  trackEvent('cta-clicked', { ctaName, location });
}

export function trackExternalLinkClicked(url: string, context: string): void {
  trackEvent('external-link-clicked', { url, context });
}