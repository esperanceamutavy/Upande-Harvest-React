import * as Sentry from '@sentry/react-native';

/**
 * Side-effect module — import this file once to initialise Sentry at module load time.
 * No-op when EXPO_PUBLIC_SENTRY_DSN is absent — safe for local dev without a DSN configured.
 *
 * enableNative is false because v1 runs inside Expo Go (managed workflow).
 * TODO Phase 8: set enableNative: true for EAS production builds.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    enableNative: false,
    debug: __DEV__,
    tracesSampleRate: __DEV__ ? 0 : 0.2,
  });
}
