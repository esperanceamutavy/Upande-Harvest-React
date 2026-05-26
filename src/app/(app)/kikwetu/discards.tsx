import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, QrCode } from 'lucide-react-native';

import { useStation } from '../../../features/station/useStation';
import { useFetchStockEntryByBunch } from '../../../features/discards/useFetchStockEntryByBunch';
import { useCreateDiscardEntry } from '../../../features/discards/useCreateDiscardEntry';
import { playSubmit, playError } from '../../../lib/audio';
import { haptics } from '../../../lib/haptics';
import { extractFrappeError } from '../../../lib/api';
import { BarcodeScannerOverlay } from '../../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../../components/ui/AppBar';
import { Pill } from '../../../components/ui/Pill';
import { colors, radii, spacing } from '../../../components/ui/theme';
import type { DiscardReason } from '../../../types/discard';

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };

const REASONS: DiscardReason[] = ['Lack of market', 'Disease'];

export default function DiscardsScreen() {
  const router = useRouter();
  const station = useStation();
  const fetchByBunch = useFetchStockEntryByBunch();
  const createDiscard = useCreateDiscardEntry();

  const [discardReason, setDiscardReason] = useState<DiscardReason | ''>('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);

  useEffect(() => {
    if (!station) {
      router.replace('/configure');
    }
  }, [station, router]);

  if (!station) return null;

  function warn(text: string) {
    haptics.medium();
    setFeedback({ type: 'warning', text });
  }

  async function handleScan(raw: string) {
    setScannerVisible(false);

    let bunchId: string | null = null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>;
        if (typeof p.bunch_id === 'string') bunchId = p.bunch_id;
      }
    } catch {
      // not JSON — handled below
    }

    if (!bunchId) {
      playError();
      warn('Invalid bunch QR code');
      return;
    }

    if (!discardReason) {
      playError();
      warn('Please choose a discard reason');
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const entries = await fetchByBunch.mutateAsync({ bunchId, action: 'discard' });

      if (entries.length === 0) {
        playError();
        warn('The bunch has not been graded');
        return;
      }
      if (entries.some((e) => e.custom_scanned_packing === 1)) {
        playError();
        warn('The bunch has already been packed');
        return;
      }
      if (entries.some((e) => e.stock_entry_type === 'Discard')) {
        playError();
        warn('The bunch has already been discarded');
        return;
      }

      const res = await createDiscard.mutateAsync({
        userFarm: station!.farm,
        bunchId,
        discardReason,
      });

      playSubmit();
      haptics.light();
      setFeedback({ type: 'success', text: `Bunch ${bunchId} discarded (${res.stock_entry})` });
      setDiscardReason('');
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
    } finally {
      setSubmitting(false);
    }
  }

  const scanDisabled = submitting || !discardReason;

  return (
    <SafeAreaView style={styles.root}>
      <AppBar title="Discard Entry" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Text style={styles.sectionHeader}>Select Discard Reason:</Text>

          <View style={styles.reasonList}>
            {REASONS.map((r) => {
              const selected = discardReason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    setDiscardReason(r);
                    setFeedback(null);
                  }}
                  style={({ pressed }) => [
                    styles.reasonTile,
                    selected && styles.reasonTileSelected,
                    pressed && !selected && styles.reasonTilePressed,
                  ]}
                  disabled={submitting}
                >
                  <View
                    style={[
                      styles.radioOuter,
                      selected && styles.radioOuterSelected,
                    ]}
                  >
                    {selected ? <Check size={14} color="white" /> : null}
                  </View>
                  <Text
                    style={[styles.reasonText, selected && styles.reasonTextSelected]}
                  >
                    {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => {
              if (!scanDisabled) setScannerVisible(true);
            }}
            disabled={scanDisabled}
            style={({ pressed }) => [
              styles.scanBtn,
              scanDisabled && styles.scanBtnDisabled,
              pressed && !scanDisabled && styles.scanBtnPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <QrCode size={22} color="white" />
                <Text style={styles.scanBtnText}>Scan Bunch QR</Text>
              </>
            )}
          </Pressable>

          {!discardReason && !submitting ? (
            <Text style={styles.hint}>Choose a reason above to enable scanning.</Text>
          ) : null}

          {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

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
        visible={scannerVisible}
        onScan={handleScan}
        onCancel={() => setScannerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  form: { gap: spacing.md },
  sectionHeader: { fontSize: 14, fontWeight: '600', color: colors.primary },
  reasonList: { gap: spacing.sm },
  reasonTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  reasonTilePressed: { backgroundColor: colors.pressed },
  reasonTileSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '14',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  radioOuterSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  reasonText: { fontSize: 15, color: colors.primary },
  reasonTextSelected: { fontWeight: '600' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  scanBtnPressed: { opacity: 0.85 },
  scanBtnDisabled: { opacity: 0.4 },
  scanBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
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
