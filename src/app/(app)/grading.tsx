import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { QrCode } from 'lucide-react-native';

import { useFarm } from '../../features/station/useFarm';
import { useGraderOpenBucket } from '../../features/grading/useGraderOpenBucket';
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
import type { GraderOpenBucket } from '../../types/grading';

// Direct-to-Grader grading. Two scans, in order:
//   1. grader badge → resolves their open bucket (get_grader_open_bucket)
//   2. bunch QR     → submits immediately (mobile_grading_entry, serialized)
// The grader stays latched across bunches so a whole bucket can be graded
// without re-scanning the badge. See RESTYLE_PLAN.md §8.2.
//
// Deliberately out of scope: sqlite, the sync queue, the stem pool, bouquet
// grading, bucket balance, rejects.

type FeedbackMsg = { tone: NoticeTone; text: string };
type Slot = 'grader' | 'bunch';

export default function GradingScreen() {
  const router = useRouter();
  const farm = useFarm();
  const openBucketMut = useGraderOpenBucket();
  const submitMut = useSubmitGrading();

  const [grader, setGrader] = useState<string | null>(null);
  const [openBucket, setOpenBucket] = useState<GraderOpenBucket | null>(null);
  const [graderInput, setGraderInput] = useState('');
  const [bunchInput, setBunchInput] = useState('');
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const scanTargetRef = useRef<Slot>('grader');
  const graderRef = useRef<TextInput>(null);
  const bunchRef = useRef<TextInput>(null);

  // Grading writes against a farm, same as shelving.
  useEffect(() => {
    if (!farm) router.replace('/configure');
  }, [farm, router]);

  if (!farm) return null;

  const loadingBucket = openBucketMut.isPending;
  const submitting = submitMut.isPending;
  const canGrade = !!grader && !!openBucket?.open && !!openBucket.bucketId;

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

  function clearGrader() {
    setGrader(null);
    setOpenBucket(null);
    setProgrammatic('grader', '');
    setProgrammatic('bunch', '');
    setFeedback(null);
    graderRef.current?.focus();
  }

  async function resolveGrader(value: string) {
    setFeedback(null);
    try {
      const result = await openBucketMut.mutateAsync(value);
      if (!result.open || !result.bucketId) {
        setGrader(null);
        setOpenBucket(null);
        setFeedback({
          tone: 'danger',
          text: `${value} has no open bucket. Do Receiving Out first.`,
        });
        playError();
        haptics.medium();
        graderRef.current?.focus();
        return;
      }
      setGrader(value);
      setOpenBucket(result);
      haptics.light();
      bunchRef.current?.focus();
    } catch (e) {
      setGrader(null);
      setOpenBucket(null);
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
      playError();
    }
  }

  async function submitBunch(bunchId: string) {
    if (isProcessingRef.current) return;
    if (!grader || !openBucket?.bucketId) {
      warn('Scan the grader badge first.');
      return;
    }

    isProcessingRef.current = true;
    setFeedback(null);
    try {
      const res = await submitMut.mutateAsync({
        bunchId,
        grader,
        bucketId: openBucket.bucketId,
        farm: farm!.farm,
      });
      playSubmit();
      const stems = res.qty != null ? `${res.qty} stems` : 'graded';
      const variety = res.variety ? ` · ${res.variety}` : '';
      setFeedback({ tone: 'success', text: `Graded: ${stems}${variety}` });

      // Refresh remaining_qty so the bucket card reflects the write.
      try {
        const refreshed = await openBucketMut.mutateAsync(grader);
        setOpenBucket(refreshed);
        if (!refreshed.open) {
          setFeedback({ tone: 'info', text: 'Bucket finished. Scan the next grader or bucket.' });
        }
      } catch {
        // Non-fatal — the grade landed; only the counter is stale.
      }
    } catch (e) {
      playError();
      haptics.medium();
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
    } finally {
      setProgrammatic('bunch', '');
      isProcessingRef.current = false;
      bunchRef.current?.focus();
    }
  }

  function handleValue(slot: Slot, raw: string) {
    const value = extractGradingQrValue(raw);
    if (!value) return;
    if (slot === 'grader') void resolveGrader(value);
    else void submitBunch(value);
  }

  // HID wedge scanners type the payload then a terminator. Route by the QR's
  // own type when it declares one, so a grader badge scanned into the bunch
  // field still latches the grader instead of being submitted as a bunch.
  function onChangeField(slot: Slot, text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    if (slot === 'grader') setGraderInput(text);
    else setBunchInput(text);

    const trimmed = text.trim();
    if (!trimmed || isProcessingRef.current) return;

    const looksComplete = trimmed.endsWith('}') || trimmed.length >= 6;
    if (!looksComplete) return;

    const detected = detectGradingQrType(trimmed);
    if (detected === 'bucket') {
      warn('In Direct-to-Grader mode, scan the grader badge — not the bucket.');
      setProgrammatic(slot, '');
      return;
    }
    const target: Slot = detected === 'unknown' ? slot : detected;
    handleValue(target, trimmed);
  }

  function openScanner(slot: Slot) {
    if (submitting || loadingBucket) return;
    scanTargetRef.current = slot;
    setScannerVisible(true);
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    const detected = detectGradingQrType(raw);
    if (detected === 'bucket') {
      warn('In Direct-to-Grader mode, scan the grader badge — not the bucket.');
      return;
    }
    const target: Slot = detected === 'unknown' ? scanTargetRef.current : detected;
    handleValue(target, raw);
  }

  return (
    <Screen title="Grading">
      <Card title="Scan grader">
        <View style={styles.form}>
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
                editable={!loadingBucket && !submitting}
              />
              <Pressable style={styles.qrBtn} onPress={() => openScanner('grader')}>
                <QrCode size={22} color={colors.text} />
              </Pressable>
            </View>
          </Field>

          {loadingBucket ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.text} />
              <Text style={styles.hint}>Resolving open bucket…</Text>
            </View>
          ) : null}
        </View>
      </Card>

      {canGrade && openBucket ? (
        <Card title="Open bucket">
          <View style={styles.rows}>
            <DetailRow label="Grader" value={grader ?? '—'} />
            <DetailRow label="Bucket" value={openBucket.bucketId ?? '—'} />
            <DetailRow label="Variety" value={openBucket.variety ?? '—'} />
            <DetailRow
              label="Remaining"
              value={
                openBucket.remainingQty != null
                  ? `${openBucket.remainingQty}${
                      openBucket.initialQty != null ? ` / ${openBucket.initialQty}` : ''
                    } stems`
                  : '—'
              }
            />
          </View>
          <Button
            label="Change grader"
            variant="outline"
            onPress={clearGrader}
            style={styles.changeBtn}
          />
        </Card>
      ) : null}

      {canGrade ? (
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

      <Text style={styles.hint}>
        {canGrade
          ? 'Keep scanning bunches — the grader stays latched until you change it.'
          : 'Scan a grader badge to begin. They must have an open Receiving Out.'}
      </Text>

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleCameraScan}
        onCancel={() => setScannerVisible(false)}
      />
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  rows: { gap: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
    flexShrink: 1,
    textAlign: 'right',
  },
  changeBtn: { marginTop: spacing.md },
});
