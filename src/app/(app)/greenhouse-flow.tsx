import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useGreenhouseFlow, extractFlowError } from '../../features/greenhouse/useGreenhouseFlow';
import { formatFlow, formatGap, type GapTone } from '../../features/greenhouse/gap';
import type { FlowRange } from '../../features/greenhouse/dateRange';
import { Card } from '../../components/ui/Card';
import { Screen } from '../../components/ui/Screen';
import { Segmented } from '../../components/ui/Segmented';
import { colors, spacing, typography } from '../../components/ui/theme';
import type { GreenhouseFlowRow, GreenhouseFlowTotals } from '../../types/greenhouse';

// Greenhouse flow — where stems are stuck between receiving and the shelf.
//
// THE GAP IS THE POINT, not the totals. Each row leads with the greenhouse and
// its gap; the three stage figures sit underneath as context.
//
// A list, not a bento: live data returns 32 greenhouses, which is a screen of
// its own rather than a dashboard tile. The dashboard carries only the single
// total-gap number, tapping through to here.
//
// BUCKET COUNTS ARE NOT SHOWN PER STAGE. A bucket can move more than once, so a
// greenhouse legitimately reports 21 received buckets against 38 transferred;
// printing those next to each other invites a reader to see a discrepancy that
// does not exist. Stems are the comparable figure, and the only one on the row.

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
] as const satisfies readonly { value: FlowRange; label: string }[];

/** 'short' is the headline. 'over' is muted — normal, never an error. */
const GAP_COLOUR: Record<GapTone, string> = {
  short: colors.text,
  over: colors.muted,
  level: colors.success,
};

export default function GreenhouseFlowScreen() {
  const [range, setRange] = useState<FlowRange>('today');
  const flow = useGreenhouseFlow(range);

  const rows = flow.data?.greenhouses ?? [];

  return (
    <Screen
      title="Greenhouse flow"
      loading={flow.isLoading}
      error={flow.error ? extractFlowError(flow.error) : null}
      onRetry={() => void flow.refetch()}
      onRefresh={async () => {
        await flow.refetch();
      }}
    >
      <Card title="Range">
        <Segmented value={range} options={RANGE_OPTIONS} onChange={setRange} />
      </Card>

      {flow.data ? <TotalsRow totals={flow.data.totals} /> : null}

      {flow.data && rows.length === 0 ? (
        <Card title="No movement">
          <Text style={styles.empty}>
            Nothing received, transferred or shelved in this window.
          </Text>
        </Card>
      ) : null}

      {rows.length ? (
        <Card title={`Greenhouses (${rows.length})`}>
          <View style={styles.rows}>
            {rows.map((row) => (
              <FlowRowView key={row.greenhouse} row={row} />
            ))}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

function TotalsRow({ totals }: { totals: GreenhouseFlowTotals }) {
  const gap = formatGap(totals.gapStems);
  return (
    <Card title="All greenhouses">
      <View style={styles.totalsHead}>
        <Text style={styles.totalsLabel}>Not yet shelved</Text>
        <Text style={[styles.totalsGap, { color: GAP_COLOUR[gap.tone] }]}>{gap.text}</Text>
      </View>
      <Text style={styles.flowLine}>
        {formatFlow(totals.receivedStems, totals.transferredStems, totals.shelvedStems)}
      </Text>
    </Card>
  );
}

function FlowRowView({ row }: { row: GreenhouseFlowRow }) {
  const gap = formatGap(row.gapStems);
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.greenhouse} numberOfLines={1}>
          {row.greenhouse}
        </Text>
        <Text style={[styles.gap, { color: GAP_COLOUR[gap.tone] }]}>{gap.text}</Text>
      </View>
      <Text style={styles.flowLine}>
        {formatFlow(row.receivedStems, row.transferredStems, row.shelvedStems)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.sm },
  row: {
    gap: 2,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  greenhouse: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  // Right-aligned so the gaps form a readable column down the list.
  gap: { fontSize: 15, fontWeight: '700', textAlign: 'right' },
  flowLine: { ...typography.caption },
  totalsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  totalsLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  totalsGap: { fontSize: 22, fontWeight: '700', textAlign: 'right' },
  empty: { ...typography.caption, textAlign: 'center' },
});
