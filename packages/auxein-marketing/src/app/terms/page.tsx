import { Metadata } from 'next';
import TermsContent from './TermsContent';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Auxein Limited Terms of Use - Terms and conditions for using our website and services.',
};

export default function TermsPage() {
  return <TermsContent />;
}