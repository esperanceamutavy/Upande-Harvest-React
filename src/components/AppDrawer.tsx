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
import { LogOut, X } from 'lucide-react-native';

import { useAuthStore } from '../stores/auth';
import { useLogout } from '../features/auth/useLogout';
import { useFarm } from '../features/station/useFarm';
import { WORKFLOW_ITEMS, UTILITY_ITEMS, type DrawerItem } from '../features/navigation/drawerItems';
import { colors, radii, spacing } from './ui/theme';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.75, 320);

interface AppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppDrawer({ isOpen, onClose }: AppDrawerProps) {
  const router = useRouter();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const farm = useFarm();
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

  function renderItem(item: DrawerItem) {
    const Icon = item.icon;
    return (
      <Pressable
        key={item.route}
        onPress={() => navigate(item.route)}
        style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
      >
        <Icon size={20} color={colors.primary} />
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
