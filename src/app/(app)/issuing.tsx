import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CircleCheck, QrCode, TriangleAlert } from 'lucide-react-native';

import { useXfloraReadySaleOrders } from '../../features/issuing/useXfloraReadySaleOrders';
import { useXfloraReadySaleOrderItems } from '../../features/issuing/useXfloraReadySaleOrderItems';
import { useIssueFromColdstore } from '../../features/issuing/useIssueFromColdstore';
import { useBucketIssueInfo } from '../../features/issuing/useBucketIssueInfo';
import { useIssueBucketNoOrder } from '../../features/issuing/useIssueBucketNoOrder';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { extractScannedId } from '../../lib/qr';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { Button } from '../../components/ui/Button';
import { Card, Notice, type NoticeTone } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Screen } from '../../components/ui/Screen';
import { Segmented } from '../../components/ui/Segmented';
import { colors, radii, spacing } from '../../components/ui/theme';
import type { XfloraReadySaleOrderItem } from '../../types/xflora';

type FeedbackMsg = { tone: NoticeTone; text: string };

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

// Two ways in, and SCAN-FIRST is the default.
//
//   scan  — scan any bucket with no order selected. getBucketIssueInfo routes
//           it: allocated → issue against the sale_order_item it returns;
//           unallocated → offer the no-order fallback behind a confirm;
//           already issued → warn. This is the normal packhouse case, because
//           a packer holds a bucket, not an order.
//   order — pick an order, load its packing list, work through it. Kept for
//           working an order deliberately; no longer the only way in.
//
// The bucket id is unwrapped with the shared src/lib/qr.ts extractor, which
// also covers the legacy {"<id>":"bucket"} coldroom labels.

type IssueMode = 'scan' | 'order';

const MODE_OPTIONS = [
  { value: 'scan', label: 'Scan bucket' },
  { value: 'order', label: 'By order' },
] as const satisfies readonly { value: IssueMode; label: string }[];

const MAX_LOG_ROWS = 12;

interface IssueLogRow {
  id: string;
  bucketId: string;
  outcome: string;
  detail: string;
  tone: NoticeTone;
  time: string;
}

export default function IssuingScreen() {
  const ordersQuery = useXfloraReadySaleOrders();
  const fetchItems = useXfloraReadySaleOrderItems();
  const issueMut = useIssueFromColdstore();
  const allocationMut = useBucketIssueInfo();
  const noOrderMut = useIssueBucketNoOrder();

  const [mode, setMode] = useState<IssueMode>('scan');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [orderQuery, setOrderQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [items, setItems] = useState<XfloraReadySaleOrderItem[]>([]);
  const [bucketInput, setBucketInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  // Set when a scan turns out to have no allocation anywhere. Holds the bucket
  // id awaiting an explicit confirmation of the no-order fallback.
  const [pendingUnallocated, setPendingUnallocated] = useState<string | null>(null);
  const [log, setLog] = useState<IssueLogRow[]>([]);
  const seqRef = useRef(0);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const bucketRef = useRef<TextInput>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const orders = ordersQuery.data ?? [];
  const itemsLoading = fetchItems.isPending;

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const suggestions = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => o.toLowerCase().includes(q));
  }, [orders, orderQuery]);

  function resetBucket() {
    setLoading(false);
    isProcessingRef.current = false;
    isSettingProgrammaticallyRef.current = true;
    setBucketInput('');
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
    bucketRef.current?.focus();
  }

  /** The explicit, opt-in fallback. Permanently drops the bucket→order link. */
  async function confirmIssueNoOrder(bucketId: string) {
    setPendingUnallocated(null);
    setFeedback(null);
    try {
      const res = await noOrderMut.mutateAsync(bucketId);
      playSubmit();
      const shelf =
        res.removedFromShelf != null ? ` · ${res.removedFromShelf} shelf row(s) cleared` : '';
      setFeedback({ tone: 'success', text: `${res.message}${shelf}` });
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
    } finally {
      resetBucket();
    }
  }

  function addLog(bucketId: string, outcome: string, detail: string, tone: NoticeTone) {
    seqRef.current += 1;
    setLog((prev) =>
      [
        { id: `${seqRef.current}`, bucketId, outcome, detail, tone, time: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, MAX_LOG_ROWS),
    );
  }

  function markIssued(bucket: string) {
    const key = bucket.toLowerCase();
    setItems((prev) =>
      prev.map((it) => (it.bucket.toLowerCase() === key ? { ...it, isIssued: true } : it)),
    );
  }

  async function selectOrder(name: string) {
    setSelectedOrder(name);
    setOrderQuery(name);
    setShowSuggestions(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setItems([]);
    setFeedback(null);
    try {
      const result = await fetchItems.mutateAsync(name);
      setItems(result.items);
      // An empty list is never shown bare: the server always explains itself,
      // and those explanations include real failures ("Error generating packing
      // list: …") that used to render as a silent empty state.
      if (result.notice) {
        setFeedback({ tone: 'warn', text: result.notice });
        playError();
      } else {
        bucketRef.current?.focus();
      }
    } catch (e) {
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
      playError();
    }
  }

  /** POST the issue for a bucket whose sale_order_item is already known. */
  async function issueAgainst(
    bucketId: string,
    saleOrderItem: string,
    oplName: string,
    context: string,
  ) {
    isProcessingRef.current = true;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await issueMut.mutateAsync({ bucketId, saleOrderItem, oplName });
      markIssued(bucketId);
      playSubmit();
      setFeedback({ tone: 'success', text: res.message });
      addLog(bucketId, 'Issued', context, 'success');
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 409) {
        // Server says it's already issued — authoritative; self-heal the badge.
        markIssued(bucketId);
        playError();
        const message =
          (e as { message?: string }).message || 'Already issued to this sale order item.';
        setFeedback({ tone: 'warn', text: message });
        addLog(bucketId, 'Already issued', message, 'warn');
      } else {
        playError();
        haptics.medium();
        const message = extractFrappeError(e);
        setFeedback({ tone: 'danger', text: message });
        addLog(bucketId, 'Failed', message, 'danger');
      }
    } finally {
      resetBucket();
    }
  }

  /**
   * SCAN-FIRST. getBucketIssueInfo is the router for the whole screen — it
   * already returns sale_order_item, opl_name, sales_order, variety and shelf,
   * which is everything needed to issue without the packer picking an order.
   */
  async function resolveAndIssue(bucketId: string) {
    setPendingUnallocated(null);
    isProcessingRef.current = true;
    setLoading(true);
    setFeedback(null);
    try {
      const info = await allocationMut.mutateAsync(bucketId);

      if (info.status === 'not_allocated') {
        setPendingUnallocated(bucketId);
        setFeedback({
          tone: 'warn',
          text: `${bucketId} has no order allocation. Shelving may not have run for it.`,
        });
        playError();
        haptics.medium();
        addLog(bucketId, 'No allocation', 'Awaiting confirmation to issue without an order.', 'warn');
        resetBucket();
        return;
      }

      if (info.status === 'already_issued') {
        setFeedback({ tone: 'warn', text: info.message });
        playError();
        addLog(bucketId, 'Already issued', info.message, 'warn');
        resetBucket();
        return;
      }

      if (!info.saleOrderItem) {
        const text = `${bucketId} is allocated to ${info.oplName ?? 'an order'} but has no sale order item.`;
        setFeedback({ tone: 'danger', text });
        playError();
        addLog(bucketId, 'Unusable', text, 'danger');
        resetBucket();
        return;
      }

      // Allocated. Issue straight against what the lookup returned — no manual
      // order selection needed.
      isProcessingRef.current = false;
      setLoading(false);
      const where = info.salesOrder ?? info.oplName ?? '—';
      await issueAgainst(
        bucketId,
        info.saleOrderItem,
        info.oplName ?? '',
        [info.variety, info.shelf ? `shelf ${info.shelf}` : null, where].filter(Boolean).join(' · '),
      );
    } catch (e) {
      const message = extractFrappeError(e);
      setFeedback({ tone: 'danger', text: message });
      playError();
      addLog(bucketId, 'Lookup failed', message, 'danger');
      resetBucket();
    } finally {
      isProcessingRef.current = false;
      setLoading(false);
    }
  }

  async function handleScan(raw: string) {
    if (isProcessingRef.current) return;

    const bucketId = extractScannedId(raw);
    if (!bucketId) {
      setFeedback({ tone: 'danger', text: 'Could not extract a valid bucket ID from the scan.' });
      playError();
      resetBucket();
      return;
    }

    // In order mode, a bucket already on the loaded packing list is issued from
    // that row: it saves a round-trip and keeps the local already-issued
    // pre-empt. Anything else — including every scan in scan mode — goes to the
    // server to be routed.
    if (mode === 'order' && selectedOrder) {
      const matched = items.find((it) => it.bucket.toLowerCase() === bucketId.toLowerCase());
      if (matched?.bucket && matched.saleOrderItem) {
        if (matched.isIssued) {
          setFeedback({ tone: 'warn', text: `Bucket ${bucketId} is already issued.` });
          playError();
          resetBucket();
          return;
        }
        await issueAgainst(
          bucketId,
          matched.saleOrderItem,
          matched.oplName,
          `${matched.variety} · ${selectedOrder}`,
        );
        return;
      }
    }

    await resolveAndIssue(bucketId);
  }

  function onChangeBucket(text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    setBucketInput(text);
    const trimmed = text.trim();
    if (trimmed.endsWith('}') && isValidJson(trimmed) && !isProcessingRef.current) {
      void handleScan(trimmed);
    }
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    void handleScan(raw);
  }

  // Scan mode needs no order and no loaded list — that is the whole point.
  // Order mode still waits for a list, so a packer is not scanning into nothing.
  const scanEnabled = !loading && (mode === 'scan' || (!!selectedOrder && items.length > 0));

  return (
    <Screen title="Issue From Coldstore">
      <Card title="Mode">
        <Segmented
          value={mode}
          options={MODE_OPTIONS}
          onChange={(next) => {
            setMode(next);
            setFeedback(null);
            setPendingUnallocated(null);
            bucketRef.current?.focus();
          }}
        />
      </Card>

      {/* Order type-ahead — order mode only. Scanning does not need it. */}
      {mode === 'order' ? (
      <Card title="Select order">
        <Field label="Sale Order">
          <View>
            <TextInput
              style={styles.input}
              value={orderQuery}
              onChangeText={(text) => {
                setOrderQuery(text);
                setSelectedOrder(null);
                setItems([]);
                setShowSuggestions(true);
                setFeedback(null);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                hideTimer.current = setTimeout(() => setShowSuggestions(false), 150);
              }}
              placeholder={ordersQuery.isLoading ? 'Loading orders…' : 'Search sale order…'}
              placeholderTextColor={colors.muted}
              editable={!ordersQuery.isLoading && orders.length > 0}
            />
            {showSuggestions && suggestions.length > 0 ? (
              <View style={styles.suggestions}>
                {suggestions.slice(0, 8).map((o) => (
                  <Pressable
                    key={o}
                    onPress={() => void selectOrder(o)}
                    style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
                  >
                    <Text style={styles.suggestionText}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Field>
      </Card>
      ) : null}

      {mode === 'order' && ordersQuery.error ? (
        <Notice tone="danger">
          Failed to load orders. Pull the drawer closed and reopen to retry.
        </Notice>
      ) : null}

      {/* Packing list — order mode only */}
      {mode !== 'order' ? null : itemsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.text} />
          <Text style={styles.hint}>Loading items…</Text>
        </View>
      ) : selectedOrder && items.length === 0 ? (
        <Text style={styles.hint}>No packing items found for {selectedOrder}.</Text>
      ) : items.length > 0 ? (
        <Card title={`Items for ${selectedOrder}`}>
          <View style={styles.list}>
            {items.map((item, idx) => (
              <PackingCard key={`${item.bucket}-${idx}`} item={item} />
            ))}
          </View>
        </Card>
      ) : null}

      {/* Bucket scan. Available immediately in scan mode — that is the point. */}
      {mode === 'scan' || selectedOrder ? (
        <Card title="Scan bucket">
          <Field label="Bucket ID">
            <View style={styles.scanRow}>
              <TextInput
                ref={bucketRef}
                autoFocus={mode === 'scan'}
                style={[styles.input, styles.scanInput, !scanEnabled && styles.inputDisabled]}
                value={bucketInput}
                onChangeText={onChangeBucket}
                autoCapitalize="characters"
                placeholder={
                  loading ? 'Issuing…' : scanEnabled ? 'Scan bucket QR code…' : 'No items to issue'
                }
                placeholderTextColor={colors.muted}
                editable={scanEnabled}
              />
              <Pressable
                style={styles.qrBtn}
                onPress={() => {
                  if (scanEnabled) setScannerVisible(true);
                }}
              >
                <QrCode size={22} color={scanEnabled ? colors.text : colors.muted} />
              </Pressable>
            </View>
          </Field>
        </Card>
      ) : null}

      {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

      {pendingUnallocated ? (
        <Card title="Issue without an order">
          <Notice tone="warn">
            {pendingUnallocated} has no Pick List allocation. Issuing it without an order clears
            its shelf rows and permanently drops the bucket&rsquo;s link to any order. Only do
            this if the bucket really is unallocated — if shelving simply has not run yet,
            allocate it first instead.
          </Notice>
          <View style={styles.confirmRow}>
            <Button
              label="Issue without order"
              loading={noOrderMut.isPending}
              onPress={() => void confirmIssueNoOrder(pendingUnallocated)}
            />
            <Button
              label="Cancel"
              variant="outline"
              onPress={() => {
                setPendingUnallocated(null);
                setFeedback(null);
                bucketRef.current?.focus();
              }}
            />
          </View>
        </Card>
      ) : null}

      {log.length > 0 ? (
        <Card title="This session">
          <View style={styles.log}>
            {log.map((row) => (
              <View key={row.id} style={styles.logRow}>
                <View style={styles.logHead}>
                  <Text
                    style={[
                      styles.logBucket,
                      row.tone === 'danger' && styles.logError,
                      row.tone === 'warn' && styles.logWarn,
                    ]}
                    numberOfLines={1}
                  >
                    {row.bucketId}
                  </Text>
                  <Text style={styles.logTime}>
                    {row.outcome} · {row.time}
                  </Text>
                </View>
                <Text style={styles.logDetail} numberOfLines={2}>
                  {row.detail}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleCameraScan}
        onCancel={() => setScannerVisible(false)}
      />
    </Screen>
  );
}

function PackingCard({ item }: { item: XfloraReadySaleOrderItem }) {
  return (
    <View style={[styles.card, item.isIssued && styles.cardIssued]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, item.isIssued && styles.mutedText]} numberOfLines={1}>
          {item.variety} ({item.stemLength})
        </Text>
        {item.isIssued ? (
          <View style={styles.badge}>
            <CircleCheck size={13} color={colors.success} />
            <Text style={styles.badgeText}>Issued</Text>
          </View>
        ) : null}
      </View>
      <CardRow label="Bucket" value={item.bucket} muted={item.isIssued} />
      <CardRow label="Shelf" value={item.shelf} muted={item.isIssued} />
      <CardRow label="OPL" value={item.oplName} muted={item.isIssued} />
      <CardRow label="Team" value={item.team} muted={item.isIssued} />
      <CardRow label="Stems to issue" value={item.qty} muted={item.isIssued} />
      {item.downgradeTo ? (
        <View style={styles.downgradeRow}>
          <TriangleAlert size={14} color={colors.warning} />
          <Text style={styles.downgradeText}>Downgrade to: {item.downgradeTo}</Text>
        </View>
      ) : null}
    </View>
  );
}

function CardRow({ label, value, muted }: { label: string; value: string; muted: boolean }) {
  return (
    <View style={styles.cardRow}>
      <Text style={styles.cardRowLabel}>{label}</Text>
      <Text style={[styles.cardRowValue, muted && styles.mutedText]} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.primary,
    backgroundColor: colors.surface,
  },
  inputDisabled: { backgroundColor: colors.pressed },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scanInput: { flex: 1 },
  qrBtn: {
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    zIndex: 100,
    elevation: 4,
    shadowColor: 'black',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggestionPressed: { backgroundColor: colors.pressed },
  suggestionText: { fontSize: 14, color: colors.primary },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  list: { gap: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: 4,
  },
  cardIssued: { opacity: 0.55, borderColor: colors.borderLight, backgroundColor: colors.pressed },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.primary },
  mutedText: { color: colors.muted },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success + '1A',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.success },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardRowLabel: { fontSize: 13, color: colors.muted },
  cardRowValue: { fontSize: 13, fontWeight: '500', color: colors.primary, flexShrink: 1, textAlign: 'right' },
  downgradeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  downgradeText: { fontSize: 13, color: colors.warning, fontWeight: '500' },
  confirmRow: { gap: spacing.sm, marginTop: spacing.md },

  log: { gap: spacing.sm },
  logRow: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  logHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  logBucket: { fontSize: 13, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  logTime: { fontSize: 12, color: colors.muted },
  logDetail: { fontSize: 13, color: colors.textSecondary },
  logWarn: { color: colors.warning },
  logError: { color: colors.error },
});
