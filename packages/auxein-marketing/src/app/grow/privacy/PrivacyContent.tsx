'use client';

import Link from 'next/link';
import { Container } from '@/components/layout/Container';

export default function GrowPrivacyContent() {
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
              href="/grow/privacy"
              className="px-4 py-2 bg-olive text-white rounded-lg font-medium"
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
                Auxein Grow — Mobile App Privacy Policy
              </h1>
              <p className="text-charcoal-500 mb-8">Effective Date: 7 May 2026</p>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">1. Introduction</h2>
                <p className="text-charcoal-600 mb-4">
                  Auxein Limited (NZBN: 9429041651063, &quot;Auxein&quot;, &quot;we&quot;, &quot;us&quot;,
                  &quot;our&quot;) develops and operates the Auxein Grow mobile application
                  (&quot;Auxein Grow&quot;, the &quot;App&quot;), distributed through Google Play
                  and the Apple App Store under the package identifier
                  <code className="text-charcoal bg-sand px-1 rounded mx-1">co.nz.auxein.grow</code>.
                </p>
                <p className="text-charcoal-600 mb-4">
                  This policy explains specifically how Auxein Grow collects, uses, stores, shares,
                  and protects information when you use the App in the field. It is supplementary
                  to our general{' '}
                  <Link href="/privacy" className="text-olive hover:text-olive-600">
                    website privacy policy
                  </Link>
                  ; where the two overlap, this Auxein Grow policy governs use of the mobile App.
                </p>
                <p className="text-charcoal-600 mb-4">
                  We handle your information in accordance with the New Zealand Privacy Act 2020
                  and applicable Australian privacy law for users accessing the App from Australia.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">2. About the App</h2>
                <p className="text-charcoal-600 mb-4">
                  Auxein Grow is a vineyard and orchard operations app for field workers, managers,
                  and contractors. It allows authorised users to receive and complete tasks, record
                  GPS tracks of work undertaken (e.g. spray runs), capture observations and photos,
                  log incidents and risks, and report hours worked. All records are scoped to the
                  user&apos;s employer or contracting company within the Auxein platform.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">3. Information We Collect</h2>

                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">3.1 Account &amp; Profile Data</h3>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Name, email address, phone number (if provided), role/permission tier</li>
                  <li>Company affiliation (the Auxein customer account you belong to)</li>
                  <li>Property and block assignments controlled by your company administrator</li>
                  <li>Authentication tokens (session JWTs stored on the device)</li>
                </ul>

                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">3.2 Location Data (Foreground &amp; Background)</h3>
                <p className="text-charcoal-600 mb-4">
                  Auxein Grow collects precise location data only while you are actively using a
                  feature that requires it. Specifically:
                </p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>
                    <strong>GPS task tracking:</strong> when you tap &quot;Start GPS Tracking&quot;
                    on a task, the App records a continuous track (latitude, longitude, accuracy,
                    speed, heading, timestamp) until you tap Stop. Tracking continues in the
                    background while the App is minimised so the track is not lost when the screen
                    locks or you switch apps. A persistent foreground-service notification is shown
                    on Android while background tracking is active.
                  </li>
                  <li>
                    <strong>Single-point captures:</strong> when you create an observation,
                    incident, asset, or risk record, the App captures a single GPS coordinate at
                    that moment to geo-tag the record.
                  </li>
                  <li>
                    <strong>Map view:</strong> your device&apos;s current position may be displayed
                    on map screens to orient you on the property; this position is not transmitted
                    unless you explicitly create a record.
                  </li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  Background location is collected only during active GPS tracking that you have
                  manually started, and stops the moment you stop tracking or close the active
                  task. Auxein Grow does not perform passive, ambient, or always-on location
                  collection.
                </p>

                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">3.3 Photos &amp; Camera</h3>
                <p className="text-charcoal-600 mb-4">
                  When you attach a photo to a task, observation, incident, risk, or asset record,
                  the App accesses your camera or photo library to capture or select that image.
                  Selected images are uploaded to our servers and stored against the relevant
                  record. We do not access photos you have not explicitly attached.
                </p>

                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">3.4 Field Records You Create</h3>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Task statuses, completion times, hours worked, free-text notes</li>
                  <li>Observation details (severity, type, plant counts, descriptions)</li>
                  <li>Incident details (including injury notes if you choose to record them)</li>
                  <li>Risk assessments (likelihood, severity, controls, descriptions)</li>
                  <li>Asset records and stock counts</li>
                </ul>

                <h3 className="text-lg font-medium text-charcoal mt-6 mb-3">3.5 Device &amp; Diagnostic Data</h3>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Device model, operating system version, app version</li>
                  <li>Network connectivity state (used to manage offline queueing)</li>
                  <li>Anonymous crash reports and performance diagnostics via Expo Application Services (EAS)</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  Auxein Grow does not collect advertising identifiers and does not contain
                  third-party advertising SDKs.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">4. Permissions Requested by the App</h2>
                <p className="text-charcoal-600 mb-4">
                  When you install Auxein Grow you may be asked to grant the following permissions.
                  All permissions can be reviewed and revoked at any time in your device settings.
                </p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>
                    <strong>Precise location (foreground):</strong> required to record GPS spots and
                    geo-tag field records.
                  </li>
                  <li>
                    <strong>Precise location (background):</strong> required so GPS task tracking
                    continues uninterrupted when the screen locks or you switch apps. Used only
                    during active task tracking that you have started.
                  </li>
                  <li>
                    <strong>Foreground service (Android):</strong> required to display the
                    persistent notification that keeps GPS tracking running reliably on Android.
                  </li>
                  <li>
                    <strong>Camera:</strong> required to capture evidence photos against records.
                    Optional &mdash; you can decline and select existing images from your photo
                    library instead.
                  </li>
                  <li>
                    <strong>Photo library:</strong> required to attach existing photos to records.
                    Optional.
                  </li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">5. How We Use the Information</h2>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>Authenticate you and scope visible data to your company and assigned properties</li>
                  <li>Record evidence of work performed (GPS tracks, hours, photos) for compliance, audit, and operational reporting back to your employer or contracting company</li>
                  <li>Display tasks, blocks, observations, and assets relevant to your role</li>
                  <li>Synchronise field records between your device and our servers, including reconciling records captured offline once connectivity is restored</li>
                  <li>Generate aggregated, de-identified analytics about app usage so we can improve performance and stability</li>
                  <li>
                    <strong>Aggregated agronomic research &amp; regional insights:</strong>{' '}
                    observations, pest and disease records, phenology data, and other
                    field-captured agronomic information may be aggregated and de-identified
                    (stripped of company, user, and location-identifying detail beyond a regional
                    level) and used by Auxein for research, modelling, and the production of
                    regional insights and industry reports. Aggregated outputs do not identify
                    individual users, properties, or companies.
                  </li>
                  <li>Communicate operationally important notifications (e.g. new task assignments)</li>
                  <li>Comply with legal obligations</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  We do not use any data captured by the App for advertising, profiling, or
                  marketing to third parties. Identifiable field data is used to deliver the
                  service to your company and is not sold. Aggregated, de-identified outputs
                  derived from field data may be published or incorporated into Auxein Insights
                  products as described above.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">6. Who Sees Your Data</h2>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>
                    <strong>Your company:</strong> records you create through the App are visible
                    within your Auxein company account, subject to per-property visibility rules
                    set by your administrators. Managers and admins in your company can see GPS
                    tracks, hours, photos, and other records associated with the work you have
                    completed.
                  </li>
                  <li>
                    <strong>Service providers acting on our behalf:</strong>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Amazon Web Services (cloud hosting and database)</li>
                      <li>Mapbox (map tiles and geocoding; receives your map viewport, not your account identity)</li>
                      <li>Expo Application Services (build pipeline and crash diagnostics)</li>
                      <li>Email delivery providers (transactional emails such as login alerts)</li>
                    </ul>
                  </li>
                  <li>
                    <strong>Legal authorities:</strong> when required by law, court order, or to
                    protect our rights.
                  </li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  We do not sell, rent, or trade your personal information.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">7. Where Your Data Is Stored</h2>
                <p className="text-charcoal-600 mb-4">
                  Data captured by Auxein Grow is transmitted over TLS/HTTPS to our backend hosted
                  on Amazon Web Services and stored in encrypted databases. Data may be processed
                  in countries outside New Zealand, including Australia and the United States. We
                  put contractual safeguards in place that require recipients to protect your
                  information to standards comparable to the New Zealand Privacy Act 2020.
                </p>
                <p className="text-charcoal-600 mb-4">
                  Photos, GPS tracks, and authentication tokens are also cached locally on your
                  device while you are signed in to support offline operation.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">8. Data Retention &amp; Deletion</h2>
                <p className="text-charcoal-600 mb-4">
                  Records you create through the App are retained for as long as your company
                  remains an Auxein customer, plus any period required to comply with legal
                  obligations (typically up to 7 years for compliance, audit, or financial
                  records).
                </p>
                <p className="text-charcoal-600 mb-4">
                  You may request deletion of your personal data at any time by emailing{' '}
                  <a
                    href="mailto:grow@auxein.co.nz"
                    className="text-olive hover:text-olive-600"
                  >
                    grow@auxein.co.nz
                  </a>
                  . Where records are required for compliance, audit, or legal purposes, we will
                  de-identify rather than delete them where possible. Signing out of the App or
                  uninstalling it will clear locally cached data on the device.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">9. Your Rights</h2>
                <p className="text-charcoal-600 mb-4">Under the Privacy Act 2020, you have the right to:</p>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li><strong>Access:</strong> request a copy of personal information we hold about you</li>
                  <li><strong>Correction:</strong> ask us to correct inaccurate or incomplete information</li>
                  <li><strong>Deletion:</strong> request deletion of your personal information (subject to retention requirements)</li>
                  <li><strong>Withdraw consent:</strong> revoke any permission previously granted; you may also revoke OS-level permissions in your device settings at any time</li>
                  <li><strong>Complain:</strong> lodge a complaint with the New Zealand Privacy Commissioner or the Australian Office of the Information Commissioner</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  To exercise any of these rights, contact us at{' '}
                  <a
                    href="mailto:grow@auxein.co.nz"
                    className="text-olive hover:text-olive-600"
                  >
                    grow@auxein.co.nz
                  </a>
                  .
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">10. Security</h2>
                <ul className="list-disc pl-6 text-charcoal-600 space-y-2 mb-4">
                  <li>All data in transit is encrypted using TLS</li>
                  <li>Database storage is encrypted at rest</li>
                  <li>Authentication uses signed JWTs with short-lived sessions</li>
                  <li>Access to production data is restricted to authorised Auxein personnel</li>
                  <li>Regular security review of dependencies and infrastructure</li>
                </ul>
                <p className="text-charcoal-600 mb-4">
                  No method of transmission or storage is completely secure. If you suspect
                  unauthorised access to your account, contact us immediately.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">11. Children</h2>
                <p className="text-charcoal-600 mb-4">
                  Auxein Grow is intended for adult professional use within the agriculture and
                  viticulture industries. The App is not directed at, and we do not knowingly
                  collect personal information from, individuals under 18 years of age. If a
                  parent or guardian believes a child has provided us with personal information,
                  please contact us so we can delete it.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">12. Changes to This Policy</h2>
                <p className="text-charcoal-600 mb-4">
                  We may update this policy as the App evolves. Material changes will be
                  communicated through the App, by email, or by an updated effective date on this
                  page. Continued use of the App after a change takes effect constitutes
                  acceptance of the revised policy.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-charcoal mt-8 mb-4">13. Contact Us</h2>
                <p className="text-charcoal-600 mb-4">
                  For privacy-related inquiries about Auxein Grow:
                </p>
                <div className="bg-sand p-4 rounded-lg mb-4">
                  <p className="text-charcoal font-semibold">Auxein Limited</p>
                  <p className="text-charcoal-600">Email: grow@auxein.co.nz</p>
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
            Last updated: 7 May 2026
          </p>
        </div>
      </Container>
    </div>
  );
}
