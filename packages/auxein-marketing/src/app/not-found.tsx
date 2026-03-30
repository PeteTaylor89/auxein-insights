import Link from 'next/link';
import { Container } from '@/components/layout/Container';

export default function NotFound() {
  return (
    <section className="pt-32 pb-24 bg-sand min-h-[60vh] flex items-center">
      <Container>
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-6xl font-bold text-charcoal mb-4">404</h1>
          <p className="text-xl text-charcoal-600 mb-8">
            This page could not be found.
          </p>
          <Link href="/" className="btn-primary">
            Back to Home
          </Link>
        </div>
      </Container>
    </section>
  );
}
