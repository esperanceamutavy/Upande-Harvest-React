import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { QrCode } from 'lucide-react-native';

import { useOplList } from '../../features/packing/useOplList';
import { deriveSession, useOrderPickList } from '../../features/packing/useOrderPickList';
import { useBunchDetails } from '../../features/packing/useBunchDetails';
import {
  classifyPackError,
  stripPackingErrorPrefix,
  usePackBunch,
} from '../../features/packing/usePackBunch';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, Notice, type NoticeTone } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Screen } from '../../components/ui/Screen';
import { Segmented } from '../../components/ui/Segmented';
import { colors, radii, spacing } from '../../components/ui/theme';
import type {
  BunchDetails,
  OplDateFilter,
  OplListItem,
  PackEntry,
  PackRejection,
  PackingSession,
} from '../../types/packing';

// Packing. Three steps: pick an OPL, review it, then scan bunches into boxes.
//
// One request per bunch (Rule 2), so an ungraded-bunch rejection names the scan
// that caused it. The client owns box numbering and the stem cap (Rule 1) — the
// server has neither. Rule 3 validates variety and stem length against the
// OPL's rows before posting, because a mismatch does not error server-side, it
// silently packs into the wrong warehouse. See RESTYLE_PLAN.md §8.3.

const MAX_LOG_ROWS = 12;

const DATE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
] as const satisfies readonly { value: OplDateFilter; label: string }[];

type FeedbackMsg = { tone: NoticeTone; text: string };

const REJECTION_TONE: Record<PackRejection, NoticeTone> = {
  'duplicate-in-session': 'warn',
  'already-packed': 'warn',
  ungraded: 'danger',
  'variety-mismatch': 'danger',
  'length-mismatch': 'danger',
  'order-complete': 'danger',
  'bad-uom': 'danger',
  error: 'danger',
};

export default function PackingScreen() {
  const [range, setRange] = useState<OplDateFilter>('today');
  const oplList = useOplList(range);
  const oplMut = useOrderPickList();
  const bunchMut = useBunchDetails();
  const packMut = usePackBunch();

  const [session, setSession] = useState<PackingSession | null>(null);
  const [bunchInput, setBunchInput] = useState('');

  // Box state. The client owns both — nothing server-side tracks them, and
  // total_stems must never be read back (it was corrupt until 2026-08-20 and is
  // a server-side derivation either way).
  const [boxNumber, setBoxNumber] = useState(1);
  // "units", not stems: these accumulate in whatever unit the OPL's cap uses.
  // The per-bunch increment is the bunch's own stem count, which is correct
  // when the OPL is well-formed and wrong in the same direction as the OPL when
  // it is not — see the allocator defect in §8.3.
  const [unitsInBox, setUnitsInBox] = useState(0);
  const [unitsPacked, setUnitsPacked] = useState(0);
  // DISPLAY ONLY — plain bunch counts. Rule 1 never reads these; it compares
  // unitsInBox against capPerBox so like is compared with like.
  const [bunchesInBox, setBunchesInBox] = useState(0);
  const [bunchesPacked, setBunchesPacked] = useState(0);

  const [entries, setEntries] = useState<PackEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const packedIdsRef = useRef<Set<string>>(new Set());
  const seqRef = useRef(0);
  const bunchRef = useRef<TextInput>(null);

  const loadingOpl = oplMut.isPending;
  const busy = bunchMut.isPending || packMut.isPending;

  function setBunchProgrammatic(value: string) {
    isSettingProgrammaticallyRef.current = true;
    setBunchInput(value);
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
  }

  function logEntry(entry: Omit<PackEntry, 'id' | 'time'>) {
    seqRef.current += 1;
    setEntries((prev) =>
      [{ ...entry, id: `${seqRef.current}`, time: new Date().toLocaleTimeString() }, ...prev].slice(
        0,
        MAX_LOG_ROWS,
      ),
    );
  }

  function reject(bunchId: string, rejection: PackRejection, detail: string) {
    playError();
    haptics.medium();
    setFeedback({ tone: REJECTION_TONE[rejection], text: detail });
    logEntry({ bunchId, boxId: null, status: 'rejected', rejection, detail });
    setBunchProgrammatic('');
    bunchRef.current?.focus();
  }

  async function selectOpl(name: string) {
    setFeedback(null);
    try {
      const opl = await oplMut.mutateAsync(name);

      if (!opl.salesOrder) {
        setFeedback({ tone: 'danger', text: `${opl.name} has no sales order.` });
        playError();
        return;
      }
      const derived = deriveSession(opl);
      if (!derived) {
        setFeedback({
          tone: 'danger',
          text: `${opl.name} has no usable pack rate or order total — box sizes cannot be computed.`,
        });
        playError();
        return;
      }

      setSession(derived);
      setBoxNumber(1);
      setUnitsInBox(0);
      setUnitsPacked(0);
      setBunchesInBox(0);
      setBunchesPacked(0);
      setEntries([]);
      packedIdsRef.current = new Set();
      setBunchProgrammatic('');
      haptics.light();
      bunchRef.current?.focus();
    } catch (e) {
      setSession(null);
      setFeedback({ tone: 'danger', text: extractFrappeError(e) });
      playError();
    }
  }

  function clearOpl() {
    setSession(null);
    setBunchProgrammatic('');
    setBoxNumber(1);
    setUnitsInBox(0);
    setUnitsPacked(0);
    setBunchesInBox(0);
    setBunchesPacked(0);
    setEntries([]);
    packedIdsRef.current = new Set();
    setFeedback(null);
  }

  /** Rule 3 — variety AND stem length must both match a row on this OPL. */
  function validateAgainstOpl(s: PackingSession, bunch: BunchDetails): PackRejection | null {
    // The OPL holds the Item TEMPLATE ("Monza"); the bunch holds the VARIANT
    // ("Monza-50CM"). Accept either form, resolved via Item.variant_of rather
    // than by parsing the code, so it survives variants that do not follow a
    // Name-NNCM convention.
    const matchesVariety = (rowItemCode: string) =>
      rowItemCode === bunch.itemCode || rowItemCode === bunch.variantParent;

    if (!s.opl.rows.some((r) => matchesVariety(r.itemCode))) return 'variety-mismatch';
    if (!s.opl.rows.some((r) => matchesVariety(r.itemCode) && r.stemLength === bunch.stemLength)) {
      return 'length-mismatch';
    }
    return null;
  }

  /** Rule 1 — which box this bunch goes into. Pure; commits nothing. */
  function planBox(s: PackingSession, units: number): { boxId: number; unitsAfter: number } | null {
    let boxId = boxNumber;
    let inBox = unitsInBox;
    if (inBox + units > s.capPerBox) {
      boxId += 1;
      inBox = 0;
    }
    if (boxId > s.boxCount) return null;
    return { boxId, unitsAfter: inBox + units };
  }

  async function handleBunch(raw: string) {
    const s = session;
    if (!s || isProcessingRef.current) return;

    const bunchId = raw.trim();
    if (!bunchId) return;

    if (packedIdsRef.current.has(bunchId)) {
      reject(bunchId, 'duplicate-in-session', `${bunchId} was already scanned in this session.`);
      return;
    }

    isProcessingRef.current = true;
    setFeedback(null);
    try {
      const bunch = await bunchMut.mutateAsync(bunchId);

      const mismatch = validateAgainstOpl(s, bunch);
      if (mismatch === 'variety-mismatch') {
        reject(
          bunchId,
          mismatch,
          `${bunch.itemCode} is not on ${s.opl.name}. Packing it would send stock to the wrong warehouse.`,
        );
        return;
      }
      if (mismatch === 'length-mismatch') {
        const wanted = [...new Set(s.opl.rows.map((r) => r.stemLength))].join(', ');
        reject(
          bunchId,
          mismatch,
          `${bunch.stemLength} is not on ${s.opl.name}. This order wants ${wanted}.`,
        );
        return;
      }

      const plan = planBox(s, bunch.stemsPerBunch);
      if (!plan) {
        reject(
          bunchId,
          'order-complete',
          `All ${s.boxCount} boxes are full — ${s.opl.name} is fully packed. Nothing further can be added.`,
        );
        return;
      }

      const res = await packMut.mutateAsync({
        salesOrder: s.opl.salesOrder!,
        customer: s.opl.customer,
        farm: bunch.farm,
        orderPickList: s.opl.name,
        bunchId,
        itemCode: bunch.itemCode,
        bunchUom: bunch.bunchUom,
        stemLength: bunch.stemLength,
        boxId: plan.boxId,
      });

      // already_packed[] only populates on batch submissions — we send one bunch,
      // so the script throws instead and this is handled in catch. Checked here
      // regardless, since it is the documented contract.
      if (res.alreadyPacked.includes(bunchId)) {
        reject(bunchId, 'already-packed', `${bunchId} was already packed. Skipped.`);
        return;
      }

      // Commit box state only after the write lands.
      packedIdsRef.current.add(bunchId);
      // A new box resets the in-box bunch count; the order total keeps rising.
      const bunchesAfter = (plan.boxId === boxNumber ? bunchesInBox : 0) + 1;
      setBoxNumber(plan.boxId);
      setUnitsInBox(plan.unitsAfter);
      setUnitsPacked((prev) => prev + bunch.stemsPerBunch);
      setBunchesInBox(bunchesAfter);
      setBunchesPacked((prev) => prev + 1);

      playSubmit();
      setFeedback({
        tone: 'success',
        text: `Box ${plan.boxId} — ${
          s.capBunches != null
            ? `${bunchesAfter} of ${s.capBunches} bunches`
            : `${plan.unitsAfter}/${s.capPerBox}`
        } · ${bunch.itemCode} ${bunch.stemLength}`,
      });
      logEntry({
        bunchId,
        boxId: plan.boxId,
        status: 'packed',
        rejection: null,
        detail: `${bunch.itemCode} ${bunch.stemLength} · ${bunch.bunchUom}${
          res.docname ? ` · ${res.docname}` : ''
        }`,
      });
      setBunchProgrammatic('');
      bunchRef.current?.focus();
    } catch (e) {
      // Packing wraps every error as "Error processing packing: <text>" — strip
      // it so the packer reads the server's actual sentence. Grading does not
      // wrap, which is why this is packing-local.
      const message = stripPackingErrorPrefix(extractFrappeError(e));
      reject(bunchId, classifyPackError(message), message);
    } finally {
      isProcessingRef.current = false;
    }
  }

  function onChangeBunch(text: string) {
    if (isSettingProgrammaticallyRef.current) return;
    setBunchInput(text);

    const trimmed = text.trim();
    if (!trimmed || isProcessingRef.current) return;
    // HID wedge scanners type the payload then a terminator.
    if (trimmed.endsWith('}') || trimmed.length >= 8) void handleBunch(trimmed);
  }

  function handleCameraScan(raw: string) {
    setScannerVisible(false);
    void handleBunch(raw);
  }

  // ── STEP 1: picker ────────────────────────────────────────────────────────
  if (!session) {
    return (
      <Screen title="Packing">
        <Card title="Pick list date">
          <Segmented value={range} options={DATE_OPTIONS} onChange={setRange} />
        </Card>

        {loadingOpl ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.text} />
            <Text style={styles.hint}>Loading pick list…</Text>
          </View>
        ) : null}

        {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

        {oplList.isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.text} />
            <Text style={styles.hint}>Loading pick lists…</Text>
          </View>
        ) : oplList.error ? (
          <Notice tone="danger">{extractFrappeError(oplList.error)}</Notice>
        ) : (oplList.data ?? []).length === 0 ? (
          <Card title="No pick lists">
            <Text style={styles.body}>
              Nothing for this period. Try a wider date range — mixed-box pick lists are excluded.
            </Text>
          </Card>
        ) : (
          <Card title={`${oplList.data!.length} pick lists`}>
            <View style={styles.list}>
              {oplList.data!.map((item) => (
                <OplPickerRow
                  key={item.name}
                  item={item}
                  disabled={loadingOpl}
                  onPress={() => void selectOpl(item.name)}
                />
              ))}
            </View>
          </Card>
        )}

        <Text style={styles.hint}>Choose a pick list to review before scanning.</Text>
      </Screen>
    );
  }

  // ── STEPS 2 + 3: review, then scan ───────────────────────────────────────
  const lengths = [...new Set(session.opl.rows.map((r) => r.stemLength))].join(', ');

  return (
    <Screen title="Packing">
      <Card title="Order pick list">
        <View style={styles.rows}>
          <DetailRow label="Pick list" value={session.opl.name} />
          <DetailRow label="Customer" value={session.opl.customer ?? '—'} />
          <DetailRow label="Sales order" value={session.opl.salesOrder ?? '—'} />
          <DetailRow label="Box type" value={session.opl.boxType ?? '—'} />
          {/* Unit-neutral on purpose: custom_packrate and custom_total_stems
              share a unit, but it is NOT reliably stems (§8.3), so labelling
              them would be a lie on any OPL the allocator got wrong. */}
          <DetailRow label="Bunch size" value={session.opl.rows[0]?.uom ?? '—'} />
          <DetailRow
            label="Per box"
            value={
              session.capBunches != null ? `${session.capBunches} bunches` : `${session.capPerBox}`
            }
          />
          <DetailRow
            label="Order total"
            value={
              session.totalBunches != null
                ? `${session.totalBunches} bunches`
                : (session.opl.totalUnits ?? '—')
            }
          />
          <DetailRow label="Boxes" value={`${session.boxCount}`} />
        </View>
        <Button
          label="Change pick list"
          variant="outline"
          onPress={clearOpl}
          style={styles.changeBtn}
        />
      </Card>

      <Card title="Items">
        <View style={styles.list}>
          {session.opl.rows.map((row, idx) => (
            <View key={`${row.itemCode}-${row.stemLength}-${idx}`} style={styles.itemRow}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {row.itemCode} · {row.stemLength}
              </Text>
              {/* Whole bunches. `qty` is already in bunches, so this is just a
                  round — a fraction like 0.8 means the OPL itself is wrong
                  (§8.3, allocator defect), and surfacing that to a packer mid
                  shift helps nobody. The bunch size stays alongside because the
                  packer needs to check it. */}
              <Text style={styles.itemMeta} numberOfLines={1}>
                {Math.round(row.qty)} bunches · {row.uom}
                {row.shelf ? ` · shelf ${row.shelf}` : ''}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Persistent counter — shown always, not only on error. */}
      <Card title={`Box ${boxNumber} of ${session.boxCount}`}>
        <Text style={styles.counter}>
          {session.capBunches != null
            ? `${bunchesInBox} of ${session.capBunches} bunches`
            : `${unitsInBox} / ${session.capPerBox}`}
        </Text>
        <View style={styles.rows}>
          <DetailRow
            label="Order progress"
            value={
              session.totalBunches != null
                ? `${bunchesPacked} of ${session.totalBunches} bunches`
                : `${unitsPacked} / ${session.opl.totalUnits ?? '—'}`
            }
          />
          {/* Surfaced so a packer can sanity-check they have Bunch(10) and not
              Bunch(12): a wrong-size bunch passes both Rule 1 and Rule 3 today
              — the unguarded gap recorded in §8.3. */}
          <DetailRow label="Bunch size" value={session.opl.rows[0]?.uom ?? '—'} />
          <DetailRow label="Variety" value={session.opl.rows[0]?.itemCode ?? '—'} />
          <DetailRow label="Lengths" value={lengths || '—'} />
        </View>
      </Card>

      <Card title="Scan bunch">
        <Field label="Bunch QR">
          <View style={styles.scanRow}>
            <TextInput
              ref={bunchRef}
              style={[styles.input, styles.scanInput]}
              value={bunchInput}
              onChangeText={onChangeBunch}
              autoFocus
              autoCapitalize="characters"
              placeholder={busy ? 'Packing…' : 'Scan bunch QR code…'}
              placeholderTextColor={colors.muted}
              editable={!busy}
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

        {busy ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.text} />
            <Text style={styles.hint}>Packing…</Text>
          </View>
        ) : null}
      </Card>

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
        Boxes advance automatically when the pack rate is reached.
      </Text>

      <BarcodeScannerOverlay
        visible={scannerVisible}
        onScan={handleCameraScan}
        onCancel={() => setScannerVisible(false)}
      />
    </Screen>
  );
}

function OplPickerRow({
  item,
  disabled,
  onPress,
}: {
  item: OplListItem;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pickerRow,
        pressed && styles.pickerRowPressed,
        disabled && styles.pickerRowDisabled,
      ]}
    >
      <View style={styles.pickerHead}>
        <Text style={styles.pickerName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.pickerDate}>{item.dateCreated ?? ''}</Text>
      </View>
      <Text style={styles.pickerMeta} numberOfLines={1}>
        {[item.customer, item.boxType, item.totalUnits ? `${item.totalUnits} per order` : null]
          .filter(Boolean)
          .join(' · ') || '—'}
      </Text>
    </Pressable>
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

// Three visual states: packed, a benign refusal (re-scan) in amber, and a
// genuine fault in red. A full order is red — it means stop, not retry.
function EntryRow({ entry }: { entry: PackEntry }) {
  const benign =
    entry.rejection === 'duplicate-in-session' || entry.rejection === 'already-packed';
  const tint = entry.status === 'packed' ? null : benign ? styles.logWarn : styles.logError;

  return (
    <View style={styles.logRow}>
      <View style={styles.logHead}>
        <Text style={[styles.logBunch, tint]} numberOfLines={1}>
          {entry.bunchId}
        </Text>
        <Text style={styles.logTime}>
          {entry.boxId != null ? `Box ${entry.boxId} · ` : ''}
          {entry.time}
        </Text>
      </View>
      <Text style={[styles.logDetail, tint]} numberOfLines={3}>
        {entry.detail}
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
    marginBottom: spacing.md,
  },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textSecondary },
  changeBtn: { marginTop: spacing.md },

  counter: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.md,
  },

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

  list: { gap: spacing.sm },

  pickerRow: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickerRowPressed: { backgroundColor: colors.pressed },
  pickerRowDisabled: { opacity: 0.45 },
  pickerHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  pickerName: { fontSize: 14, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  pickerDate: { fontSize: 12, color: colors.muted },
  pickerMeta: { fontSize: 13, color: colors.textSecondary },

  itemRow: { gap: 2 },
  itemTitle: { fontSize: 13, fontWeight: '600', color: colors.primary },
  itemMeta: { fontSize: 13, color: colors.textSecondary },

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
  logWarn: { color: colors.warning },
  logError: { color: colors.error },
});
