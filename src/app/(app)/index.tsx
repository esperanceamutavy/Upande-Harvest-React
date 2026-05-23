import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Adapt, Button, Select, Sheet, Text, XStack, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, ChevronDown, Menu, X } from 'lucide-react-native';

import { useAuthStore } from '../../stores/auth';
import { useStockEntries } from '../../features/stock/useStockEntries';
import { useStockEntryTypes } from '../../features/stock/useStockEntryTypes';
import { AppDrawer } from '../../components/AppDrawer';
import type { StockEntry } from '../../types/stock';

const PRIMARY = '#44433e';

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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('All');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState<'from' | 'to' | null>(null);

  const { data: entries = [], isFetching, isLoading, error, refetch } = useStockEntries();
  const { data: entryTypes = [] } = useStockEntryTypes();

  const typeOptions = useMemo(() => ['All', ...entryTypes], [entryTypes]);

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
        onPress={() => router.push(`/kikwetu/stock-entry/${item.name}`)}
        style={styles.row}
      >
        <YStack flex={1} gap={2}>
          <XStack gap="$2" alignItems="center">
            <Text fontSize={13}>{item.posting_date}</Text>
            <Text
              fontSize={12}
              color={item.docstatus === 1 ? '$success' : '$red10'}
            >
              {item.docstatus === 1 ? 'Submitted' : 'Draft'}
            </Text>
          </XStack>
          <Text color="$primary" fontSize={14}>{item.name}</Text>
          <Text color="$primary" fontSize={13} fontWeight="bold">
            {item.stock_entry_type?.toUpperCase() ?? ''}
          </Text>
        </YStack>
        <Text fontSize={17} fontWeight="bold">
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
      <AppDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Header */}
      <XStack paddingHorizontal="$3" paddingVertical="$2" alignItems="center" gap="$2">
        <Pressable onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Menu size={28} color={PRIMARY} />
        </Pressable>
        <YStack flex={1}>
          <Text fontSize={22} fontWeight="600" color="$primary">{getGreeting()}</Text>
          <Text fontSize={16} fontWeight="bold" color="$primary">{fullName || 'User'}</Text>
        </YStack>
      </XStack>

      {/* Filter bar */}
      <XStack paddingHorizontal="$3" paddingBottom="$2" alignItems="center" gap="$2">
        <Text fontWeight="600" fontSize={13} flexShrink={0}>Type:</Text>

        <Select value={selectedType} onValueChange={setSelectedType}>
          <Select.Trigger flex={1} iconAfter={<ChevronDown size={14} color={PRIMARY} />}>
            <Select.Value />
          </Select.Trigger>

          <Adapt when="sm" platform="touch">
            <Sheet dismissOnSnapToBottom snapPoints={[40]}>
              <Sheet.Frame padding="$4">
                <Sheet.ScrollView>
                  <Adapt.Contents />
                </Sheet.ScrollView>
              </Sheet.Frame>
              <Sheet.Overlay />
            </Sheet>
          </Adapt>

          <Select.Content>
            <Select.Viewport>
              {typeOptions.map((type, i) => (
                <Select.Item key={type} index={i} value={type}>
                  <Select.ItemText>{type}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select>

        <Pressable onPress={() => setShowPicker('from')} style={styles.dateBtn}>
          <Calendar size={14} color={PRIMARY} />
          <Text fontSize={12} marginLeft={4} color="$primary">
            {fromDate ? fmtDate(fromDate) : 'From'}
          </Text>
        </Pressable>

        <Pressable onPress={() => setShowPicker('to')} style={styles.dateBtn}>
          <Calendar size={14} color={PRIMARY} />
          <Text fontSize={12} marginLeft={4} color="$primary">
            {toDate ? fmtDate(toDate) : 'To'}
          </Text>
        </Pressable>

        {(fromDate || toDate) && (
          <Pressable onPress={clearDateFilter} hitSlop={8}>
            <X size={20} color="red" />
          </Pressable>
        )}
      </XStack>

      {/* Active date range label */}
      {fromDate && toDate && (
        <Text paddingHorizontal="$3" fontSize={13} color="$accent" paddingBottom="$1">
          {fmtDate(fromDate)} → {fmtDate(toDate)}
        </Text>
      )}

      <Text paddingHorizontal="$3" paddingBottom="$2" fontSize={18}>
        Stock entries
      </Text>

      {error ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3" padding="$4">
          <Text color="$red10" fontSize={14} textAlign="center">
            {(error as { message?: string }).message ?? 'Failed to load entries'}
          </Text>
          <Button onPress={() => void refetch()} size="$3" backgroundColor="$accent" color="white">
            Retry
          </Button>
        </YStack>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          contentContainerStyle={filteredEntries.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <YStack alignItems="center" gap="$2" padding="$4">
              <Text color="$accent" fontSize={14}>
                {isLoading ? 'Loading…' : 'No entries available'}
              </Text>
            </YStack>
          }
          ItemSeparatorComponent={() => <YStack style={styles.separator} />}
          style={styles.list}
        />
      )}

      {showPicker != null && (
        <DateTimePicker
          value={(showPicker === 'from' ? fromDate : toDate) ?? new Date()}
          mode="date"
          onChange={(event, date) => {
            setShowPicker(null);
            if (event.type === 'dismissed' || !date) return;
            if (showPicker === 'from') setFromDate(date);
            else setToDate(date);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F4F6' },
  iconBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(68,67,62,0.1)',
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(68,67,62,0.25)',
  },
  list: { flex: 1, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  separator: { height: 1, backgroundColor: 'rgba(68,67,62,0.15)' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
