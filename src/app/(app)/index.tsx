import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Menu } from 'lucide-react-native';

import { useAuthStore } from '../../stores/auth';
import { useDashboardStats } from '../../features/dashboard/useDashboardStats';
import { WORKFLOW_ITEMS } from '../../features/navigation/drawerItems';
import { AppDrawer } from '../../components/AppDrawer';
import { Button } from '../../components/ui/Button';
import { StatTile } from '../../components/ui/StatTile';
import { colors, fontFamily, fontSize, radii, spacing } from '../../components/ui/theme';

function formatDate(): string {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function fmt(v: number | null): string {
  return v == null ? '—' : Math.round(v).toLocaleString();
}

export default function Dashboard() {
  const router = useRouter();
  const fullName = useAuthStore((s) => s.fullName);
  const firstName = useMemo(() => (fullName ?? '').split(' ')[0] || 'there', [fullName]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, isLoading, isError, isRefetching, refetch } = useDashboardStats();

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuBtn} hitSlop={8}>
            <Menu size={26} color={colors.primary} />
          </Pressable>
          <View style={styles.greeting}>
            <Text style={styles.headerDate}>{formatDate()}</Text>
            <Text style={styles.headerName}>Hi, {firstName}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : isError ? (
          <View style={styles.stateBox}>
            <Text style={styles.errorText}>Couldn&apos;t load today&apos;s stats.</Text>
            <Button onPress={() => void refetch()}>Retry</Button>
          </View>
        ) : (
          <>
            {/* Stat tiles — Received (hero) + Shelved / Bucket Transfer */}
            <StatTile
              hero
              tone="green"
              label="RECEIVED TODAY"
              value={fmt(data?.receivedStems ?? null)}
              unit="stems"
            />
            <View style={styles.row}>
              <StatTile tone="blue" label="SHELVED" value={fmt(data?.shelvedStems ?? null)} unit="stems" />
              <StatTile tone="stone" label="TRANSFERRED" value={fmt(data?.bucketTransferStems ?? null)} unit="stems" />
            </View>

            {/* Quick actions — data-driven from the drawer's workflow list */}
            <View style={styles.actionsWrap}>
              <Text style={styles.actionsLabel}>QUICK ACTIONS</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.actionsRow}
              >
                {WORKFLOW_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Pressable
                      key={item.route}
                      style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
                      onPress={() => router.push(item.route as never)}
                    >
                      <Icon size={16} color={colors.primary} />
                      <Text style={styles.actionChipLabel}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>

      <AppDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  menuBtn: {
    padding: 8,
    borderRadius: radii.md,
    backgroundColor: colors.pressed,
  },
  greeting: { flex: 1 },
  headerDate: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.muted, marginBottom: 2 },
  headerName: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.primary },

  row: { flexDirection: 'row', gap: spacing.sm },

  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  errorText: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center' },

  actionsWrap: { marginTop: spacing.md },
  actionsLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  actionsRow: { gap: spacing.sm, paddingBottom: 4 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionChipPressed: { backgroundColor: colors.pressed },
  actionChipLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.primary },
});
