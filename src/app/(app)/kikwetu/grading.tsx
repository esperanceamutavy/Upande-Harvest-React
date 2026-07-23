import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, MoreVertical, QrCode } from 'lucide-react-native';

import { useStation } from '../../../features/station/useStation';
import { useCreateGradingEntry } from '../../../features/grading/useCreateGradingEntry';
import { useBunchSizeOptions } from '../../../features/grading/useBunchSizeOptions';
import { playSubmit, playError } from '../../../lib/audio';
import { haptics } from '../../../lib/haptics';
import { extractFrappeError } from '../../../lib/api';
import { BarcodeScannerOverlay } from '../../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../../components/ui/AppBar';
import { Picker } from '../../../components/ui/Picker';
import { Pill } from '../../../components/ui/Pill';
import { colors, radii, spacing } from '../../../components/ui/theme';
import type {
  GradingPayload,
  ScannedBunch,
  ScannedVariety,
} from '../../../types/grading';

const ACCENT = colors.accent;

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };

function parseGradingQr(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Type B: single JSON object — try this first since it's the cheap path
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    // Could be single object OR concatenated; try parsing as single first
    try {
      const single = JSON.parse(trimmed);
      if (single && typeof single === 'object' && !Array.isArray(single)) {
        return single as Record<string, unknown>;
      }
    } catch {
      // fall through to Type A
    }
  }

  // Type A: concatenated JSON objects {...}{...}{...}
  // Match each balanced {...} block. Since QR fields are flat string values
  // (no nested objects), a simple non-greedy match between { and } is safe.
  const matches = trimmed.match(/\{[^{}]*\}/g);
  if (!matches || matches.length === 0) return null;

  const merged: Record<string, unknown> = {};
  for (const chunk of matches) {
    try {
      const obj = JSON.parse(chunk);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        Object.assign(merged, obj);
      } else {
        return null; // chunk parsed but isn't an object — reject the whole scan
      }
    } catch {
      return null; // any chunk fails — reject the whole scan
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

export default function GradingScreen() {
  const router = useRouter();
  const station = useStation();
  const createGradingEntry = useCreateGradingEntry();

  const [bunchScan, setBunchScan] = useState<ScannedBunch | null>(null);
  const [varietyScan, setVarietyScan] = useState<ScannedVariety | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideBunchSize, setOverrideBunchSize] = useState<string>('Bunch(10)');

  const bunchSizeOptions = useBunchSizeOptions();
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!station) {
      router.replace('/configure');
    }
  }, [station, router]);

  if (!station) return null;

  function warn(text: string) {
    setFeedback({ type: 'warning', text });
    playError();
    haptics.medium();
  }

  function reset() {
    setBunchScan(null);
    setVarietyScan(null);
    setFeedback(null);
  }

  async function maybeSubmit(bunch: ScannedBunch | null, variety: ScannedVariety | null) {
    if (!bunch || !variety) return;
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setLoading(true);

    const payload: GradingPayload = {
      farm: station!.farm,
      variety: variety.variety,
      stem_length: bunch.stem_length,
      grader: bunch.grader,
      bunch_id: bunch.bunch_id,
    };
    if (overrideEnabled) {
      payload.bunch_size_override = overrideBunchSize;
    }

    try {
      const res = await createGradingEntry.mutateAsync(payload);
      if (res.error === 'lockout_active') {
        playError();
        setFeedback({
          type: 'warning',
          text: res.message || 'This bunch was just graded. Please wait a moment.',
        });
      } else if (res.stock_entry) {
        playSubmit();
        setFeedback({ type: 'success', text: `Graded: ${bunch.bunch_id}` });
      } else {
        playError();
        setFeedback({ type: 'error', text: res.message || 'Submission failed' });
      }
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
    } finally {
      setBunchScan(null);
      setVarietyScan(null);
      setLoading(false);
      isProcessingRef.current = false;
    }
  }

  function handleScan(raw: string) {
    setScannerVisible(false);
    if (isProcessingRef.current) return;

    const p = parseGradingQr(raw);
    if (!p) {
      warn('Invalid QR code format');
      return;
    }

    if (
      typeof p.bunch_id === 'string' &&
      typeof p.grader === 'string' &&
      typeof p.stem_length === 'string'
    ) {
      const bunch: ScannedBunch = {
        grader: p.grader,
        stem_length: p.stem_length,
        bunch_id: p.bunch_id,
      };
      setBunchScan(bunch);
      setFeedback(null);
      void maybeSubmit(bunch, varietyScan);
      return;
    }

    if (typeof p.variety === 'string' && !p.bunch_id) {
      const variety: ScannedVariety = { variety: p.variety };
      setVarietyScan(variety);
      setFeedback(null);
      void maybeSubmit(bunchScan, variety);
      return;
    }

    warn('Unknown QR format — please scan a bunch label or variety QR');
  }

  const hint = loading
    ? 'Submitting…'
    : bunchScan && varietyScan
      ? 'Submitting…'
      : bunchScan
        ? 'Now scan the variety QR'
        : varietyScan
          ? 'Now scan the bunch QR'
          : 'Scan the bunch QR and variety QR in any order';

  const hasAnyScan = bunchScan !== null || varietyScan !== null;

  return (
    <SafeAreaView style={styles.root}>
      <AppBar
        title="Grading Entry"
        onBack={() => router.back()}
        rightAction={{
          icon: <MoreVertical size={22} color="white" />,
          onPress: () => Alert.alert('Reports', 'Reports coming in Phase 5.', [{ text: 'OK' }]),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          {/* Scan slot cards */}
          <View style={styles.slotRow}>
            <ScanSlot
              label="Bunch"
              value={bunchScan?.bunch_id ?? null}
              filled={bunchScan !== null}
            />
            <ScanSlot
              label="Variety"
              value={varietyScan?.variety ?? null}
              filled={varietyScan !== null}
            />
          </View>

          {/* Big Scan QR button */}
          <Pressable
            style={({ pressed }) => [
              styles.scanBtn,
              loading && styles.scanBtnDisabled,
              pressed && !loading && styles.scanBtnPressed,
            ]}
            onPress={() => {
              if (!loading) setScannerVisible(true);
            }}
            disabled={loading}
          >
            <QrCode size={22} color="white" />
            <Text style={styles.scanBtnText}>Scan QR</Text>
          </Pressable>

          {/* Bunch size override */}
          <Pressable
            onPress={() => setOverrideEnabled((v) => !v)}
            style={styles.checkboxRow}
            hitSlop={8}
          >
            <View style={[styles.checkbox, overrideEnabled && styles.checkboxChecked]}>
              {overrideEnabled ? <Check size={14} color="white" /> : null}
            </View>
            <Text style={styles.checkboxLabel}>Override bunch size</Text>
          </Pressable>

          {overrideEnabled ? (
            <View style={styles.overrideRow}>
              <Text style={styles.overrideLabel}>Bunch size:</Text>
              <View style={styles.overridePickerWrap}>
                <Picker
                  value={overrideBunchSize}
                  onValueChange={setOverrideBunchSize}
                  placeholder="Select bunch size"
                  items={bunchSizeOptions.map((s) => ({ label: s, value: s }))}
                />
              </View>
            </View>
          ) : null}

          {/* Hint */}
          <View style={styles.hintRow}>
            {loading ? <ActivityIndicator size="small" color={ACCENT} /> : null}
            <Text style={styles.hint}>{hint}</Text>
          </View>

          {/* Feedback */}
          {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

          {/* Reset link */}
          {hasAnyScan && !loading ? (
            <Pressable onPress={reset} hitSlop={8} style={styles.resetWrap}>
              <Text style={styles.resetLink}>Reset</Text>
            </Pressable>
          ) : null}

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
        visible={scannerVisible}
        onScan={handleScan}
        onCancel={() => setScannerVisible(false)}
      />
    </SafeAreaView>
  );
}

function ScanSlot({
  label,
  value,
  filled,
}: {
  label: string;
  value: string | null;
  filled: boolean;
}) {
  return (
    <View style={[styles.slot, filled && styles.slotFilled]}>
      <View style={styles.slotHeader}>
        <Text style={styles.slotLabel}>{label}</Text>
        {filled ? <Check size={16} color={colors.success} /> : null}
      </View>
      <Text style={[styles.slotValue, !value && styles.slotValueEmpty]} numberOfLines={1}>
        {value ?? 'Tap below to scan'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  form: { gap: spacing.md },
  slotRow: { flexDirection: 'row', gap: spacing.md },
  slot: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  slotFilled: {
    borderColor: colors.success,
    backgroundColor: colors.success + '0F',
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },
  slotValue: { fontSize: 14, color: colors.primary },
  slotValueEmpty: { color: colors.muted, fontStyle: 'italic' },
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: { fontSize: 14, color: colors.primary },
  overrideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  overrideLabel: { fontSize: 13, color: colors.muted },
  overridePickerWrap: { flex: 1 },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  resetWrap: { alignSelf: 'center' },
  resetLink: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  stationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    marginTop: spacing.sm,
  },
  stationText: { fontSize: 13, color: colors.primary, flex: 1 },
  changeLink: { fontSize: 13, color: ACCENT, fontWeight: '600' },
});
