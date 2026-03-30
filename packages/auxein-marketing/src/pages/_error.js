function ErrorPage({ statusCode }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '100px 20px' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold', color: '#2D3436', marginBottom: '1rem' }}>
        {statusCode || 'Error'}
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#636e72', marginBottom: '2rem' }}>
        {statusCode === 404 ? 'This page could not be found.' : 'Something went wrong.'}
      </p>
      <a
        href="/"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#4A6741',
          color: '#fff',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: '600',
        }}
      >
        Back to Home
      </a>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;
