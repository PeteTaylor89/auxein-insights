import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Solutions',
  description:
    'Regional climate insights, vineyard-specific climate projections, risk management, and traceability solutions for winegrowers.',
  alternates: {
    canonical: 'https://auxein.co.nz/solutions',
  },
};

export default function SolutionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}