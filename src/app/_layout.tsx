import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { initSentry } from '../lib/sentry';

initSentry();
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { TamaguiProvider } from 'tamagui';

import { tamaguiConfig } from '../../tamagui.config';
import { getSecureItem, SECURE_KEYS } from '../lib/storage';
import { useAuthStore } from '../stores/auth';

const queryClient = new QueryClient();

function RootLayoutNav() {
  const [hydrated, setHydrated] = useState(false);
  const { isAuthenticated, setCredentials } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Read SecureStore on first mount and hydrate the auth store.
  // Splash screen stays visible until this completes (Phase 1.5 polishes timing).
  useEffect(() => {
    async function hydrate() {
      const [apiKey, apiSecret, instanceUrl] = await Promise.all([
        getSecureItem(SECURE_KEYS.API_KEY),
        getSecureItem(SECURE_KEYS.API_SECRET),
        getSecureItem(SECURE_KEYS.INSTANCE_URL),
      ]);
      if (apiKey && apiSecret && instanceUrl) {
        setCredentials({ apiKey, apiSecret, instanceUrl, fullName: '', email: '' });
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
    <QueryClientProvider client={queryClient}>
      <TamaguiProvider config={tamaguiConfig}>
        <RootLayoutNav />
      </TamaguiProvider>
    </QueryClientProvider>
  );
}
