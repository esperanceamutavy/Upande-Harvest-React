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
import { getSecureItem, getStorageItem, SECURE_KEYS, STORAGE_KEYS } from '../lib/storage';
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

  // Read SecureStore on first mount and hydrate the auth store.
  // Splash screen stays visible until this completes (Phase 1.5 polishes timing).
  useEffect(() => {
    async function hydrate() {
      void initAudio(); // fire-and-forget; players needed before first workflow screen
      const [sid, instanceUrl, fullName, email, farmJson] = await Promise.all([
        getSecureItem(SECURE_KEYS.SID),
        getSecureItem(SECURE_KEYS.INSTANCE_URL),
        getStorageItem('fullname'),
        getStorageItem(STORAGE_KEYS.EMAIL_BACKUP),
        getStorageItem(STORAGE_KEYS.USER_FARM),
      ]);
      if (sid && instanceUrl) {
        setCredentials({
          sid,
          instanceUrl,
          fullName: fullName ?? '',
          email: email ?? '',
        });
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
