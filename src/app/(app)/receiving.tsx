import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, QrCode } from 'lucide-react-native';

import { useCreateXfloraReceivingEntry } from '../../features/receiving/useCreateXfloraReceivingEntry';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { AppBar } from '../../components/ui/AppBar';
import { Field } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Pill';
import { colors, radii, spacing } from '../../components/ui/theme';

const ACCENT = colors.accent;

// Port of xflora_receiving_entry.dart:37
const BUNCH_SIZES = [5, 7, 9, 10, 13] as const;

type FeedbackMsg = { type: 'success' | 'warning' | 'error'; text: string };

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** 8-char uppercase alphanumeric — port of _generateBatchId (xflora_receiving_entry.dart:49). */
function generateBatchId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export default function ReceivingScreen() {
  const router = useRouter();
  const createReceivingEntry = useCreateXfloraReceivingEntry();

  const [bucketInput, setBucketInput] = useState('');
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isBunched, setIsBunched] = useState(false);
  const [selectedBunchSize, setSelectedBunchSize] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const textInputRef = useRef<TextInput>(null);

  function warn(text: string) {
    setFeedback({ type: 'warning', text });
    playError();
    haptics.medium();
  }

  // Clears only the bucket field and refocuses — batch id, bunch size and quantity
  // are intentionally preserved between scans (xflora_receiving_entry.dart:154).
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

  async function handleScannedData(raw: string) {
    if (isProcessingRef.current) return;

    // Bunched mode requires a size + a positive quantity before a scan is accepted.
    if (isBunched) {
      if (selectedBunchSize === null) {
        warn('Please select a bunch size first.');
        return;
      }
      const qty = Number.parseInt(quantity.trim(), 10);
      if (!quantity.trim()) {
        warn('Please enter a quantity first.');
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        warn('Quantity must be a positive number.');
        return;
      }
    }

    let bucketId: string | null = null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).bucket_id != null) {
        bucketId = String((parsed as Record<string, unknown>).bucket_id);
      }
    } catch {
      warn('Invalid QR format.');
      resetState();
      return;
    }

    if (!bucketId) {
      setFeedback({ type: 'error', text: 'Invalid label: no bucket_id found.' });
      playError();
      resetState();
      return;
    }

    isProcessingRef.current = true;
    setLoading(true);
    setFeedback(null);
    haptics.light();

    const qty = isBunched ? Number.parseInt(quantity.trim(), 10) : null;
    try {
      const res = await createReceivingEntry.mutateAsync({
        bucketId,
        batchId: isBatchMode ? batchId : null,
        isBunched,
        bunchSize: isBunched ? selectedBunchSize : null,
        quantity: isBunched ? qty : null,
      });
      playSubmit();
      setFeedback({ type: 'success', text: res.message });
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ type: 'error', text: extractFrappeError(e) });
    } finally {
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

  function toggleBatchMode() {
    setIsBatchMode((prev) => {
      const next = !prev;
      setBatchId(next ? generateBatchId() : null);
      return next;
    });
    textInputRef.current?.focus();
  }

  function toggleBunched() {
    setIsBunched((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedBunchSize(null);
        setQuantity('');
      }
      return next;
    });
    textInputRef.current?.focus();
  }

  return (
    <SafeAreaView style={styles.root}>
      <AppBar title="Receiving Entry" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          {/* Batch Receiving toggle */}
          <Pressable onPress={toggleBatchMode} style={styles.toggleRow}>
            <View style={[styles.checkbox, isBatchMode && styles.checkboxChecked]}>
              {isBatchMode ? <Check size={14} color="white" /> : null}
            </View>
            <View style={styles.toggleLabels}>
              <Text style={styles.toggleLabel}>Batch Receiving</Text>
              <Text style={styles.toggleHint}>
                {isBatchMode ? `Batch: ${batchId}` : 'Single bucket mode'}
              </Text>
            </View>
          </Pressable>

          {/* Is Bunched toggle */}
          <Pressable onPress={toggleBunched} style={styles.toggleRow}>
            <View style={[styles.checkbox, isBunched && styles.checkboxChecked]}>
              {isBunched ? <Check size={14} color="white" /> : null}
            </View>
            <View style={styles.toggleLabels}>
              <Text style={styles.toggleLabel}>Is Bunched</Text>
              <Text style={styles.toggleHint}>{isBunched ? 'Bunched' : 'Not bunched'}</Text>
            </View>
          </Pressable>

          {/* Bunch size + quantity (only when bunched) */}
          {isBunched ? (
            <View style={styles.bunchCard}>
              <Text style={styles.bunchTitle}>Bunch Size</Text>
              <View style={styles.chipRow}>
                {BUNCH_SIZES.map((size) => {
                  const selected = selectedBunchSize === size;
                  return (
                    <Pressable
                      key={size}
                      onPress={() => {
                        setSelectedBunchSize(size);
                        textInputRef.current?.focus();
                      }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {size}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Field label="Quantity (number of bunches)">
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="Enter number of bunches"
                  placeholderTextColor={colors.muted}
                  editable={!loading}
                />
              </Field>
            </View>
          ) : null}

          {/* Bucket QR field — HID-aware; JSON terminator triggers processing */}
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
                <QrCode size={22} color={ACCENT} />
              </Pressable>
            </View>
          </Field>

          {feedback ? <Pill variant={feedback.type}>{feedback.text}</Pill> : null}

          <Text style={styles.hint}>Scan a bucket QR code to record receipt</Text>
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(68,67,62,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: ACCENT, borderColor: ACCENT },
  toggleLabels: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.primary },
  toggleHint: { fontSize: 12, color: colors.muted },
  bunchCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  bunchTitle: { fontSize: 14, fontWeight: '600', color: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 44,
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  chipTextSelected: { color: 'white' },
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
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
