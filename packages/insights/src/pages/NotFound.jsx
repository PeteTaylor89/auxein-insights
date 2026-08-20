// pages/NotFound.jsx — a real 404.
//
// The catch-all used to `<Navigate to="/" replace />`. That hides dead links
// from us and, worse, answers a crawler with a 200-and-content for a URL that
// does not exist — so retired or mistyped paths get indexed as duplicates of
// the home page. With region pages arriving, a URL that does not exist should
// say so.
//
// Note this is still a client-side 404: S3 + CloudFront serves index.html with
// a 200 for unknown paths. Fixing the status code properly needs a CloudFront
// custom error response, which is tracked alongside the sitemap origin change.
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import useDocumentMeta from '../hooks/useDocumentMeta';
import './NotFound.css';

function NotFound() {
  useDocumentMeta({
    title: 'Page not found',
    description: 'That page does not exist on Auxein Insights.',
    noindex: true,
  });

  return (
    <div className="not-found-page">
      <SiteHeader />
      <main className="not-found">
        <Compass size={40} className="not-found__icon" aria-hidden="true" />
        <h1>That page does not exist</h1>
        <p>
          The link may be out of date, or the address slightly off. These are the
          places worth starting from:
        </p>
        <div className="not-found__links">
          <Link to="/" className="not-found__link">Home</Link>
          <Link to="/map" className="not-found__link">Vine Atlas</Link>
          <Link to="/articles" className="not-found__link">Articles</Link>
          <Link to="/research" className="not-found__link">Research</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default NotFound;
