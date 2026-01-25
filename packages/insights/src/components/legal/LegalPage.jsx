// src/components/legal/LegalPage.jsx
// Standalone legal page component for footer links
// Shows full-page view of Privacy Policy, Cookie Policy, or Terms of Use

import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PrivacyPolicy, CookiePolicy, TermsOfUse } from './LegalContent';


function LegalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get('section') || 'privacy';

  const sections = [
    { id: 'privacy', label: 'Privacy Policy', component: PrivacyPolicy },
    { id: 'cookies', label: 'Cookie Policy', component: CookiePolicy },
    { id: 'terms', label: 'Terms of Use', component: TermsOfUse },
  ];

  const ActiveComponent = sections.find(s => s.id === activeSection)?.component || PrivacyPolicy;

  const handleSectionChange = (sectionId) => {
    setSearchParams({ section: sectionId });
    window.scrollTo(0, 0);
  };

  return (
    <div className="legal-page">
        <div className="legal-page-header">
        <Link to="/" className="legal-back-link">
            ← Back to Auxein Insights
        </Link>
        </div>
      <div className="legal-page-container">
        {/* Sidebar navigation */}
        <aside className="legal-sidebar">
          <nav>
            <h3>Legal Documents</h3>
            <ul>
              {sections.map(section => (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`legal-nav-link ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => handleSectionChange(section.id)}
                  >
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          
          <div className="legal-sidebar-footer">
            <p>Last updated: 26 January 2026</p>
            <p>
              Questions?{' '}
              <a href="mailto:insights@auxein.co.nz">Contact us</a>
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="legal-main">
          <ActiveComponent />
          
          {/* Back to top */}
          <button 
            type="button"
            className="legal-back-to-top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            ↑ Back to top
          </button>
        </main>
      </div>
    </div>
  );
}

export default LegalPage;