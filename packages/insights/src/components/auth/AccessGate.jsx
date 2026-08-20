// components/auth/AccessGate.jsx — one component for both gates.
//
//   require="registration"  free, but you must have an account
//   require="pro"           paid
//
// Two design rules, both about SEO and both easy to get wrong:
//
// 1. **The gate wraps the DATA, not the PAGE.** Region pages are the strongest
//    organic-search assets the site has. If a crawler (or a visitor arriving
//    from search) hits a full-page login wall, the page is worth nothing —
//    there is no content to rank and no reason to stay. So the page renders its
//    own heading, description and context, and only the numbers sit inside a
//    gate.
//
// 2. **Say what is behind it.** A gate that lists what you get converts; one
//    that says "sign in to continue" is a toll booth. The `preview` prop exists
//    for that — pass the actual feature list.
import { Lock, Sparkles } from 'lucide-react';
import './AccessGate.css';

const COPY = {
  registration: {
    icon: <Lock size={26} aria-hidden="true" />,
    title: 'Create a free account to see this',
    body: 'Regional climate data is free — we just need to know who is using it.',
    cta: 'Sign in or register free',
    tone: 'free',
  },
  pro: {
    icon: <Sparkles size={26} aria-hidden="true" />,
    title: 'This is a Pro feature',
    // Describes what SHIPS. The assistant is a later phase and naming it here
    // sells something nobody can be given today.
    body: 'Pro adds your own site: one point, its whole record back to 1986, and how it sits against the vineyards around it.',
    cta: 'See Pro',
    tone: 'pro',
  },
};

/**
 * @param {'registration'|'pro'} require
 * @param {boolean} allowed      caller decides; this component only renders
 * @param {Function} onAction    sign-in modal, or upgrade flow
 * @param {string[]} preview     what sits behind the gate
 * @param {React.ReactNode} children  rendered when `allowed`
 */
function AccessGate({ require = 'registration', allowed, onAction, preview = [], title, cta, children }) {
  if (allowed) return children;

  const copy = COPY[require] || COPY.registration;

  return (
    <div className={`access-gate access-gate--${copy.tone}`} role="note">
      <div className="access-gate__icon">{copy.icon}</div>
      <h3 className="access-gate__title">{title || copy.title}</h3>
      <p className="access-gate__body">{copy.body}</p>

      {preview.length > 0 && (
        <ul className="access-gate__preview">
          {preview.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}

      {/* The caller owns the wording, because the right next step differs by
          who is looking: an anonymous visitor needs to sign in, and a
          signed-in free user needs a way to actually buy the thing. */}
      <button type="button" className="access-gate__cta" onClick={onAction}>
        {cta || copy.cta}
      </button>
    </div>
  );
}

export default AccessGate;
