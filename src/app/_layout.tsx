import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { PortalProvider as GorhomPortalProvider } from '@tamagui/portal';
import { TamaguiProvider } from 'tamagui';

import { tamaguiConfig } from '../../tamagui.config';
import '../lib/sentry'; // side-effect: initialises Sentry once at module load
import { initAudio } from '../lib/audio';
import { getSecureItem, getStorageItem, SECURE_KEYS, STORAGE_KEYS } from '../lib/storage';
import { useAuthStore } from '../stores/auth';
import { useStationStore } from '../stores/station';

const queryClient = new QueryClient();

function RootLayoutNav() {
  const [hydrated, setHydrated] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setCredentials = useAuthStore((s) => s.setCredentials);
  const setStation = useStationStore((s) => s.setStation);
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
      const [apiKey, apiSecret, instanceUrl, fullName, email, stationJson] = await Promise.all([
        getSecureItem(SECURE_KEYS.API_KEY),
        getSecureItem(SECURE_KEYS.API_SECRET),
        getSecureItem(SECURE_KEYS.INSTANCE_URL),
        getStorageItem('fullname'),
        getStorageItem(STORAGE_KEYS.EMAIL_BACKUP),
        getStorageItem(STORAGE_KEYS.USER_STATION),
      ]);
      if (apiKey && apiSecret && instanceUrl) {
        setCredentials({
          apiKey,
          apiSecret,
          instanceUrl,
          fullName: fullName ?? '',
          email: email ?? '',
        });
      }
      if (stationJson) {
        try {
          const parsed = JSON.parse(stationJson);
          if (
            parsed &&
            typeof parsed === 'object' &&
            typeof parsed.farm === 'string' &&
            typeof parsed.warehouse === 'string' &&
            typeof parsed.farmName === 'string' &&
            typeof parsed.warehouseName === 'string'
          ) {
            setStation(parsed);
          }
        } catch {
          // corrupt JSON — silently skip
        }
      }
      setHydrated(true);
      await SplashScreen.hideAsync();
    }
    void hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [isAuthenticated, segments, hydrated]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  });

  if (!fontsLoaded) return null;

  return (
    <TamaguiProvider config={tamaguiConfig}>
      <GorhomPortalProvider>
        <QueryClientProvider client={queryClient}>
          <RootLayoutNav />
        </QueryClientProvider>
      </GorhomPortalProvider>
    </TamaguiProvider>
  );
}
