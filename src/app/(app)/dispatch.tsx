import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { QrCode, Trash2 } from 'lucide-react-native';

import {
  useCloseSession,
  useOpenSession,
  useRemoveBox,
  useScanBox,
} from '../../features/dispatch/useDispatchSession';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { extractScannedId } from '../../lib/qr';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, Notice, type NoticeTone } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Screen } from '../../components/ui/Screen';
import { colors, radii, spacing } from '../../components/ui/theme';
import type { ScanBoxResult } from '../../types/dispatch';

// Dispatch — boxes are scanned onto a truck, and the paperwork follows.
//
// Truck and driver latch at the top exactly the way Receiving Out latches the
// grader: one decision, then a scan field that keeps focus.
//
// ORDER COMPLETION IS THE MOMENT THAT MATTERS. When `order_complete` comes back
// true a Delivery Note has been SUBMITTED and stock has left XFL Graded Sold.
// That is not the same weight as an ordinary scan, so it gets a Notice that
// PERSISTS across subsequent scans rather than being replaced by the next
// "box 4 of 9" line, plus the note name on that box's log row.
//
// A `delivery_note_error` is a WARN, never an error: the box is physically on
// the truck and the scan succeeded. Only the paperwork needs a human. The
// server guarantees this — box.loaded is written and committed before the note
// is attempted, and both create and submit are guarded.

const MAX_LOG_ROWS = 40;

type FeedbackMsg = { tone: NoticeTone; text: string };
type Slot = 'truck' | 'box';

interface LogRow {
  id: string;
  boxLabel: string;
  detail: string;
  tone: NoticeTone;
  /** Set only on the scan that completed an order. */
  deliveryNote: string | null;
  time: string;
}

/** The last completed order. Held separately so it survives the next scan. */
interface CompletedOrder {
  salesOrder: string;
  customer: string | null;
  deliveryNote: string | null;
  deliveryNoteError: string | null;
  boxes: number;
}

export default function DispatchScreen() {
  const openMut = useOpenSession();
  const scanMut = useScanBox();
  const removeMut = useRemoveBox();
  const closeMut = useCloseSession();

  const [truckInput, setTruckInput] = useState('');
  const [driverInput, setDriverInput] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [truckReg, setTruckReg] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);

  const [boxInput, setBoxInput] = useState('');
  const [entries, setEntries] = useState<LogRow[]>([]);
  const [completed, setCompleted] = useState<CompletedOrder | null>(null);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const scanTargetRef = useRef<Slot>('box');
  const seqRef = useRef(0);
  const truckRef = useRef<TextInput>(null);
  const boxRef = useRef<TextInput>(null);

  const busy = openMut.isPending || scanMut.isPending || removeMut.isPending || closeMut.isPending;

  function warn(text: string) {
    setFeedback({ tone: 'warn', text });
    playError();
    haptics.medium();
  }

  function fail(text: string) {
    setFeedback({ tone: 'danger', text });
    playError();
    haptics.medium();
  }

  function setProgrammatic(value: string) {
    isSettingProgrammaticallyRef.current = true;
    setBoxInput(value);
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
  }

  function log(row: Omit<LogRow, 'id' | 'time'>) {
    seqRef.current += 1;
    setEntries((prev) =>
      [
        { ...row, id: String(seqRef.current), time: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, MAX_LOG_ROWS),
    );
  }

  // ---------------------------------------------------------------- session

  async function handleOpenSession() {
    const truck = truckInput.trim().toUpperCase();
    const driver = driverInput.trim();
    if (!truck) {
      warn('Enter the truck registration first.');
      return;
    }
    if (!driver) {
      warn('Enter the driver name first.');
      return;
    }

    setFeedback(null);
    try {
      const res = await openMut.mutateAsync({ truckReg: truck, driverName: driver });
      setSession(res.session);
      setTruckReg(truck);
      // On a reused session the ORIGINAL driver is authoritative — two people
      // scanning one truck share a manifest, and the first name on it wins.
      setDriverName(res.driverName ?? driver);
      setDriverInput(res.driverName ?? driver);
      playSubmit();
      haptics.light();
      setFeedback({
        tone: res.reused ? 'info' : 'success',
        text: res.reused
          ? `Joined the open session for ${truck} — driver ${res.driverName ?? driver}.`
          : res.message,
      });
      boxRef.current?.focus();
    } catch (e) {
      fail(extractFrappeError(e));
    }
  }

  function changeTruck() {
    setSession(null);
    setTruckReg(null);
    setDriverName(null);
    setEntries([]);
    setCompleted(null);
    setFeedback(null);
    setProgrammatic('');
    truckRef.current?.focus();
  }

  async function handleClose() {
    if (!session) return;
    try {
      const res = await closeMut.mutateAsync(session);
      playSubmit();
      haptics.light();
      const notes = res.deliveryNotes.length
        ? ` Delivery Notes: ${res.deliveryNotes.join(', ')}.`
        : '';
      Alert.alert(
        'Session closed',
        `${res.totalBoxes} box${res.totalBoxes === 1 ? '' : 'es'} on ${truckReg}. `
          + `${res.ordersCompleted} order${res.ordersCompleted === 1 ? '' : 's'} completed.${notes}`,
        [{ text: 'OK', onPress: changeTruck }],
      );
    } catch (e) {
      fail(extractFrappeError(e));
    }
  }

  function confirmClose() {
    if (!session) return;
    Alert.alert(
      'Close session?',
      `${entries.length} box${entries.length === 1 ? '' : 'es'} scanned onto ${truckReg}. `
        + 'No more boxes can be added after closing.',
      [
        { text: 'Keep scanning', style: 'cancel' },
        { text: 'Close', style: 'destructive', onPress: () => void handleClose() },
      ],
    );
  }

  // ------------------------------------------------------------------ scans

  /** Progress for a freshly loaded box. `already_loaded` carries no counts. */
  function describe(res: ScanBoxResult): string {
    return res.boxesTotal ? `Loaded (${res.boxesLoaded} of ${res.boxesTotal})` : 'Loaded';
  }

  async function handleBoxScan(raw: string) {
    if (!session || isProcessingRef.current) return;

    // Unwrapped AT CAPTURE, before it reaches state or the payload. A printed
    // Box Label's QR is a desk URL (/app/box-label/<name>), not a bare id.
    const boxLabel = extractScannedId(raw);
    if (!boxLabel) {
      warn('Could not read a box label from that scan.');
      setProgrammatic('');
      return;
    }

    isProcessingRef.current = true;
    setFeedback(null);
    haptics.light();

    try {
      const res = await scanMut.mutateAsync({ session, boxLabel });

      if (res.status === 'already_loaded') {
        // The server reports WHICH session holds it, looked up from Dispatch
        // Session Box — not necessarily this one. A box already on another
        // lorry is a different problem from a double scan, and saying "already
        // on this truck" for both would send the wrong box out.
        const elsewhere = res.onSession != null && res.onSession !== session;
        if (elsewhere) {
          fail(
            `${res.boxLabel} is already loaded on ANOTHER session (${res.onSession}). `
              + 'Do not put it on this truck.',
          );
        } else {
          warn(`${res.boxLabel} is already on this truck — scanned twice.`);
        }
        log({
          boxLabel: res.boxLabel,
          detail: elsewhere ? `Already on ${res.onSession}` : 'Already on this truck',
          tone: elsewhere ? 'danger' : 'warn',
          deliveryNote: null,
        });
        return;
      }

      playSubmit();

      if (res.orderComplete) {
        // Stock has MOVED. Held in its own slot so the next scan cannot wipe it.
        setCompleted({
          salesOrder: res.salesOrder ?? '—',
          customer: res.customer,
          deliveryNote: res.deliveryNote,
          deliveryNoteError: res.deliveryNoteError,
          boxes: res.boxesTotal,
        });
        haptics.medium();
      }

      if (res.deliveryNoteError) {
        // WARN, not error: the box IS loaded. Only the paperwork needs a human.
        setFeedback({
          tone: 'warn',
          text: `${res.boxLabel} is loaded. ${res.deliveryNoteError} — the box is on the truck; `
            + 'the Delivery Note needs finishing by hand.',
        });
      } else {
        setFeedback({ tone: 'success', text: res.message });
      }

      log({
        boxLabel: res.boxLabel,
        detail: [describe(res), res.customer, res.salesOrder].filter(Boolean).join(' · '),
        tone: res.deliveryNoteError ? 'warn' : res.orderComplete ? 'success' : 'info',
        deliveryNote: res.deliveryNote,
      });
    } catch (e) {
      fail(extractFrappeError(e));
    } finally {
      isProcessingRef.current = false;
      setProgrammatic('');
      boxRef.current?.focus();
    }
  }

  function confirmRemove(boxLabel: string) {
    if (!session) return;
    Alert.alert(
      'Remove box?',
      `${boxLabel} will be taken off this session. This is refused once the order's `
        + 'Delivery Note exists.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removeMut.mutateAsync({ session, boxLabel });
                setEntries((prev) => prev.filter((r) => r.boxLabel !== boxLabel));
                playSubmit();
                setFeedback({ tone: 'info', text: `${boxLabel} removed from the session.` });
              } catch (e) {
                fail(extractFrappeError(e));
              }
            })();
          },
        },
      ],
    );
  }

  function onChangeBox(text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    setBoxInput(text);
    const trimmed = text.trim();
    if (!trimmed || isProcessingRef.current) return;
    // Same capture rule as the other scan screens: a JSON terminator, or enough
    // characters to be a real label.
    if (trimmed.endsWith('}') || trimmed.length >= 6) void handleBoxScan(trimmed);
  }

  function openScanner(slot: Slot) {
    if (busy) return;
    scanTargetRef.current = slot;
    setScannerVisible(true);
  }

  function onCameraScan(raw: string) {
    setScannerVisible(false);
    if (scanTargetRef.current === 'truck') {
      setTruckInput((extractScannedId(raw) ?? raw).toUpperCase());
      return;
    }
    void handleBoxScan(raw);
  }

  // ----------------------------------------------------------------- render

  return (
    <Screen
      title="Dispatch"
      footer={
        session ? (
          <Button
            label="Close session"
            variant="outline"
            onPress={confirmClose}
            disabled={busy}
            loading={closeMut.isPending}
          />
        ) : null
      }
    >
      <Card title={session ? 'Truck' : 'Open a session'}>
        {session ? (
          <View style={styles.rows}>
            <DetailRow label="Truck" value={truckReg ?? '—'} />
            <DetailRow label="Driver" value={driverName ?? '—'} />
            <DetailRow label="Session" value={session} />
            <Button
              label="Change truck"
              variant="outline"
              onPress={changeTruck}
              disabled={busy}
              style={styles.changeBtn}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <Field label="Truck registration">
              <View style={styles.scanRow}>
                <TextInput
                  ref={truckRef}
                  style={[styles.input, styles.scanInput]}
                  value={truckInput}
                  onChangeText={(t) => setTruckInput(t.toUpperCase())}
                  autoFocus
                  autoCapitalize="characters"
                  placeholder="e.g. KDA 123A"
                  placeholderTextColor={colors.muted}
                  editable={!busy}
                />
                <Pressable style={styles.qrBtn} onPress={() => openScanner('truck')}>
                  <QrCode size={22} color={colors.text} />
                </Pressable>
              </View>
            </Field>

            <Field label="Driver name">
              <TextInput
                style={styles.input}
                value={driverInput}
                onChangeText={setDriverInput}
                placeholder="Driver name"
                placeholderTextColor={colors.muted}
                editable={!busy}
                returnKeyType="done"
                onSubmitEditing={() => void handleOpenSession()}
              />
            </Field>

            <Button
              label="Open session"
              onPress={() => void handleOpenSession()}
              disabled={busy}
              loading={openMut.isPending}
            />
          </View>
        )}
      </Card>

      {/* PERSISTENT. Stock has moved — this outlives the next scan. */}
      {completed ? (
        <Card title="Order complete">
          <Notice tone={completed.deliveryNoteError ? 'warn' : 'success'}>
            {completed.salesOrder}
            {completed.customer ? ` for ${completed.customer}` : ''} is fully loaded
            {completed.boxes ? ` — all ${completed.boxes} boxes` : ''}.
            {completed.deliveryNote
              ? ` Delivery Note ${completed.deliveryNote} submitted; stock has moved.`
              : ''}
            {completed.deliveryNoteError
              ? ` ${completed.deliveryNoteError} — the boxes are loaded, but the Delivery Note`
                + ' needs finishing by hand.'
              : ''}
          </Notice>
          <Button
            label="Dismiss"
            variant="ghost"
            onPress={() => setCompleted(null)}
            style={styles.changeBtn}
          />
        </Card>
      ) : null}

      {session ? (
        <Card title="Scan box">
          <Field label="Box label">
            <View style={styles.scanRow}>
              <TextInput
                ref={boxRef}
                style={[styles.input, styles.scanInput]}
                value={boxInput}
                onChangeText={onChangeBox}
                autoFocus
                autoCapitalize="characters"
                placeholder={scanMut.isPending ? 'Processing…' : 'Scan box label…'}
                placeholderTextColor={colors.muted}
                editable={!busy}
              />
              <Pressable style={styles.qrBtn} onPress={() => openScanner('box')}>
                <QrCode size={22} color={colors.text} />
              </Pressable>
            </View>
          </Field>
        </Card>
      ) : null}

      {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

      {entries.length ? (
        <Card title={`Boxes on this truck (${entries.length})`}>
          <View style={styles.rows}>
            {entries.map((row) => (
              <View key={row.id} style={styles.logRow}>
                <View style={styles.logMain}>
                  <Text style={styles.logLabel}>{row.boxLabel}</Text>
                  <Text style={styles.logDetail}>{row.detail}</Text>
                  {row.deliveryNote ? (
                    <Text style={styles.logNote}>Delivery Note {row.deliveryNote}</Text>
                  ) : null}
                </View>
                <Text style={styles.logTime}>{row.time}</Text>
                <Pressable
                  onPress={() => confirmRemove(row.boxLabel)}
                  disabled={busy}
                  hitSlop={8}
                  style={styles.removeBtn}
                >
                  <Trash2 size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {session && !entries.length ? (
        <Text style={styles.hint}>Scan a box label to load it onto {truckReg}</Text>
      ) : null}

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={onCameraScan}
        onCancel={() => setScannerVisible(false)}
      />
    </Screen>
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
  form: { gap: spacing.md },
  rows: { gap: spacing.sm },
  changeBtn: { marginTop: spacing.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailLabel: { fontSize: 13, color: colors.muted },
  detailValue: { fontSize: 13, fontWeight: '600', color: colors.text, flexShrink: 1 },
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
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  logMain: { flex: 1, gap: 2 },
  logLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  logDetail: { fontSize: 12, color: colors.muted },
  logNote: { fontSize: 12, fontWeight: '600', color: colors.success },
  logTime: { fontSize: 11, color: colors.muted },
  removeBtn: { padding: 4 },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
