// src/pages/ResearchPage.jsx — placeholder for the research programme.
//
// The full listing still exists, unrouted, in ResearchListing.jsx; restoring it
// is a one-line change in App.jsx. `/research/:slug` is untouched and still
// serves published reports — those URLs are RSS <guid>s and must not move.
//
// Deliberately noindex: an empty "coming soon" page competing in search results
// with real article content is worse than no page. It comes out of the sitemap
// too, and goes back in when there is something here.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import useDocumentMeta from '../hooks/useDocumentMeta';
import './ResearchPage.css';

function ResearchPage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useDocumentMeta({
    title: 'Research',
    description: 'Applied climate research for New Zealand growers — coming soon.',
    path: '/research',
    noindex: true,
  });

  return (
    <div className="research-placeholder-page">
      <SiteHeader
        onSignInClick={() => setAuthModalOpen(true)}
      />

      <main className="research-placeholder">
        <BookOpen size={40} className="research-placeholder__icon" aria-hidden="true" />
        <h1>Research</h1>
        <p>
          We are preparing a programme of applied climate research for New Zealand
          growers: method notes on how the surfaces are built, validation against
          the station network, and findings worth citing.
        </p>
        <p className="research-placeholder__meta">Nothing published here yet.</p>

        <div className="research-placeholder__links">
          <Link to="/articles" className="research-placeholder__link">
            Read the articles <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link to="/regions" className="research-placeholder__link research-placeholder__link--ghost">
            Explore the regions
          </Link>
        </div>
      </main>

      <SiteFooter />
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context="research" />
    </div>
  );
}

export default ResearchPage;
