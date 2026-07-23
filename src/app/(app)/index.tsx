import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, Menu, X } from 'lucide-react-native';

import { useAuthStore } from '../../stores/auth';
import { useStockEntries } from '../../features/stock/useStockEntries';
import { useStockEntryTypes } from '../../features/stock/useStockEntryTypes';
import { AppDrawer } from '../../components/AppDrawer';
import type { StockEntry } from '../../types/stock';
import { Button } from '../../components/ui/Button';
import { Picker } from '../../components/ui/Picker';
import { colors, radii, spacing, typography } from '../../components/ui/theme';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Dashboard() {
  const router = useRouter();
  const fullName = useAuthStore((s) => s.fullName);

  const firstName = useMemo(
    () => (fullName ?? '').split(' ')[0] || 'User',
    [fullName],
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('All');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState<'from' | 'to' | null>(null);

  const { data: entries = [], isFetching, isLoading, error, refetch } = useStockEntries();
  const { data: entryTypes = [] } = useStockEntryTypes();

  const typeOptions = useMemo(() => ['All', ...entryTypes], [entryTypes]);
  const pickerItems = useMemo(
    () => typeOptions.map((t) => ({ label: t, value: t })),
    [typeOptions],
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const typeOk = selectedType === 'All' || e.stock_entry_type === selectedType;
      if (!typeOk) return false;
      if (fromDate || toDate) {
        const d = new Date(e.posting_date + 'T00:00:00');
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    });
  }, [entries, selectedType, fromDate, toDate]);

  const clearDateFilter = useCallback(() => {
    setFromDate(null);
    setToDate(null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: StockEntry }) => (
      <Pressable
        onPress={() => router.push(`/stock-entry/${item.name}`)}
        style={styles.card}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.entryType}>{item.stock_entry_type?.toUpperCase() ?? ''}</Text>
          <Text style={styles.entryName}>{item.name}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaDate}>{item.posting_date}</Text>
            <Text
              style={[
                styles.metaStatus,
                item.docstatus === 1
                  ? styles.submitted
                  : item.docstatus === 2
                    ? styles.cancelled
                    : styles.draft,
              ]}
            >
              {item.docstatus === 1 ? 'Submitted' : item.docstatus === 2 ? 'Cancelled' : 'Draft'}
            </Text>
          </View>
        </View>
        <Text style={styles.amount}>
          {item.total_amount != null
            ? `${item.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /-`
            : '—'}
        </Text>
      </Pressable>
    ),
    [router],
  );

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuBtn}>
          <Menu size={28} color={colors.primary} />
        </Pressable>
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>{getGreeting()}</Text>
          <Text style={styles.greetingName}>{firstName}</Text>
        </View>
      </View>

      {/* Filter bar */}
      <View style={styles.filterBar}>
        <Text style={styles.filterLabel}>Type:</Text>
        <View style={styles.typePicker}>
          <Picker
            value={selectedType}
            onValueChange={setSelectedType}
            placeholder="All"
            items={pickerItems}
          />
        </View>

        <Pressable onPress={() => setShowPicker('from')} style={styles.dateBtn}>
          <Calendar size={14} color={colors.primary} />
          <Text style={styles.dateBtnText}>{fromDate ? fmtDate(fromDate) : 'From'}</Text>
        </Pressable>

        <Pressable onPress={() => setShowPicker('to')} style={styles.dateBtn}>
          <Calendar size={14} color={colors.primary} />
          <Text style={styles.dateBtnText}>{toDate ? fmtDate(toDate) : 'To'}</Text>
        </Pressable>

        {(fromDate || toDate) ? (
          <Pressable onPress={clearDateFilter} hitSlop={8}>
            <X size={20} color={colors.error} />
          </Pressable>
        ) : null}
      </View>

      {/* Active date range label */}
      {fromDate && toDate ? (
        <Text style={styles.dateRangeLabel}>{fmtDate(fromDate)} → {fmtDate(toDate)}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>Stock entries</Text>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {(error as { message?: string }).message ?? 'Failed to load entries'}
          </Text>
          <Button onPress={() => void refetch()}>Retry</Button>
        </View>
      ) : isLoading && entries.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          contentContainerStyle={
            filteredEntries.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.emptyView}>
              <Text style={styles.emptyText}>No entries available.</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          style={styles.list}
        />
      )}

      {showPicker != null ? (
        <DateTimePicker
          value={(showPicker === 'from' ? fromDate : toDate) ?? new Date()}
          mode="date"
          onChange={(event, date) => {
            setShowPicker(null);
            if (event.type === 'dismissed' || !date) return;
            if (showPicker === 'from') {
              const normalized = new Date(date);
              normalized.setHours(0, 0, 0, 0);
              setFromDate(normalized);
            } else {
              const normalized = new Date(date);
              normalized.setHours(23, 59, 59, 999);
              setToDate(normalized);
            }
          }}
        />
      ) : null}

      <AppDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  menuBtn: {
    padding: 8,
    borderRadius: radii.md,
    backgroundColor: colors.pressed,
  },
  greeting: { flex: 1 },
  greetingText: { fontSize: 16, fontWeight: '400', color: colors.primary },
  greetingName: { fontSize: 22, fontWeight: '600', color: colors.primary },
  // filter bar
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterLabel: { ...typography.label, flexShrink: 0 },
  typePicker: { flex: 1 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dateBtnText: { fontSize: 12, color: colors.primary },
  dateRangeLabel: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    fontSize: 13,
    color: colors.accent,
  },
  sectionTitle: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    fontSize: 18,
    color: colors.primary,
  },
  // states
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: { fontSize: 14, color: colors.error, textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // list
  list: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  listContent: { paddingBottom: spacing.xxl },
  emptyContainer: { flex: 1 },
  emptyView: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyText: { ...typography.hint },
  // card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  cardLeft: { flex: 1, gap: 2 },
  entryType: { fontSize: 13, fontWeight: 'bold', color: colors.primary },
  entryName: { fontSize: 14, color: colors.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaDate: { fontSize: 13, color: colors.primary },
  metaStatus: { fontSize: 12 },
  submitted: { color: colors.success },
  cancelled: { color: colors.muted },
  draft: { color: colors.error },
  amount: { fontSize: 17, fontWeight: 'bold', color: colors.primary },
  separator: { height: 1, backgroundColor: colors.borderLight },
});
