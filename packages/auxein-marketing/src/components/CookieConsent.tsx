'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';

const COOKIE_CONSENT_KEY = 'auxein-cookie-consent';

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if user has already consented
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Small delay before showing banner
      const timer = setTimeout(() => setShowBanner(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setShowBanner(false);
  };

  const handleDecline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    setShowBanner(false);
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
        >
          <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl border border-olive/10 overflow-hidden">
            <div className="p-4 md:p-6">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="hidden sm:flex w-10 h-10 rounded-lg bg-olive/10 items-center justify-center shrink-0">
                  <Cookie className="w-5 h-5 text-olive" />
                </div>

                {/* Content */}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-charcoal mb-2">
                    We respect your privacy
                  </h3>
                  <p className="text-charcoal-600 text-sm mb-4">
                    We use minimal cookies to ensure our website functions properly. We also use{' '}
                    <strong>Umami</strong>, a privacy-focused analytics tool that doesn&apos;t track 
                    personal data or use cookies. By clicking &quot;Accept&quot;, you consent to our use of 
                    essential cookies.{' '}
                    <Link href="/privacy" className="text-olive hover:text-olive-600 underline">
                      Learn more
                    </Link>
                  </p>

                  {/* Buttons */}
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleAccept}
                      className="px-5 py-2 bg-olive hover:bg-olive-600 text-white font-medium rounded-lg transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={handleDecline}
                      className="px-5 py-2 bg-transparent border border-olive/25 text-charcoal hover:border-olive font-medium rounded-lg transition-colors"
                    >
                      Decline
                    </button>
                    <Link
                      href="/privacy"
                      className="px-5 py-2 text-olive hover:text-olive-600 font-medium transition-colors"
                    >
                      Privacy Policy
                    </Link>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={handleDecline}
                  className="p-1 text-charcoal-400 hover:text-charcoal rounded transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}