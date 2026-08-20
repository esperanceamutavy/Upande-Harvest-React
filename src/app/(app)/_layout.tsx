import { Tabs } from 'expo-router';
import {
  ArrowLeftRight,
  Home,
  LayoutGrid,
  PackageCheck,
  PackagePlus,
  type LucideIcon,
} from 'lucide-react-native';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../components/ui/theme';

// Bottom tab bar mirroring the v2 reference: icon-only, active = primary, inactive = muted,
// height 52 + safe-area inset, surface bg with a hairline top border. Five tabs mapped to
// our flows; Rejects/Configure/ERP/detail stay off the bar (href: null) — Rejects is
// reachable via the drawer + a dashboard quick action. Icons match the drawer's lucide set.
function tabIcon(Icon: LucideIcon) {
  return function TabBarIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon size={size ?? 24} color={color as string} />;
  };
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 52 + insets.bottom,
          paddingBottom: insets.bottom,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen name="receiving" options={{ title: 'Receiving', tabBarIcon: tabIcon(PackagePlus) }} />
      <Tabs.Screen name="bucket-transfer" options={{ title: 'Bucket Transfer', tabBarIcon: tabIcon(ArrowLeftRight) }} />
      <Tabs.Screen name="shelving" options={{ title: 'Shelving', tabBarIcon: tabIcon(LayoutGrid) }} />
      <Tabs.Screen name="issuing" options={{ title: 'Issuing', tabBarIcon: tabIcon(PackageCheck) }} />

      {/* Off the tab bar — reachable via drawer / quick actions */}
      <Tabs.Screen name="rejects" options={{ href: null }} />
      <Tabs.Screen name="configure" options={{ href: null }} />
      <Tabs.Screen name="erp-desk" options={{ href: null }} />
      <Tabs.Screen name="receiving-out" options={{ href: null }} />
      <Tabs.Screen name="grading" options={{ href: null }} />
      <Tabs.Screen name="packing" options={{ href: null }} />
      <Tabs.Screen name="stock-entry/[id]" options={{ href: null }} />
    </Tabs>
  );
}
