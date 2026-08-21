import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { QrCode } from 'lucide-react-native';

import { useOplList } from '../../features/packing/useOplList';
import { useOrderPickList } from '../../features/packing/useOrderPickList';
import { useSalesOrderTargets } from '../../features/packing/useSalesOrderTargets';
import { useBunchDetails } from '../../features/packing/useBunchDetails';
import {
  classifyPackError,
  stripPackingErrorPrefix,
  usePackBunch,
} from '../../features/packing/usePackBunch';
import { BarcodeScannerOverlay } from '../../features/scanning/BarcodeScannerOverlay';
import { playBeep, playSubmit, playError } from '../../lib/audio';
import { haptics } from '../../lib/haptics';
import { extractFrappeError } from '../../lib/api';
import { extractScannedId } from '../../lib/qr';
import { useAuthStore } from '../../stores/auth';
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
// TARGETS COME FROM THE SALES ORDER, not the OPL: the allocator is broken and
// OPL quantities under-report (§8.3). The OPL still supplies shelf, warehouse,
// the item rows Rule 3 matches against, and the id sent as
// `custom_order_pick_list`.
//
// Everything is counted in BUNCHES — one scan is one bunch, and both the cap
// and the target arrive from the SO already in bunches.
//
// One request per bunch (Rule 2), so an ungraded-bunch rejection names the scan
// that caused it. The client owns box numbering and the cap (Rule 1) — the
// server has neither. Rule 3 validates variety and stem length against the
// OPL's rows before posting, because a mismatch does not error server-side, it
// silently packs into the wrong warehouse.

const MAX_LOG_ROWS = 12;

// "Today" would be wrong: the range is today AND tomorrow, because packers pack
// today for tomorrow's flight. Anything implying urgency ("Due now") would read
// as overdue, which is the opposite of a forward-looking window.
//
// Four options across a phone leaves little room, so the long label degrades to
// the short one when the measured segment cannot hold it, rather than clipping.
const DATE_OPTIONS = [
  { value: 'today', label: 'Today + tomorrow', shortLabel: 'Next 2 days' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
] as const satisfies readonly {
  value: OplDateFilter;
  label: string;
  shortLabel?: string;
}[];

type FeedbackMsg = { tone: NoticeTone; text: string; pdfUrl?: string | null };

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
  // `file_url` comes back relative to the instance, so it needs the base URL to
  // be openable.
  const instanceUrl = useAuthStore((st) => st.instanceUrl);
  const [range, setRange] = useState<OplDateFilter>('today');
  const oplList = useOplList(range);
  const oplMut = useOrderPickList();
  const targetsMut = useSalesOrderTargets();
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
  // Everything is bunches now: the cap and the target both come from the Sales
  // Order in bunches, and one scan is one bunch. No unit conversion left in the
  // hot path, and nothing to compare across units.
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

  const loadingOpl = oplMut.isPending || targetsMut.isPending;
  const busy = bunchMut.isPending || packMut.isPending;

  function setBunchProgrammatic(value: string) {
    isSettingProgrammaticallyRef.current = true;
    setBunchInput(value);
    setTimeout(() => {
      isSettingProgrammaticallyRef.current = false;
    }, 0);
  }

  /** Frappe returns `file_url` relative to the site; make it openable. */
  function absoluteFileUrl(fileUrl: string): string | null {
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    if (!instanceUrl) return null;
    return `${instanceUrl.replace(/\/+$/, '')}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
  }

  function openPdf(fileUrl: string) {
    const url = absoluteFileUrl(fileUrl);
    if (url) void Linking.openURL(url);
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
      // Targets come from the SALES ORDER, never the OPL — the allocator is
      // broken and OPL quantities cannot be trusted (§8.3).
      const targets = await targetsMut.mutateAsync({
        salesOrder: opl.salesOrder,
        oplName: opl.name,
      });

      setSession({ opl, targets });
      setBoxNumber(1);
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

  /**
   * Rule 1 — which box this bunch goes into. Pure; commits nothing.
   * One scan is one bunch, and the cap is in bunches, so this is a plain count.
   */
  function planBox(s: PackingSession): { boxId: number; bunchesAfter: number } | null {
    let boxId = boxNumber;
    let inBox = bunchesInBox;
    if (inBox + 1 > s.targets.capBunches) {
      boxId += 1;
      inBox = 0;
    }
    if (boxId > s.targets.boxCount) return null;
    return { boxId, bunchesAfter: inBox + 1 };
  }

  async function handleBunch(raw: string) {
    const s = session;
    if (!s || isProcessingRef.current) return;

    // UNWRAP AT CAPTURE. Bunch QRs arrive JSON-wrapped —
    // {"bunch_id":"BUNCH-38203"} — and this is the single funnel both the wedge
    // and the camera path reach, so everything downstream (the dedupe set, the
    // session log, the payload) holds the clean id. Sending raw is what produced
    // `Bunch {"bunch_id":"BUNCH-38203"} not found`.
    const bunchId = extractScannedId(raw);
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

      const plan = planBox(s);
      if (!plan) {
        reject(
          bunchId,
          'order-complete',
          `All ${s.targets.boxCount} boxes are full — ${s.opl.name} is fully packed. Nothing further can be added.`,
        );
        return;
      }

      // Known BEFORE the request, because the payload has to carry it: this
      // scan closes the box when its count lands exactly on the cap.
      const cap = s.targets.capBunches;
      const boxClosed = plan.bunchesAfter >= cap;
      const lastBox = plan.boxId >= s.targets.boxCount;

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
        closeBox: boxClosed,
        closeBoxNumber: boxClosed ? plan.boxId : undefined,
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
      setBoxNumber(plan.boxId);
      setBunchesInBox(plan.bunchesAfter);
      setBunchesPacked((prev) => prev + 1);

      // ── Box-full announcement ────────────────────────────────────────────
      // The counter card advances on its own; this is the announcement, not the
      // mechanism. It stays on screen until the next scan clears it — a packer
      // looking down at the flowers needs it there when they look up.
      playSubmit();
      if (boxClosed) {
        // Second cue on top of the usual submit sound, so a closed box is
        // audibly distinct from an ordinary scan without being a new sound to
        // learn. Paired with a heavy haptic; ordinary scans have none.
        playBeep();
        haptics.heavy();
      }

      const closeText = lastBox
        ? `Box ${plan.boxId} of ${s.targets.boxCount} complete — order fully packed.`
        : `Box ${plan.boxId} of ${s.targets.boxCount} complete — ${plan.bunchesAfter} of ${cap} bunches. Starting Box ${plan.boxId + 1}.`;

      if (boxClosed && res.boxLabelPdfError) {
        // The PACK succeeded; only the label render failed. Warn, never a
        // failed scan — the bunch is in the box either way.
        setFeedback({
          tone: 'warn',
          text: `${closeText} Label PDF failed: ${res.boxLabelPdfError}`,
        });
      } else if (boxClosed) {
        setFeedback({ tone: 'success', text: closeText, pdfUrl: res.boxLabelPdf });
      } else {
        setFeedback({
          tone: 'success',
          text: `Box ${plan.boxId} — ${plan.bunchesAfter} of ${cap} bunches · ${bunch.itemCode} ${bunch.stemLength}`,
        });
      }

      logEntry({
        bunchId,
        boxId: plan.boxId,
        status: 'packed',
        rejection: null,
        detail: `${bunch.itemCode} ${bunch.stemLength} · ${bunch.bunchUom}${
          res.docname ? ` · ${res.docname}` : ''
        }${boxClosed ? ` · closed Box ${plan.boxId}` : ''}${
          res.boxLabelPdfError ? ` · label render failed` : ''
        }`,
        // Kept on the row so the label stays reachable once the next scan
        // clears the Notice.
        pdfUrl: res.boxLabelPdf,
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
        ) : (oplList.data?.items ?? []).length === 0 ? (
          <Card title="No pick lists">
            <Text style={styles.body}>
              {oplList.data?.notice ??
                'No pick lists for orders due in this window. Try a wider range — mixed-box pick lists are excluded.'}
            </Text>
          </Card>
        ) : (
          <Card title={`${oplList.data!.items.length} pick lists`}>
            <View style={styles.list}>
              {oplList.data!.items.map((item) => (
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
          {/* Targets from the SALES ORDER, not the OPL — the allocator is
              broken and OPL quantities under-report (§8.3). */}
          <DetailRow label="Bunch size" value={session.targets.uom} />
          <DetailRow label="Per box" value={`${session.targets.capBunches} bunches`} />
          <DetailRow label="Order target" value={`${session.targets.targetBunches} bunches`} />
          <DetailRow label="Boxes" value={`${session.targets.boxCount}`} />
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
              {/* Shelf is what this list is FOR — it tells the packer where to
                  walk. The row's own qty is deliberately not shown: it comes
                  from the broken allocator and would contradict the Sales Order
                  target above it. */}
              <Text style={styles.itemMeta} numberOfLines={1}>
                {row.uom}
                {row.shelf ? ` · shelf ${row.shelf}` : ''}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Persistent counter — shown always, not only on error. */}
      <Card title={`Box ${boxNumber} of ${session.targets.boxCount}`}>
        <Text style={styles.counter}>
          {bunchesInBox} of {session.targets.capBunches} bunches
        </Text>
        <View style={styles.rows}>
          <DetailRow
            label="Order progress"
            value={`${bunchesPacked} of ${session.targets.targetBunches} bunches`}
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

      {feedback ? (
        <Notice tone={feedback.tone}>
          {feedback.text}
          {feedback.pdfUrl ? (
            <Text style={styles.link} onPress={() => openPdf(feedback.pdfUrl!)}>
              {'  '}Open box label PDF
            </Text>
          ) : null}
        </Notice>
      ) : null}

      {entries.length > 0 ? (
        <Card title="This session">
          <View style={styles.log}>
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onOpenPdf={openPdf} />
            ))}
          </View>
        </Card>
      ) : null}

      <Text style={styles.hint}>
        {bunchesPacked >= session.targets.targetBunches
          ? 'Order fully packed. Change pick list to start another.'
          : 'Boxes advance automatically when the pack rate is reached.'}
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
        <Text style={styles.pickerDate}>
          {item.deliveryDate ? `Due ${item.deliveryDate}` : ''}
        </Text>
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
function EntryRow({
  entry,
  onOpenPdf,
}: {
  entry: PackEntry;
  onOpenPdf: (fileUrl: string) => void;
}) {
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
      {entry.pdfUrl ? (
        <Text style={styles.link} onPress={() => onOpenPdf(entry.pdfUrl!)}>
          Open box label PDF
        </Text>
      ) : null}
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
  link: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
