// metro.config.js — Expo config with workspace isolation
// Blocks web-only packages from being resolved via npm workspace hoisting
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const projectRoot = path.resolve(__dirname, '../..');

// Block web-only packages from the bundle
function escapeForRegex(dir) {
  const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(/\\\\/g, '[\\\\/]');
}

config.resolver.blockList = [
  ...[
    'packages/shared',
    'packages/web',
    'packages/insights',
    'packages/auxein-marketing',
    'node_modules/@vineyard/shared',
    'node_modules/@vineyard/web',
    'node_modules/@vineyard/insights',
  ].map(rel => new RegExp(escapeForRegex(path.resolve(projectRoot, rel)) + '[\\\\/].*')),
];

module.exports = config;
