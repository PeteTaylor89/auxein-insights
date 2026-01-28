declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, unknown>) => void;
    };
  }
}

export function trackEvent(
  eventName: string,
  eventData?: Record<string, unknown>
): void {
  if (typeof window !== 'undefined' && window.umami) {
    window.umami.track(eventName, eventData);
  }
}

export const analytics = {
  viewSolution: (solutionId: string) =>
    trackEvent('view_solution', { solution: solutionId }),
  clickSolutionCta: (solutionId: string) =>
    trackEvent('click_solution_cta', { solution: solutionId }),
  submitContactForm: (inquiryType: string) =>
    trackEvent('submit_contact_form', { inquiry_type: inquiryType }),
  joinWaitlist: (source: string) =>
    trackEvent('join_waitlist', { source }),
  clickNavLink: (link: string) =>
    trackEvent('click_nav_link', { link }),
  clickExternalLink: (url: string) =>
    trackEvent('click_external_link', { url }),
};