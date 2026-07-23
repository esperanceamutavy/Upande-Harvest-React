import { useState, useMemo } from 'react';
import { Modal, View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Search } from 'lucide-react-native';
import { colors, radii, spacing } from './ui/theme';
import type { RejectReasonItem } from '../types/reject';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (reason: RejectReasonItem) => void;
  reasons: RejectReasonItem[];
  excludeNames?: string[];  // reasons already added — hide them
}

export function RejectReasonModal({
  visible,
  onClose,
  onSelect,
  reasons,
  excludeNames = [],
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reasons.filter((r) => {
      if (excludeNames.includes(r.name)) return false;
      if (!q) return true;
      return r.reason.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
    });
  }, [reasons, search, excludeNames]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Reject Reason</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={24} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Search size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search reasons..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item);
                setSearch('');
              }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowText}>{item.reason}</Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No matching reasons</Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '600', color: colors.primary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.primary },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  rowPressed: { backgroundColor: colors.pressed },
  rowText: { fontSize: 15, color: colors.primary },
  separator: { height: 1, backgroundColor: colors.borderLight },
  empty: { padding: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 14 },
});
