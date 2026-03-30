'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-sand">
        <div className="max-w-2xl mx-auto text-center px-6">
          <h1 className="text-6xl font-bold text-charcoal mb-4">500</h1>
          <p className="text-xl text-charcoal-600 mb-8">
            Something went wrong.
          </p>
          <button
            onClick={() => reset()}
            className="btn-primary"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
