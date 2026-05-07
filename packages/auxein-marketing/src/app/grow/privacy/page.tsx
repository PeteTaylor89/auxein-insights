import { Metadata } from 'next';
import GrowPrivacyContent from './PrivacyContent';

export const metadata: Metadata = {
  title: 'Auxein Grow — Mobile App Privacy Policy',
  description:
    'Privacy policy for the Auxein Grow mobile application. How we collect, use, store, and protect data captured by the app, including location, photos, and field records.',
};

export default function GrowPrivacyPage() {
  return <GrowPrivacyContent />;
}
