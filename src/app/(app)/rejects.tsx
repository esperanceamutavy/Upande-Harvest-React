import { useEffect, useRef, useState } from 'react';
import {
  Modal,
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

import { useCreateXfloraDiscardEntry } from '../../features/discard/useCreateXfloraDiscardEntry';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../components/ui/AppBar';
import { Field } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Pill';
import { colors, radii, spacing } from '../../components/ui/theme';
import type { XfloraDiscardPayload } from '../../types/xflora';

const AUTO_DISMISS_MS = 2500;

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };
type DialogState = { title: string; isError: boolean; payload: XfloraDiscardPayload };

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Discard scans carry the id under `coldroom_bucket` (not `bucket_id`). */
function extractColdroomBucket(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).coldroom_bucket != null) {
      return String((parsed as Record<string, unknown>).coldroom_bucket);
    }
  } catch {
    // fall through
  }
  return null;
}

export default function RejectsScreen() {
  const router = useRouter();
  const createDiscardEntry = useCreateXfloraDiscardEntry();

  const [bucketInput, setBucketInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const textInputRef = useRef<TextInput>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  // Clears the field and refocuses for continuous scanning.
  function resetState() {
    setLoading(false);
    isProcessingRef.current = false;
    isSettingProgrammaticallyRef.current = true;
    setBucketInput('');
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
    textInputRef.current?.focus();
  }

  function closeDialog() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setDialog(null);
    textInputRef.current?.focus();
  }

  async function handleScannedData(raw: string) {
    if (isProcessingRef.current) return;

    const bucketId = extractColdroomBucket(raw);
    if (!bucketId) {
      setFeedback({ type: 'error', text: 'Please scan a valid bucket QR code.' });
      playError();
      haptics.medium();
      resetState();
      return;
    }

    isProcessingRef.current = true;
    setLoading(true);
    setFeedback(null);

    try {
      const res = await createDiscardEntry.mutateAsync(bucketId);
      if (res.status === 'success' && res.payload) {
        playSubmit();
        setDialog({ title: 'Bucket Discarded', isError: false, payload: res.payload });
        dismissTimer.current = setTimeout(closeDialog, AUTO_DISMISS_MS);
        resetState();
      } else if (res.reason === 'bucket_too_young' && res.payload) {
        // Blocking dialog (no auto-dismiss). Unlike the Flutter reference, we still
        // reset the scan state so the next bucket can be scanned after acknowledging.
        playError();
        haptics.heavy();
        setDialog({ title: 'Cannot Discard: Too Young', isError: true, payload: res.payload });
        resetState();
      } else {
        playError();
        haptics.medium();
        setFeedback({ type: 'error', text: res.message || 'Discard failed.' });
        resetState();
      }
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
      resetState();
    }
  }

  function onChangeText(text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    setBucketInput(text);
    const trimmed = text.trim();
    if (trimmed.endsWith('}') && isValidJson(trimmed) && !isProcessingRef.current) {
      void handleScannedData(trimmed);
    }
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    void handleScannedData(raw);
  }

  return (
    <SafeAreaView style={styles.root}>
      <AppBar title="Rejects (Discard)" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Field label="Scan Bucket QR">
            <View style={styles.scanRow}>
              <TextInput
                ref={textInputRef}
                style={[styles.input, styles.scanInput]}
                value={bucketInput}
                onChangeText={onChangeText}
                autoFocus
                autoCapitalize="characters"
                placeholder={loading ? 'Processing…' : 'Scan bucket QR code…'}
                placeholderTextColor={colors.muted}
                editable={!loading}
              />
              <Pressable
                style={styles.qrBtn}
                onPress={() => {
                  if (!loading) setScannerVisible(true);
                }}
              >
                <QrCode size={22} color={colors.text} />
              </Pressable>
            </View>
          </Field>

          {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

          <Text style={styles.hint}>Scan a coldroom bucket QR code to discard it</Text>
        </View>
      </ScrollView>

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleCameraScan}
        onCancel={() => setScannerVisible(false)}
      />

      <ResultDialog dialog={dialog} onClose={closeDialog} />
    </SafeAreaView>
  );
}

function ResultDialog({ dialog, onClose }: { dialog: DialogState | null; onClose: () => void }) {
  if (!dialog) return null;
  const { title, isError, payload } = dialog;
  const accentColor = isError ? colors.error : colors.success;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.dialogOverlay}>
        <View style={styles.dialogCard}>
          <Text style={[styles.dialogTitle, { color: accentColor }]}>{title}</Text>

          <DetailRow label="Bucket ID" value={payload.bucketId} />
          {payload.variety ? <DetailRow label="Variety" value={payload.variety} /> : null}
          {payload.stems != null ? <DetailRow label="Stems" value={String(Math.round(payload.stems))} /> : null}

          {payload.ageDays != null ? (
            <View style={styles.ageWrap}>
              <View style={styles.divider} />
              <Text style={[styles.ageText, { color: isError ? colors.error : colors.primary }]}>
                {payload.ageDays} DAYS OLD
              </Text>
            </View>
          ) : null}

          <Pressable onPress={onClose} style={styles.okBtn} hitSlop={8}>
            <Text style={[styles.okText, { color: accentColor }]}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  // dialog
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: { fontSize: 14, color: colors.muted },
  detailValue: { fontSize: 14, fontWeight: '600', color: colors.primary },
  ageWrap: { gap: spacing.sm, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.borderLight },
  ageText: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  okBtn: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  okText: { fontSize: 15, fontWeight: 'bold' },
});
