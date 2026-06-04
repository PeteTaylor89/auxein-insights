#!/usr/bin/env node
// scripts/bump-build.mjs — single source of truth for app versioning.
//
// Versioning model:
//   • expo.version          marketing semver (MAJOR.MINOR.PATCH) — what stores show
//   • ios.buildNumber       monotonic build integer (string)  ┐ ALWAYS kept equal,
//   • android.versionCode   monotonic build integer (number)  ┘ one number to reason about
//
// Every store build gets a NEW build integer; numbers are never reused on either
// store. Run this BEFORE each build, COMMIT app.json, then `eas build`. Because
// appVersionSource is "local", EAS reads app.json from the committed git state —
// so the number that shipped is pinned in the commit that produced the build.
//
// Usage:
//   node scripts/bump-build.mjs                 +1 build number only
//   node scripts/bump-build.mjs patch           +1 build, bump marketing patch (0.1.1 -> 0.1.2)
//   node scripts/bump-build.mjs minor           +1 build, bump marketing minor (0.1.1 -> 0.2.0)
//   node scripts/bump-build.mjs major           +1 build, bump marketing major (0.1.1 -> 1.0.0)
//   node scripts/bump-build.mjs --set-version 0.2.0   +1 build, set explicit marketing version
//   node scripts/bump-build.mjs --build 12            force the build integer (e.g. to clear a clash)
//   node scripts/bump-build.mjs --show                print current values, change nothing

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'app.json');
const data = JSON.parse(readFileSync(appJsonPath, 'utf8'));
const e = data.expo;

const curIos = parseInt(e.ios?.buildNumber ?? '0', 10) || 0;
const curAndroid = e.android?.versionCode ?? 0;
const curBuild = Math.max(curIos, curAndroid); // self-heal if they ever drift apart
const curVersion = e.version;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const flagVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

if (has('--show')) {
  console.log(`version=${curVersion}  iOS buildNumber=${e.ios?.buildNumber}  Android versionCode=${e.android?.versionCode}`);
  process.exit(0);
}

// build integer
const forced = flagVal('--build');
const nextBuild = forced !== undefined ? parseInt(forced, 10) : curBuild + 1;
if (!Number.isInteger(nextBuild) || nextBuild <= 0) {
  console.error(`Invalid build number: ${forced}`);
  process.exit(1);
}

// marketing version
let nextVersion = curVersion;
const setV = flagVal('--set-version');
if (setV) {
  if (!/^\d+\.\d+\.\d+$/.test(setV)) { console.error(`--set-version must be MAJOR.MINOR.PATCH, got ${setV}`); process.exit(1); }
  nextVersion = setV;
} else if (has('major') || has('minor') || has('patch')) {
  let [maj, min, pat] = curVersion.split('.').map(Number);
  if (has('major')) { maj++; min = 0; pat = 0; }
  else if (has('minor')) { min++; pat = 0; }
  else { pat++; }
  nextVersion = `${maj}.${min}.${pat}`;
}

e.version = nextVersion;
e.ios = e.ios || {};
e.android = e.android || {};
e.ios.buildNumber = String(nextBuild);
e.android.versionCode = nextBuild;

writeFileSync(appJsonPath, JSON.stringify(data, null, 2) + '\n');

console.log(`Bumped version ${curVersion} -> ${nextVersion}, build ${curBuild} -> ${nextBuild} (iOS buildNumber + Android versionCode).`);
console.log('Next: commit app.json, then `eas build --platform all --profile production`.');
