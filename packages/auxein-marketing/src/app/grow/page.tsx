import { Metadata } from 'next';
import GrowContent from './GrowContent';

export const metadata: Metadata = {
  title: 'Auxein Grow — Vineyard Management Software',
  description:
    'Plan the work, do it in the field, prove it happened. Tasks row by row, observations spot by spot, and an audit trail that writes itself — on forty years of block-level climate data.',
  keywords: [
    'vineyard management software',
    'vineyard software New Zealand',
    'spray diary app',
    'SWNZ compliance software',
    'vineyard audit trail',
    'disease pressure model vineyard',
    'vineyard task management app',
    'viticulture software',
  ],
  alternates: {
    canonical: 'https://auxein.co.nz/grow',
  },
  openGraph: {
    type: 'website',
    url: 'https://auxein.co.nz/grow',
    title: 'Auxein Grow — Vineyard Management Software',
    description:
      'Tasks row by row, observations spot by spot, and an audit trail that writes itself — on forty years of block-level climate data.',
    images: [
      {
        url: '/images/home-page.JPG',
        width: 1200,
        height: 630,
        alt: 'Auxein Grow vineyard management dashboard',
      },
    ],
  },
};

export default function GrowPage() {
  return <GrowContent />;
}
