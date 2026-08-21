import { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

// Rendered ONCE, by the (app) layout — see drawerContext.
//
// MODAL IS REQUIRED, not incidental. An in-tree absolutely-positioned overlay
// was tried and REVERTED: it lost z-order to react-native-screens' native
// screen containers, so the drawer opened but was painted behind the screen on
// every route. Sibling order and zIndex/elevation do not beat a native view.
// Modal's native window is the only thing that reliably sits above them.
//
// `statusBarTranslucent` also makes the dim layer cover the status bar, which
// the in-tree overlay could not guarantee under edge-to-edge.
//
// The slide animation stays hand-rolled (`animationType="none"`), so `visible`
// is driven by `mounted` rather than `isOpen` — see below.
export function AppDrawer({ isOpen, onClose }: AppDrawerProps) {
  const router = useRouter();
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

  console.log('[drawer] 5. AppDrawer render, isOpen =', isOpen, 'mounted =', mounted);

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

  // `visible` is driven by `mounted`, NOT `isOpen`, so the Modal stays up for
  // the 200ms slide-out before hiding. Binding it to `isOpen` would unmount
  // instantly and the close animation would never be seen.
  //
  // On the mount gate: it cannot keep the subtree alive between opens, because
  // RN's Modal returns null from its own render when hidden — the children
  // unmount either way. So the gate now earns its place purely by preserving
  // the exit animation. The explicit `if (!mounted) return null` is gone as
  // redundant; `visible` does that job with one mechanism instead of two.
  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dim overlay — tap to close */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Drawer panel */}
      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        {/* Header. Back to a constant top pad: `statusBarTranslucent` puts the
            Modal under the status bar predictably, so the inset-derived value
            the in-tree overlay needed is no longer required. */}
        <View style={styles.header}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Fills the (app) layout and sits above <Tabs> by sibling order. box-none so
  // only the dim layer and the panel take touches.
  // Written out rather than spread: `StyleSheet.absoluteFill` is a registered
  // style ID, not an object, so `...StyleSheet.absoluteFill` contributed
  // nothing. Harmless here (the Modal fills by itself) but wrong, and it was a
  // real bug during the in-tree overlay attempt. Kept explicit.
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
    paddingTop: 48,
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
