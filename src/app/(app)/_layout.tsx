import { Tabs } from 'expo-router';
import {
  ArrowLeftRight,
  Home,
  LayoutGrid,
  PackageCheck,
  PackagePlus,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppDrawer } from '../../components/AppDrawer';
import { DrawerProvider, useDrawer } from '../../features/navigation/drawerContext';
import { colors } from '../../components/ui/theme';

// Bottom tab bar mirroring the v2 reference: icon-only, active = primary, inactive = muted,
// height 52 + safe-area inset, surface bg with a hairline top border. Five tabs mapped to
// our flows; Rejects/Configure/ERP/detail stay off the bar (href: null) — Rejects is
// reachable via the drawer + a dashboard quick action. Icons match the drawer's lucide set.
// Built ONCE at module scope. Previously these were created inside the render,
// so every re-render handed React Navigation a brand-new component type for each
// tab — forcing the navigator to re-render its icons on any parent state change.
function tabIcon(Icon: LucideIcon) {
  return function TabBarIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon size={size ?? 24} color={color as string} />;
  };
}

const HomeIcon = tabIcon(Home);
const ReceivingIcon = tabIcon(PackagePlus);
const BucketTransferIcon = tabIcon(ArrowLeftRight);
const ShelvingIcon = tabIcon(LayoutGrid);
const IssuingIcon = tabIcon(PackageCheck);

// The navigator. Deliberately does NOT consume the drawer context: if it did,
// every open/close would re-render the whole <Tabs> subtree. `screenOptions` is
// memoised on the inset for the same reason — a fresh object each render makes
// React Navigation re-render regardless of whether anything changed.
function AppTabs() {
  const insets = useSafeAreaInsets();

  const screenOptions = useMemo(
    () => ({
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
    }),
    [insets.bottom],
  );

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: HomeIcon }} />
      <Tabs.Screen name="receiving" options={{ title: 'Receiving', tabBarIcon: ReceivingIcon }} />
      <Tabs.Screen name="bucket-transfer" options={{ title: 'Bucket Transfer', tabBarIcon: BucketTransferIcon }} />
      <Tabs.Screen name="shelving" options={{ title: 'Shelving', tabBarIcon: ShelvingIcon }} />
      <Tabs.Screen name="issuing" options={{ title: 'Issuing', tabBarIcon: IssuingIcon }} />

      {/* Off the tab bar — reachable via drawer / quick actions */}
      <Tabs.Screen name="rejects" options={{ href: null }} />
      <Tabs.Screen name="configure" options={{ href: null }} />
      <Tabs.Screen name="erp-desk" options={{ href: null }} />
      <Tabs.Screen name="receiving-out" options={{ href: null }} />
      <Tabs.Screen name="grading" options={{ href: null }} />
      <Tabs.Screen name="packing" options={{ href: null }} />
      <Tabs.Screen name="dispatch" options={{ href: null }} />
      <Tabs.Screen name="traceability" options={{ href: null }} />
      <Tabs.Screen name="stock-entry/[id]" options={{ href: null }} />
    </Tabs>
  );
}

// The ONE AppDrawer, isolated in its own component so that toggling the drawer
// re-renders only this — never the navigator. Rendered as a later sibling of
// <Tabs>, so it paints above the tab bar without a native Modal window.
function DrawerHost() {
  const { isOpen, closeDrawer } = useDrawer();
  return <AppDrawer isOpen={isOpen} onClose={closeDrawer} />;
}

export default function AppLayout() {
  return (
    <DrawerProvider>
      <View style={{ flex: 1 }}>
        <AppTabs />
        <DrawerHost />
      </View>
    </DrawerProvider>
  );
}
