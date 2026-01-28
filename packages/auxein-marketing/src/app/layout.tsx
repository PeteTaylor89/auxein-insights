import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Auxein | Climate Intelligence for Viticulture',
    template: '%s | Auxein',
  },
  description:
    'Precision climate intelligence and vineyard management solutions for the New Zealand wine industry. Data-driven insights for sustainable viticulture.',
  keywords: [
    'vineyard management',
    'climate intelligence',
    'viticulture',
    'New Zealand wine',
    'precision agriculture',
    'sustainability',
    'regenerative farming',
  ],
  authors: [{ name: 'Pete Taylor', url: 'https://auxein.co.nz' }],
  creator: 'Auxein Limited',
  openGraph: {
    type: 'website',
    locale: 'en_NZ',
    url: 'https://auxein.co.nz',
    siteName: 'Auxein',
    title: 'Auxein | Climate Intelligence for Viticulture',
    description:
      'Precision climate intelligence and vineyard management solutions for the New Zealand wine industry.',
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Auxein - Climate Intelligence for Viticulture',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Auxein | Climate Intelligence for Viticulture',
    description:
      'Precision climate intelligence and vineyard management solutions for the New Zealand wine industry.',
    images: ['/images/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        {/* Umami Analytics - replace with your actual ID */}
        {process.env.NEXT_PUBLIC_UMAMI_ID && (
          <script
            defer
            src="https://analytics.auxein.co.nz/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_ID}
          />
        )}
      </head>
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}