import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { QrCode } from 'lucide-react-native';

import { useFarm } from '../../features/station/useFarm';
import { useReceivingOut } from '../../features/receiving-out/useReceivingOut';
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
import type { ReceivingOutResult } from '../../types/receivingOut';

// Receiving Out — a grader checks a bucket out for grading.
// Flow position: Issue → **Receiving Out** → Grading.
//
// Two scans, same badge-latch pattern as grading: the grader badge latches
// locally, then each bucket scan posts. `grader` is an Employee docname, which
// on this site is the payroll number, so the QR helpers are shared with grading.
//
// The switch/keep decision is the reason this screen exists, so it is rendered
// as an in-screen Card with two buttons rather than an Alert.alert — the packer
// needs to read the prior bucket's variety and remaining stems before choosing.

const MAX_LOG_ROWS = 12;

type FeedbackMsg = { tone: NoticeTone; text: string };
type Slot = 'grader' | 'bucket';

interface LogRow {
  id: string;
  bucketId: string;
  outcome: string;
  detail: string;
  tone: NoticeTone;
  time: string;
}

/** Pending switch/keep decision, held until the grader chooses. */
interface PendingSwitch {
  requestedBucketId: string;
  priorBucketId: string;
  priorVariety: string | null;
  priorRemainingQty: number | null;
}

export default function ReceivingOutScreen() {
  const router = useRouter();
  const farm = useFarm();
  const submitMut = useReceivingOut();

  const [grader, setGrader] = useState<string | null>(null);
  const [graderInput, setGraderInput] = useState('');
  const [bucketInput, setBucketInput] = useState('');
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [open, setOpen] = useState<ReceivingOutResult | null>(null);
  const [entries, setEntries] = useState<LogRow[]>([]);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const scanTargetRef = useRef<Slot>('grader');
  const seqRef = useRef(0);
  const graderRef = useRef<TextInput>(null);
  const bucketRef = useRef<TextInput>(null);

  // `farm` is a required field on the endpoint.
  useEffect(() => {
    if (!farm) router.replace('/configure');
  }, [farm, router]);

  if (!farm) return null;

  const busy = submitMut.isPending;

  function setProgrammatic(slot: Slot, value: string) {
    isSettingProgrammaticallyRef.current = true;
    if (slot === 'grader') setGraderInput(value);
    else setBucketInput(value);
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
  }

  function log(bucketId: string, outcome: string, detail: string, tone: NoticeTone) {
    seqRef.current += 1;
    setEntries((prev) =>
      [
        {
          id: `${seqRef.current}`,
          bucketId,
          outcome,
          detail,
          tone,
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ].slice(0, MAX_LOG_ROWS),
    );
  }

  function latchGrader(value: string) {
    setGrader(value);
    setProgrammatic('grader', value);
    setProgrammatic('bucket', '');
    setPending(null);
    setOpen(null);
    setFeedback(null);
    haptics.light();
    bucketRef.current?.focus();
  }

  function clearGrader() {
    setGrader(null);
    setProgrammatic('grader', '');
    setProgrammatic('bucket', '');
    setPending(null);
    setOpen(null);
    setFeedback(null);
    graderRef.current?.focus();
  }

  async function submit(bucketId: string, confirm?: 'reject' | 'cancel') {
    if (!grader) {
      setFeedback({ tone: 'warn', text: 'Scan the grader badge first.' });
      playError();
      haptics.medium();
      return;
    }
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    setFeedback(null);
    try {
      const res = await submitMut.mutateAsync({
        grader,
        bucketId,
        farm: farm!.farm,
        confirm,
      });

      switch (res.outcome) {
        case 'needs-confirmation':
          // Do NOT clear the field or play a success sound — this is a question,
          // not an outcome. The decision Card below renders from `pending`.
          setPending({
            requestedBucketId: res.requestedBucketId ?? bucketId,
            priorBucketId: res.priorBucketId ?? '—',
            priorVariety: res.priorVariety,
            priorRemainingQty: res.priorRemainingQty,
          });
          setFeedback({ tone: 'warn', text: res.message });
          haptics.medium();
          break;

        case 'already-open':
          setPending(null);
          setOpen(res);
          setFeedback({ tone: 'info', text: res.message });
          haptics.light();
          log(res.bucketId ?? bucketId, 'Already open', res.message, 'info');
          break;

        case 'cancelled':
          setPending(null);
          setOpen(res);
          setFeedback({ tone: 'info', text: res.message });
          log(res.bucketId ?? bucketId, 'Kept prior', res.message, 'info');
          break;

        case 'opened':
          setPending(null);
          setOpen(res);
          playSubmit();
          setFeedback({
            tone: 'success',
            text: `${res.bucketId ?? bucketId} opened — ${res.variety ?? '—'}, ${
              res.remainingQty ?? '—'
            } stems`,
          });
          log(
            res.bucketId ?? bucketId,
            'Opened',
            `${res.variety ?? '—'} · ${res.remainingQty ?? '—'} stems${
              res.receivingOut ? ` · ${res.receivingOut}` : ''
            }`,
            'success',
          );
          break;
      }

      if (res.outcome !== 'needs-confirmation') {
        setProgrammatic('bucket', '');
        bucketRef.current?.focus();
      }
    } catch (e) {
      // Includes "held by <other grader>" — a frappe.throw, so HTTP 500.
      const message = extractFrappeError(e);
      playError();
      haptics.medium();
      setFeedback({ tone: 'danger', text: message });
      log(bucketId, 'Refused', message, 'danger');
      setProgrammatic('bucket', '');
      bucketRef.current?.focus();
    } finally {
      isProcessingRef.current = false;
    }
  }

  function handleValue(slot: Slot, raw: string) {
    if (slot === 'grader') {
      const value = extractGradingQrValue(raw);
      if (value) latchGrader(value);
      return;
    }
    // Bucket ids are NOT uniform and the server unwraps JSON scans itself, so
    // the raw scanned value is forwarded untouched. Pre-parsing here would
    // break "Coldroom Bucket - 2880" and the JSON-wrapped forms.
    const bucketId = raw.trim();
    if (bucketId) void submit(bucketId);
  }

  function routeScan(fallbackSlot: Slot, raw: string) {
    // A badge QR declares itself, so scanning one into the bucket field
    // re-latches the grader rather than being sent as a bucket.
    const detected = detectGradingQrType(raw);
    handleValue(detected === 'grader' ? 'grader' : fallbackSlot, raw);
  }

  function onChangeField(slot: Slot, text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    if (slot === 'grader') setGraderInput(text);
    else setBucketInput(text);

    const trimmed = text.trim();
    if (!trimmed || isProcessingRef.current || pending) return;
    if (trimmed.endsWith('}') || trimmed.length >= 6) routeScan(slot, trimmed);
  }

  function openScanner(slot: Slot) {
    if (busy) return;
    scanTargetRef.current = slot;
    setScannerVisible(true);
  }

  return (
    <Screen title="Receiving Out">
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
              editable={!busy}
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

      {/* The switch/keep decision — the reason this screen exists. */}
      {pending ? (
        <Card title="Grader already holds a bucket">
          <Notice tone="warn">
            {grader} is still holding {pending.priorBucketId}
            {pending.priorVariety ? ` (${pending.priorVariety})` : ''}
            {pending.priorRemainingQty != null
              ? ` with ${pending.priorRemainingQty} stems remaining`
              : ''}
            . Switching closes it as Replaced and records the leftover.
          </Notice>

          <View style={styles.rows}>
            <DetailRow label="Currently held" value={pending.priorBucketId} />
            <DetailRow label="Variety" value={pending.priorVariety ?? '—'} />
            <DetailRow
              label="Remaining"
              value={
                pending.priorRemainingQty != null ? `${pending.priorRemainingQty} stems` : '—'
              }
            />
            <DetailRow label="Scanned" value={pending.requestedBucketId} />
          </View>

          <View style={styles.decisionRow}>
            <Button
              label={`Switch to ${pending.requestedBucketId}`}
              loading={busy}
              onPress={() => void submit(pending.requestedBucketId, 'reject')}
            />
            <Button
              label={`Keep ${pending.priorBucketId}`}
              variant="outline"
              onPress={() => void submit(pending.requestedBucketId, 'cancel')}
            />
          </View>
        </Card>
      ) : null}

      {grader && !pending ? (
        <Card title="Scan bucket">
          <Field label="Bucket">
            <View style={styles.scanRow}>
              <TextInput
                ref={bucketRef}
                style={[styles.input, styles.scanInput]}
                value={bucketInput}
                onChangeText={(t) => onChangeField('bucket', t)}
                autoCapitalize="characters"
                placeholder={busy ? 'Submitting…' : 'Scan bucket QR code…'}
                placeholderTextColor={colors.muted}
                editable={!busy}
              />
              <Pressable style={styles.qrBtn} onPress={() => openScanner('bucket')}>
                <QrCode size={22} color={colors.text} />
              </Pressable>
            </View>
          </Field>

          {busy ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.text} />
              <Text style={styles.hint}>Submitting…</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {open && !pending ? (
        <Card title="Open bucket">
          <View style={styles.rows}>
            <DetailRow label="Bucket" value={open.bucketId ?? '—'} />
            <DetailRow label="Variety" value={open.variety ?? '—'} />
            <DetailRow
              label="Remaining"
              value={open.remainingQty != null ? `${open.remainingQty} stems` : '—'}
            />
            <DetailRow label="Receiving Out" value={open.receivingOut ?? '—'} />
          </View>
        </Card>
      ) : null}

      {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

      {entries.length > 0 ? (
        <Card title="This session">
          <View style={styles.log}>
            {entries.map((row) => (
              <View key={row.id} style={styles.logRow}>
                <View style={styles.logHead}>
                  <Text style={[styles.logBucket, tintFor(row.tone)]} numberOfLines={1}>
                    {row.bucketId}
                  </Text>
                  <Text style={styles.logTime}>
                    {row.outcome} · {row.time}
                  </Text>
                </View>
                <Text style={[styles.logDetail, tintFor(row.tone)]} numberOfLines={3}>
                  {row.detail}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Text style={styles.hint}>
        {pending
          ? 'Choose whether to switch buckets before scanning again.'
          : grader
            ? 'Scan a bucket to check it out for grading.'
            : 'Scan a grader badge to begin.'}
      </Text>

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={(raw) => {
          setScannerVisible(false);
          routeScan(scanTargetRef.current, raw);
        }}
        onCancel={() => setScannerVisible(false)}
      />
    </Screen>
  );
}

function tintFor(tone: NoticeTone) {
  if (tone === 'danger') return styles.logError;
  if (tone === 'warn') return styles.logWarn;
  return null;
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

  rows: { gap: 4, marginTop: spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
    flexShrink: 1,
    textAlign: 'right',
  },

  decisionRow: { gap: spacing.sm, marginTop: spacing.lg },

  log: { gap: spacing.sm },
  logRow: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  logHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  logBucket: { fontSize: 13, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  logTime: { fontSize: 12, color: colors.muted },
  logDetail: { fontSize: 13, color: colors.textSecondary },
  logWarn: { color: colors.warning },
  logError: { color: colors.error },
});
