import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, QrCode } from 'lucide-react-native';

import { useBucketItem } from '../../features/receiving/useBucketItem';
import { useCreateXfloraReceivingEntry } from '../../features/receiving/useCreateXfloraReceivingEntry';
import { StemCountPrompt } from '../../features/receiving/StemCountPrompt';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { Card, Notice, type NoticeTone } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Screen } from '../../components/ui/Screen';
import { Segmented } from '../../components/ui/Segmented';
import { colors, radii, spacing } from '../../components/ui/theme';

// Port of xflora_receiving_entry.dart:37
const BUNCH_SIZES = [5, 7, 9, 10, 13] as const;

type FeedbackMsg = { tone: NoticeTone; text: string };

// Bunched and partial-bucket were two checkboxes that disabled each other —
// i.e. a three-state single-select wearing two booleans. Segmented states the
// exclusivity directly. Batch receiving stays a separate checkbox because it is
// orthogonal: it composes with all three modes.
type ReceivingMode = 'standard' | 'bunched' | 'partial';

const MODE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'bunched', label: 'Bunched' },
  { value: 'partial', label: 'Partial' },
] as const satisfies readonly { value: ReceivingMode; label: string }[];

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

/**
 * A scanned bucket held back from posting until the packer supplies a stem
 * count. Only unbunched Spray Roses land here.
 */
type PendingStemCount = { bucketId: string; itemCode: string; standard: number | null };

export default function ReceivingScreen() {
  const createReceivingEntry = useCreateXfloraReceivingEntry();
  const bucketItem = useBucketItem();

  const [bucketInput, setBucketInput] = useState('');
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [mode, setMode] = useState<ReceivingMode>('standard');
  const [selectedBunchSize, setSelectedBunchSize] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('');
  const [overrideQty, setOverrideQty] = useState('');

  const isBunched = mode === 'bunched';
  const isPartial = mode === 'partial';
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [pending, setPending] = useState<PendingStemCount | null>(null);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const textInputRef = useRef<TextInput>(null);

  function warn(text: string) {
    setFeedback({ tone: 'warn', text });
    playError();
    haptics.medium();
  }

  // Clears only the bucket field and refocuses — batch id, bunch size and quantity
  // are intentionally preserved between scans (xflora_receiving_entry.dart:154).
  //
  // `focus` is false while the stem-count prompt is up: refocusing would raise
  // the keyboard behind the modal, and the scan is still in flight so
  // isProcessingRef must stay set.
  function resetState({ focus = true }: { focus?: boolean } = {}) {
    setLoading(false);
    if (focus) isProcessingRef.current = false;
    isSettingProgrammaticallyRef.current = true;
    setBucketInput('');
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
    if (focus) textInputRef.current?.focus();
  }

  /** Posts the entry. Shared by the direct path and the stem-count prompt. */
  async function postEntry(bucketId: string, override: number | null) {
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
        overrideQty: override,
      });
      playSubmit();
      const text =
        res.overrideApplied && res.qty != null
          ? `Received ${res.qty.toLocaleString()} stems (partial)`
          : res.message;
      setFeedback({ tone: 'success', text });
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
    } finally {
      setPending(null);
      resetState();
    }
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

    // Partial-bucket mode requires a positive stems override before a scan is accepted.
    if (isPartial) {
      const ov = Number.parseInt(overrideQty.trim(), 10);
      if (!overrideQty.trim()) {
        warn('Enter the override stems first.');
        return;
      }
      if (!Number.isFinite(ov) || ov <= 0) {
        warn('Override stems must be a positive number.');
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
      setFeedback({ tone: 'danger', text: 'Invalid label: no bucket_id found.' });
      playError();
      resetState();
      return;
    }

    // Unbunched Spray Roses are never a full bucket, so ask for the stem count
    // rather than letting the server apply the 90-stem bucket rate. Only
    // 'standard' qualifies: 'partial' already carries a count the packer typed,
    // and 'bunched' is a different branch on the server entirely.
    if (mode === 'standard') {
      isProcessingRef.current = true;
      setLoading(true);
      setFeedback(null);
      try {
        const item = await bucketItem.mutateAsync(bucketId);
        if (item.isSprayRose) {
          setPending({ bucketId, itemCode: item.itemCode, standard: item.standard });
          haptics.light();
          resetState({ focus: false });
          return;
        }
      } catch (e) {
        // Fail CLOSED. Falling through would post the bucket at its full rate,
        // and if it was an unbunched Spray Rose that silently overstates the
        // receipt — the exact error this prompt exists to prevent. A rescan is
        // cheap; a wrong stem count is not.
        playError();
        haptics.medium();
        setFeedback({
          tone: 'danger',
          text: `Could not read the variety for ${bucketId}: ${extractFrappeError(e)}. Scan again.`,
        });
        resetState();
        return;
      }
    }

    const ov = isPartial ? Number.parseInt(overrideQty.trim(), 10) : null;
    await postEntry(bucketId, ov);
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

  // Leaving a mode clears its inputs, matching the old toggles' behaviour.
  function changeMode(next: ReceivingMode) {
    setMode(next);
    if (next !== 'bunched') {
      setSelectedBunchSize(null);
      setQuantity('');
    }
    if (next !== 'partial') setOverrideQty('');
    textInputRef.current?.focus();
  }

  return (
    <Screen title="Receiving Entry">
      <Card title="Receiving mode">
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

          <Field label="Bucket mode">
            <Segmented value={mode} options={MODE_OPTIONS} onChange={changeMode} />
          </Field>
        </View>
      </Card>

      {/* Bunch size + quantity (only when bunched) */}
      {isBunched ? (
        <Card title="Bunch details">
          <View style={styles.form}>
            <Field label="Bunch Size">
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
            </Field>

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
        </Card>
      ) : null}

      {/* Partial override stems (only when partial) — persists across scans */}
      {isPartial ? (
        <Card title="Partial bucket">
          <Field label="Override stems">
            <TextInput
              style={styles.input}
              value={overrideQty}
              onChangeText={(t) => setOverrideQty(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Enter stems received"
              placeholderTextColor={colors.muted}
              editable={!loading}
            />
          </Field>
          <Text style={styles.hint}>
            Unbunched Spray Roses are asked for a stem count automatically — this mode is for
            everything else.
          </Text>
        </Card>
      ) : null}

      {/* Bucket QR field — HID-aware; JSON terminator triggers processing */}
      <Card title="Scan bucket">
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
      </Card>

      {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

      <Text style={styles.hint}>Scan a bucket QR code to record receipt</Text>

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleCameraScan}
        onCancel={() => setScannerVisible(false)}
      />

      {/* Keyed on the bucket so each scan gets a prompt with empty local state. */}
      {pending ? (
        <StemCountPrompt
          key={pending.bucketId}
          visible
          itemCode={pending.itemCode}
          standard={pending.standard}
          busy={loading}
          onConfirm={(stems) => {
            void postEntry(pending.bucketId, stems);
          }}
          onCancel={() => {
            setPending(null);
            setFeedback({ tone: 'info', text: 'Cancelled — nothing was recorded.' });
            resetState();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleLabels: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.primary },
  toggleHint: { fontSize: 12, color: colors.muted },
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
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
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
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
