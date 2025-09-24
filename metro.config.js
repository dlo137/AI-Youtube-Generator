const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add resolver configuration for Supabase and Node.js compatibility
config.resolver.alias = {
  ...config.resolver.alias,
  'crypto': 'react-native-crypto-js',
  'stream': 'readable-stream',
  'url': 'react-native-url-polyfill',
  'buffer': '@craftzdog/react-native-buffer',
  'events': 'events',
  // Replace ws package with our mock
  'ws': path.resolve(__dirname, 'MockWebSocket.ts'),
};

// Add node_modules resolution for polyfills
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Exclude problematic packages
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.platforms = ['native', 'ios', 'android', 'web'];

config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// Configure transformer to handle Node.js modules
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = config;