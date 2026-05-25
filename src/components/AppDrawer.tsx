import { useEffect, useRef, useState } from 'react';
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
import {
  Box,
  Hexagon,
  LogOut,
  Monitor,
  PackagePlus,
  Scissors,
  Settings,
  Trash2,
  Truck,
  X,
  XCircle,
} from 'lucide-react-native';

import { useAuthStore } from '../stores/auth';
import { useLogout } from '../features/auth/useLogout';
import { useStation } from '../features/station/useStation';
import { colors, radii, spacing } from './ui/theme';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.75, 320);

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  route: string;
}

const KIKWETU_ITEMS: MenuItem[] = [
  { label: 'Harvesting', icon: <Scissors size={20} color={colors.primary} />, route: '/kikwetu/harvesting' },
  { label: 'Receiving',  icon: <PackagePlus size={20} color={colors.primary} />, route: '/kikwetu/receiving' },
  { label: 'Grading',   icon: <Hexagon size={20} color={colors.primary} />, route: '/kikwetu/grading' },
  { label: 'Packing',   icon: <Box size={20} color={colors.primary} />, route: '/kikwetu/packing' },
  { label: 'Dispatch',  icon: <Truck size={20} color={colors.primary} />, route: '/kikwetu/dispatch' },
  { label: 'Discards',  icon: <Trash2 size={20} color={colors.primary} />, route: '/kikwetu/discards' },
  { label: 'Rejects',   icon: <XCircle size={20} color={colors.primary} />, route: '/kikwetu/rejects' },
];

const UTILITY_ITEMS: MenuItem[] = [
  { label: 'Configure Farm', icon: <Settings size={20} color={colors.primary} />, route: '/configure' },
  { label: 'View ERP Desk',  icon: <Monitor size={20} color={colors.primary} />, route: '/erp-desk' },
];

interface AppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppDrawer({ isOpen, onClose }: AppDrawerProps) {
  const router = useRouter();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const station = useStation();
  const { logout } = useLogout();

  const [modalVisible, setModalVisible] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    if (isOpen) {
      setModalVisible(true);
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
      }).start(() => setModalVisible(false));
    }
  }, [isOpen]);

  function navigate(route: string) {
    onClose();
    router.push(route as never);
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

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Dim overlay — tap to close */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Drawer panel */}
      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>
          <Text style={styles.fullName}>{fullName || 'User'}</Text>
          {email ? <Text style={styles.emailText}>{email}</Text> : null}
          <View style={styles.stationCard}>
            <Text style={styles.stationText}>
              {station
                ? `${station.farmName} Farm · ${station.warehouseName}`
                : 'No station configured'}
            </Text>
          </View>
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
              <Text style={styles.menuLabel}>{item.label}</Text>
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
              <Text style={styles.menuLabel}>{item.label}</Text>
            </Pressable>
          ))}
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
  overlay: {
    ...StyleSheet.absoluteFill,
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
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: 48,
    paddingBottom: spacing.lg,
    borderBottomRightRadius: radii.lg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  fullName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginTop: spacing.md,
  },
  emailText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  stationCard: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stationText: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  scroll: { flex: 1, paddingVertical: spacing.xs },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: spacing.md,
  },
  menuItemPressed: { backgroundColor: colors.pressed },
  menuLabel: { fontSize: 15, fontWeight: '600', color: colors.primary },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.xs },
  footer: { borderTopWidth: 1, borderTopColor: colors.borderLight },
  logoutLabel: { color: colors.error },
});
