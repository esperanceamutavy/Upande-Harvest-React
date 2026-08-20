import { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LogOut, X } from 'lucide-react-native';

import { useAuthStore } from '../stores/auth';
import { useLogout } from '../features/auth/useLogout';
import { useFarm } from '../features/station/useFarm';
import { WORKFLOW_ITEMS, UTILITY_ITEMS, type DrawerItem } from '../features/navigation/drawerItems';
import { colors, fontFamily, fontSize, radii, spacing } from './ui/theme';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.75, 320);

interface AppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

// Rendered ONCE, by the (app) layout — see drawerContext. Not a Modal: on
// Android a Modal is a native window, and constructing/showing one per open was
// a large part of the observed delay. An absolutely-positioned overlay rendered
// as a LATER SIBLING of <Tabs> paints above the tab bar with no native window
// involved, and the panel animation was already hand-rolled (the Modal used
// animationType="none"), so nothing is lost visually.
//
// The trade is Modal's `onRequestClose`, which handled the Android hardware
// back button. BackHandler below restores that explicitly.
export function AppDrawer({ isOpen, onClose }: AppDrawerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const farm = useFarm();
  const { logout } = useLogout();

  // Lazy useState, not `useRef(...).current` — React 19's react-hooks rules
  // reject reading a ref during render. Same fix as Segmented.tsx.
  const [translateX] = useState(() => new Animated.Value(-DRAWER_WIDTH));

  // `mounted` outlives `isOpen` by one animation so the panel can slide out
  // before it unmounts. Opening flips it during render rather than from an
  // effect — React's sanctioned alternative to setState-in-effect, and it
  // avoids the cascading-render the lint rule was pointing at.
  const [mounted, setMounted] = useState(isOpen);
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (isOpen) setMounted(true);
  }

  useEffect(() => {
    if (isOpen) {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(translateX, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [isOpen, translateX]);

  // Android hardware back closes the drawer instead of leaving the screen.
  // Replaces the `onRequestClose` the Modal used to provide.
  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true; // consumed — do not also pop the route
    });
    return () => sub.remove();
  }, [isOpen, onClose]);

  function navigate(route: string) {
    onClose();
    router.push(route as never);
  }

  function renderItem(item: DrawerItem) {
    const Icon = item.icon;
    return (
      <Pressable
        key={item.route}
        onPress={() => navigate(item.route)}
        style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
      >
        <Icon size={20} color={colors.textSecondary} />
        <Text style={styles.menuLabel}>{item.label}</Text>
      </Pressable>
    );
  }

  function confirmLogout() {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => { void logout(); onClose(); },
      },
    ]);
  }

  const initial = fullName && fullName.length > 0 ? fullName[0].toUpperCase() : 'U';

  // Render nothing when closed. This started as a workaround for one Modal host
  // per screen; with a single hoisted instance that reason is gone, but it is
  // now REQUIRED for a different one: an absolute-fill overlay left mounted
  // would swallow every touch on the screen beneath it.
  if (!mounted) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      {/* Dim overlay — tap to close */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Drawer panel */}
      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        {/* Header. paddingTop comes from the live inset rather than a constant:
            without a Modal there is no `statusBarTranslucent` guarantee, so how
            far the overlay extends under the status bar depends on the platform's
            edge-to-edge setting. Using the inset is correct either way. */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + spacing.md, 24) }]}>
          <View style={styles.headerTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.fullName}>{fullName || 'User'}</Text>
          {email ? <Text style={styles.emailText}>{email}</Text> : null}
          <View style={styles.stationCard}>
            <Text style={styles.stationText}>
              {farm ? `${farm.farmName} Farm` : 'No farm configured'}
            </Text>
          </View>
        </View>

        {/* Menu items */}
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {WORKFLOW_ITEMS.map(renderItem)}

          <View style={styles.divider} />

          {UTILITY_ITEMS.map(renderItem)}
        </ScrollView>

        {/* Footer: logout */}
        <View style={styles.footer}>
          <Pressable
            onPress={confirmLogout}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <LogOut size={20} color={colors.error} />
            <Text style={[styles.menuLabel, styles.logoutLabel]}>Logout</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the (app) layout and sits above <Tabs> by sibling order. box-none so
  // only the dim layer and the panel take touches.
  // Written out rather than spread: `StyleSheet.absoluteFill` is a registered
  // style ID, not an object, so the previous `...StyleSheet.absoluteFill`
  // contributed nothing — harmless inside a Modal, which fills by itself, but
  // not here.
  host: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 100 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.surface,
    elevation: 8,
    shadowColor: 'black',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 2, height: 0 },
  },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: 'white' },
  fullName: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.primary,
    marginTop: spacing.md,
  },
  emailText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  stationCard: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stationText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  scroll: { flex: 1, paddingVertical: spacing.xs },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: spacing.md,
  },
  menuItemPressed: { backgroundColor: colors.pressed },
  menuLabel: { fontFamily: fontFamily.medium, fontSize: 15, color: colors.primary },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.xs },
  footer: { borderTopWidth: 1, borderTopColor: colors.borderLight },
  logoutLabel: { color: colors.error },
});
