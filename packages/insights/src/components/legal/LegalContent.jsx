// src/components/legal/LegalContent.jsx
// Legal content components for Privacy Policy, Cookie Policy, and Terms of Use
// Used by both LegalModal (signup) and LegalPage (standalone)

import { useState } from 'react';

// ============================================================================
// PRIVACY POLICY
// ============================================================================
export function PrivacyPolicy() {
  return (
    <div className="legal-content">
      <h1>Privacy Policy</h1>
      <p className="legal-effective">Effective Date: 26 January 2026</p>
      
      <section>
        <h2>1. Introduction</h2>
        <p>
          Auxein Limited (NZBN: 9429041651063, "Auxein", "we", "us", "our") operates the 
          Auxein Insights platform. We are committed to protecting your privacy and 
          handling your personal information in accordance with the New Zealand Privacy 
          Act 2020.
        </p>
        <p>
          This policy explains how we collect, use, store, and protect your personal 
          information when you use our services.
        </p>
      </section>

      <section>
        <h2>2. Information We Collect</h2>
        
        <h3>2.1 Information You Provide</h3>
        <p>When you create an account or use our services, we may collect:</p>
        <ul>
          <li>Contact information: name, email address</li>
          <li>Professional information: company name, job title, user type (e.g., wine company owner, viticulturist, consultant)</li>
          <li>Geographic information: region of interest for climate data services</li>
          <li>Communication preferences: your choices regarding newsletters, marketing communications, and research participation</li>
        </ul>

        <h3>2.2 Information Collected Automatically</h3>
        <p>When you use our platform, we automatically collect:</p>
        <ul>
          <li>Usage data: login timestamps, last active time, features accessed</li>
          <li>Technical data: browser type, device information, IP address (for security purposes)</li>
          <li>Map interaction data: regions viewed, zoom levels (to improve service delivery)</li>
        </ul>

        <h3>2.3 Information from Third Parties</h3>
        <p>
          We may receive publicly available climate and geographic data from government 
          agencies and research institutions to provide our climate intelligence services.
        </p>
      </section>

      <section>
        <h2>3. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide and maintain the Auxein Insights platform</li>
          <li>Authenticate your identity and secure your account</li>
          <li>Personalise your experience based on your role and region of interest</li>
          <li>Send service-related communications (e.g., verification emails, security alerts)</li>
          <li>Send marketing communications (only with your explicit consent)</li>
          <li>Improve our services through aggregated, anonymised analytics</li>
          <li>Comply with legal obligations</li>
        </ul>
      </section>

      <section>
        <h2>4. Legal Basis for Processing</h2>
        <p>We process your personal information based on:</p>
        <ul>
          <li><strong>Contract performance:</strong> To provide you with our services</li>
          <li><strong>Consent:</strong> For marketing communications and optional data collection</li>
          <li><strong>Legitimate interests:</strong> For security, fraud prevention, and service improvement</li>
          <li><strong>Legal obligations:</strong> To comply with applicable laws</li>
        </ul>
      </section>

      <section>
        <h2>5. Information Sharing</h2>
        <p>We do not sell your personal information. We may share your information with:</p>
        <ul>
          <li><strong>Service providers:</strong> Cloud hosting (Amazon Web Services), email delivery services, and mapping services (Mapbox) who process data on our behalf under strict confidentiality agreements</li>
          <li><strong>Professional advisors:</strong> Accountants, lawyers, and auditors as necessary</li>
          <li><strong>Legal authorities:</strong> When required by law or to protect our rights</li>
          <li><strong>Business transfers:</strong> In connection with any merger, sale, or acquisition</li>
        </ul>
      </section>

      <section>
        <h2>6. International Data Transfers</h2>
        <p>
          Your data may be processed in countries outside New Zealand, including Australia 
          and the United States (for cloud hosting). We ensure appropriate safeguards are 
          in place, including contracts that require recipients to protect your information 
          to standards comparable to New Zealand law.
        </p>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <p>We retain your personal information for as long as:</p>
        <ul>
          <li>Your account remains active</li>
          <li>Necessary to provide you with our services</li>
          <li>Required to comply with legal obligations (typically 7 years for financial records)</li>
          <li>Needed to resolve disputes and enforce agreements</li>
        </ul>
        <p>
          You may request deletion of your account and personal data at any time, subject 
          to legal retention requirements.
        </p>
      </section>

      <section>
        <h2>8. Your Rights</h2>
        <p>Under the Privacy Act 2020, you have the right to:</p>
        <ul>
          <li><strong>Access:</strong> Request a copy of personal information we hold about you</li>
          <li><strong>Correction:</strong> Ask us to correct inaccurate or incomplete information</li>
          <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal requirements)</li>
          <li><strong>Withdraw consent:</strong> Opt out of marketing communications at any time</li>
          <li><strong>Complain:</strong> Lodge a complaint with the NZ Privacy Commissioner or the Australian Information Commissioner</li>
        </ul>
        <p>To exercise these rights, contact us at insights@auxein.co.nz.</p>
      </section>

      <section>
        <h2>9. Data Security</h2>
        <p>We implement industry-standard security measures including:</p>
        <ul>
          <li>Encryption of data in transit (TLS/SSL) and at rest</li>
          <li>Secure password hashing (bcrypt)</li>
          <li>Regular security assessments</li>
          <li>Access controls and authentication requirements</li>
          <li>Secure cloud infrastructure with AWS</li>
        </ul>
        <p>
          While we take reasonable steps to protect your information, no internet transmission 
          is completely secure. Please notify us immediately if you suspect unauthorised access 
          to your account.
        </p>
      </section>

      <section>
        <h2>10. Children's Privacy</h2>
        <p>
          Our services are intended for business use and are not directed at individuals 
          under 18 years of age. We do not knowingly collect personal information from children.
        </p>
      </section>

      <section>
        <h2>11. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material 
          changes by email or through the platform. Continued use of our services after changes 
          take effect constitutes acceptance of the revised policy.
        </p>
      </section>

      <section>
        <h2>12. Contact Us</h2>
        <p>For privacy-related inquiries or to exercise your rights:</p>
        <address>
          <strong>Auxein Limited</strong><br />
          Email: insights@auxein.co.nz<br />
          New Zealand
        </address>
        <p>
          <strong>NZ Privacy Commissioner:</strong>{' '}
          <a href="https://www.privacy.org.nz" target="_blank" rel="noopener noreferrer">
            www.privacy.org.nz
          </a>
        </p>

      </section>
    </div>
  );
}

// ============================================================================
// COOKIE POLICY
// ============================================================================
export function CookiePolicy() {
  return (
    <div className="legal-content">
      <h1>Cookie Policy</h1>
      <p className="legal-effective">Effective Date: 26 January 2026</p>
      
      <section>
        <h2>1. What Are Cookies?</h2>
        <p>
          Cookies are small text files stored on your device when you visit websites. 
          They help websites function properly, remember your preferences, and provide 
          information to site owners.
        </p>
      </section>

      <section>
        <h2>2. How We Use Cookies</h2>
        <p>
          Auxein Insights uses minimal cookies and similar technologies. We prioritise 
          privacy-respecting approaches to data collection.
        </p>

        <h3>2.1 Essential Cookies (Required)</h3>
        <p>These cookies are necessary for the platform to function:</p>
        <table className="cookie-table">
          <thead>
            <tr>
              <th>Purpose</th>
              <th>Description</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Authentication</td>
              <td>
                We use JWT (JSON Web Tokens) stored in your browser's local storage 
                to keep you logged in. This is not technically a cookie but functions 
                similarly for authentication purposes.
              </td>
              <td>7 days</td>
            </tr>
          </tbody>
        </table>

        <h3>2.2 Functional Cookies</h3>
        <p>These cookies enable enhanced functionality:</p>
        <table className="cookie-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Mapbox</td>
              <td>Map Services</td>
              <td>
                Mapbox may set cookies to deliver map tiles, remember map preferences, 
                and optimise map loading performance. See{' '}
                <a href="https://www.mapbox.com/legal/privacy" target="_blank" rel="noopener noreferrer">
                  Mapbox Privacy Policy
                </a>.
              </td>
            </tr>
          </tbody>
        </table>

        <h3>2.3 Analytics</h3>
        <p>
          We use Umami, a privacy-focused analytics platform that does not use cookies 
          or collect personal data. Umami provides us with aggregated, anonymised 
          information about how our platform is used without tracking individual users.
        </p>
      </section>

      <section>
        <h2>3. What We Don't Use</h2>
        <p>We do not use:</p>
        <ul>
          <li>Third-party advertising cookies</li>
          <li>Social media tracking pixels</li>
          <li>Cross-site tracking technologies</li>
          <li>Personal data in analytics</li>
        </ul>
      </section>

      <section>
        <h2>4. Managing Cookies</h2>
        <p>
          You can control cookies through your browser settings. Most browsers allow you to:
        </p>
        <ul>
          <li>View what cookies are stored</li>
          <li>Delete individual or all cookies</li>
          <li>Block cookies from specific or all sites</li>
          <li>Set preferences for different types of cookies</li>
        </ul>
        <p>
          Note: Blocking essential cookies or clearing local storage will log you out 
          of the platform and may affect functionality.
        </p>
        <p>Browser cookie settings:</p>
        <ul>
          <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Chrome</a></li>
          <li><a href="https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox" target="_blank" rel="noopener noreferrer">Firefox</a></li>
          <li><a href="https://support.apple.com/en-nz/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
          <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
        </ul>
      </section>

      <section>
        <h2>5. Local Storage</h2>
        <p>
          In addition to cookies, we use browser local storage to store your authentication 
          token. Local storage data persists until explicitly cleared. You can clear local 
          storage through your browser's developer tools or by logging out of the platform.
        </p>
      </section>

      <section>
        <h2>6. Changes to This Policy</h2>
        <p>
          We may update this Cookie Policy when we change our practices or for legal, 
          operational, or regulatory reasons. Updates will be posted on this page with 
          a revised effective date.
        </p>
      </section>

      <section>
        <h2>7. Contact Us</h2>
        <p>
          If you have questions about our use of cookies, please contact us at{' '}
          <a href="mailto:insights@auxein.co.nz">privacy@auxein.co.nz</a>.
        </p>
      </section>
    </div>
  );
}

// ============================================================================
// TERMS OF USE
// ============================================================================
export function TermsOfUse() {
  return (
    <div className="legal-content">
      <h1>Terms of Use</h1>
      <p className="legal-effective">Effective Date: 26 January 2026</p>
      
      <section>
        <h2>1. Agreement to Terms</h2>
        <p>
          These Terms of Use ("Terms") constitute a legally binding agreement between you 
          and Auxein Limited (NZBN: 9429041651063, "Auxein", "we", "us", "our") governing 
          your access to and use of the Auxein Insights platform, including any associated 
          websites, applications, and services (collectively, the "Platform").
        </p>
        <p>
          By creating an account or using the Platform, you agree to be bound by these Terms. 
          If you do not agree to these Terms, you may not access or use the Platform.
        </p>
      </section>

      <section>
        <h2>2. Eligibility</h2>
        <p>To use the Platform, you must:</p>
        <ul>
          <li>Be at least 18 years of age</li>
          <li>Have the legal capacity to enter into a binding agreement</li>
          <li>Not be prohibited from using the Platform under applicable laws</li>
          <li>Provide accurate and complete registration information</li>
        </ul>
        <p>
          If you are using the Platform on behalf of an organisation, you represent that 
          you have authority to bind that organisation to these Terms.
        </p>
      </section>

      <section>
        <h2>3. Account Registration and Security</h2>
        
        <h3>3.1 Account Creation</h3>
        <p>
          You must register for an account to access certain features of the Platform. 
          You agree to provide accurate, current, and complete information during 
          registration and to keep your account information updated.
        </p>

        <h3>3.2 Account Security</h3>
        <p>
          You are responsible for maintaining the confidentiality of your login credentials 
          and for all activities that occur under your account. You must immediately notify 
          us at insights@auxein.co.nz if you suspect unauthorised access to your account.
        </p>

        <h3>3.3 Email Verification</h3>
        <p>
          You must verify your email address before accessing the Platform. We may send 
          service-related communications to your registered email address.
        </p>
      </section>

      <section>
        <h2>4. Platform Services</h2>
        
        <h3>4.1 Climate Intelligence Services</h3>
        <p>
          The Platform provides climate data, analytics, and insights for the wine industry. 
          While we strive for accuracy, climate data is subject to inherent uncertainties 
          and should be used as one factor among many in decision-making.
        </p>

        <h3>4.2 Data Sources</h3>
        <p>
          Our climate data is sourced from government agencies, research institutions, and 
          other reputable providers. We do not guarantee the accuracy, completeness, or 
          timeliness of third-party data.
        </p>

        <h3>4.3 Service Availability</h3>
        <p>
          We aim to provide continuous access to the Platform but do not guarantee 
          uninterrupted availability. We may suspend or modify the Platform for maintenance, 
          updates, or other operational reasons.
        </p>
      </section>

      <section>
        <h2>5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Platform for any unlawful purpose or in violation of these Terms</li>
          <li>Share your account credentials with third parties</li>
          <li>Attempt to gain unauthorised access to any part of the Platform</li>
          <li>Interfere with or disrupt the Platform's operation or security</li>
          <li>Use automated tools to scrape, crawl, or extract data from the Platform</li>
          <li>Reverse engineer, decompile, or disassemble any part of the Platform</li>
          <li>Resell, redistribute, or commercially exploit Platform data without authorisation</li>
          <li>Upload malicious code, viruses, or harmful content</li>
          <li>Impersonate any person or misrepresent your affiliation with any entity</li>
          <li>Use the Platform in any way that could damage our reputation or goodwill</li>
        </ul>
      </section>

      <section>
        <h2>6. Intellectual Property</h2>
        
        <h3>6.1 Our Intellectual Property</h3>
        <p>
          The Platform, including its design, features, content, algorithms, and underlying 
          technology, is owned by Auxein and protected by copyright, trademark, and other 
          intellectual property laws. You may not copy, modify, distribute, or create 
          derivative works without our written permission.
        </p>

        <h3>6.2 Your Data</h3>
        <p>
          You retain ownership of any data you upload to the Platform ("User Data"). 
          By uploading User Data, you grant us a non-exclusive, worldwide licence to 
          use, store, and process your data solely to provide and improve the Platform.
        </p>

        <h3>6.3 Feedback</h3>
        <p>
          If you provide feedback, suggestions, or ideas about the Platform, you grant 
          us the right to use this feedback without restriction or compensation.
        </p>
      </section>

      <section>
        <h2>7. Subscriptions and Payment</h2>
        
        <h3>7.1 Free and Paid Services</h3>
        <p>
          The Regional Intelligence Platform features are available for free; others require a paid subscription. 
          Current pricing and features are displayed on the Platform.
        </p>

        <h3>7.2 Payment Terms</h3>
        <p>
          If you subscribe to paid services, you agree to pay all applicable fees. 
          Subscriptions automatically renew unless cancelled before the renewal date. 
          All fees are non-refundable except as required by law or as specified in 
          these Terms.
        </p>

        <h3>7.3 Price Changes</h3>
        <p>
          We may change subscription prices with at least 30 days' notice. Price changes 
          take effect at your next renewal period.
        </p>
      </section>

      <section>
        <h2>8. Disclaimer of Warranties</h2>
        <p>
          THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY 
          KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO 
          WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND 
          NON-INFRINGEMENT.
        </p>
        <p>
          We do not warrant that the Platform will be uninterrupted, error-free, or 
          secure, or that any defects will be corrected.
        </p>
        <p>
          CLIMATE DATA AND FORECASTS ARE PROVIDED FOR INFORMATIONAL PURPOSES ONLY AND 
          SHOULD NOT BE RELIED UPON AS THE SOLE BASIS FOR ANY AGRICULTURAL, BUSINESS, 
          OR FINANCIAL DECISION. ACTUAL CONDITIONS MAY VARY SIGNIFICANTLY FROM PREDICTIONS.
        </p>
      </section>

      <section>
        <h2>9. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, AUXEIN AND ITS DIRECTORS, EMPLOYEES, 
          AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF 
          PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE PLATFORM.
        </p>
        <p>
          Nothing in these Terms excludes or limits liability that cannot be excluded 
          or limited under applicable law, including the Consumer Guarantees Act 1993 
          (NZ) or Australian Consumer Law where applicable.
        </p>
      </section>

      <section>
        <h2>10. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Auxein and its officers, directors, 
          employees, and agents from any claims, damages, losses, or expenses (including 
          legal fees) arising from your use of the Platform, violation of these Terms, 
          or infringement of any third-party rights.
        </p>
      </section>

      <section>
        <h2>11. Termination</h2>
        
        <h3>11.1 Termination by You</h3>
        <p>
          You may terminate your account at any time by contacting us at insights@auxein.co.nz 
          or through the Platform settings. Upon termination, you will lose access to your 
          account and User Data.
        </p>

        <h3>11.2 Termination by Us</h3>
        <p>
          We may suspend or terminate your account immediately if you breach these Terms, 
          engage in fraudulent activity, or if required by law. We may also terminate 
          accounts that have been inactive for an extended period with reasonable notice.
        </p>

        <h3>11.3 Effect of Termination</h3>
        <p>
          Upon termination, your right to use the Platform ceases immediately. Sections 
          6 (Intellectual Property), 8 (Disclaimer), 9 (Limitation of Liability), 
          10 (Indemnification), and 14 (Governing Law) survive termination.
        </p>
      </section>

      <section>
        <h2>12. Changes to Terms</h2>
        <p>
          We may modify these Terms at any time by posting revised Terms on the Platform. 
          Material changes will be communicated via email or Platform notification at least 
          30 days before taking effect. Your continued use of the Platform after changes 
          become effective constitutes acceptance of the revised Terms.
        </p>
      </section>

      <section>
        <h2>13. General Provisions</h2>
        <ul>
          <li>
            <strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy 
            and Cookie Policy, constitute the entire agreement between you and Auxein.
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

      <section>
        <h2>14. Governing Law and Disputes</h2>
        <p>
          These Terms are governed by the laws of New Zealand. Any disputes arising from 
          these Terms shall be resolved exclusively in the courts of New Zealand, unless 
          you are an Australian consumer entitled to bring proceedings in Australia.
        </p>
        <p>
          Before initiating any formal proceedings, you agree to attempt to resolve 
          disputes informally by contacting us at legal@auxein.co.nz.
        </p>
      </section>

      <section>
        <h2>15. Contact Information</h2>
        <p>For questions about these Terms, contact us at:</p>
        <address>
          <strong>Auxein Limited</strong><br />
          Email: insights@auxein.co.nz<br />
          New Zealand
        </address>
      </section>
    </div>
  );
}

// ============================================================================
// COMBINED VIEW (for signup modal)
// ============================================================================
export function LegalTabs({ defaultTab = 'privacy' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabs = [
    { id: 'privacy', label: 'Privacy Policy', component: PrivacyPolicy },
    { id: 'cookies', label: 'Cookie Policy', component: CookiePolicy },
    { id: 'terms', label: 'Terms of Use', component: TermsOfUse },
  ];

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || PrivacyPolicy;

  return (
    <div className="legal-tabs">
      <div className="legal-tabs-header">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`legal-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="legal-tabs-content">
        <ActiveComponent />
      </div>
    </div>
  );
}

export default {
  PrivacyPolicy,
  CookiePolicy,
  TermsOfUse,
  LegalTabs,
};