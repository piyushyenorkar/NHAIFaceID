const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {};

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts } = defaultConfig.resolver;

const config = {
  resolver: {
    assetExts: [...assetExts, 'onnx', 'ort', 'tflite'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
