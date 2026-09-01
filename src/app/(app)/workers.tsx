import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useWorkerStats } from '../../features/workers/useWorkerStats';
import type { FlowRange } from '../../features/greenhouse/dateRange';
import { Card } from '../../components/ui/Card';
import { Screen } from '../../components/ui/Screen';
import { Segmented } from '../../components/ui/Segmented';
import { extractFrappeError } from '../../lib/api';
import { colors, spacing, typography } from '../../components/ui/theme';
import type { WorkerStat } from '../../types/workers';

// Worker activity — who shelved, and how much.
//
// SHELVING LEADS. That is the question this screen is for; receiving, transfer
// and grading follow as context, and only for workers who did them.
//
// The shelving column SUMS EXACTLY TO THE DASHBOARD'S SHELVED TILE. Both use
// MAX(stem_qty) per bucket per day, attributed to whoever shelved it last. That
// is the whole point of showing a total here: a manager can check the parts
// against the whole and have them agree.
//
// A handset cannot carry the web's five-column table, so each worker is a row
// with their shelving figure, and the other operations sit underneath as a
// caption only when they are non-zero.

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
] as const satisfies readonly { value: FlowRange; label: string }[];

const fmt = (n: number) => n.toLocaleString();

/** Receiving / transfer / grading, omitting whatever the worker did not do. */
function otherWork(w: WorkerStat): string | null {
  const parts: string[] = [];
  if (w.receiving) parts.push(`${fmt(w.receiving)} received`);
  if (w.bucketTransfer) parts.push(`${fmt(w.bucketTransfer)} transferred`);
  if (w.grading) parts.push(`${fmt(w.grading)} graded`);
  return parts.length ? parts.join(' · ') : null;
}

export default function WorkersScreen() {
  const [range, setRange] = useState<FlowRange>('today');
  const stats = useWorkerStats(range);

  const all = stats.data ?? [];
  // Server order is by combined total; this screen is about shelving, so the
  // shelvers are ranked by what they shelved.
  const shelvers = all
    .filter((w) => w.shelving > 0)
    .sort((a, b) => b.shelving - a.shelving);
  const others = all.filter((w) => w.shelving === 0 && w.total > 0);
  const shelvedTotal = shelvers.reduce((sum, w) => sum + w.shelving, 0);

  return (
    <Screen
      title="Worker activity"
      loading={stats.isLoading}
      error={stats.error ? extractFrappeError(stats.error) : null}
      onRetry={() => void stats.refetch()}
      onRefresh={async () => {
        await stats.refetch();
      }}
    >
      <Card title="Range">
        <Segmented value={range} options={RANGE_OPTIONS} onChange={setRange} />
      </Card>

      {stats.data ? (
        <Card title="Shelving">
          <View style={styles.totalHead}>
            <Text style={styles.totalLabel}>
              {shelvers.length} {shelvers.length === 1 ? 'worker' : 'workers'}
            </Text>
            <Text style={styles.totalValue}>{fmt(shelvedTotal)} stems</Text>
          </View>

          {shelvers.length ? (
            <View style={styles.rows}>
              {shelvers.map((w) => (
                <View key={w.worker} style={styles.row}>
                  <View style={styles.main}>
                    <Text style={styles.name} numberOfLines={1}>
                      {w.workerName}
                    </Text>
                    {otherWork(w) ? (
                      <Text style={styles.caption} numberOfLines={1}>
                        {otherWork(w)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.value}>{fmt(w.shelving)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>Nobody shelved in this window.</Text>
          )}
        </Card>
      ) : null}

      {/* Everyone else who worked, so the screen is not silently partial. */}
      {others.length ? (
        <Card title={`Other operations (${others.length})`}>
          <View style={styles.rows}>
            {others.map((w) => (
              <View key={w.worker} style={styles.row}>
                <View style={styles.main}>
                  <Text style={styles.name} numberOfLines={1}>
                    {w.workerName}
                  </Text>
                  <Text style={styles.caption} numberOfLines={1}>
                    {otherWork(w) ?? '—'}
                  </Text>
                </View>
                <Text style={styles.valueMuted}>{fmt(w.total)}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {stats.data && all.length === 0 ? (
        <Card title="No activity">
          <Text style={styles.empty}>No worker activity in this window.</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  main: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  caption: { ...typography.caption },
  value: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'right' },
  valueMuted: { fontSize: 15, fontWeight: '600', color: colors.muted, textAlign: 'right' },
  totalHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  totalValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  empty: { ...typography.caption, textAlign: 'center' },
});
