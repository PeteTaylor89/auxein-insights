'use client';

import Link from 'next/link';
import { Container } from '@/components/layout/Container';

export default function TermsContent() {
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
              className="px-4 py-2 bg-white border border-olive/25 text-charcoal hover:border-olive rounded-lg font-medium transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="px-4 py-2 bg-olive text-white rounded-lg font-medium"
            >
              Terms of Use
            </Link>
          </div>

          {/* Content */}
          <div className="bg-white rounded-xl p-8 md:p-12 shadow-sm border border-olive/10">
            <article className="prose prose-olive max-w-none">
              <h1 className="text-3xl font-bold text-charcoal border-b-2 border-olive pb-4 mb-6">
                Terms of Use
              </h1>
              <p className="text-charcoal-500 mb-8">Effective Date: 26 January 2026</p>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">1. Agreement to Terms</h2>
                <p className="text-charcoal-600 mb-4">
                  These Terms of Use (&quot;Terms&quot;) constitute a legally binding agreement between you 
                  and Auxein Limited (NZBN: 9429041651063, &quot;Auxein&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) governing 
                  your access to and use of the Auxein website and related services (collectively, the &quot;Services&quot;).
                </p>
                <p className="text-charcoal-600 mb-4">
                  By accessing or using our Services, you agree to be bound by these Terms. 
                  If you do not agree to these Terms, you may not access or use the Services.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">2. Services Description</h2>
                <p className="text-charcoal-600 mb-4">
                  Auxein provides climate intelligence, vineyard management solutions, and related 
                  consulting services for the New Zealand wine industry. Our Services include:
                </p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Auxein Insights Pro - Vineyard management platform</li>
                  <li>Regional Intelligence - Free climate data platform</li>
                  <li>Climate and vineyard data products</li>
                  <li>Sustainability and climate risk consulting</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">3. Eligibility</h2>
                <p className="text-charcoal-600 mb-4">To use our Services, you must:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Be at least 18 years of age</li>
                  <li>Have the legal capacity to enter into a binding agreement</li>
                  <li>Not be prohibited from using the Services under applicable laws</li>
                  <li>Provide accurate and complete information when contacting us</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  If you are using the Services on behalf of an organisation, you represent that 
                  you have authority to bind that organisation to these Terms.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">4. Acceptable Use</h2>
                <p className="text-charcoal-600 mb-4">You agree not to:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Use the Services for any unlawful purpose or in violation of these Terms</li>
                  <li>Attempt to gain unauthorised access to any part of the Services</li>
                  <li>Interfere with or disrupt the Services&apos; operation or security</li>
                  <li>Use automated tools to scrape, crawl, or extract data from the Services</li>
                  <li>Reverse engineer, decompile, or disassemble any part of the Services</li>
                  <li>Upload malicious code, viruses, or harmful content</li>
                  <li>Impersonate any person or misrepresent your affiliation with any entity</li>
                  <li>Use the Services in any way that could damage our reputation or goodwill</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">5. Intellectual Property</h2>
                
                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">5.1 Our Intellectual Property</h3>
                <p className="text-charcoal-600 mb-4">
                  The Services, including their design, features, content, and underlying 
                  technology, are owned by Auxein and protected by copyright, trademark, and other 
                  intellectual property laws. You may not copy, modify, distribute, or create 
                  derivative works without our written permission.
                </p>

                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">5.2 Feedback</h3>
                <p className="text-charcoal-600 mb-4">
                  If you provide feedback, suggestions, or ideas about our Services, you grant 
                  us the right to use this feedback without restriction or compensation.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">6. Third-Party Services</h2>
                <p className="text-charcoal-600 mb-4">
                  Our Services may contain links to third-party websites or services that are not 
                  owned or controlled by Auxein. We have no control over, and assume no responsibility 
                  for, the content, privacy policies, or practices of any third-party websites or services.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">7. Disclaimer of Warranties</h2>
                <p className="text-charcoal-600 mb-4 uppercase text-sm">
                  THE SERVICES ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY 
                  KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO 
                  WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND 
                  NON-INFRINGEMENT.
                </p>
                <p className="text-charcoal-600 mb-4">
                  We do not warrant that the Services will be uninterrupted, error-free, or 
                  secure, or that any defects will be corrected.
                </p>
                <p className="text-charcoal-600 mb-4 text-sm">
                  CLIMATE DATA AND FORECASTS ARE PROVIDED FOR INFORMATIONAL PURPOSES ONLY AND 
                  SHOULD NOT BE RELIED UPON AS THE SOLE BASIS FOR ANY AGRICULTURAL, BUSINESS, 
                  OR FINANCIAL DECISION. ACTUAL CONDITIONS MAY VARY SIGNIFICANTLY FROM PREDICTIONS.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">8. Limitation of Liability</h2>
                <p className="text-charcoal-600 mb-4 text-sm">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, AUXEIN AND ITS DIRECTORS, EMPLOYEES, 
                  AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
                  CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF 
                  PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICES.
                </p>
                <p className="text-charcoal-600 mb-4">
                  Nothing in these Terms excludes or limits liability that cannot be excluded 
                  or limited under applicable law, including the Consumer Guarantees Act 1993 
                  (NZ) where applicable.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">9. Indemnification</h2>
                <p className="text-charcoal-600 mb-4">
                  You agree to indemnify and hold harmless Auxein and its officers, directors, 
                  employees, and agents from any claims, damages, losses, or expenses (including 
                  legal fees) arising from your use of the Services, violation of these Terms, 
                  or infringement of any third-party rights.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">10. Changes to Terms</h2>
                <p className="text-charcoal-600 mb-4">
                  We may modify these Terms at any time by posting revised Terms on this page. 
                  Material changes will be communicated with reasonable notice. 
                  Your continued use of the Services after changes become effective constitutes 
                  acceptance of the revised Terms.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">11. General Provisions</h2>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>
                    <strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy, 
                    constitute the entire agreement between you and Auxein.
                  </li>
                  <li>
                    <strong>Severability:</strong> If any provision is found unenforceable, the 
                    remaining provisions continue in effect.
                  </li>
                  <li>
                    <strong>Waiver:</strong> Our failure to enforce any right does not constitute 
                    a waiver of that right.
                  </li>
                  <li>
                    <strong>Assignment:</strong> You may not assign your rights under these Terms 
                    without our consent. We may assign our rights without restriction.
                  </li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">12. Governing Law and Disputes</h2>
                <p className="text-charcoal-600 mb-4">
                  These Terms are governed by the laws of New Zealand. Any disputes arising from 
                  these Terms shall be resolved exclusively in the courts of New Zealand.
                </p>
                <p className="text-charcoal-600 mb-4">
                  Before initiating any formal proceedings, you agree to attempt to resolve 
                  disputes informally by contacting us at pete@auxein.co.nz.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">13. Contact Information</h2>
                <p className="text-charcoal-600 mb-4">For questions about these Terms, contact us at:</p>
                <div className="bg-sand p-4 rounded-lg">
                  <p className="text-charcoal font-semibold">Auxein Limited</p>
                  <p className="text-charcoal-600">Email: pete.taylor@auxein.co.nz</p>
                  <p className="text-charcoal-600">Christchurch, Canterbury, New Zealand</p>
                </div>
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