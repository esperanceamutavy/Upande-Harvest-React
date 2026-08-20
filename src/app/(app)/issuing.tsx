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
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { Button } from '../../components/ui/Button';
import { Card, Notice, type NoticeTone } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Screen } from '../../components/ui/Screen';
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

/** Extract the scanned bucket id. */
function extractBucketId(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      if (o.coldroom_bucket != null) return String(o.coldroom_bucket);
      // LEGACY-QR COMPAT — do NOT remove. Some old coldroom labels are shaped
      // {"<id>":"bucket"}: the bucket id is the KEY whose value is the literal
      // string "bucket". Old printed labels still exist in the coldroom.
      // (Ported from xflora_issue_from_coldstore.dart.)
      for (const [k, v] of Object.entries(o)) {
        if (v === 'bucket') return k;
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export default function IssuingScreen() {
  const ordersQuery = useXfloraReadySaleOrders();
  const fetchItems = useXfloraReadySaleOrderItems();
  const issueMut = useIssueFromColdstore();
  const allocationMut = useBucketIssueInfo();
  const noOrderMut = useIssueBucketNoOrder();

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

  function warn(text: string) {
    setFeedback({ tone: 'warn', text });
    playError();
    haptics.medium();
  }

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

  /**
   * A scanned bucket that is not on the selected order's packing list. Ask the
   * server what its allocation really is:
   *   not_allocated  → offer the no-order fallback, behind a confirmation
   *   already_issued → nothing to do
   *   ok             → it belongs to a DIFFERENT order; say which, and do not
   *                    offer to drop the link. Re-selecting that order is the
   *                    correct move, and it keeps the bucket→order association.
   */
  async function resolveUnallocated(bucketId: string) {
    setPendingUnallocated(null);
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
        return;
      }

      if (info.status === 'already_issued') {
        setFeedback({ tone: 'warn', text: info.message });
        playError();
        return;
      }

      const where = info.salesOrder ?? info.oplName ?? 'another order';
      setFeedback({
        tone: 'danger',
        text: `${bucketId} is allocated to ${where}, not ${selectedOrder}. Select that order to issue it.`,
      });
      playError();
    } catch (e) {
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
      playError();
    } finally {
      resetBucket();
    }
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
      setItems(result);
      bucketRef.current?.focus();
    } catch (e) {
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
      playError();
    }
  }

  async function handleScan(raw: string) {
    if (isProcessingRef.current) return;
    if (!selectedOrder) {
      warn('Please select an Order first.');
      resetBucket();
      return;
    }

    const bucketId = extractBucketId(raw);
    if (!bucketId) {
      setFeedback({ tone: 'danger', text: 'Could not extract a valid bucket ID from the scan.' });
      playError();
      resetBucket();
      return;
    }

    const matched = items.find((it) => it.bucket.toLowerCase() === bucketId.toLowerCase());
    if (!matched || !matched.bucket) {
      // Not in THIS order's packing list — but that is not the same as having no
      // allocation at all, and only the latter makes the no-order fallback safe.
      // Ask the server which it is before offering anything destructive.
      await resolveUnallocated(bucketId);
      return;
    }
    if (!matched.saleOrderItem) {
      setFeedback({ tone: 'danger', text: `Sale Order Item not found for bucket ${bucketId}.` });
      playError();
      resetBucket();
      return;
    }
    // Local pre-empt — matched item already known issued; skip the round-trip.
    // Backend 409 remains the safety net for anything local state doesn't know.
    if (matched.isIssued) {
      setFeedback({ tone: 'warn', text: `Bucket ${bucketId} is already issued.` });
      playError();
      resetBucket();
      return;
    }

    isProcessingRef.current = true;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await issueMut.mutateAsync({
        bucketId,
        saleOrderItem: matched.saleOrderItem,
        oplName: matched.oplName,
      });
      markIssued(matched.bucket);
      playSubmit();
      setFeedback({ tone: 'success', text: res.message });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 409) {
        // Server says it's already issued — authoritative; self-heal the badge.
        markIssued(matched.bucket);
        playError();
        setFeedback({
          tone: 'warn',
          text: (e as { message?: string }).message || 'Already issued to this sale order item.',
        });
      } else {
        playError();
        haptics.medium();
        setFeedback({ tone: 'danger', text: extractFrappeError(e) });
      }
    } finally {
      resetBucket();
    }
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

  const scanEnabled = !!selectedOrder && items.length > 0 && !loading;

  return (
    <Screen title="Issue From Coldstore">
      {/* Order type-ahead */}
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

      {ordersQuery.error ? (
        <Notice tone="danger">
          Failed to load orders. Pull the drawer closed and reopen to retry.
        </Notice>
      ) : null}

      {/* Packing list */}
      {itemsLoading ? (
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

      {/* Bucket scan — only after an order is selected */}
      {selectedOrder ? (
        <Card title="Scan bucket">
          <Field label="Bucket ID">
            <View style={styles.scanRow}>
              <TextInput
                ref={bucketRef}
                style={[styles.input, styles.scanInput, !scanEnabled && styles.inputDisabled]}
                value={bucketInput}
                onChangeText={onChangeBucket}
                autoCapitalize="characters"
                placeholder={loading ? 'Issuing…' : scanEnabled ? 'Scan bucket QR code…' : 'No items to issue'}
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
});
