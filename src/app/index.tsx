import { Redirect } from 'expo-router';

// Auth gate in _layout.tsx handles the redirect.
// This fallback ensures Expo Router always has a matching root route.
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
