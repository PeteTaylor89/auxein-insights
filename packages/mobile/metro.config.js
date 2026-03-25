// metro.config.js — Standard Expo config (no monorepo shared dependency)
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
