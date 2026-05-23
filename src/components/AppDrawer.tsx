import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button, Sheet, Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import {
  Scissors,
  Home,
  SlidersHorizontal,
  Package,
  Truck,
  Trash2,
  LogOut,
  Settings,
  Monitor,
  X,
} from 'lucide-react-native';

import { useAuthStore } from '../stores/auth';
import { useStationStore } from '../stores/station';
import { useLogout } from '../features/auth/useLogout';

const PRIMARY = '#44433e';
const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.8, 320);

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  route: string;
}

const KIKWETU_ITEMS: MenuItem[] = [
  { label: 'Harvesting',     icon: <Scissors size={20} color={PRIMARY} />,         route: '/kikwetu/harvesting' },
  { label: 'Receiving',      icon: <Home size={20} color={PRIMARY} />,              route: '/kikwetu/receiving' },
  { label: 'Rejects',        icon: <SlidersHorizontal size={20} color={PRIMARY} />, route: '/kikwetu/rejects' },
  { label: 'Grading',        icon: <SlidersHorizontal size={20} color={PRIMARY} />, route: '/kikwetu/grading' },
  { label: 'Packing',        icon: <Package size={20} color={PRIMARY} />,           route: '/kikwetu/packing' },
  { label: 'Dispatch',       icon: <Truck size={20} color={PRIMARY} />,             route: '/kikwetu/dispatch' },
  { label: 'Discards',       icon: <Trash2 size={20} color={PRIMARY} />,            route: '/kikwetu/discards' },
];

const UTILITY_ITEMS: MenuItem[] = [
  { label: 'Configure Farm', icon: <Settings size={20} color={PRIMARY} />, route: '/configure' },
  { label: 'View ERP Desk',  icon: <Monitor size={20} color={PRIMARY} />, route: '/erp-desk' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AppDrawer({ isOpen, onClose }: Props) {
  const router = useRouter();
  const fullName = useAuthStore((s) => s.fullName);
  const station = useStationStore((s) => s.station);
  const { logout } = useLogout();
  const [logoutSheetOpen, setLogoutSheetOpen] = useState(false);

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: isOpen ? 0 : -DRAWER_WIDTH,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: isOpen ? 0.5 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOpen]);

  function navigate(route: string) {
    onClose();
    router.push(route as never);
  }

  const initial = fullName && fullName.length > 0 ? fullName[0].toUpperCase() : 'U';

  if (!isOpen) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        {/* Header */}
        <View style={styles.header}>
          <XStack justifyContent="space-between" alignItems="flex-start">
            <View style={styles.avatar}>
              <Text fontSize={22} fontWeight="bold" color="white">{initial}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </XStack>
          <Text fontSize={18} fontWeight="bold" color="white" marginTop="$3">
            {fullName || 'User'}
          </Text>
          <Text fontSize={13} color="rgba(255,255,255,0.7)">
            {station?.farmName ?? 'No Farm Selected'}
          </Text>
          <Text fontSize={13} color="rgba(255,255,255,0.7)">
            {station?.warehouseName ?? 'No Station Selected'}
          </Text>
        </View>

        {/* Menu items */}
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {KIKWETU_ITEMS.map((item) => (
            <Pressable
              key={item.route}
              onPress={() => navigate(item.route)}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              {item.icon}
              <Text fontSize={15} fontWeight="600" color="$primary" marginLeft="$3">
                {item.label}
              </Text>
            </Pressable>
          ))}

          <View style={styles.divider} />

          {UTILITY_ITEMS.map((item) => (
            <Pressable
              key={item.route}
              onPress={() => navigate(item.route)}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              {item.icon}
              <Text fontSize={15} fontWeight="600" color="$primary" marginLeft="$3">
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Footer: logout + version */}
        <View style={styles.footer}>
          <Pressable
            onPress={() => setLogoutSheetOpen(true)}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <LogOut size={20} color="red" />
            <Text fontSize={15} fontWeight="600" color="red" marginLeft="$3">Logout</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Logout confirmation sheet */}
      <Sheet
        open={logoutSheetOpen}
        onOpenChange={setLogoutSheetOpen}
        dismissOnSnapToBottom
        snapPoints={[30]}
        modal
      >
        <Sheet.Overlay />
        <Sheet.Frame padding="$4">
          <YStack alignItems="center" gap="$3">
            <LogOut size={40} color="red" />
            <Text fontSize={17} fontWeight="500" textAlign="center">
              Are you sure you want to logout?
            </Text>
            <XStack gap="$3" width="100%">
              <Button
                flex={1}
                variant="outlined"
                onPress={() => setLogoutSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                flex={1}
                backgroundColor="$red9"
                color="white"
                onPress={() => {
                  setLogoutSheetOpen(false);
                  onClose();
                  void logout();
                }}
              >
                Logout
              </Button>
            </XStack>
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'black',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: 'white',
    elevation: 8,
    shadowColor: 'black',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 2, height: 0 },
  },
  header: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 20,
    borderBottomRightRadius: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#699dcd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1, paddingVertical: 8 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemPressed: { backgroundColor: 'rgba(68,67,62,0.06)' },
  divider: { height: 1, backgroundColor: 'rgba(68,67,62,0.12)', marginVertical: 4 },
  footer: { borderTopWidth: 1, borderTopColor: 'rgba(68,67,62,0.12)' },
});
