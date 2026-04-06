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

export default function useDocumentMeta({ title, description, path, image } = {}) {
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
    };
  }, [title, description, path, image]);
}
