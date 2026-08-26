import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { QrCode } from 'lucide-react-native';

import {
  extractTraceError,
  useTraceability,
} from '../../features/traceability/useTraceability';
import {
  findGradingEvent,
  formatBunches,
  formatTimestamp,
  graderLabel,
} from '../../features/traceability/format';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { extractScannedId } from '../../lib/qr';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { Card, Notice } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Screen } from '../../components/ui/Screen';
import { colors, radii, spacing } from '../../components/ui/theme';
import type {
  BoxContent,
  BoxCurrent,
  BucketCurrent,
  BunchCurrent,
  StockEvent,
  TraceResult,
} from '../../types/traceability';

// Traceability — scan anything, see where it has been.
//
// One field, three layouts. The kind is decided by the server from the ref's
// prefix, so the screen never guesses: it switches on `kind` and each branch
// renders only the fields that kind actually carries.
//
// A ref the server cannot find comes back HTTP 200 with `exists: false`. That
// is an ANSWER, not a failure, so it renders as an info Notice rather than an
// error — "no such label" and "the lookup broke" are different things to a user
// holding a smudged sticker.

type NotFound = { exists: false; refId: string; message: string };

export default function TraceabilityScreen() {
  const lookupMut = useTraceability();

  const [input, setInput] = useState('');
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const busy = lookupMut.isPending;

  function setProgrammatic(value: string) {
    isSettingProgrammaticallyRef.current = true;
    setInput(value);
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
  }

  async function runLookup(raw: string) {
    if (isProcessingRef.current) return;

    // Unwrapped AT CAPTURE. Bunch and bucket QRs are JSON-wrapped; a printed
    // Box Label encodes a desk URL (/app/box-label/<name>).
    const refId = extractScannedId(raw);
    if (!refId) {
      setError('Could not read a label from that scan.');
      setResult(null);
      playError();
      return;
    }

    isProcessingRef.current = true;
    setError(null);
    setResult(null);
    haptics.light();

    try {
      const res = await lookupMut.mutateAsync(refId);
      setResult(res);
      // A miss is a valid answer, but it should not sound like a hit.
      if (res.exists) playSubmit();
      else playError();
    } catch (e) {
      // 400 + { error }; NOT a Frappe throw, so no _server_messages.
      setError(extractTraceError(e));
      playError();
      haptics.medium();
    } finally {
      isProcessingRef.current = false;
      setProgrammatic(refId);
      inputRef.current?.focus();
    }
  }

  function onChangeText(text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    setInput(text);
    const trimmed = text.trim();
    if (!trimmed || isProcessingRef.current) return;
    if (trimmed.endsWith('}') || trimmed.length >= 6) void runLookup(trimmed);
  }

  function onCameraScan(raw: string) {
    setScannerVisible(false);
    void runLookup(raw);
  }

  function clear() {
    setResult(null);
    setError(null);
    setProgrammatic('');
    inputRef.current?.focus();
  }

  return (
    // NOT `loading={busy}`: Screen's loading state replaces the whole body, so
    // the scan field would vanish on every lookup and the HID scanner would
    // lose focus. The field reports busy itself, via its placeholder.
    <Screen title="Traceability">
      <Card title="Scan a label">
        <Field label="Bunch, bucket or box">
          <View style={styles.scanRow}>
            <TextInput
              ref={inputRef}
              style={[styles.input, styles.scanInput]}
              value={input}
              onChangeText={onChangeText}
              autoFocus
              autoCapitalize="characters"
              placeholder={busy ? 'Looking up…' : 'Scan or type a label…'}
              placeholderTextColor={colors.muted}
              editable={!busy}
              returnKeyType="search"
              onSubmitEditing={() => void runLookup(input)}
            />
            <Pressable
              style={styles.qrBtn}
              onPress={() => {
                if (!busy) setScannerVisible(true);
              }}
            >
              <QrCode size={22} color={colors.text} />
            </Pressable>
          </View>
        </Field>
        {result || error ? (
          <Pressable onPress={clear} hitSlop={8} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </Card>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {result && !result.exists ? <NotFoundView result={result} /> : null}

      {result?.exists && result.kind === 'bunch' ? (
        <BunchView refId={result.refId} current={result.current} events={result.events} />
      ) : null}

      {result?.exists && result.kind === 'bucket' ? (
        <BucketView refId={result.refId} current={result.current} events={result.events} />
      ) : null}

      {result?.exists && result.kind === 'box' ? (
        <BoxView refId={result.refId} current={result.current} events={result.events} />
      ) : null}

      {!result && !error ? (
        <Text style={styles.hint}>Scan a bunch, bucket or box label to see its history</Text>
      ) : null}

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={onCameraScan}
        onCancel={() => setScannerVisible(false)}
      />
    </Screen>
  );
}

// --------------------------------------------------------------------- views

function NotFoundView({ result }: { result: NotFound }) {
  return (
    <Card title="Not found">
      {/* info, not danger: the lookup worked, the label is simply unknown. */}
      <Notice tone="info">{result.message}</Notice>
    </Card>
  );
}

function BunchView({
  refId,
  current,
  events,
}: {
  refId: string;
  current: BunchCurrent;
  events: StockEvent[];
}) {
  // LEAD WITH THE GRADING. "When was this graded and by whom" is the question
  // a bunch scan is asked to answer; the rest of the history is context.
  const grading = findGradingEvent(events);
  const grader = graderLabel(grading);

  return (
    <>
      <Card title="Graded">
        {grading ? (
          <View style={styles.rows}>
            <Text style={styles.lead}>{formatTimestamp(grading.eventTime)}</Text>
            <Text style={styles.leadSub}>{grader ? `by ${grader}` : 'grader not recorded'}</Text>
          </View>
        ) : (
          <Notice tone="warn">No grading event on this bunch yet.</Notice>
        )}
      </Card>

      <Card title={refId}>
        <View style={styles.rows}>
          <DetailRow label="Variety" value={current.itemCode} />
          <DetailRow label="Bunch size" value={current.bunchSize} />
          <DetailRow label="Stem length" value={current.stemLength} />
          <DetailRow label="Farm" value={current.farm} />
        </View>
      </Card>

      <EventList events={events} />
    </>
  );
}

function BucketView({
  refId,
  current,
  events,
}: {
  refId: string;
  current: BucketCurrent;
  events: StockEvent[];
}) {
  return (
    <>
      <Card title={refId}>
        <View style={styles.rows}>
          <DetailRow label="Variety" value={current.itemCode} />
          <DetailRow label="Greenhouse" value={current.greenhouse} />
          <DetailRow label="Status" value={current.status} />
        </View>
      </Card>

      <EventList events={events} />
    </>
  );
}

function BoxView({
  refId,
  current,
  events,
}: {
  refId: string;
  current: BoxCurrent;
  events: BoxContent[];
}) {
  // LEAD WITH THE PACKING. A box has no Stock Entries of its own, so its
  // "history" is when it was packed, by whom, and what went in.
  return (
    <>
      <Card title="Packed">
        <View style={styles.rows}>
          <Text style={styles.lead}>{formatTimestamp(current.packedAt)}</Text>
          {/* Rendered as-is: usually a raw email, since few Employees have a
              user_id set. Prettifying it would be inventing a name. */}
          <Text style={styles.leadSub}>
            {current.packedBy ? `by ${current.packedBy}` : 'packer not recorded'}
          </Text>
          <Text style={styles.leadStat}>
            {formatBunches(current.bunches)} bunch
            {current.bunches === 1 ? '' : 'es'}
            {current.totalStems != null
              ? ` · ${current.totalStems.toLocaleString()} stems`
              : ''}
          </Text>
        </View>
      </Card>

      <Card title={refId}>
        <View style={styles.rows}>
          <DetailRow
            label="Box"
            value={
              current.boxNumber != null
                ? `${current.boxNumber}${current.boxTotalCount ? ` of ${current.boxTotalCount}` : ''}`
                : null
            }
          />
          <DetailRow label="Customer" value={current.customer} />
          <DetailRow label="Consignee" value={current.consignee} />
          <DetailRow label="Length" value={current.length} />
          <DetailRow
            label="Pack rate"
            value={current.packRate ? `${current.packRate.toLocaleString()} stems` : null}
          />
          <DetailRow label="Pick list" value={current.orderPickList} />
          <DetailRow label="Pack list" value={current.farmPackList} />
        </View>
      </Card>

      <Card title={`Contents (${events.length})`}>
        {events.length ? (
          <View style={styles.rows}>
            {events.map((row, i) => (
              <View key={`${row.variety}-${row.length}-${i}`} style={styles.eventRow}>
                <View style={styles.eventMain}>
                  <Text style={styles.eventTitle}>{row.variety ?? '—'}</Text>
                  <Text style={styles.eventDetail}>
                    {[row.length, row.uom].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </View>
                <Text style={styles.eventQty}>
                  {row.qty != null ? `${row.qty.toLocaleString()} stems` : '—'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>This box has no contents recorded.</Text>
        )}
      </Card>
    </>
  );
}

function EventList({ events }: { events: StockEvent[] }) {
  return (
    <Card title={`History (${events.length})`}>
      {events.length ? (
        <View style={styles.rows}>
          {events.map((e, i) => {
            const who = graderLabel(e);
            const move = [e.fromWarehouse, e.toWarehouse].filter(Boolean).join(' → ');
            return (
              <View key={`${e.stockEntry ?? i}-${i}`} style={styles.eventRow}>
                <View style={styles.eventMain}>
                  <Text style={styles.eventTitle}>{e.event ?? '—'}</Text>
                  <Text style={styles.eventDetail}>{formatTimestamp(e.eventTime)}</Text>
                  {who ? <Text style={styles.eventDetail}>by {who}</Text> : null}
                  {move ? <Text style={styles.eventMove}>{move}</Text> : null}
                </View>
                <Text style={styles.eventQty}>
                  {e.qty != null ? e.qty.toLocaleString() : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.hint}>No stock movements recorded against this label.</Text>
      )}
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.sm },
  lead: { fontSize: 22, fontWeight: '700', color: colors.text },
  leadSub: { fontSize: 15, color: colors.textSecondary },
  leadStat: { fontSize: 14, fontWeight: '600', color: colors.muted, marginTop: spacing.xs },
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
  clearBtn: { alignSelf: 'flex-start', paddingTop: spacing.sm },
  clearText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  eventMain: { flex: 1, gap: 2 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  eventDetail: { fontSize: 12, color: colors.muted },
  eventMove: { fontSize: 12, color: colors.textSecondary },
  eventQty: { fontSize: 13, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
