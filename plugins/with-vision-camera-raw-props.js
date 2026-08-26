const { withMainApplication } = require('expo/config-plugins');

const FEATURE_FLAG_IMPORTS = `import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults`;

const FEATURE_FLAG_OVERRIDE = `    ReactNativeFeatureFlags.dangerouslyForceOverride(
        object : ReactNativeNewArchitectureFeatureFlagsDefaults(true) {
          override fun useRawPropsJsiValue(): Boolean = true
          override fun useShadowNodeStateOnClone(): Boolean = true
        }
    )`;

function addVisionCameraRawPropsSupport(contents) {
  if (!contents.includes('import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags')) {
    contents = contents.replace(
      'import com.facebook.react.defaults.DefaultReactNativeHost',
      `import com.facebook.react.defaults.DefaultReactNativeHost\n${FEATURE_FLAG_IMPORTS}`,
    );
  }

  const loadReactNativeCall = '    loadReactNative(this)';
  if (contents.includes('useRawPropsJsiValue(): Boolean = true')) {
    contents = contents.replace(
      `${loadReactNativeCall}\n${FEATURE_FLAG_OVERRIDE}`,
      `${FEATURE_FLAG_OVERRIDE}\n${loadReactNativeCall}`,
    );
  } else {
    contents = contents.replace(
      loadReactNativeCall,
      `${FEATURE_FLAG_OVERRIDE}\n${loadReactNativeCall}`,
    );
  }

  return contents;
}

module.exports = function withVisionCameraRawProps(config) {
  return withMainApplication(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('VisionCamera raw props support expects a Kotlin MainApplication.');
    }

    config.modResults.contents = addVisionCameraRawPropsSupport(config.modResults.contents);
    return config;
  });
};

module.exports.addVisionCameraRawPropsSupport = addVisionCameraRawPropsSupport;
