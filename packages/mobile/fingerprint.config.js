// Fingerprint configuration for the `runtimeVersion: { policy: "fingerprint" }`
// OTA compatibility gate.
//
// ## Why this file exists
//
// The fingerprint hashes the ENTIRE resolved Expo config, not only the parts
// that affect native code — including `extra`. That is too strict for this app,
// because `extra` is precisely the bag of JS-readable values that an OTA is
// supposed to be able to change:
//
//     extra.apiUrl            which backend the app talks to
//     extra.appVariant        which build this is
//     extra.mapboxPublicToken a runtime map token
//     extra.sentryDsn         whether crash reporting is on
//
// Measured on 2026-09-02, production variant, android:
//
//     baseline                b86a3a360cc353a1161959df8132ea82e69a470a
//     with SENTRY_DSN set     dad1b78e29cf6f2134ec68b88947223ee46f14d5
//     with DSN + ORG/PROJECT  9b5b114f21f866ababb27ba02d3d9cfa0180ca22
//
// Without this skip, adding the Sentry DSN — a value read at runtime by JS,
// with a native module that is already in the binary — would change the
// runtimeVersion and could therefore only ship in a NEW BUILD. That is the
// opposite of what OTA is for.
//
// ## What is still covered
//
// Everything that actually decides binary compatibility: native modules, the
// plugin list and their options, package.json dependencies, app icons and
// splash, permissions, bundle identifiers, the Android and iOS project files.
// A new native module or a changed plugin option still bumps the
// runtimeVersion and still forces a build, which is correct.
//
// ## The one thing to remember
//
// An OTA can now repoint `extra.apiUrl`. That is intended — it is a JS value —
// but it means an update carries the API URL of whoever published it. Publish
// with the same environment you build with.
//
// ## ignorePaths: the Windows + hoisted-node_modules trap (added 2026-09-05)
//
// Every EAS build of build 10 failed in "Configure expo-updates" with a runtime
// version mismatch, listing ~112 differing files under node_modules. The two
// machines cannot agree without the list below.
//
// @expo/fingerprint loads the Expo config in a child process and records which
// modules were required, so config plugins are hashed. It then drops the ones
// living in node_modules using DEFAULT_CONFIG_LOADING_IGNORE_PATHS — patterns
// of the form "**/node_modules/@expo/**/*". The path it tests comes from
// `path.relative(projectRoot, modulePath)` and is never converted to posix
// (@expo/fingerprint 0.15.4; unchanged in 0.20.12 — ExpoConfigLoader.js).
//
// node_modules is hoisted to the repo root, so every one of those paths starts
// with a parent prefix. Two things then go wrong together, and only on Windows:
//
//   - the strip-parent-prefix regex is /^(\.\.\/)+/ — forward slashes only, so
//     an OS-separator path is never stripped;
//   - minimatch's "**" deliberately refuses to match a ".." segment.
//
// So on Linux the prefix is stripped and "**/node_modules/@expo/**/*" matches;
// on Windows nothing matches and ~112 infrastructure modules get hashed that
// the EAS builder never hashes. No glob without an explicit "../../" prefix can
// fix it — "**/node_modules/**" and "*node_modules*" were both measured to
// return false against the Windows-shaped path.
//
// The list below therefore mirrors DEFAULT_CONFIG_LOADING_IGNORE_PATHS with the
// prefix made explicit. Verified to match the Windows-shaped paths, and to
// leave real config plugins (@rnmapbox/maps, @sentry/react-native,
// expo-location) and every autolinking source untouched — those still decide
// binary compatibility and must stay in the hash. On Linux these patterns
// select paths that were already excluded, so the builder is unaffected.
//
// "../../" is this package's depth to the workspace root (packages/mobile).
// If the package moves, or Expo normalises the path in ExpoConfigLoader, revisit.

const HOISTED = '../../node_modules';

// Kept byte-identical in spirit to @expo/fingerprint's own list so the two can
// be diffed when the dependency is upgraded.
const CONFIG_LOADING_INFRA_PACKAGES = [
  'ajv',
  'ajv-formats',
  'ajv-keywords',
  'ansi-styles',
  'chalk',
  'debug',
  'dotenv',
  'dotenv-expand',
  'escape-string-regexp',
  'getenv',
  'graceful-fs',
  'fast-deep-equal',
  'fast-uri',
  'has-flag',
  'imurmurhash',
  'js-tokens',
  'json5',
  'json-schema-traverse',
  'ms',
  'picocolors',
  'lines-and-columns',
  'require-from-string',
  'resolve-from',
  'schema-utils',
  'signal-exit',
  'sucrase',
  'supports-color',
  'ts-interface-checker',
  'write-file-atomic',
];

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigExtraSection'],
  ignorePaths: [
    `${HOISTED}/@babel/**/*`,
    `${HOISTED}/@expo/**/*`,
    `${HOISTED}/@jridgewell/**/*`,
    `${HOISTED}/expo/config.js`,
    `${HOISTED}/expo/config-plugins.js`,
    `${HOISTED}/{${CONFIG_LOADING_INFRA_PACKAGES.join(',')}}/**/*`,
  ],
};
