import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MoreVertical, QrCode } from 'lucide-react-native';

import { useStation } from '../../../features/station/useStation';
import { useEntryByBunch } from '../../../features/grading/useEntryByBunch';
import { useCreateGradingEntry } from '../../../features/grading/useCreateGradingEntry';
import { playSubmit, playError } from '../../../lib/audio';
import { haptics } from '../../../lib/haptics';
import { extractFrappeError } from '../../../lib/api';
import { BarcodeScannerOverlay } from '../../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../../components/ui/AppBar';
import { Field } from '../../../components/ui/Field';
import { Pill } from '../../../components/ui/Pill';
import { colors, radii, spacing } from '../../../components/ui/theme';
import type { GradingPayload, ScannedBunchData } from '../../../types/grading';

const ACCENT = colors.accent;

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };
type ScannerMode = 'grader' | 'bunch';

export default function GradingScreen() {
  const router = useRouter();
  const station = useStation();
  const entryByBunch = useEntryByBunch();
  const createGradingEntry = useCreateGradingEntry();

  const [graderInput, setGraderInput] = useState('');
  const [bunchInput, setBunchInput] = useState('');
  const [lastScannedBunch, setLastScannedBunch] = useState<ScannedBunchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState<ScannerMode | null>(null);

  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!station) {
      router.replace('/configure');
    }
  }, [station, router]);

  if (!station) return null;

  function resetCycle() {
    setBunchInput('');
    setLastScannedBunch(null);
    setLoading(false);
    isProcessingRef.current = false;
    // graderInput INTENTIONALLY preserved across cycles. Same grader keeps grading bunches.
  }

  function warn(text: string) {
    setFeedback({ type: 'warning', text });
    playError();
    haptics.medium();
  }

  function processGraderQR(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warn('Invalid QR code format');
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      warn('Invalid QR code format');
      return;
    }
    const p = parsed as Record<string, unknown>;
    if (typeof p.grader !== 'string') {
      warn('Please scan a valid grader QR code');
      return;
    }
    setGraderInput(p.grader);
    setFeedback(null);
  }

  async function submitGrading(scannedData: ScannedBunchData) {
    const payload: GradingPayload = {
      farm: station!.farm,
      stock_entry_type: 'Grading',
      graded_by: graderInput,
      stem_length: scannedData.stem_length,
      bunch_size: scannedData.bunch_size,
      bunch_id: scannedData.bunch_id,
      variety: scannedData.variety,
      quantity: 1,
    };
    try {
      await createGradingEntry.mutateAsync(payload);
      playSubmit();
      setFeedback({ type: 'success', text: 'Bunch graded successfully' });
      resetCycle();
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetCycle();
    }
  }

  async function processBunchQR(raw: string) {
    if (isProcessingRef.current || loading) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warn('Invalid QR code format');
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      warn('Invalid QR code format');
      return;
    }
    const p = parsed as Record<string, unknown>;
    if (
      typeof p.bunch_id !== 'string' ||
      typeof p.variety !== 'string' ||
      typeof p.bunch_size !== 'string' ||
      typeof p.stem_length !== 'string'
    ) {
      warn('Please scan a valid bunch QR code');
      return;
    }
    if (!graderInput) {
      warn('Please scan the grader QR code first');
      return;
    }

    const scannedData: ScannedBunchData = {
      bunch_id: p.bunch_id,
      variety: p.variety,
      bunch_size: p.bunch_size,
      stem_length: p.stem_length,
    };
    setLastScannedBunch(scannedData);
    setBunchInput(scannedData.bunch_id);
    setLoading(true);
    isProcessingRef.current = true;
    setFeedback(null);

    let entries;
    try {
      entries = await entryByBunch.mutateAsync({ bunchId: scannedData.bunch_id });
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetCycle();
      return;
    }

    if (entries[0]?.custom_scanned_grading === 1) {
      playError();
      setFeedback({ type: 'warning', text: 'The bunch has already been graded' });
      resetCycle();
      return;
    }

    await submitGrading(scannedData);
  }

  function handleScan(raw: string) {
    const mode = scannerVisible;
    setScannerVisible(null);
    if (mode === 'grader') {
      processGraderQR(raw);
    } else if (mode === 'bunch') {
      void processBunchQR(raw);
    }
  }

  const bunchScanDisabled = loading || !graderInput;

  return (
    <SafeAreaView style={styles.root}>
      <AppBar
        title="Grading Entry"
        onBack={() => router.back()}
        rightAction={{
          icon: <MoreVertical size={22} color="white" />,
          onPress: () => Alert.alert('Grading Report', 'Coming in Phase 5.', [{ text: 'OK' }]),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          {/* Grader */}
          <Field label="Grader">
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.rowInput]}
                value={graderInput}
                editable={false}
                placeholder="Tap QR icon to scan"
                placeholderTextColor={colors.muted}
              />
              <Pressable
                style={[styles.qrBtn, loading && styles.qrBtnDisabled]}
                onPress={() => {
                  if (!loading) setScannerVisible('grader');
                }}
                disabled={loading}
              >
                <QrCode size={22} color={ACCENT} />
              </Pressable>
            </View>
            {graderInput ? (
              <Pressable onPress={() => setGraderInput('')} hitSlop={8}>
                <Text style={styles.changeLinkInline}>Change Grader</Text>
              </Pressable>
            ) : null}
          </Field>

          {/* Bunch Details */}
          <View style={styles.fieldBlock}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Bunch Details</Text>
              {loading ? <ActivityIndicator size="small" color={ACCENT} /> : null}
            </View>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.rowInput]}
                value={bunchInput}
                editable={false}
                placeholder="Tap QR icon to scan"
                placeholderTextColor={colors.muted}
              />
              <Pressable
                style={[styles.qrBtn, bunchScanDisabled && styles.qrBtnDisabled]}
                onPress={() => {
                  if (loading) return;
                  if (!graderInput) {
                    Alert.alert('Grader required', 'Scan the grader QR code first.', [
                      { text: 'OK' },
                    ]);
                    return;
                  }
                  setScannerVisible('bunch');
                }}
              >
                <QrCode size={22} color={ACCENT} />
              </Pressable>
            </View>
          </View>

          {/* Feedback */}
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
        visible={scannerVisible !== null}
        onScan={handleScan}
        onCancel={() => setScannerVisible(null)}
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
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowInput: { flex: 1 },
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
  qrBtn: {
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(105,157,205,0.4)',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  qrBtnDisabled: { opacity: 0.4 },
  changeLinkInline: { color: colors.accent, fontSize: 13, marginTop: 4 },
  stationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  stationText: { fontSize: 13, color: colors.primary, flex: 1 },
  changeLink: { fontSize: 13, color: ACCENT, fontWeight: '600' },
});
