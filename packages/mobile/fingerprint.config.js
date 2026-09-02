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

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigExtraSection'],
};
