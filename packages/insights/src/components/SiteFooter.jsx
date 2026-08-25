// components/SiteFooter.jsx — shared footer.
//
// This is where the off-site links live. The header previously spent four of
// its six slots sending visitors to auxein.co.nz; the primary navigation of a
// content product should navigate the product. Those links are not deleted,
// they are demoted to where people look for them.
import { Link } from 'react-router-dom';
import Logo from '../assets/App_Logo_September 20251.jpg';
import './SiteFooter.css';
import { useCountryIndustry } from '../contexts/CountryIndustryContext';

function SiteFooter() {
  // Region links carry the current (country, industry) scope. Outside a
  // scoped route this falls back to the visitor's last scope, then to
  // New Zealand wine — so no link has to bounce through the /regions redirect.
  const { path } = useCountryIndustry();

  return (
    <footer className="site-footer">
      <div className="site-footer__content">
        <div className="site-footer__brand">
          <img src={Logo} alt="Auxein" className="site-footer__logo" />
          <p>Auxein Insights</p>
        </div>

        <nav className="site-footer__columns" aria-label="Footer">
          <div className="site-footer__column">
            <h3>Explore</h3>
            <Link to="/map">Vine Atlas</Link>
            <Link to={path()}>Regions</Link>
            <Link to="/pro">Insights Pro</Link>
            <Link to="/articles">Articles</Link>
            <Link to="/research">Research</Link>
          </div>

          <div className="site-footer__column">
            <h3>Auxein</h3>
            <a href="https://auxein.co.nz/about/" target="_blank" rel="noopener noreferrer">About</a>
            <a href="https://auxein.co.nz/grow/" target="_blank" rel="noopener noreferrer">Auxein Grow</a>
            <a href="https://auxein.co.nz/contact/" target="_blank" rel="noopener noreferrer">Contact</a>
            <a href="https://auxein.co.nz" target="_blank" rel="noopener noreferrer">auxein.co.nz</a>
          </div>

          <div className="site-footer__column">
            <h3>This site</h3>
            <Link to="/about">Data sources</Link>
            <Link to="/feedback">Feedback</Link>
            <Link to="/legal?section=privacy">Privacy</Link>
            <Link to="/legal?section=cookies">Cookies</Link>
            <Link to="/legal?section=terms">Terms</Link>
          </div>
        </nav>
      </div>

      <div className="site-footer__copyright">
        © {new Date().getFullYear()} Auxein Limited. All rights reserved.
      </div>
    </footer>
  );
}

export default SiteFooter;
