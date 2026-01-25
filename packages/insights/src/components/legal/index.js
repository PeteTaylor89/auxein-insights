// src/components/legal/index.js
// Export all legal components for easy importing

export { 
  PrivacyPolicy, 
  CookiePolicy, 
  TermsOfUse, 
  LegalTabs 
} from './LegalContent';

export { default as LegalModal } from './LegalModal';
export { default as LegalPage } from './LegalPage';

// CSS should be imported in your main App.jsx or index.js:
// import './components/legal/legal.css';