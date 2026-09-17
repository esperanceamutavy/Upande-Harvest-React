// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Every persisted value is namespaced by tenant, and src/lib/storage.ts is the
    // only place that composes a key. Reaching past it to AsyncStorage or
    // SecureStore directly would write a flat key that no migration knows about and
    // that one site could read from another — so this is a build failure, not a
    // convention someone has to remember at review time.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/storage.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@react-native-async-storage/async-storage",
            message: "Use src/lib/storage.ts — persisted keys must be tenant-namespaced.",
          },
          {
            name: "expo-secure-store",
            message: "Use src/lib/storage.ts — persisted keys must be tenant-namespaced.",
          },
        ],
      }],
    },
  },
]);
