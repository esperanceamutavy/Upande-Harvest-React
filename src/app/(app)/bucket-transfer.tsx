import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowDown, QrCode } from 'lucide-react-native';

import { useXfloraBucketTransfer } from '../../features/bucket-transfer/useXfloraBucketTransfer';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { Card, Notice, type NoticeTone } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Screen } from '../../components/ui/Screen';
import { colors, radii, spacing } from '../../components/ui/theme';

type FeedbackMsg = { tone: NoticeTone; text: string };
type ScanTarget = 'source' | 'destination';

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Port of the Flutter extraction: accept either `bucket_id` or `coldroom_bucket`. */
function extractBucketId(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (obj.bucket_id != null) return String(obj.bucket_id);
      if (obj.coldroom_bucket != null) return String(obj.coldroom_bucket);
    }
  } catch {
    // fall through
  }
  return null;
}

export default function BucketTransferScreen() {
  const transfer = useXfloraBucketTransfer();

  const [sourceId, setSourceIdState] = useState('');
  const [destId, setDestIdState] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  // Refs mirror the field values so scan/submit logic never reads stale state
  // from an HID keystroke closure. Flutter reads controller.text directly; this
  // is the RN-safe equivalent.
  const sourceRef = useRef('');
  const destRef = useRef('');
  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const scanTargetRef = useRef<ScanTarget>('source');

  const sourceInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);

  function setSource(value: string) {
    sourceRef.current = value;
    setSourceIdState(value);
  }
  function setDest(value: string) {
    destRef.current = value;
    setDestIdState(value);
  }

  function setProgrammatic(target: ScanTarget, value: string) {
    isSettingProgrammaticallyRef.current = true;
    if (target === 'source') setSource(value);
    else setDest(value);
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
  }

  function warn(text: string) {
    setFeedback({ tone: 'warn', text });
    playError();
    haptics.medium();
  }

  function resetForm() {
    isSettingProgrammaticallyRef.current = true;
    setSource('');
    setDest('');
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
    sourceInputRef.current?.focus();
  }

  async function submitTransfer(src: string, dst: string) {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await transfer.mutateAsync({
        sourceBucketId: src,
        destinationBucketId: dst,
      });
      playSubmit();
      setFeedback({ tone: 'success', text: res.message });
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
    } finally {
      resetForm();
      setLoading(false);
      isProcessingRef.current = false;
    }
  }

  function processScanned(raw: string, target: ScanTarget) {
    if (isProcessingRef.current) return;
    const id = extractBucketId(raw);
    if (!id) {
      warn('Invalid QR format — no bucket id found.');
      return;
    }
    haptics.light();
    setProgrammatic(target, id);

    const src = sourceRef.current;
    const dst = destRef.current;
    if (src && dst) {
      void submitTransfer(src, dst);
    } else if (target === 'source') {
      destInputRef.current?.focus();
    }
  }

  function onChangeField(text: string, target: ScanTarget) {
    if (isSettingProgrammaticallyRef.current) return;
    if (target === 'source') setSource(text);
    else setDest(text);

    const trimmed = text.trim();
    if (trimmed.endsWith('}') && isValidJson(trimmed) && !isProcessingRef.current) {
      processScanned(trimmed, target);
    }
  }

  function openScanner(target: ScanTarget) {
    if (loading) return;
    scanTargetRef.current = target;
    setScannerVisible(true);
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    processScanned(raw, scanTargetRef.current);
  }

  return (
    <Screen title="Bucket Transfer">
      <Card title="Transfer bucket">
        <View style={styles.form}>
          <Field label="Source Bucket">
            <View style={styles.scanRow}>
              <TextInput
                ref={sourceInputRef}
                style={[styles.input, styles.scanInput]}
                value={sourceId}
                onChangeText={(t) => onChangeField(t, 'source')}
                autoFocus
                autoCapitalize="characters"
                placeholder="Scan source bucket QR…"
                placeholderTextColor={colors.muted}
                editable={!loading}
              />
              <Pressable style={styles.qrBtn} onPress={() => openScanner('source')}>
                <QrCode size={22} color={colors.text} />
              </Pressable>
            </View>
          </Field>

          <View style={styles.arrowRow}>
            <ArrowDown size={28} color={colors.muted} />
          </View>

          <Field label="Destination Bucket">
            <View style={styles.scanRow}>
              <TextInput
                ref={destInputRef}
                style={[styles.input, styles.scanInput]}
                value={destId}
                onChangeText={(t) => onChangeField(t, 'destination')}
                autoCapitalize="characters"
                placeholder="Scan destination bucket QR…"
                placeholderTextColor={colors.muted}
                editable={!loading}
              />
              <Pressable style={styles.qrBtn} onPress={() => openScanner('destination')}>
                <QrCode size={22} color={colors.text} />
              </Pressable>
            </View>
          </Field>
        </View>
      </Card>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.text} />
          <Text style={styles.hint}>Transferring…</Text>
        </View>
      ) : null}

      {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

      <Text style={styles.hint}>
        Scan the source bucket, then the destination — transfer submits automatically.
      </Text>

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleCameraScan}
        onCancel={() => setScannerVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  arrowRow: { alignItems: 'center', paddingVertical: spacing.xs },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
