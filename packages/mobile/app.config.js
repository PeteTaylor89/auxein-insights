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
  // The Mapbox DOWNLOAD token is no longer read here — see the @rnmapbox/maps
  // plugin entry below. It must be present in the build environment as
  // RNMAPBOX_MAPS_DOWNLOAD_TOKEN, or the Android build cannot fetch the SDK.
  const mapboxDownloadTokenPresent = Boolean(
    process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN || process.env.MAPBOX_DOWNLOAD_TOKEN,
  );
  if (!mapboxDownloadTokenPresent) {
    console.log('[app.config] No RNMAPBOX_MAPS_DOWNLOAD_TOKEN — fine for `eas update` '
      + 'and local Metro; an Android BUILD needs it to fetch the Mapbox SDK.');
  } else if (!process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN) {
    console.log('[app.config] MAPBOX_DOWNLOAD_TOKEN is set but RNMAPBOX_MAPS_DOWNLOAD_TOKEN '
      + 'is not — the plugin reads the latter. Rename it in EAS Secrets.');
  }

  // Crash reporting. The DSN is NOT in the repo — it comes from the build
  // environment (eas.json `env`, or .env locally), so this ships inert until
  // one exists and the value can be rotated without a code change.
  //
  // The native module is included either way, and that is the point: it is
  // native, so if it misses build 10 it cannot arrive until build 11. Init is
  // guarded on the DSN in App.js, so a build with no DSN simply reports
  // nothing rather than crashing on startup — which would be a crash reporter
  // causing the crash.
  const sentryDsn = process.env.SENTRY_DSN || '';
  // Source-map upload needs an auth token AND an org/project. Without them the
  // plugin still builds; the traces are just minified bundle offsets, which are
  // close to useless — so the build logs say so rather than looking fine.
  const sentryOrg = process.env.SENTRY_ORG || '';
  const sentryProject = process.env.SENTRY_PROJECT || '';
  if (sentryDsn && !(sentryOrg && sentryProject)) {
    console.log('[app.config] SENTRY_DSN set but SENTRY_ORG/SENTRY_PROJECT are not — '
      + 'crashes will report with unreadable, minified stack traces.');
  }
  if (!sentryDsn) {
    console.log('[app.config] No SENTRY_DSN — crash reporting is inert in this build.');
  }

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
      // The download token is deliberately NOT passed as a plugin option.
      //
      // It is a BUILD-time credential for Mapbox's private maven repo and has
      // no runtime effect, but as a plugin option it is written into
      // gradle.properties — which makes it native config, which puts it inside
      // the `fingerprint` runtimeVersion. It is an EAS Secret, so it is set on
      // the build server and NOT on the machine that runs `eas update`, and the
      // two therefore computed different runtimeVersions:
      //
      //     without the token   67aefe3a5166a935f03e4a3aebab911dda814f90
      //     with the token      870cf724793f526853c109715d61cceacab52b6e
      //
      // Different runtimeVersion means the update simply never reaches the
      // binary — no error, nothing in the dashboard to suggest a problem. That
      // is the exact shape of "OTA declared working when it is not".
      //
      // The plugin reads RNMAPBOX_MAPS_DOWNLOAD_TOKEN from the environment
      // instead (and now warns that the option is deprecated), which keeps the
      // credential out of both the fingerprint and gradle.properties.
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsImpl: 'mapbox',
        },
      ],
      // Added unconditionally: the plugin is what puts the native crash handler
      // in the binary, and leaving it out when the DSN happens to be unset
      // would make the presence of crash reporting depend on the environment of
      // whoever ran the build.
      [
        '@sentry/react-native/expo',
        {
          organization: sentryOrg || undefined,
          project: sentryProject || undefined,
        },
      ],
    ],
    extra: {
      ...(config.extra || {}),
      apiUrl,
      mapboxPublicToken,
      appVariant: VARIANT,
      sentryDsn,
    },
  };
};
