import { useEffect } from 'react';

const DEFAULTS = {
  title: 'Auxein Regional Insights | Free Climate Intelligence for NZ Wine',
  description: 'Free regional climate intelligence for New Zealand wine regions. Historical trends, seasonal comparisons, and climate projections built on over 1 billion data points.',
  url: 'https://insights.auxein.co.nz',
  image: 'https://insights.auxein.co.nz/og-image.jpg',
};

function setMeta(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`) ||
           document.querySelector(`meta[name="${property}"]`);
  if (el) {
    el.setAttribute('content', content);
  } else {
    el = document.createElement('meta');
    el.setAttribute(property.startsWith('og:') || property.startsWith('twitter:') ? 'property' : 'name', property);
    el.setAttribute('content', content);
    document.head.appendChild(el);
  }
}

// index.html ships a single static <link rel="canonical"> pointing at the site
// root, and nothing used to update it. Every article and research page was
// therefore telling search engines that the homepage was its canonical URL —
// an instruction to fold them all into one page rather than index them
// individually. Whatever else is true of the SPA's client-side SEO, this one
// was actively working against us.
function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setRobots(noindex) {
  let el = document.querySelector('meta[name="robots"]');
  if (!noindex) {
    // Must be removed, not left behind. A stale noindex surviving a client-side
    // navigation off a 404 would quietly de-index whatever page came next.
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  el.setAttribute('content', 'noindex, follow');
}

export default function useDocumentMeta({ title, description, path, image, noindex = false } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | Auxein Regional Insights` : DEFAULTS.title;
    const desc = description || DEFAULTS.description;
    const url = path ? `${DEFAULTS.url}${path}` : DEFAULTS.url;
    const img = image || DEFAULTS.image;

    document.title = fullTitle;
    setMeta('description', desc);
    setMeta('og:title', fullTitle);
    setMeta('og:description', desc);
    setMeta('og:url', url);
    setMeta('og:image', img);
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', desc);
    setMeta('twitter:image', img);
    setCanonical(url);
    setRobots(noindex);

    return () => {
      document.title = DEFAULTS.title;
      setMeta('description', DEFAULTS.description);
      setMeta('og:title', DEFAULTS.title);
      setMeta('og:description', DEFAULTS.description);
      setMeta('og:url', DEFAULTS.url);
      setMeta('og:image', DEFAULTS.image);
      setMeta('twitter:title', DEFAULTS.title);
      setMeta('twitter:description', DEFAULTS.description);
      setMeta('twitter:image', DEFAULTS.image);
      setCanonical(DEFAULTS.url);
      setRobots(false);
    };
  }, [title, description, path, image, noindex]);
}
