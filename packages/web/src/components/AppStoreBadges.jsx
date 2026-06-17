// AppStoreBadges — official App Store + Google Play download badges.
// Shared across the login mobile-only notice, the accept-invitation success
// screen, and the contractor mobile-only landing page so the store links and
// badge art live in one place. Badge images are served from the marketing CDN
// (same assets used in the branded emails); store links point at the live
// Auxein Grow listings. Apple's badge sits a touch shorter than Google's by
// design so their cap-heights line up (the Play badge carries more padding).

export const APP_STORE_URL = 'https://apps.apple.com/us/app/auxein-grow/id6774847550';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=nz.co.auxein.grow';

const APP_STORE_BADGE = 'https://auxein.co.nz/images/badges/app-store-badge.png';
const PLAY_STORE_BADGE = 'https://auxein.co.nz/images/badges/google-play-badge.png';

export default function AppStoreBadges({ className = '' }) {
  return (
    <div
      className={`app-store-badges ${className}`}
      style={{
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <img
          src={APP_STORE_BADGE}
          alt="Download Auxein Grow on the App Store"
          style={{ height: '44px', width: 'auto', display: 'block', border: 0 }}
        />
      </a>
      <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
        <img
          src={PLAY_STORE_BADGE}
          alt="Get Auxein Grow on Google Play"
          style={{ height: '52px', width: 'auto', display: 'block', border: 0 }}
        />
      </a>
    </div>
  );
}
