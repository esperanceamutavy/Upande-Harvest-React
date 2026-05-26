import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { QrCode } from 'lucide-react-native';

import { useStation } from '../../../features/station/useStation';
import { useFetchPickListWithFarmPackList } from '../../../features/packing/useFetchPickListWithFarmPackList';
import { useCreateOrUpdateFarmPackList } from '../../../features/packing/useCreateOrUpdateFarmPackList';
import { useFetchStockEntryByBunch } from '../../../features/discards/useFetchStockEntryByBunch';
import { playSubmit, playError } from '../../../lib/audio';
import { haptics } from '../../../lib/haptics';
import { extractFrappeError } from '../../../lib/api';
import { BarcodeScannerOverlay } from '../../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../../components/ui/AppBar';
import { Pill } from '../../../components/ui/Pill';
import { colors, radii, spacing } from '../../../components/ui/theme';
import type {
  OrderPickList,
  PackListItemPayload,
  PickListWithFarmPackListResponse,
  ReadyToPackItem,
} from '../../../types/packing';

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };

function makeKey(variety: string, uom: string, stemLength: string): string {
  return `${variety}|${uom}|${stemLength}`;
}

// Build tally of already-packed bunches keyed by compound key
function buildPackedTally(result: PickListWithFarmPackListResponse): Record<string, number> {
  const tally: Record<string, number> = {};
  const fpl = result.farm_pack_lists[0];
  if (!fpl) return tally;
  for (const pickItem of result.order_pick_list.locations) {
    for (const packed of fpl.pack_list_item) {
      if (
        packed.item_code === pickItem.item_code &&
        packed.bunch_uom === pickItem.uom &&
        packed.stem_length === pickItem.custom_stem_length
      ) {
        const key = makeKey(pickItem.item_code, pickItem.uom, pickItem.custom_stem_length);
        tally[key] = (tally[key] ?? 0) + 1;
      }
    }
  }
  return tally;
}

export default function PackingScreen() {
  const router = useRouter();
  const station = useStation();
  const fetchOpl = useFetchPickListWithFarmPackList();
  const fetchByBunch = useFetchStockEntryByBunch();
  const submitPack = useCreateOrUpdateFarmPackList();

  const [opl, setOpl] = useState<OrderPickList | null>(null);
  const [oplDisplayUrl, setOplDisplayUrl] = useState<string>('');
  const [packedBunchesTally, setPackedBunchesTally] = useState<Record<string, number>>({});
  const [scannedBunchesTally, setScannedBunchesTally] = useState<Record<string, number>>({});
  const [scannedBunchIds, setScannedBunchIds] = useState<string[]>([]);
  const [readyToPack, setReadyToPack] = useState<ReadyToPackItem[]>([]);
  const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);
  const [oplScannerVisible, setOplScannerVisible] = useState(false);
  const [bunchScannerVisible, setBunchScannerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);

  useEffect(() => {
    if (!station) {
      router.replace('/configure');
    }
  }, [station, router]);

  // Clear lastScannedKey highlight after 2s
  useEffect(() => {
    if (!lastScannedKey) return;
    const t = setTimeout(() => setLastScannedKey(null), 2000);
    return () => clearTimeout(t);
  }, [lastScannedKey]);

  if (!station) return null;

  function warn(text: string) {
    playError();
    haptics.medium();
    setFeedback({ type: 'warning', text });
  }

  async function handleOplScan(raw: string) {
    setOplScannerVisible(false);
    if (!raw.includes('order-pick-list')) {
      warn('Please scan a valid order picklist QR code');
      return;
    }

    let oplId: string | null = null;
    try {
      const url = new URL(raw);
      const segments = url.pathname.split('/').filter(Boolean);
      oplId = segments[segments.length - 1] ?? null;
    } catch {
      warn('Please scan a valid order picklist QR code');
      return;
    }
    if (!oplId) {
      warn('Please scan a valid order picklist QR code');
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const result = await fetchOpl.mutateAsync(oplId);
      if (result.order_pick_list.docstatus === 0) {
        warn('This Order Pick List is cancelled. Request the updated Order Pick List');
        return;
      }
      setOpl(result.order_pick_list);
      setOplDisplayUrl(raw);
      setPackedBunchesTally(buildPackedTally(result));
      setScannedBunchesTally({});
      setScannedBunchIds([]);
      setReadyToPack([]);
      setLastScannedKey(null);
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({
        type: 'error',
        text: `Failed to fetch order picklist: ${extractFrappeError(e)}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBunchScan(raw: string) {
    setBunchScannerVisible(false);

    let bunchId: string | null = null;
    let variety: string | null = null;
    let bunchSize: string | null = null;
    let stemLength: string | null = null;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>;
        bunchId = typeof p.bunch_id === 'string' ? p.bunch_id : null;
        variety = typeof p.variety === 'string' ? p.variety : null;
        bunchSize = typeof p.bunch_size === 'string' ? p.bunch_size : null;
        stemLength = typeof p.stem_length === 'string' ? p.stem_length : null;
      }
    } catch {
      // not JSON
    }

    if (!bunchId) {
      warn('Invalid bunch QR code');
      return;
    }
    if (!opl) {
      warn('Please scan the picklist first');
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const entries = await fetchByBunch.mutateAsync({ bunchId, action: 'packing' });

      if (entries.length === 0) {
        warn(
          `${bunchId} has not been graded in the system. Perform the grading scan on it to enable packing`,
        );
        return;
      }
      if (entries.some((e) => e.stock_entry_type === 'Discard')) {
        warn(`${bunchId} cannot be packed (already discarded)`);
        return;
      }
      if (entries.some((e) => e.custom_scanned_packing === 1)) {
        warn(`${bunchId} has already been packed`);
        return;
      }
      if (scannedBunchIds.includes(bunchId)) {
        warn(`${bunchId} has already been scanned`);
        return;
      }

      if (!variety || !bunchSize || !stemLength) {
        warn('Bunch QR missing variety/bunch_size/stem_length');
        return;
      }

      const matchingByVariety = opl.locations.filter((loc) => loc.item_code === variety);
      if (matchingByVariety.length === 0) {
        warn(`The scanned variety (${variety}) is not in the pick list`);
        return;
      }
      const matchingBySize = matchingByVariety.filter((loc) => loc.uom === bunchSize);
      if (matchingBySize.length === 0) {
        warn(`The scanned bunch size (${bunchSize}) is not valid for variety ${variety}`);
        return;
      }
      const matchingPickItem = matchingBySize.find(
        (loc) => loc.custom_stem_length === stemLength,
      );
      if (!matchingPickItem) {
        warn(
          `The scanned stem length (${stemLength}) does not match the picklist for variety ${variety} bunch size ${bunchSize}`,
        );
        return;
      }

      const compoundKey = makeKey(variety, bunchSize, stemLength);

      const packed = packedBunchesTally[compoundKey] ?? 0;
      if (packed >= matchingPickItem.qty) {
        warn(`${variety} of length ${stemLength} has already been packed to completion`);
        return;
      }
      const scanned = scannedBunchesTally[compoundKey] ?? 0;
      if (scanned >= matchingPickItem.qty) {
        warn(`${variety} of length ${stemLength} has been scanned to completion`);
        return;
      }

      // All validations passed
      const newReady: ReadyToPackItem = {
        bunch_id: bunchId,
        variety,
        bunch_size: bunchSize,
        stem_length: stemLength,
        box_id: String(matchingPickItem.custom_box_id),
        customer_id: opl.customer,
        sales_order_id: opl.sales_order,
      };
      setScannedBunchIds((prev) => [...prev, bunchId!]);
      setScannedBunchesTally((prev) => ({ ...prev, [compoundKey]: scanned + 1 }));
      setReadyToPack((prev) => [...prev, newReady]);
      setLastScannedKey(compoundKey);

      playSubmit();
      haptics.light();
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePack() {
    if (!opl || readyToPack.length === 0) {
      setFeedback({ type: 'warning', text: 'Please scan a bunch before packing' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const items: PackListItemPayload[] = readyToPack.map((r) => {
      const stemMatch = r.bunch_size.match(/\((\d+)\)/);
      const numStems = stemMatch ? parseInt(stemMatch[1], 10) : 0;
      return {
        item_code: r.variety,
        bunch_uom: r.bunch_size,
        bunch_qty: 1,
        source_warehouse: 'Goods sold - KF',
        sales_order_id: r.sales_order_id,
        customer_id: r.customer_id,
        custom_number_of_stems: numStems,
        stem_length: r.stem_length,
        box_id: r.box_id,
        bunch_id: r.bunch_id,
      };
    });

    try {
      const result = await submitPack.mutateAsync({
        custom_sales_order: opl.sales_order,
        custom_customer: opl.customer,
        custom_farm: station!.farm,
        custom_order_pick_list: opl.name,
        items,
      });

      playSubmit();
      haptics.light();
      setFeedback({
        type: 'success',
        text: `Packed ${items.length} bunches (${result.docname})`,
      });

      // Reset local state for next batch
      setReadyToPack([]);
      setScannedBunchesTally({});
      setScannedBunchIds([]);
      setLastScannedKey(null);

      // Re-fetch OPL to refresh packed counts
      const refreshed = await fetchOpl.mutateAsync(opl.name);
      setOpl(refreshed.order_pick_list);
      setPackedBunchesTally(buildPackedTally(refreshed));
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ type: 'error', text: `Pack failed: ${extractFrappeError(e)}` });
    } finally {
      setSubmitting(false);
    }
  }

  function getRowColor(key: string, scanned: number, packed: number, required: number): string {
    if (packed >= required) return 'rgba(34,197,94,0.30)';
    if (scanned >= required) return 'rgba(74,222,128,0.30)';
    if (key === lastScannedKey) return 'rgba(96,165,250,0.30)';
    return colors.surface;
  }

  const bunchScanDisabled = !opl || submitting;

  return (
    <SafeAreaView style={styles.root}>
      <AppBar title="Packing Entry" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          {/* OPL row */}
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Order Pick List</Text>
            <View style={styles.scanRow}>
              <TextInput
                style={[styles.input, styles.scanInput]}
                value={oplDisplayUrl}
                editable={false}
                placeholder="Tap QR icon to scan"
                placeholderTextColor={colors.muted}
                numberOfLines={1}
              />
              <Pressable
                style={[styles.qrBtn, submitting && styles.qrBtnDisabled]}
                onPress={() => {
                  if (!submitting) setOplScannerVisible(true);
                }}
                disabled={submitting}
              >
                <QrCode size={22} color={colors.accent} />
              </Pressable>
            </View>
            {opl ? (
              <Text style={styles.oplMeta}>
                {opl.name} · {opl.customer} · {opl.sales_order}
              </Text>
            ) : null}
          </View>

          {/* Bunch row */}
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Bunch</Text>
            <View style={styles.scanRow}>
              <TextInput
                style={[styles.input, styles.scanInput]}
                value=""
                editable={false}
                placeholder={opl ? 'Tap QR icon to scan' : 'Scan picklist first'}
                placeholderTextColor={colors.muted}
              />
              <Pressable
                style={[styles.qrBtn, bunchScanDisabled && styles.qrBtnDisabled]}
                onPress={() => {
                  if (!bunchScanDisabled) setBunchScannerVisible(true);
                }}
                disabled={bunchScanDisabled}
              >
                <QrCode size={22} color={colors.accent} />
              </Pressable>
            </View>
          </View>

          {submitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.loadingText}>Working…</Text>
            </View>
          ) : null}

          {/* Pick list table */}
          {opl ? (
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.cell, styles.cellVariety, styles.headerCell]}>Variety</Text>
                <Text style={[styles.cell, styles.cellSmall, styles.headerCell]}>Len</Text>
                <Text style={[styles.cell, styles.cellSmall, styles.headerCell]}>UOM</Text>
                <Text style={[styles.cell, styles.cellTiny, styles.headerCell]}>Box</Text>
                <Text style={[styles.cell, styles.cellTiny, styles.headerCell]}>Req</Text>
                <Text style={[styles.cell, styles.cellSmall, styles.headerCell]}>Scan</Text>
                <Text style={[styles.cell, styles.cellSmall, styles.headerCell]}>Pack</Text>
              </View>
              {opl.locations.map((loc, idx) => {
                const key = makeKey(loc.item_code, loc.uom, loc.custom_stem_length);
                const scanned = scannedBunchesTally[key] ?? 0;
                const packed = packedBunchesTally[key] ?? 0;
                return (
                  <View
                    key={`${key}-${idx}`}
                    style={[
                      styles.tableRow,
                      { backgroundColor: getRowColor(key, scanned, packed, loc.qty) },
                    ]}
                  >
                    <Text style={[styles.cell, styles.cellVariety]} numberOfLines={1}>
                      {loc.item_code}
                    </Text>
                    <Text style={[styles.cell, styles.cellSmall]} numberOfLines={1}>
                      {loc.custom_stem_length}
                    </Text>
                    <Text style={[styles.cell, styles.cellSmall]} numberOfLines={1}>
                      {loc.uom}
                    </Text>
                    <Text style={[styles.cell, styles.cellTiny]}>{loc.custom_box_id}</Text>
                    <Text style={[styles.cell, styles.cellTiny]}>{loc.qty}</Text>
                    <Text style={[styles.cell, styles.cellSmall]}>
                      {scanned}/{loc.qty}
                    </Text>
                    <Text style={[styles.cell, styles.cellSmall]}>
                      {packed}/{loc.qty}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Pack button */}
          {readyToPack.length > 0 ? (
            <Pressable
              onPress={handlePack}
              disabled={submitting}
              style={({ pressed }) => [
                styles.packBtn,
                submitting && styles.packBtnDisabled,
                pressed && !submitting && styles.packBtnPressed,
              ]}
            >
              <Text style={styles.packBtnText}>
                Pack ({readyToPack.length} bunch{readyToPack.length === 1 ? '' : 'es'})
              </Text>
            </Pressable>
          ) : null}

          {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

          {/* Station footer */}
          <View style={styles.stationFooter}>
            <Text style={styles.stationText} numberOfLines={1}>
              {station.farmName} Farm · {station.warehouseName}
            </Text>
            <Pressable onPress={() => router.push('/configure')} hitSlop={8}>
              <Text style={styles.changeLink}>Change →</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <BarcodeScannerOverlay
        visible={oplScannerVisible}
        onScan={handleOplScan}
        onCancel={() => setOplScannerVisible(false)}
      />
      <BarcodeScannerOverlay
        visible={bunchScannerVisible}
        onScan={handleBunchScan}
        onCancel={() => setBunchScannerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  form: { gap: spacing.md },
  fieldBlock: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.primary },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scanInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.primary,
    backgroundColor: colors.surface,
  },
  qrBtn: {
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(105,157,205,0.4)',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  qrBtnDisabled: { opacity: 0.4 },
  oplMeta: { fontSize: 12, color: colors.muted },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: { fontSize: 13, color: colors.muted },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: 'center',
  },
  tableHeader: { backgroundColor: colors.bg },
  cell: { fontSize: 11, color: colors.primary, paddingHorizontal: 2 },
  cellVariety: { flex: 2 },
  cellSmall: { flex: 1.1, textAlign: 'center' },
  cellTiny: { flex: 0.7, textAlign: 'center' },
  headerCell: { fontWeight: '700', fontSize: 11 },
  packBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  packBtnDisabled: { opacity: 0.4 },
  packBtnPressed: { opacity: 0.85 },
  packBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  stationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    marginTop: spacing.sm,
  },
  stationText: { fontSize: 13, color: colors.primary, flex: 1 },
  changeLink: { fontSize: 13, color: colors.accent, fontWeight: '600' },
});
