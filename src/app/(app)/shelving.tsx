import { useEffect, useRef, useState } from 'react';
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

import { useFarm } from '../../features/station/useFarm';
import { useCreateXfloraShelvingEntry } from '../../features/shelving/useCreateXfloraShelvingEntry';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../components/ui/AppBar';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Pill';
import { colors, radii, spacing } from '../../components/ui/theme';

const ACCENT = colors.accent;
const DEBOUNCE_MS = 500;

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };
type ScanTarget = 'shelf' | 'bucket';

export default function ShelvingScreen() {
  const router = useRouter();
  const farm = useFarm();
  const createShelvingEntry = useCreateXfloraShelvingEntry();

  const [shelfInput, setShelfInput] = useState('');
  const [bucketInput, setBucketInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  // Confirmed extracted values (source of truth for submit + validation).
  const shelfIdRef = useRef('');
  const bucketIdRef = useRef('');
  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const scanTargetRef = useRef<ScanTarget>('shelf');
  const shelfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bucketTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shelfRef = useRef<TextInput>(null);
  const bucketRef = useRef<TextInput>(null);

  // Shelving is the only flow that needs a configured farm.
  useEffect(() => {
    if (!farm) router.replace('/configure');
  }, [farm, router]);

  useEffect(() => {
    return () => {
      if (shelfTimer.current) clearTimeout(shelfTimer.current);
      if (bucketTimer.current) clearTimeout(bucketTimer.current);
    };
  }, []);

  if (!farm) return null;

  function warn(text: string) {
    setFeedback({ type: 'warning', text });
    playError();
    haptics.medium();
  }

  function setField(target: ScanTarget, value: string) {
    if (target === 'shelf') setShelfInput(value);
    else setBucketInput(value);
  }

  function setProgrammatic(target: ScanTarget, value: string) {
    isSettingProgrammaticallyRef.current = true;
    setField(target, value);
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
  }

  function focusField(target: ScanTarget) {
    (target === 'shelf' ? shelfRef : bucketRef).current?.focus();
  }

  function clearField(target: ScanTarget) {
    setProgrammatic(target, '');
    if (target === 'shelf') shelfIdRef.current = '';
    else bucketIdRef.current = '';
  }

  async function submit(shelfId: string, bucketId: string) {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await createShelvingEntry.mutateAsync({
        farm: farm!.farm,
        shelfId,
        bucketId,
      });
      playSubmit();
      setFeedback({ type: 'success', text: res.message });
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
    } finally {
      // Keep the shelf for batch shelving; clear only the bucket and refocus it.
      clearField('bucket');
      setLoading(false);
      isProcessingRef.current = false;
      focusField('bucket');
    }
  }

  function processScan(target: ScanTarget, raw: string) {
    if (isProcessingRef.current) return;
    const trimmed = raw.trim();
    if (!trimmed) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      warn('Invalid QR code format. Must be a JSON object.');
      clearField(target);
      focusField(target);
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      warn('Invalid QR code format. Must be a JSON object.');
      clearField(target);
      focusField(target);
      return;
    }
    const obj = parsed as Record<string, unknown>;

    if (target === 'shelf') {
      if (obj.shelf != null) {
        const id = String(obj.shelf);
        setProgrammatic('shelf', id);
        shelfIdRef.current = id;
        setFeedback(null);
        focusField('bucket');
      } else {
        warn('Please scan a valid shelf QR code');
        clearField('shelf');
        focusField('shelf');
      }
      return;
    }

    // bucket
    const bucketId = obj.coldroom_bucket != null ? String(obj.coldroom_bucket) : '';
    if (!bucketId) {
      warn('Please scan a valid bucket QR code');
      clearField('bucket');
      focusField('bucket');
      return;
    }
    if (!shelfIdRef.current) {
      warn('Please scan the shelf QR code first');
      clearField('bucket');
      focusField('shelf');
      return;
    }
    setProgrammatic('bucket', bucketId);
    bucketIdRef.current = bucketId;
    void submit(shelfIdRef.current, bucketId);
  }

  function scheduleProcess(target: ScanTarget, text: string) {
    const timer = target === 'shelf' ? shelfTimer : bucketTimer;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => processScan(target, text), DEBOUNCE_MS);
  }

  function onChangeField(target: ScanTarget, text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    setField(target, text);
    scheduleProcess(target, text);
  }

  function openScanner(target: ScanTarget) {
    if (loading) return;
    scanTargetRef.current = target;
    setScannerVisible(true);
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    const target = scanTargetRef.current;
    const timer = target === 'shelf' ? shelfTimer : bucketTimer;
    if (timer.current) clearTimeout(timer.current);
    processScan(target, raw);
  }

  function clearForm() {
    if (shelfTimer.current) clearTimeout(shelfTimer.current);
    if (bucketTimer.current) clearTimeout(bucketTimer.current);
    clearField('shelf');
    clearField('bucket');
    setFeedback(null);
    focusField('shelf');
  }

  return (
    <SafeAreaView style={styles.root}>
      <AppBar title="Shelving Entry" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Field label="Shelf">
            <View style={styles.scanRow}>
              <TextInput
                ref={shelfRef}
                style={[styles.input, styles.scanInput]}
                value={shelfInput}
                onChangeText={(t) => onChangeField('shelf', t)}
                autoFocus
                autoCapitalize="characters"
                placeholder="Scan shelf QR code…"
                placeholderTextColor={colors.muted}
                editable={!loading}
              />
              <Pressable style={styles.qrBtn} onPress={() => openScanner('shelf')}>
                <QrCode size={22} color={ACCENT} />
              </Pressable>
            </View>
          </Field>

          <Field label="Bucket">
            <View style={styles.scanRow}>
              <TextInput
                ref={bucketRef}
                style={[styles.input, styles.scanInput]}
                value={bucketInput}
                onChangeText={(t) => onChangeField('bucket', t)}
                autoCapitalize="characters"
                placeholder="Scan bucket QR code…"
                placeholderTextColor={colors.muted}
                editable={!loading}
              />
              <Pressable style={styles.qrBtn} onPress={() => openScanner('bucket')}>
                <QrCode size={22} color={ACCENT} />
              </Pressable>
            </View>
          </Field>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={ACCENT} />
              <Text style={styles.hint}>Shelving…</Text>
            </View>
          ) : null}

          {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

          <Button onPress={clearForm}>Clear Form</Button>

          <View style={styles.stationFooter}>
            <Text style={styles.stationText} numberOfLines={1}>
              {farm.farmName} Farm
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
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scanInput: { flex: 1 },
  qrBtn: {
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(105,157,205,0.4)',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
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
