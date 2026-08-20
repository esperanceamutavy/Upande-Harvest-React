import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { QrCode } from 'lucide-react-native';

import { useFarm } from '../../features/station/useFarm';
import { useSubmitGrading } from '../../features/grading/useSubmitGrading';
import { detectGradingQrType, extractGradingQrValue } from '../../features/grading/gradingQr';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, Notice, type NoticeTone } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Screen } from '../../components/ui/Screen';
import { colors, radii, spacing } from '../../components/ui/theme';
import type { GradingEntry } from '../../types/grading';

// Grading. Two scans, ONE server call:
//   1. grader badge → latched locally, no request
//   2. bunch QR     → mobile_grading_entry, serialized
//
// The server resolves everything about the bunch off the Bunch QR Code record.
// It does not resolve a bucket — it never reads bucket_id and never looks at
// Receiving Out — and it moves stock between two hardcoded warehouses. So there
// is nothing for the client to pre-fetch and nothing to pre-validate.
//
// Failure modes, all surfaced from the server's own message (RESTYLE_PLAN.md
// §8.2): bunch not found, ALREADY GRADED, employee not found, invalid bunch
// size. Already-graded is the one a grader actually hits — it is a duplicate
// scan, not a fault, so it reads as a warning in both the Notice and the log.
//
// Deliberately out of scope: sqlite, the sync queue, the stem pool, bouquet
// grading, bucket balance, rejects.

const MAX_LOG_ROWS = 12;

type FeedbackMsg = { tone: NoticeTone; text: string };
type Slot = 'grader' | 'bunch';

// The server's duplicate-scan rejection is
// "Bunch <id> has already been graded by <name> (<stock entry>)".
// Substring-matched rather than compared: the message interpolates the grader's
// name and the Stock Entry id, and Frappe may prefix it on the way out.
function isAlreadyGraded(message: string): boolean {
  return message.toLowerCase().includes('already been graded');
}

export default function GradingScreen() {
  const router = useRouter();
  const farm = useFarm();
  const submitMut = useSubmitGrading();

  const [grader, setGrader] = useState<string | null>(null);
  const [graderInput, setGraderInput] = useState('');
  const [bunchInput, setBunchInput] = useState('');
  const [entries, setEntries] = useState<GradingEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const scanTargetRef = useRef<Slot>('grader');
  const seqRef = useRef(0);
  const graderRef = useRef<TextInput>(null);
  const bunchRef = useRef<TextInput>(null);

  // Grading writes against a farm, same as shelving.
  useEffect(() => {
    if (!farm) router.replace('/configure');
  }, [farm, router]);

  if (!farm) return null;

  const submitting = submitMut.isPending;

  function warn(text: string) {
    setFeedback({ tone: 'warn', text });
    playError();
    haptics.medium();
  }

  function setProgrammatic(slot: Slot, value: string) {
    isSettingProgrammaticallyRef.current = true;
    if (slot === 'grader') setGraderInput(value);
    else setBunchInput(value);
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
  }

  function latchGrader(value: string) {
    setGrader(value);
    setProgrammatic('grader', value);
    setProgrammatic('bunch', '');
    setFeedback(null);
    haptics.light();
    bunchRef.current?.focus();
  }

  function clearGrader() {
    setGrader(null);
    setProgrammatic('grader', '');
    setProgrammatic('bunch', '');
    setFeedback(null);
    graderRef.current?.focus();
  }

  function logEntry(entry: Omit<GradingEntry, 'id' | 'time'>) {
    seqRef.current += 1;
    const row: GradingEntry = {
      ...entry,
      id: `${seqRef.current}`,
      time: new Date().toLocaleTimeString(),
    };
    setEntries((prev) => [row, ...prev].slice(0, MAX_LOG_ROWS));
  }

  async function submitBunch(bunchId: string) {
    if (isProcessingRef.current) return;
    if (!grader) {
      warn('Scan the grader badge first.');
      return;
    }

    isProcessingRef.current = true;
    setFeedback(null);
    try {
      const res = await submitMut.mutateAsync({ bunchId, grader, farm: farm!.farm });
      playSubmit();

      const stems = res.qty != null ? `${res.qty} stems` : 'graded';
      const variety = res.variety ? ` · ${res.variety}` : '';
      setFeedback({ tone: 'success', text: `Graded: ${stems}${variety}` });
      logEntry({
        bunchId,
        grader,
        status: 'success',
        variety: res.variety,
        qty: res.qty,
        message: res.message,
      });
    } catch (e) {
      // The server's message is always more specific than anything we could
      // synthesise, so it is passed straight through. Real failure modes:
      // bunch not found, already graded, employee not found, invalid bunch size.
      const message = extractFrappeError(e);
      const duplicate = isAlreadyGraded(message);

      playError();
      haptics.medium();
      // A re-scan is a warning, not a fault — it means the bunch is already in
      // the system, which is a benign outcome for the packer.
      setFeedback({ tone: duplicate ? 'warn' : 'danger', text: message });
      logEntry({
        bunchId,
        grader,
        status: duplicate ? 'duplicate' : 'error',
        variety: null,
        qty: null,
        message,
      });
    } finally {
      setProgrammatic('bunch', '');
      isProcessingRef.current = false;
      bunchRef.current?.focus();
    }
  }

  function handleValue(slot: Slot, raw: string) {
    const value = extractGradingQrValue(raw);
    if (!value) return;
    if (slot === 'grader') latchGrader(value);
    else void submitBunch(value);
  }

  // HID wedge scanners type the payload then a terminator. Route by the QR's own
  // declared type where it has one, so a badge scanned into the bunch field
  // re-latches the grader instead of being submitted as a bunch.
  function routeScan(fallbackSlot: Slot, raw: string): void {
    const detected = detectGradingQrType(raw);
    if (detected === 'bucket') {
      warn('In Direct-to-Grader mode, scan the grader badge — not the bucket.');
      return;
    }
    handleValue(detected === 'unknown' ? fallbackSlot : detected, raw);
  }

  function onChangeField(slot: Slot, text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    if (slot === 'grader') setGraderInput(text);
    else setBunchInput(text);

    const trimmed = text.trim();
    if (!trimmed || isProcessingRef.current) return;

    const looksComplete = trimmed.endsWith('}') || trimmed.length >= 6;
    if (!looksComplete) return;

    if (detectGradingQrType(trimmed) === 'bucket') {
      setProgrammatic(slot, '');
    }
    routeScan(slot, trimmed);
  }

  function openScanner(slot: Slot) {
    if (submitting) return;
    scanTargetRef.current = slot;
    setScannerVisible(true);
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    routeScan(scanTargetRef.current, raw);
  }

  return (
    <Screen title="Grading">
      <Card title="Scan grader">
        <Field label="Grader">
          <View style={styles.scanRow}>
            <TextInput
              ref={graderRef}
              style={[styles.input, styles.scanInput]}
              value={graderInput}
              onChangeText={(t) => onChangeField('grader', t)}
              autoFocus
              autoCapitalize="characters"
              placeholder="Scan grader badge…"
              placeholderTextColor={colors.muted}
              editable={!submitting}
            />
            <Pressable style={styles.qrBtn} onPress={() => openScanner('grader')}>
              <QrCode size={22} color={colors.text} />
            </Pressable>
          </View>
        </Field>

        {grader ? (
          <Button
            label="Change grader"
            variant="outline"
            onPress={clearGrader}
            style={styles.changeBtn}
          />
        ) : null}
      </Card>

      {grader ? (
        <Card title="Scan bunch">
          <Field label="Bunch QR">
            <View style={styles.scanRow}>
              <TextInput
                ref={bunchRef}
                style={[styles.input, styles.scanInput]}
                value={bunchInput}
                onChangeText={(t) => onChangeField('bunch', t)}
                autoCapitalize="characters"
                placeholder={submitting ? 'Submitting…' : 'Scan bunch QR code…'}
                placeholderTextColor={colors.muted}
                editable={!submitting}
              />
              <Pressable style={styles.qrBtn} onPress={() => openScanner('bunch')}>
                <QrCode size={22} color={colors.text} />
              </Pressable>
            </View>
          </Field>

          {submitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.text} />
              <Text style={styles.hint}>Grading…</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

      {entries.length > 0 ? (
        <Card title="This session">
          <View style={styles.log}>
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </View>
        </Card>
      ) : null}

      <Text style={styles.hint}>
        {grader
          ? 'Keep scanning bunches — the grader stays latched until you change it.'
          : 'Scan a grader badge to begin.'}
      </Text>

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleCameraScan}
        onCancel={() => setScannerVisible(false)}
      />
    </Screen>
  );
}

// Variety and qty are server-resolved — this row is the only place they are
// visible, since the client cannot know them before the write.
//
// Three states, deliberately: a duplicate scan is the most common non-success
// outcome and is not a fault, so it reads amber rather than red.
function EntryRow({ entry }: { entry: GradingEntry }) {
  const tint =
    entry.status === 'error'
      ? styles.logError
      : entry.status === 'duplicate'
        ? styles.logDuplicate
        : null;

  const detail =
    entry.status === 'success'
      ? [entry.variety, entry.qty != null ? `${entry.qty} stems` : null]
          .filter(Boolean)
          .join(' · ') || entry.message
      : entry.message;

  return (
    <View style={styles.logRow}>
      <View style={styles.logHead}>
        <Text style={[styles.logBunch, tint]} numberOfLines={1}>
          {entry.bunchId}
        </Text>
        <Text style={styles.logTime}>{entry.time}</Text>
      </View>
      <Text style={[styles.logDetail, tint]} numberOfLines={3}>
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  changeBtn: { marginTop: spacing.md },

  log: { gap: spacing.sm },
  logRow: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  logHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  logBunch: { fontSize: 13, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  logTime: { fontSize: 12, color: colors.muted },
  logDetail: { fontSize: 13, color: colors.textSecondary },
  logError: { color: colors.error },
  logDuplicate: { color: colors.warning },
});
