import { useEffect, useRef, useState } from 'react';
import {
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
import { useBucketCheck } from '../../../features/stock/useBucketCheck';
import { useCreateReceivingEntry } from '../../../features/stock/useCreateReceivingEntry';
import { useGreenhouseByBucketId } from '../../../features/stock/useGreenhouseByBucketId';
import { playSubmit, playError } from '../../../lib/audio';
import { extractFrappeError } from '../../../lib/api';
import { BarcodeScannerOverlay } from '../../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../../components/ui/AppBar';
import { Field } from '../../../components/ui/Field';
import { Pill } from '../../../components/ui/Pill';
import { colors, radii, spacing } from '../../../components/ui/theme';

const ACCENT = colors.accent;

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export default function ReceivingScreen() {
  const router = useRouter();
  const station = useStation();
  const bucketCheck = useBucketCheck();
  const createReceivingEntry = useCreateReceivingEntry();
  const greenhouseByBucketId = useGreenhouseByBucketId();

  const [bucketIdInput, setBucketIdInput] = useState('');
  const [showLastHarvest, setShowLastHarvest] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [lastGreenhouseShown, setLastGreenhouseShown] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!station) {
      router.replace('/configure');
    }
  }, [station, router]);

  function resetState() {
    setIsProcessing(false);
    isProcessingRef.current = false;
    isSettingProgrammaticallyRef.current = true;
    setBucketIdInput('');
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
    textInputRef.current?.focus();
  }

  async function routeToReceivingFlow(bucketId: string) {
    let buckets;
    try {
      buckets = await bucketCheck.mutateAsync(bucketId);
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetState();
      return;
    }
    if (buckets.length === 0) {
      setFeedback({ type: 'warning', text: 'The bucket QR code does not exist.' });
      playError();
      resetState();
      return;
    }
    if (buckets[0].custom_status !== 'In Use') {
      setFeedback({ type: 'warning', text: 'Bucket is not yet harvested or has already been received.' });
      playError();
      resetState();
      return;
    }
    try {
      await createReceivingEntry.mutateAsync({ bucketName: buckets[0].name });
      playSubmit();
      setFeedback({ type: 'success', text: 'Created entry successfully' });
      resetState();
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetState();
    }
  }

  async function routeToGreenhouseLookup(bucketId: string) {
    try {
      const result = await greenhouseByBucketId.mutateAsync({ bucketId });
      setLastGreenhouseShown(result.greenhouse ?? 'Unknown');
      setFeedback({ type: 'success', text: `Last harvest: ${result.greenhouse ?? 'Unknown'}` });
      playSubmit();
      resetState();
    } catch (e) {
      playError();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetState();
    }
  }

  async function handleScannedData(raw: string) {
    setIsProcessing(true);
    isProcessingRef.current = true;
    setFeedback(null);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as Record<string, unknown>).bucket_id !== 'string'
      ) {
        setFeedback({ type: 'warning', text: 'Please scan a valid bucket QR code.' });
        playError();
        resetState();
        return;
      }
      const bucketId = ((parsed as Record<string, unknown>).bucket_id as string).toUpperCase();
      if (showLastHarvest) {
        await routeToGreenhouseLookup(bucketId);
      } else {
        await routeToReceivingFlow(bucketId);
      }
    } catch {
      setFeedback({ type: 'warning', text: 'Invalid QR code format.' });
      playError();
      resetState();
    }
  }

  function onChangeText(text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    setBucketIdInput(text);
    const trimmed = text.trim();
    if (trimmed.endsWith('}') && isValidJson(trimmed) && !isProcessingRef.current) {
      void handleScannedData(trimmed);
    }
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    void handleScannedData(raw);
  }

  if (!station) return null;

  return (
    <SafeAreaView style={styles.root}>
      <AppBar
        title="Receiving Entry"
        onBack={() => router.back()}
        rightAction={{
          icon: <MoreVertical size={22} color="white" />,
          onPress: () => Alert.alert('Receiving Report', 'Coming in Phase 5.', [{ text: 'OK' }]),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          {/* Toggle: show last harvest greenhouse — port of fetchLastGreenHouseDetails */}
          <Pressable
            onPress={() => setShowLastHarvest((v) => !v)}
            style={styles.toggleRow}
          >
            <View style={[styles.toggleBox, showLastHarvest && styles.toggleBoxActive]}>
              {showLastHarvest ? (
                <Text style={styles.toggleCheck}>✓</Text>
              ) : null}
            </View>
            <View style={styles.toggleLabels}>
              <Text style={styles.toggleLabel}>Show last harvest greenhouse</Text>
              {showLastHarvest ? (
                <Text style={styles.toggleHint}>(Scan QR to fetch)</Text>
              ) : null}
            </View>
          </Pressable>

          {/* Bucket ID field — HID-aware: onChangeText fires on each character; JSON-terminator triggers processing */}
          <Field label="Bucket ID">
            <View style={styles.bucketRow}>
              <TextInput
                ref={textInputRef}
                style={[styles.input, styles.bucketInput]}
                value={bucketIdInput}
                onChangeText={onChangeText}
                autoFocus
                autoCapitalize="characters"
                placeholder={isProcessing ? 'Processing…' : 'Scan bucket QR code…'}
                placeholderTextColor={colors.muted}
                editable={!isProcessing}
              />
              <Pressable
                style={styles.qrBtn}
                onPress={() => {
                  if (!isProcessing) setScannerVisible(true);
                }}
              >
                <QrCode size={22} color={ACCENT} />
              </Pressable>
            </View>
          </Field>

          {/* Last greenhouse pill — persists between scans */}
          {lastGreenhouseShown !== null ? (
            <Pill variant="neutral">Last greenhouse: {lastGreenhouseShown}</Pill>
          ) : null}

          {/* Feedback message */}
          {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

          {/* Hint */}
          <Text style={styles.hint}>Scan a bucket QR code to record receipt</Text>

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
        onScan={handleCameraScan}
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
  // toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  toggleBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(68,67,62,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  toggleBoxActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  toggleCheck: { color: 'white', fontSize: 14, fontWeight: '700' },
  toggleLabels: { flex: 1, gap: spacing.xs },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.primary },
  toggleHint: { fontSize: 12, color: ACCENT },
  // bucket input
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
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bucketInput: { flex: 1 },
  qrBtn: {
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(105,157,205,0.4)',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  // footer
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  stationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  stationText: { fontSize: 13, color: colors.primary, flex: 1 },
  changeLink: { fontSize: 13, color: ACCENT, fontWeight: '600' },
});
