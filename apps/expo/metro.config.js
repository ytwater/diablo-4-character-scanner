// Learn more: https://docs.expo.dev/guides/monorepos/
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { FileStore } = require("metro-cache");
const { withNativewind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.cacheStores = [
  new FileStore({
    root: path.join(__dirname, "node_modules", ".cache", "metro"),
  }),
];

// expo-router treats every file under src/app/ as a route by default, which
// pulls test files (and their Node-only deps like @testing-library/react-native)
// into the app bundle. Exclude them so they're only picked up by Jest.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  ).filter(Boolean),
  /\/src\/app\/.*\.test\.[jt]sx?$/,
];

/** @type {import('expo/metro-config').MetroConfig} */
module.exports = withNativewind(config);
