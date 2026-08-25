// Dynamic Expo config that overlays runtime + build-time env onto app.json.
// app.json holds the static base; this file injects values that differ per
// environment (local Metro, EAS dev build, EAS production).
//
// Env sources:
//   - Local dev (expo start): APP_VARIANT from the npm script; API_URL etc.
//     fall back to app.json defaults.
//   - EAS builds: env vars come from eas.json `env` blocks + EAS Secrets.

// --- app variants ----------------------------------------------------------
// Development and production previously shared ONE app identity
// (nz.co.auxein.grow), so installing the production build silently REPLACED the
// dev client on the device — the app opened but could never load a Metro
// bundle. Each variant now gets its own package/bundle id and its own URI
// scheme so they coexist on one phone and deep links land in the right app.
//
// The scheme must differ per variant too: two installed apps claiming
// `auxeingrow://` is the same ambiguity in a different place.
//
// PRODUCTION IDENTITY IS LOAD-BEARING. `nz.co.auxein.grow` is the Play/App
// Store listing. Changing it registers a brand-new app and orphans the existing
// one, along with its reviews and installs. Only add suffixes to non-production
// variants.
const VARIANTS = {
  development: {
    idSuffix: '.dev',
    scheme: 'auxeingrowdev',
    nameSuffix: ' (Dev)',
  },
  preview: {
    idSuffix: '.preview',
    scheme: 'auxeingrowpreview',
    nameSuffix: ' (Preview)',
  },
  production: {
    idSuffix: '',
    scheme: 'auxeingrow',
    nameSuffix: '',
  },
};

// Resolution order:
//   1. APP_VARIANT        — explicit, set by eas.json env and the dev:mobile script
//   2. EAS_BUILD_PROFILE  — set automatically by EAS Build, so a build is never
//                           mis-identified if someone forgets the env block
//   3. 'development'      — no EAS build and no override means local Metro, which
//                           must match the installed dev client, NOT production
//
// SUBMIT TRAP: EAS_BUILD_PROFILE is set by EAS Build on the SERVER only. Local
// commands that resolve this config — `eas submit` above all — see neither var
// and fall through to 'development', so they ask the stores about
// nz.co.auxein.grow.dev, which is not a listing on either. The build artifact
// is correct; only the lookup is wrong. Always prefix:
//   $env:APP_VARIANT='production'   (PowerShell)
//   APP_VARIANT=production           (bash)
// before `eas submit`, and submit by --id, not --latest (--latest ignores the
// profile and will happily push a development build).
const VARIANT =
  process.env.APP_VARIANT || process.env.EAS_BUILD_PROFILE || 'development';

const variant = VARIANTS[VARIANT];
if (!variant) {
  // Deliberately fatal. Falling back to production here would hand a dev or
  // preview build the store identity and evict the real app off the device.
  throw new Error(
    `app.config.js: unknown app variant "${VARIANT}". ` +
      `Expected one of: ${Object.keys(VARIANTS).join(', ')}. ` +
      `Add it to VARIANTS (with its own id suffix and scheme) before building.`,
  );
}

// --- .env ------------------------------------------------------------------
// `.env` documents itself as "loaded by Expo at config-resolve time", and this
// file's own header said API_URL falls back to app.json — both were true at
// once, which is the contradiction. Expo only auto-exposes `EXPO_PUBLIC_*`
// names, so a plain `API_URL=` in .env never reached `process.env` and the
// app.json default (production) silently won. Editing .env to point at a local
// backend appeared to do nothing, and every endpoint newer than the last deploy
// returned 404 while Metro and the backend were restarted in vain.
//
// Parsed here rather than via dotenv so no dependency is added: touching
// mobile package.json changes the native fingerprint and would force a dev
// client rebuild for what is a config-time convenience.
//
// Real environment variables still win, so EAS builds are unaffected.
function loadDotEnv() {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(String.fromCharCode(10))) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

module.exports = ({ config }) => {
  const apiUrl = process.env.API_URL || config.extra?.apiUrl;
  // Loud, because pointing at the wrong backend is invisible from inside the
  // app — it just 404s on anything the deployed build does not have.
  console.log(`[app.config] API_URL -> ${apiUrl}`);
  const mapboxPublicToken = process.env.MAPBOX_PUBLIC_TOKEN || '';
  const mapboxDownloadToken = process.env.MAPBOX_DOWNLOAD_TOKEN || '';

  return {
    ...config,
    name: `${config.name}${variant.nameSuffix}`,
    scheme: variant.scheme,
    ios: {
      ...(config.ios || {}),
      bundleIdentifier: `${config.ios.bundleIdentifier}${variant.idSuffix}`,
    },
    android: {
      ...(config.android || {}),
      package: `${config.android.package}${variant.idSuffix}`,
    },
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
      appVariant: VARIANT,
    },
  };
};
