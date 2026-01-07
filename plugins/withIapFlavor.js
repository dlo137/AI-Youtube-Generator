const { withAppBuildGradle } = require('@expo/config-plugins');

const withIapFlavor = (config) => {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      const androidPattern = /android\s*\{/;

      // Check if flavorDimensions is already added
      if (!config.modResults.contents.includes('flavorDimensions "store"')) {
        config.modResults.contents = config.modResults.contents.replace(
          androidPattern,
          `android {
    flavorDimensions "store"

    productFlavors {
        play {
            dimension "store"
        }
    }
`
        );
      }
    }
    return config;
  });
};

module.exports = withIapFlavor;
