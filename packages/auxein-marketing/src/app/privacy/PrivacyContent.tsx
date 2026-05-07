'use client';

import Link from 'next/link';
import { Container } from '@/components/layout/Container';

export default function PrivacyContent() {
  return (
    <div className="pt-24 pb-16 bg-sand min-h-screen">
      <Container>
        <div className="max-w-4xl mx-auto">
          {/* Back link */}
          <Link 
            href="/" 
            className="inline-flex items-center text-olive hover:text-olive-600 mb-8 transition-colors"
          >
            ← Back to Home
          </Link>

          {/* Navigation tabs */}
          <div className="flex gap-2 mb-8 flex-wrap">
            <Link
              href="/privacy"
              className="px-4 py-2 bg-olive text-white rounded-lg font-medium"
            >
              Privacy Policy
            </Link>
            <Link
              href="/grow/privacy"
              className="px-4 py-2 bg-white border border-olive/25 text-charcoal hover:border-olive rounded-lg font-medium transition-colors"
            >
              Auxein Grow Privacy
            </Link>
            <Link
              href="/terms"
              className="px-4 py-2 bg-white border border-olive/25 text-charcoal hover:border-olive rounded-lg font-medium transition-colors"
            >
              Terms of Use
            </Link>
          </div>

          {/* Content */}
          <div className="bg-white rounded-xl p-8 md:p-12 shadow-sm border border-olive/10">
            <article className="prose prose-olive max-w-none">
              <h1 className="text-3xl font-bold text-charcoal border-b-2 border-olive pb-4 mb-6">
                Privacy Policy
              </h1>
              <p className="text-charcoal-500 mb-8">Effective Date: 26 January 2026</p>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">1. Introduction</h2>
                <p className="text-charcoal-600 mb-4">
                  Auxein Limited (NZBN: 9429041651063, &quot;Auxein&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the 
                  Auxein website and related services. We are committed to protecting your privacy and 
                  handling your personal information in accordance with the New Zealand Privacy Act 2020.
                </p>
                <p className="text-charcoal-600 mb-4">
                  This policy explains how we collect, use, store, and protect your personal 
                  information when you use our services.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">2. Information We Collect</h2>
                
                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">2.1 Information You Provide</h3>
                <p className="text-charcoal-600 mb-4">When you contact us or use our services, we may collect:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Contact information: name, email address</li>
                  <li>Professional information: company name, job title</li>
                  <li>Geographic information: region of interest for climate data services</li>
                  <li>Communication preferences: your choices regarding newsletters and marketing communications</li>
                </ul>

                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">2.2 Information Collected Automatically</h3>
                <p className="text-charcoal-600 mb-4">When you visit our website, we automatically collect:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Usage data: pages visited, features accessed (via privacy-focused analytics)</li>
                  <li>Technical data: browser type, device information</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  We use Umami, a privacy-focused analytics platform that does not use cookies 
                  or collect personal data.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">3. How We Use Your Information</h2>
                <p className="text-charcoal-600 mb-4">We use your information to:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Respond to your enquiries and provide requested services</li>
                  <li>Send service-related communications</li>
                  <li>Send marketing communications (only with your explicit consent)</li>
                  <li>Improve our services through aggregated, anonymised analytics</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">4. Legal Basis for Processing</h2>
                <p className="text-charcoal-600 mb-4">We process your personal information based on:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li><strong>Consent:</strong> For marketing communications and optional data collection</li>
                  <li><strong>Legitimate interests:</strong> For service improvement and security</li>
                  <li><strong>Legal obligations:</strong> To comply with applicable laws</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">5. Information Sharing</h2>
                <p className="text-charcoal-600 mb-4">We do not sell your personal information. We may share your information with:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li><strong>Service providers:</strong> Cloud hosting (Amazon Web Services), email delivery services who process data on our behalf under strict confidentiality agreements</li>
                  <li><strong>Professional advisors:</strong> Accountants, lawyers, and auditors as necessary</li>
                  <li><strong>Legal authorities:</strong> When required by law or to protect our rights</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">6. International Data Transfers</h2>
                <p className="text-charcoal-600 mb-4">
                  Your data may be processed in countries outside New Zealand, including Australia 
                  and the United States (for cloud hosting). We ensure appropriate safeguards are 
                  in place, including contracts that require recipients to protect your information 
                  to standards comparable to New Zealand law.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">7. Data Retention</h2>
                <p className="text-charcoal-600 mb-4">We retain your personal information for as long as:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Necessary to provide you with our services</li>
                  <li>Required to comply with legal obligations (typically 7 years for financial records)</li>
                  <li>Needed to resolve disputes and enforce agreements</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  You may request deletion of your personal data at any time, subject 
                  to legal retention requirements.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">8. Your Rights</h2>
                <p className="text-charcoal-600 mb-4">Under the Privacy Act 2020, you have the right to:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li><strong>Access:</strong> Request a copy of personal information we hold about you</li>
                  <li><strong>Correction:</strong> Ask us to correct inaccurate or incomplete information</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal requirements)</li>
                  <li><strong>Withdraw consent:</strong> Opt out of marketing communications at any time</li>
                  <li><strong>Complain:</strong> Lodge a complaint with the NZ Privacy Commissioner</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  To exercise these rights, contact us at{' '}
                  <a href="mailto:pete.taylor@auxein.co.nz" className="text-olive hover:text-olive-600">
                    pete.taylor@auxein.co.nz
                  </a>.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">9. Cookies</h2>
                <p className="text-charcoal-600 mb-4">
                  Our website uses minimal cookies. We use Umami for analytics, which is a 
                  privacy-focused platform that does not use cookies or collect personal data.
                </p>
                <p className="text-charcoal-600 mb-4">
                  Essential cookies may be used for website functionality. You can control cookies 
                  through your browser settings.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">10. Data Security</h2>
                <p className="text-charcoal-600 mb-4">We implement industry-standard security measures including:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Encryption of data in transit (TLS/SSL)</li>
                  <li>Secure cloud infrastructure with AWS</li>
                  <li>Regular security assessments</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  While we take reasonable steps to protect your information, no internet transmission 
                  is completely secure.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">11. Changes to This Policy</h2>
                <p className="text-charcoal-600 mb-4">
                  We may update this Privacy Policy from time to time. We will notify you of material 
                  changes by posting the updated policy on this page. Continued use of our services after changes 
                  take effect constitutes acceptance of the revised policy.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">12. Contact Us</h2>
                <p className="text-charcoal-600 mb-4">For privacy-related inquiries or to exercise your rights:</p>
                <div className="bg-sand p-4 rounded-lg mb-4">
                  <p className="text-charcoal font-semibold">Auxein Limited</p>
                  <p className="text-charcoal-600">Email: pete.taylor@auxein.co.nz</p>
                  <p className="text-charcoal-600">Christchurch, Canterbury, New Zealand</p>
                </div>
                <p className="text-charcoal-600">
                  <strong>NZ Privacy Commissioner:</strong>{' '}
                  <a 
                    href="https://www.privacy.org.nz" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-olive hover:text-olive-600"
                  >
                    www.privacy.org.nz
                  </a>
                </p>
              </section>
            </article>

            {/* Back to top */}
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="mt-8 mx-auto block px-4 py-2 text-sm text-charcoal-500 border border-olive/25 rounded-lg hover:bg-sand transition-colors"
            >
              ↑ Back to top
            </button>
          </div>

          {/* Last updated */}
          <p className="text-center text-charcoal-500 text-sm mt-6">
            Last updated: 26 January 2026 ·{' '}
          </p>
        </div>
      </Container>
    </div>
  );
}