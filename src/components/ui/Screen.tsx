// Screen — the single wrapper that owns page chrome.
//
// Port of packhouse's src/core/ui/Screen.tsx (mark-judah/upande-packhouse),
// adapted per RESTYLE_PLAN.md Phase 2:
//   - Ionicons `menu-outline` → lucide `Menu` (hard constraint 1)
//   - packhouse's SideMenu → our existing AppDrawer, now mounted ONCE by
//     (app)/_layout.tsx; this component only calls openDrawer() on the context
//   - no useTenant() / instanceUrl (hard constraints 4 and 5)
//
// DIVERGENCE FROM THE REFERENCE: packhouse's Screen has no back prop, because
// packhouse has no pushed routes — every destination is a drawer or tab target.
// We do have pushed routes, so `onBack` swaps the hamburger for a ChevronLeft
// in the same leading slot. Tab destinations stay hamburger-only. See
// RESTYLE_PLAN.md §5.

import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Menu } from 'lucide-react-native';

import { useDrawer } from '../../features/navigation/drawerContext';
import { Button } from './Button';
import { colors, fontFamily, fontSize, spacing, typography } from './theme';

interface ScreenProps {
  title?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => Promise<void> | void;
  /**
   * Pushed routes only. Replaces the hamburger with a back chevron in the same
   * leading slot, so the drawer is unreachable from this screen. Tab
   * destinations omit this.
   */
  onBack?: () => void;
  /** Hides the hamburger and the drawer entirely. The title stays centred. */
  hideMenu?: boolean;
  /** When false the body is a plain flex View instead of a ScrollView. */
  scroll?: boolean;
  /** When false the body gets no padding — for full-bleed content. */
  contentPadded?: boolean;
  children: ReactNode;
  /** Sticky action area pinned above the tab bar. */
  footer?: ReactNode;
}

export function Screen({
  title,
  loading,
  error,
  onRetry,
  onRefresh,
  onBack,
  hideMenu,
  scroll = true,
  contentPadded = true,
  children,
  footer,
}: ScreenProps) {
  const [refreshing, setRefreshing] = useState(false);

  // The drawer is a single instance mounted by (app)/_layout.tsx; this screen
  // only asks for it to open. It used to own `menuOpen` and render its own
  // AppDrawer, which meant one instance per screen and a cold mount per open.
  const { openDrawer } = useDrawer();

  // A back chevron and a hamburger share one leading slot, so `onBack` wins.
  const showMenu = !hideMenu && !onBack;

  const handleRefresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;

  let body: ReactNode;
  if (loading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  } else if (error) {
    body = (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        {onRetry ? (
          <Button onPress={onRetry} style={styles.retry}>
            Retry
          </Button>
        ) : null}
      </View>
    );
  } else if (scroll) {
    body = (
      <ScrollView
        contentContainerStyle={contentPadded ? styles.scrollContent : undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          handleRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.text}
              colors={[colors.text]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  } else {
    body = <View style={[styles.flex, contentPadded && styles.flexContent]}>{children}</View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {title ? (
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={10}
              style={styles.menuBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          ) : showMenu ? (
            <Pressable
              onPress={openDrawer}
              hitSlop={10}
              style={styles.menuBtn}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Menu size={24} color={colors.text} />
            </Pressable>
          ) : (
            <View style={styles.menuBtn} />
          )}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {/* Symmetric spacer — keeps the title optically centred */}
          <View style={styles.menuBtn} />
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {body}
      </KeyboardAvoidingView>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgMuted },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuBtn: { width: 32, alignItems: 'center', justifyContent: 'center', padding: 4 },
  title: {
    ...typography.title,
    flex: 1,
    textAlign: 'center',
  },

  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  flexContent: { padding: spacing.lg },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.error },
  errorMsg: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retry: { marginTop: spacing.lg, alignSelf: 'stretch' },

  // No top hairline here on purpose. This footer sits directly on top of the
  // bottom tab bar, which draws its own hairline top border — two stacked white
  // bars each with a rule reads as a double bar. The footer separates itself
  // from the scrolling content with an upward shadow instead, leaving the tab
  // bar's rule as the only line in the region. See RESTYLE_PLAN.md Phase 2.
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
});
