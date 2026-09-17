// react-native-worklets-core ships its own Babel plugin, which babel-preset-expo
// does not auto-detect (the preset only auto-adds Reanimated's worklets plugin,
// and only when react-native-worklets or react-native-reanimated is installed).
//
// Reanimated and react-native-worklets were removed in Phase 1 Task 1 precisely
// so this is the only worklet transform in the pipeline -- both plugins claim the
// same 'worklet' directive, and running them together double-transforms.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets-core/plugin"],
  };
};
