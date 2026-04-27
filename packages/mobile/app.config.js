// Dynamic Expo config that overlays runtime + build-time env onto app.json.
// app.json holds the static base; this file injects values that differ per
// environment (local Expo Go, EAS dev build, EAS production).
//
// Env sources:
//   - Local dev (expo start / Expo Go): values fall back to app.json defaults.
//   - EAS builds: env vars come from eas.json `env` blocks + EAS Secrets.

module.exports = ({ config }) => {
  const apiUrl = process.env.API_URL || config.extra?.apiUrl;
  const mapboxPublicToken = process.env.MAPBOX_PUBLIC_TOKEN || '';
  const mapboxDownloadToken = process.env.MAPBOX_DOWNLOAD_TOKEN || '';

  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsImpl: 'mapbox',
          RNMapboxMapsDownloadToken: mapboxDownloadToken,
        },
      ],
    ],
    extra: {
      ...(config.extra || {}),
      apiUrl,
      mapboxPublicToken,
    },
  };
};
