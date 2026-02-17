import type { Metadata } from 'next';
import StructuredData from '@/components/StructuredData';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import '@/styles/globals.css';
import { CookieConsent } from '@/components/CookieConsent';

export const metadata: Metadata = {
  metadataBase: new URL('https://auxein.co.nz'),
  title: {
    default: 'Auxein | Climate Intelligence for Wine',
    template: '%s | Auxein',
  },
  description:
    'Climate risk intelligence and vineyard management solutions for New Zealand and Australian winegrowers. Over 1 billion data points powering smarter decisions.',
  keywords: [
    'climate risk wine',
    'vineyard climate data',
    'New Zealand wine technology',
    'vineyard management',
    'wine climate intelligence',
    'Waipara climate',
    'Marlborough climate data',
    'Central Otago wine climate',
    'wine industry climate change',
    'viticulture technology New Zealand',
  ],
  authors: [{ name: 'Pete Taylor', url: 'https://auxein.co.nz/about' }],
  creator: 'Auxein Limited',
  publisher: 'Auxein Limited',
  openGraph: {
    type: 'website',
    locale: 'en_NZ',
    url: 'https://auxein.co.nz',
    siteName: 'Auxein',
    title: 'Auxein | Climate Intelligence for Wine',
    description:
      'Climate risk intelligence and vineyard management solutions for New Zealand and Australian winegrowers.',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Auxein - Climate Intelligence for Wine',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Auxein | Climate Intelligence for Wine',
    description:
      'Climate risk intelligence for New Zealand and Australian winegrowers.',
    images: ['/opengraph-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://auxein.co.nz',
  },
  verification: {
    google: 'YOUR_GOOGLE_VERIFICATION_CODE', // from Search Console
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
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <script
            defer
            src="https://cloud.umami.is/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          />
        )}

        <StructuredData
          data={{
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Auxein Limited',
            legalName: 'Auxein Limited',
            url: 'https://auxein.co.nz',
            logo: 'https://auxein.co.nz/images/logo-full.png',
            image: 'https://auxein.co.nz/images/logo-full.png',
            description:
              'Climate risk intelligence and vineyard management solutions for New Zealand and Australian winegrowers.',
            foundingDate: '2024',
            founder: {
              '@type': 'Person',
              name: 'Pete Taylor',
              jobTitle: 'Founder & Director',
              hasCredential: [
                'Master of Wine & Viticulture (Lincoln University)',
                'CMS-Certified Sommelier',
                'BSc',
                'MWRM',
              ],
            },
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Waipara',
              addressRegion: 'Canterbury',
              addressCountry: 'NZ',
            },
            areaServed: [
              { '@type': 'Country', name: 'New Zealand' },
              { '@type': 'Country', name: 'Australia' },
            ],
            sameAs: [
              'https://www.linkedin.com/company/auxein-limited',
              'https://www.youtube.com/@regenwine',
            ],
            contactPoint: {
              '@type': 'ContactPoint',
              contactType: 'sales',
              url: 'https://auxein.co.nz/contact',
            },
          }}
        />

        <StructuredData
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Auxein',
            url: 'https://auxein.co.nz',
            description:
              'Climate intelligence for wine — helping winegrowers make smarter decisions.',
            publisher: {
              '@type': 'Organization',
              name: 'Auxein Limited',
            },
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}