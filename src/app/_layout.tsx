import { BottomSheetModalProvider } from '@expo/ui/community/bottom-sheet';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import '../lib/sentry'; // side-effect: initialises Sentry once at module load
import '../lib/fonts'; // side-effect: patches Text/TextInput to default to DM Sans
import { APP_FONTS } from '../lib/fonts';
import { initAudio } from '../lib/audio';
import { LEGACY_PINNED_HOST } from '../lib/config';
import { parseSiteInput } from '../lib/siteUrl';
import {
  APP_KEYS,
  TENANT_KEYS,
  getAppItem,
  getItemFor,
  readLegacyFlatSession,
  runStorageMigration,
  setActiveTenant,
} from '../lib/storage';
import { useAuthStore } from '../stores/auth';
import { useFarmStore } from '../stores/farm';

const queryClient = new QueryClient();

function RootLayoutNav() {
  const [hydrated, setHydrated] = useState(false);
  const [fontsLoaded] = useFonts(APP_FONTS);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setCredentials = useAuthStore((s) => s.setCredentials);
  const setFarm = useFarmStore((s) => s.setFarm);
  const segments = useSegments();
  const router = useRouter();

  // Make TanStack Query refetchOnWindowFocus work in React Native.
  // AppState 'active' = app foregrounded = treat as window focus.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // Migrate, then hydrate the auth store. The splash stays up throughout.
  //
  // ORDERING IS THE GUARANTEE, not a detail. setHydrated(true) runs only after this
  // resolves; the redirect effect below begins `if (!hydrated) return` and render is
  // blocked by `if (!hydrated || !fontsLoaded) return null`. So between process start
  // and migration completion there is no navigation decision and no paint — nobody
  // can be bounced to a login screen mid-upgrade. The migration must therefore stay
  // on the awaited path: fire it as a detached effect and the guarantee evaporates.
  useEffect(() => {
    async function hydrate() {
      void initAudio(); // fire-and-forget; players needed before first workflow screen

      const migration = await runStorageMigration(LEGACY_PINNED_HOST);

      let sid: string | null = null;
      let instanceUrl: string | null = null;
      let fullName: string | null = null;
      let email: string | null = null;
      let farmJson: string | null = null;

      if (migration.status === 'failed') {
        // A storage fault must not cost anyone their session. Behave exactly as the
        // previous build did for this launch, strictly read-only, and try again next
        // time. This branch writes nothing — writing here would re-create flat keys.
        console.warn('[boot] storage migration failed, using legacy keys', migration.failedAt);
        const legacy = await readLegacyFlatSession();
        sid = legacy.sid;
        instanceUrl = legacy.instanceUrl;
        fullName = legacy.fullName;
        email = legacy.email;
        farmJson = legacy.userFarm;
      } else {
        const tenantId = await getAppItem(APP_KEYS.ACTIVE_TENANT);
        if (tenantId) {
          setActiveTenant(tenantId);
          [sid, fullName, email, farmJson] = await Promise.all([
            getItemFor(tenantId, TENANT_KEYS.SID),
            getItemFor(tenantId, TENANT_KEYS.FULLNAME),
            getItemFor(tenantId, TENANT_KEYS.EMAIL),
            getItemFor(tenantId, TENANT_KEYS.USERFARM),
          ]);
          // Derived, never stored — one source of truth for which host we talk to.
          instanceUrl = `https://${tenantId}`;
        }
      }

      // A legacy install may hold an http:// origin, from the old normalizeUrl
      // fallback. Upgrade it in place rather than forcing a logout: the session
      // cookie is host-bound and carries no scheme binding (verified against the
      // live site), so the sid stays valid and the cleartext replay stops. Only a
      // host that fails the allowlist is refused.
      if (sid && instanceUrl) {
        const site = parseSiteInput(instanceUrl.replace(/^http:\/\//i, 'https://'));
        if (site.ok) {
          setActiveTenant(site.site.tenantId);
          setCredentials({
            sid,
            instanceUrl: site.site.origin,
            tenantId: site.site.tenantId,
            fullName: fullName ?? '',
            email: email ?? '',
          });
        } else {
          console.warn('[boot] stored site is not allowlisted, declining to restore');
        }
      }

      if (farmJson) {
        try {
          const parsed = JSON.parse(farmJson);
          if (
            parsed &&
            typeof parsed === 'object' &&
            typeof parsed.farm === 'string' &&
            typeof parsed.farmName === 'string'
          ) {
            setFarm(parsed);
          }
        } catch {
          // corrupt JSON — silently skip
        }
      }
      setHydrated(true);
    }
    void hydrate();
  }, []);

  // Hold the splash until BOTH state hydration and the DM Sans/Poppins fonts are
  // ready, so the first paint is never in the wrong typeface.
  useEffect(() => {
    if (hydrated && fontsLoaded) void SplashScreen.hideAsync();
  }, [hydrated, fontsLoaded]);

  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [isAuthenticated, segments, hydrated]);

  if (!hydrated || !fontsLoaded) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <BottomSheetModalProvider>
        <RootLayoutNav />
      </BottomSheetModalProvider>
    </QueryClientProvider>
  );
}
