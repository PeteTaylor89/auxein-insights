import { useEffect } from 'react';

// ONE NAME. The product had three — "Auxein Regional Intelligence" in the
// emails, "Auxein Regional Insights" in this file and in index.html's og tags,
// and "Auxein Insights" everywhere a human had written copy recently. A visitor
// who signs up, gets an email and then looks at their browser tab was being
// shown three different products. It is Auxein Insights.
const BRAND = 'Auxein Insights';

const DEFAULTS = {
  title: `${BRAND} - Climate intelligence for New Zealand`,
  description: 'Free climate intelligence for New Zealand growing regions. Historical trends, seasonal comparisons, and climate projections built on over 1 billion data points.',
  url: 'https://insights.auxein.co.nz',
  image: 'https://insights.auxein.co.nz/og-image.jpg',
};

/**
 * `Auxein Insights - Page`. Brand first, one separator, a plain hyphen.
 *
 * The separator is normalised rather than trusted. Page titles come from three
 * places — this repo's own strings, article `seo_title`s typed into the admin
 * editor, and research report titles — and the last two are written by people
 * who use em dashes. A tab strip that reads "Auxein Insights - Pro" beside
 * "Auxein Insights — A warming decade" looks like two different sites, so the
 * dashes are folded here, in the one place every title passes through, rather
 * than by asking every author to remember.
 *
 * A page that already leads with the brand is left alone, so nothing can come
 * out as "Auxein Insights - Auxein Insights - ...".
 */
function composeTitle(page) {
  if (!page) return DEFAULTS.title;
  const clean = String(page)
    .replace(/[‒–—―]/g, '-')  // figure, en, em, horizontal bar
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return DEFAULTS.title;
  if (clean.toLowerCase().startsWith(BRAND.toLowerCase())) return clean;
  return `${BRAND} - ${clean}`;
}

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
    const fullTitle = composeTitle(title);
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
