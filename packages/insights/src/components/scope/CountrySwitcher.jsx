// components/scope/CountrySwitcher.jsx — pick which country the site is showing.
//
// Phase 2 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// IT RENDERS NOTHING WHILE ONLY ONE COUNTRY HAS DATA.
// A switcher offering a single choice is not a control, it is an advertisement
// for an empty page — and Australia is seeded inactive precisely so the ingest
// work has somewhere to attach, not so it can be browsed. The moment a second
// country goes `is_active`, this appears on its own with no code change.
//
// Switching navigates rather than setting state, because the scope lives in the
// URL. It keeps the current sub-path where that makes sense: moving country on
// `/nz/wine` lands on `/au/wine`. It does NOT keep a region slug — Marlborough
// is not a place in Australia, and silently 404ing is worse than landing on the
// destination country's region index.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useCountryIndustry, scopePath } from '../../contexts/CountryIndustryContext';
import './CountrySwitcher.css';

function CountrySwitcher({ className = '' }) {
  const { countries, activeCountries, country, industry, countryName } =
    useCountryIndustry();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // One country with data means no choice to offer. Note this checks ACTIVE
  // countries, not all of them — Australia existing in the registry is not a
  // reason to show a control.
  if (activeCountries.length < 2) return null;

  const choose = (iso2) => {
    setOpen(false);
    const next = iso2.toLowerCase();
    if (next === country) return;
    // Drop the region slug deliberately — see the header comment.
    navigate(scopePath(next, industry));
  };

  return (
    <div className={`country-switcher ${className}`} ref={ref}>
      <button
        type="button"
        className="country-switcher__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Globe size={16} aria-hidden="true" />
        <span className="country-switcher__label">{countryName}</span>
        <ChevronDown size={16} aria-hidden="true"
                     className={open ? 'country-switcher__chev--open' : ''} />
      </button>

      {open && (
        <ul className="country-switcher__menu" role="listbox"
            aria-label="Choose a country">
          {countries.map((c) => {
            const iso = c.iso2.toLowerCase();
            const current = iso === country;
            return (
              <li key={c.iso2} role="option" aria-selected={current}>
                <button
                  type="button"
                  className={`country-switcher__item${
                    current ? ' country-switcher__item--current' : ''}${
                    c.is_active ? '' : ' country-switcher__item--pending'}`}
                  onClick={() => choose(c.iso2)}
                  // An inactive country is still navigable: the destination is
                  // a real "coming soon" page, and blocking the click would
                  // make the entry look broken rather than pending.
                >
                  <span>{c.name}</span>
                  {current && <Check size={15} aria-hidden="true" />}
                  {!c.is_active && (
                    <span className="country-switcher__tag">Coming soon</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default CountrySwitcher;
