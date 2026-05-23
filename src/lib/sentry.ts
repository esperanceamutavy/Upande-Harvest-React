import * as Sentry from '@sentry/react-native';

/**
 * Initialise Sentry from EXPO_PUBLIC_SENTRY_DSN.
 * No-op when the env var is absent — safe for local dev without a DSN configured.
 * Called at the module level in _layout.tsx so it runs before any rendering.
 *
 * enableNative is false because v1 runs inside Expo Go (managed workflow).
 * TODO Phase 8: set enableNative: true for EAS production builds.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    enableNative: false,
    debug: __DEV__,
    tracesSampleRate: __DEV__ ? 0 : 0.2,
  });
}
