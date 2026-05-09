// components/SiteFooter.jsx — Auxein Grow web app footer
import Logo from '../assets/logo-mark.png';
import './SiteFooter.css';

function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <img src={Logo} alt="Auxein Grow logo" />
          <span>Auxein Grow</span>
        </div>
        <div className="footer-links">
          <a href="https://auxein.co.nz/about/" target="_blank" rel="noopener noreferrer">About</a>
          <a href="https://auxein.co.nz" target="_blank" rel="noopener noreferrer">Auxein</a>
          <a href="https://auxein.co.nz/contact" target="_blank" rel="noopener noreferrer">Contact</a>
        </div>
        <div className="footer-copyright">
          &copy; {year} Auxein. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
