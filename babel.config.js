module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', {
        jsxRuntime: 'automatic'
      }]
    ],
    plugins: [
      // expo-router/babel is deprecated in SDK 50+, removed as per warning...
    ],
  };
};