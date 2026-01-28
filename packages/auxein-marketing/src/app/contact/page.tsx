'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, MapPin, Clock, MessageSquare } from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { ContactForm } from '@/components/forms/ContactForm';

function ContactContent() {
  const searchParams = useSearchParams();
  const defaultInquiry = searchParams.get('inquiry') || '';

  return (
    <div className="grid lg:grid-cols-5 gap-12 lg:gap-16">
      {/* Contact Info */}
      <div className="lg:col-span-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-bold text-charcoal mb-6">
            Let's talk
          </h2>
          <p className="text-charcoal-600 mb-8">
            Whether you have questions about our solutions, want to discuss a
            potential partnership, or just want to learn more about what we
            do - I'd love to hear from you.
          </p>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-olive/10 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-olive" />
              </div>
              <div>
                <h3 className="font-semibold text-charcoal">Email</h3>
                <a
                  href="mailto:pete@auxein.co.nz"
                  className="text-olive hover:text-olive-600"
                >
                  pete.taylor@auxein.co.nz
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-olive/10 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-olive" />
              </div>
              <div>
                <h3 className="font-semibold text-charcoal">Location</h3>
                <p className="text-charcoal-600">
                  Christchurch, Canterbury<br />New Zealand
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-olive/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-olive" />
              </div>
              <div>
                <h3 className="font-semibold text-charcoal">Response Time</h3>
                <p className="text-charcoal-600">Usually within 1-2 business days</p>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="mt-10 p-6 rounded-xl bg-sand border border-olive/25">
            <div className="flex items-center gap-3 mb-4">
              <MessageSquare className="w-5 h-5 text-olive" />
              <h3 className="font-semibold text-charcoal">Quick Links</h3>
            </div>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://insights.auxein.co.nz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-olive hover:text-olive-600"
                >
                  Try Regional Insights →
                </a>
              </li>
              <li>
                <a href="/insights-pro" className="text-olive hover:text-olive-600">
                  Join the Auxein Insights Pro waitlist →
                </a>
              </li>
            </ul>
          </div>
        </motion.div>
      </div>

      {/* Contact Form */}
      <motion.div
        className="lg:col-span-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="bg-white p-8 md:p-10 rounded-xl shadow-sm border border-olive/10">
          <ContactForm defaultInquiryType={defaultInquiry} />
        </div>
      </motion.div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 bg-sand relative overflow-hidden">
        <div className="texture-overlay" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-olive/10 rounded-full blur-3xl" />

        <Container className="relative z-10">
          <div className="max-w-3xl">
            <motion.h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Contact
            </motion.h1>
            <motion.p
              className="text-xl text-charcoal-600 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Have a question or want to discuss how Auxein can help your
              vineyard or project? Get in touch.
            </motion.p>
          </div>
        </Container>
      </section>

      {/* Contact Section */}
      <section className="py-24 bg-white">
        <Container>
          <Suspense fallback={<div>Loading...</div>}>
            <ContactContent />
          </Suspense>
        </Container>
      </section>
    </>
  );
}