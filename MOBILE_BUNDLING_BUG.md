# Mobile App Bundling Bug Report

**Date:** 2026-03-25
**Status:** OPEN
**Severity:** Blocker for Phase M1

## Problem

The Expo/React Native mobile app bundles successfully (973-1016 modules) but crashes at runtime with:

```
ERROR [TypeError: Cannot read property 'S' of undefined]
ERROR [TypeError: Cannot read property 'default' of undefined]
```

These errors appear immediately on app load, before any screen renders.

## Root Cause Analysis

The `@vineyard/shared` package is being pulled into the metro bundle despite no direct imports from mobile source files. Likely causes:

1. **npm workspace resolution** — The root `package.json` defines workspaces including `packages/mobile`. npm hoists dependencies, and metro may resolve `@vineyard/shared` transitively through the root `node_modules`.

2. **Shared package contains web-only code** that crashes in React Native:
   - `import.meta.env` (Vite-only) — partially fixed with safe guards
   - `localStorage` — partially fixed with try/catch wrapper
   - `react-router-dom` import in `AuthContext.jsx` — no react-router-dom in mobile
   - `window.location` references

3. **The cryptic errors** (`property 'S' of undefined`) suggest a minified/bundled module is failing — likely axios interceptors or react-router-dom being evaluated in the RN context.

## What Was Tried

1. **babel-preset-expo `unstable_transformImportMeta`** — Fixed the `import.meta` syntax error but runtime values are still undefined
2. **Safe localStorage wrapper** in shared `api.js` — try/catch around all localStorage calls
3. **Safe `import.meta.env` guards** — `(typeof import.meta !== 'undefined' && import.meta.env?.X)` pattern
4. **Mobile-specific api.js** using `expo-secure-store` instead of localStorage
5. **initMobileApi() to patch shared axios instance** — Failed because axios interceptor internals (`.handlers`) are minified
6. **Separate mobile services file** (`src/api/services.js`) — All mobile screens now import from local services, zero `@vineyard/shared` imports in mobile source
7. **Removed `@vineyard/shared` from mobile package.json** — Still being resolved
8. **Stripped metro.config.js watchFolders** — Still being resolved

## Recommended Next Steps

1. **Check if root workspace hoisting pulls shared into mobile node_modules** — Run `npm ls @vineyard/shared` from packages/mobile to see resolution path
2. **Add `@vineyard/shared` to metro blockList** — In metro.config.js, use `resolver.blockList` to explicitly exclude the shared package from bundling:
   ```js
   config.resolver.blockList = [
     /packages\/shared\/.*/,
   ];
   ```
3. **Check for transitive imports** — Something in mobile's dependency tree may re-export from shared. Run metro with `--verbose` to see the full module graph
4. **Consider ejecting mobile from npm workspaces** — Add mobile to root package.json `workspaces.nohoist` or move it outside the monorepo workspace scope
5. **Nuclear option** — Create a fresh Expo project outside the monorepo, copy mobile source files, install deps independently

## Environment

- Expo SDK 54 (upgraded from 53)
- React 19.1.0, React Native 0.81.5
- Node 20.x, npm workspaces
- Windows 10, tested on iOS via Expo Go
- Metro bundler reports successful bundle (973-1016 modules)
