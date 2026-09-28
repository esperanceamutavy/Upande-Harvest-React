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
import { useExistingPack } from '../../features/packing/useExistingPack';
import { formatBoxRanges, resumePlan } from '../../features/packing/resume';
import { compareLength, displayLength } from '../../features/packing/lengths';
import { effectiveStemLength, matchBunchToOpl } from '../../features/packing/bunchMatch';
import { filterOpls } from '../../features/packing/oplSearch';
import { matchesSegment, startedFirst } from '../../features/packing/packState';
import type { PickerSegment } from '../../features/packing/packState';
import { lengthFloorFor, substitutesForLine } from '../../features/packing/substitutes';
import { parseStemsPerBunch } from '../../features/packing/targets';
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
import { colors, radii, spacing, typography } from '../../components/ui/theme';
import type {
  BunchDetails,
  OplDateFilter,
  OplListItem,
  PackStatus,
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

/** Progress line for a row that has a pack list. Null when nothing is started.
 *
 *  This badge now does MORE work than it used to. A part-packed pick list and
 *  an untouched one sit side by side under "To pack", so this line is the only
 *  thing that tells them apart — see `startedFirst`. */
function pickerProgress(item: OplListItem): string | null {
  if (item.packStatus === 'packed') {
    return item.boxesTotal > 0 ? `Packed · ${item.boxesTotal} boxes` : 'Packed';
  }
  if (item.started) {
    return item.boxesTotal > 0
      ? `${item.boxesPacked} of ${item.boxesTotal} boxes packed`
      : `${item.boxesPacked} boxes packed`;
  }
  return null;
}

/**
 * What a packer should read FIRST on a picker row.
 *
 * They recognise what goes on the box — "TGW Flower 02", "Fresh From Source
 * (TGW)" — not "Dutch Flower Group (DFG)". Preference order: the code, then the
 * consignee, then the customer name.
 *
 * The caption carries the customer name only when it is not already the primary
 * line, so nothing is ever printed twice.
 */
function pickerIdentity(item: OplListItem): { primary: string | null; caption: string | null } {
  const customer = item.customer?.trim() || null;
  // Already resolved off the Customer Code record — nothing is parsed here.
  const code = item.customerCode?.code ?? null;
  const consignee = item.consignee?.trim() || null;

  const primary = code || consignee || customer;
  const caption = customer && customer !== primary ? customer : null;

  return { primary, caption };
}

/** [1 .. boxNumber-1] — every box the session has moved past. */
function rangeBelow(boxNumber: number): number[] {
  const out: number[] = [];
  for (let n = 1; n < boxNumber; n += 1) out.push(n);
  return out;
}

// Filtered on the Sales Order's delivery_date throughout.
//
// "Today" filters on delivery_date = TOMORROW, which is not a mistake: packing
// runs a day ahead of the flight, so the day's WORK is the next day's
// deliveries. Labelling it "Tomorrow" described the plane and read as work that
// had not started yet. The union member is `packing_today` for the same reason.
//
// An order due today has already been dispatched, so it is excluded from the
// default — still reachable via "This week", which is Monday–Sunday and so
// always contains today.
//
// The other three are for looking back or hunting something outside the normal
// rhythm. All four labels are short enough not to need a shortLabel fallback.
const DATE_OPTIONS = [
  { value: 'packing_today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
] as const satisfies readonly { value: OplDateFilter; label: string }[];

// A SECOND row rather than a fifth date segment. The date row is already at
// four options and barely fits at 412dp, and status is a different dimension
// anyway — a packer may want packed orders from this week, or unpacked ones
// from tomorrow.
//
// "IN PROGRESS" NARROWS "TO PACK". IT DOES NOT REMOVE FROM IT.
//
// It once held pick lists with a draft Farm Pack List INSTEAD of "To pack", so
// a packer who started a box yesterday could not find it under "To pack" today
// — OPL-2026-06186. The classification stays fixed: a draft is unfinished work
// and belongs with the work still to do, and only a submitted Farm Pack List
// (its LAST box closed) counts as packed.
//
// The segment is back because seeing what is part-done is worth a tap, but as a
// VIEW over "To pack" rather than a third bucket. A started pick list appears
// in both, so browsing "To pack" still shows everything unfinished. See
// `PickerSegment` — the overlap is the reason it is a separate type from
// PackStatus, and collapsing the two is the original bug.
//
// Part-packed rows are also distinct without switching: they sort to the top of
// "To pack" and carry a "3 of 10 boxes packed" badge. See `startedFirst`.
const STATUS_OPTIONS = [
  { value: 'to_pack', label: 'To pack' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'packed', label: 'Packed' },
] as const satisfies readonly { value: PickerSegment; label: string }[];

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
  const [range, setRange] = useState<OplDateFilter>('packing_today');
  // Status filters client-side off the already-fetched list, so switching it is
  // instant and does not refetch.
  const [status, setStatus] = useState<PickerSegment>('to_pack');
  // Search does the same, over the fields the bulk fetches already put in
  // memory — see oplSearch.ts. No query, and it keeps working offline once the
  // list is on screen.
  const [search, setSearch] = useState('');
  const oplList = useOplList(range);
  const oplMut = useOrderPickList();
  const targetsMut = useSalesOrderTargets();
  const existingMut = useExistingPack();
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
  // Counted in session.targets.unitLabel — bunches when the bunch size could be
  // resolved, stems when it could not. Never assume bunches.
  const [inBox, setInBox] = useState(0);
  const [packedTotal, setPackedTotal] = useState(0);

  const [entries, setEntries] = useState<PackEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isSettingProgrammaticallyRef = useRef(false);
  const isProcessingRef = useRef(false);
  const packedIdsRef = useRef<Set<string>>(new Set());
  const seqRef = useRef(0);
  const bunchRef = useRef<TextInput>(null);

  const loadingOpl = oplMut.isPending || targetsMut.isPending || existingMut.isPending;
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
      // Bunch size across the WHOLE pick list, not just row 0. A bunch is 10
      // stems on one order and 7 or 9 on another, and a single OPL can carry
      // more than one size — BOX-OPL-2026-05502-1 holds Bunch(10) and Bunch(9)
      // rows in one box. Taking row 0 as representative would state a bunch
      // target the other rows do not share; when they disagree we count stems.
      const oplBunchSizes = new Set(
        opl.rows
          .map((r) => parseStemsPerBunch(r.uom))
          .filter((n): n is number => n != null),
      );
      const targets = await targetsMut.mutateAsync({
        salesOrder: opl.salesOrder,
        oplName: opl.name,
        // First choice for resolving bunch size; the SO's custom_bunching is
        // the fallback when the OPL row's uom is not Bunch(N).
        oplUom: opl.rows[0]?.uom ?? '',
        mixedBunchSizes: oplBunchSizes.size > 1,
      });

      // RESUME, do not restart. Reopening a partially packed OPL used to show
      // "Box 1 of N — 0 packed", so the packer refilled full boxes and every
      // scan came back as already packed.
      const existing = await existingMut.mutateAsync(opl.name);
      const resume = resumePlan(
        existing.perBox,
        targets.capPerBox,
        targets.boxCount,
        targets.unitLabel,
      );

      setSession({ opl, targets, resume });
      setBoxNumber(resume.boxNumber);
      setInBox(resume.inBox);
      setPackedTotal(resume.packedTotal);
      setEntries([]);
      packedIdsRef.current = new Set();
      setBunchProgrammatic('');

      if (resume.isComplete) {
        setFeedback({
          tone: 'warn',
          text: `${opl.name} is fully packed — all ${targets.boxCount} boxes are complete. Nothing further can be added.`,
        });
        playError();
        return;
      }

      const done = formatBoxRanges(resume.completeBoxes);
      if (done) {
        setFeedback({
          tone: 'info',
          text: `Resuming at Box ${resume.boxNumber} of ${targets.boxCount}${
            resume.inBox > 0 ? ` (${resume.inBox} of ${targets.capPerBox} ${targets.unitLabel} already in it)` : ''
          } · boxes ${done} complete.`,
        });
      }

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
    setInBox(0);
    setPackedTotal(0);
    setEntries([]);
    packedIdsRef.current = new Set();
    setFeedback(null);
  }

  /**
   * Rule 3 — right variety, and long enough.
   *
   * VARIETY is still membership against `item_locations`: that is what stops a
   * Madam Red bunch going into a Brinessa box. The OPL holds the Item TEMPLATE
   * ("Monza") while the bunch holds the VARIANT ("Monza-50CM"), so either form
   * is accepted, resolved via Item.variant_of rather than by parsing the code.
   *
   * LENGTH is no longer membership. Longer stems are allocated and cut DOWN
   * during packing, so an OPL allocated 60/70CM legitimately fills a 50CM
   * order, and a packer may equally grab a 50CM bunch for it. The old
   * membership test blocked both directions. A bunch now needs only to be at
   * or above the ORDER's length; only shorter is refused, since 40CM cannot be
   * cut up to 50CM.
   *
   * ── ACCEPTED RISK ────────────────────────────────────────────────────────
   * The server resolves a warehouse by matching item_code + custom_stem_length
   * against item_locations, and on NO MATCH falls back silently to
   * item_locations[0].warehouse. The old length check happened to catch that
   * before a post. Relaxing it means a valid 50CM scan against a 60CM
   * allocation now takes the fallback. Harmless on a single-warehouse OPL —
   * both live examples are — but a real hole on a multi-warehouse one.
   * The proper fix is server-side: match on variety and length-or-longer there
   * too. See RESTYLE_PLAN.md §8.3.
   */
  /**
   * What Rule 3 matches VARIETY against.
   *
   * A straight box matches `item_locations`, unchanged. A MIX cannot: the
   * allocator does not write `custom_opl` to every line, so a variety it never
   * reached has no row there and a perfectly good bunch would be refused. The
   * group is the order's own statement of what belongs in the box, so that is
   * the membership set — see mixGroup.ts.
   *
   * Group lines are reduced to the TEMPLATE. They carry the variant
   * ("FUSCHIANA-40CM"), and a 60CM bunch — valid, because longer stems are cut
   * down — resolves to "FUSCHIANA". Comparing variants would reject it on a
   * string difference that Rule 3 exists to permit.
   */
  function varietyRowsFor(s: PackingSession): { itemCode: string }[] {
    if (s.targets.packMode === 'straight') return s.opl.rows;
    const varieties = s.targets.groupLines
      .map((l) => l.variety)
      .filter((v): v is string => v !== null && v.length > 0);
    // Fall back rather than match against nothing, which would reject every scan.
    return varieties.length > 0 ? varieties.map((itemCode) => ({ itemCode })) : s.opl.rows;
  }

  /**
   * Rule 3's variety set, WIDENED by whatever the order permits as a substitute.
   *
   * A substitution is a permission the order granted, so it belongs in the same
   * membership test rather than in a branch beside it — which also handles a
   * BOUQUET for free: every component must still be permitted, and a component
   * may now be permitted by substitution.
   *
   * Length is not decided here; it is measured against the line the substitute
   * stands in for. See lengthFloorFor.
   */
  function acceptedVarietyRows(s: PackingSession): { itemCode: string }[] {
    const base = varietyRowsFor(s);
    if (s.targets.substitutes.length === 0) return base;
    return [...base, ...s.targets.substitutes.map((sub) => ({ itemCode: sub.varietyTemplate }))];
  }

  /** The floor this particular bunch must clear — its own line's, or the line
   *  it substitutes for. */
  function floorFor(s: PackingSession, bunch: BunchDetails): string | null {
    return lengthFloorFor({
      // variantParent is already the variant_of template, resolved by
      // useBunchDetails — the same relation both sides of the table use.
      bunchTemplate: bunch.variantParent || bunch.itemCode,
      orderTemplates: s.targets.groupLines.map((l) => l.variety),
      substitutes: s.targets.substitutes,
      orderLength: s.targets.orderLength,
    });
  }

  function validateAgainstOpl(s: PackingSession, bunch: BunchDetails): PackRejection | null {
    // MONO matches on its one variety; a BOUQUET has to have EVERY component on
    // the pick list. Its item_code names only the first of several, so matching
    // on that alone would wave through a bouquet whose other varieties belong to
    // a different order. See bunchMatch.ts.
    if (matchBunchToOpl(bunch, acceptedVarietyRows(s)) !== null) return 'variety-mismatch';

    // A bouquet is governed by its SHORTEST component: a 40CM stem in a 50CM
    // order is short however long the rest are.
    // A variety ON the order keeps the order's own length, unchanged. One
    // reachable only by substitution is measured against the line it stands in
    // for: a substitute listed against Adalonia-40CM admits 40CM or longer.
    const verdict = compareLength(effectiveStemLength(bunch, compareLength), floorFor(s, bunch));
    if (verdict === 'shorter') return 'length-mismatch';
    if (verdict === 'unknown') {
      // Allowed on purpose — a format surprise must not stop a packer.
      console.warn(
        `[packing] length not comparable, allowing scan: bunch=${bunch.stemLength} order=${s.targets.orderLength}`,
      );
    }
    return null;
  }

  /**
   * Rule 1 — which box this bunch goes into. Pure; commits nothing.
   *
   * The increment is one BUNCH when the session counts bunches, and the scanned
   * bunch's own stem count when it counts stems. The scanned bunch always knows
   * its own size even when the order does not.
   */
  function planBox(s: PackingSession, increment: number): { boxId: number; after: number } | null {
    let nextBox = boxNumber;
    let count = inBox;
    if (count + increment > s.targets.capPerBox) {
      nextBox += 1;
      count = 0;
    }
    if (nextBox > s.targets.boxCount) return null;
    return { boxId: nextBox, after: count + increment };
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
          bunch.isMixedBunch
            ? `${bunch.bunchName ?? 'That bouquet'} does not belong on ${s.opl.name} — ${(matchBunchToOpl(bunch, acceptedVarietyRows(s))?.missing ?? []).join(', ')} ${(matchBunchToOpl(bunch, acceptedVarietyRows(s))?.missing ?? []).length === 1 ? 'is' : 'are'} not on this pick list.`
            : `${bunch.itemCode} is not on ${s.opl.name}. Packing it would send stock to the wrong warehouse.`,
        );
        return;
      }
      if (mismatch === 'length-mismatch') {
        reject(
          bunchId,
          mismatch,
          `${bunch.stemLength} is shorter than the ${floorFor(s, bunch)} line it would fill. Pick ${floorFor(s, bunch)} or longer.`,
        );
        return;
      }

      const increment = s.targets.unitLabel === 'bunches' ? 1 : bunch.stemsPerBunch;
      const plan = planBox(s, increment);
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
      const cap = s.targets.capPerBox;
      const unit = s.targets.unitLabel;
      const boxClosed = plan.after >= cap;
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
      setInBox(plan.after);
      setPackedTotal((prev) => prev + increment);

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
        : `Box ${plan.boxId} of ${s.targets.boxCount} complete — ${plan.after} of ${cap} ${unit}. Starting Box ${plan.boxId + 1}.`;

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
          text: `Box ${plan.boxId} — ${plan.after} of ${cap} ${unit} · ${bunch.itemCode} ${bunch.stemLength}`,
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
    const all = oplList.data?.items ?? [];
    const searching = search.trim().length > 0;

    // SEARCH IGNORES THE STATUS TAB, deliberately.
    //
    // Searching is a LOOKUP, not a refinement of the current tab. Scoping it to
    // the tab made a pick list that exists look like one that does not:
    // OPL-2026-06186 was allocated yesterday and already part-packed, so it sat
    // under "In progress" while a packer searched "06186" from "To pack" and got
    // nothing. Reasonably, they concluded it had never been fetched — and the
    // hunt went looking for a date filter that does not exist. The date segment
    // filters on the Sales Order's delivery_date ONLY; date_created has not
    // constrained this query since b5e0885.
    //
    // Every row already carries its own status badge, so a cross-tab result
    // says what it is rather than appearing in the wrong place unexplained.
    //
    // `searching` also distinguishes "nothing matched what you typed" from
    // "nothing is due in this window" — a packer who mistypes must not conclude
    // the order is missing.
    const visible = searching
      ? filterOpls(all, search)
      : startedFirst(
          all.filter((i) => matchesSegment({ status: i.packStatus, started: i.started }, status)),
        );

    return (
      <Screen title="Packing">
        <Card title="Find a pick list">
          <View style={styles.filters}>
            <TextInput
              style={styles.input}
              value={search}
              onChangeText={setSearch}
              placeholder="Code, consignee, customer, OPL, variety…"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            <Field label="Delivery date">
              <Segmented value={range} options={DATE_OPTIONS} onChange={setRange} />
            </Field>
            <Field label="Packing status">
              <Segmented value={status} options={STATUS_OPTIONS} onChange={setStatus} />
            </Field>
          </View>
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
        ) : visible.length === 0 ? (
          <Card title={searching ? 'No match' : 'No pick lists'}>
            <Text style={styles.body}>
              {searching
                ? `Nothing matches “${search.trim()}” in this date range and status. Check the spelling, or clear the search — the pick list may be under a different date or status.`
                : (oplList.data?.notice ??
                  `No ${STATUS_OPTIONS.find((o) => o.value === status)?.label.toLowerCase()} pick lists for orders due in this window. Try another status or a wider date range — mixed-box pick lists are excluded.`)}
            </Text>
          </Card>
        ) : (
          // Count reflects ALL THREE filters, not the unfiltered fetch.
          <Card
            title={`${visible.length} pick list${visible.length === 1 ? '' : 's'}${
              searching ? ` matching “${search.trim()}”` : ''
            }`}
          >
            <View style={styles.list}>
              {visible.map((item) => (
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
  // The ORDER's length, not the OPL's: longer stems are cut down during
  // packing, so the box holds the order's length and so does the label.
  const lengths = displayLength(
    session.targets.orderLength,
    [...new Set(session.opl.rows.map((r) => r.stemLength))],
  );

  // Boxes finished BEFORE this session plus any finished during it. boxNumber
  // only advances once a box fills, so every box below it is complete.
  const completedBoxes = formatBoxRanges(
    Array.from(new Set([...session.resume.completeBoxes, ...rangeBelow(boxNumber)])),
  );

  return (
    <Screen title="Packing">
      <Card title="Order pick list">
        <View style={styles.rows}>
          <DetailRow label="Pick list" value={session.opl.name} />
          <DetailRow label="Customer" value={session.opl.customer ?? '—'} />
          {/* Each omitted entirely when empty — a blank row is worse than none.
              The code reference comes from the Sales Order LINE, falling back to
              the header; the code itself is looked up on the Customer Code
              record, because the stored value is that record's NAME and the two
              diverge. See features/packing/customerCodeRef.ts. */}
          {session.targets.customerCode ? (
            // The caption usually repeats the Customer row above. That is
            // deliberate — it confirms the code belongs to that customer. It now
            // comes from Customer Code.customer rather than a parsed substring.
            <DetailRow
              label="Customer code"
              value={session.targets.customerCode.code}
              caption={session.targets.customerCode.customer}
            />
          ) : null}
          <DetailRow label="Sales order" value={session.opl.salesOrder ?? '—'} />
          {session.targets.consignee ? (
            <DetailRow label="Consignee" value={session.targets.consignee} />
          ) : null}
          {/* One Truck row, never two: the value is resolved line-first in
              useSalesOrderTargets, so the header is only ever a fallback. */}
          {session.targets.truck ? (
            <DetailRow label="Truck" value={session.targets.truck} />
          ) : null}
          {/* Last of the identity rows — least often present. */}
          {session.targets.barcode ? (
            <DetailRow label="Barcode" value={session.targets.barcode} />
          ) : null}
          <DetailRow label="Box type" value={session.opl.boxType ?? '—'} />
          {/* Targets from the SALES ORDER, not the OPL — the allocator is
              broken and OPL quantities under-report (§8.3). */}
          <DetailRow label="Bunch size" value={session.targets.uom} />
          <DetailRow
            label="Per box"
            value={`${session.targets.capPerBox} ${session.targets.unitLabel}`}
          />
          <DetailRow
            label="Order target"
            value={`${session.targets.orderTotal} ${session.targets.unitLabel}`}
          />
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
          {/* A MIX lists the GROUP, plainly and in full — every variety the order
              asks for, whether or not the allocator reached it. No warning, no
              greying out, no allocated-vs-ordered: a packer scans what is in
              front of them, and whether allocation ran is not their problem.
              Shelf is unknown for an unallocated line, so the row simply omits
              it rather than saying anything about why. */}
          {session.targets.packMode !== 'straight'
            ? session.targets.groupLines.map((line, idx) => {
                const shelf = session.opl.rows.find(
                  (r) => r.itemCode === line.variety || r.itemCode === line.itemCode,
                )?.shelf;
                const subs = substitutesForLine(session.targets.substitutes, {
                  template: line.variety,
                  length: line.orderLength,
                });
                return (
                  <View key={`${line.itemCode}-${idx}`} style={styles.itemRow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {line.variety ?? line.itemCode} · {line.orderLength ?? '—'}
                    </Text>
                    {shelf ? (
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        shelf {shelf}
                      </Text>
                    ) : null}
                    {/* A PERMISSION, NOT AN EXCEPTION. Same muted style as the
                        shelf line — no warning tone, no emphasis. The order said
                        these are acceptable, so they read as ordinary. */}
                    {subs.length > 0 ? (
                      <Text style={styles.itemMeta} numberOfLines={2}>
                        or {subs.join(', ')}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            : session.opl.rows.map((row, idx) => (
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
              {/* See the mixed branch above — quiet on purpose. */}
              {substitutesForLine(session.targets.substitutes, {
                template: row.itemCode,
                length: row.stemLength,
              }).length > 0 ? (
                <Text style={styles.itemMeta} numberOfLines={2}>
                  or{' '}
                  {substitutesForLine(session.targets.substitutes, {
                    template: row.itemCode,
                    length: row.stemLength,
                  }).join(', ')}
                </Text>
              ) : null}
            </View>
              ))}
        </View>
      </Card>

      {/* Persistent counter — shown always, not only on error. */}
      <Card title={`Box ${boxNumber} of ${session.targets.boxCount}`}>
        <Text style={styles.counter}>
          {inBox} of {session.targets.capPerBox} {session.targets.unitLabel}
        </Text>
        <View style={styles.rows}>
          <DetailRow
            label="Order progress"
            value={`${packedTotal} of ${session.targets.orderTotal} ${session.targets.unitLabel}`}
          />
          {/* Persistent, unlike the resume Notice which the next scan clears.
              A packer returning to a part-packed order needs to see that boxes
              1-3 are done without re-reading a message that has gone. */}
          {completedBoxes ? (
            <DetailRow label="Boxes complete" value={completedBoxes} />
          ) : null}
          {/* Surfaced so a packer can sanity-check they have Bunch(10) and not
              Bunch(12): a wrong-size bunch passes both Rule 1 and Rule 3 today
              — the unguarded gap recorded in §8.3. */}
          <DetailRow label="Bunch size" value={session.opl.rows[0]?.uom ?? '—'} />
          <DetailRow
            label="Variety"
            value={
              session.targets.packMode !== 'straight'
                ? `${session.targets.groupLines.length} varieties`
                : (session.opl.rows[0]?.itemCode ?? '—')
            }
          />
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
        {session.resume.isComplete || packedTotal >= session.targets.orderTotal
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
  const identity = pickerIdentity(item);
  const progress = pickerProgress(item);

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
      {identity.primary ? (
        <Text style={styles.pickerPrimary} numberOfLines={1}>
          {identity.primary}
        </Text>
      ) : null}
      {identity.caption ? (
        <Text style={styles.pickerCaption} numberOfLines={1}>
          {identity.caption}
        </Text>
      ) : null}
      {item.boxType ? (
        <Text style={styles.pickerMeta} numberOfLines={1}>
          {item.boxType}
        </Text>
      ) : null}
      {progress ? (
        <Text style={styles.pickerProgress} numberOfLines={1}>
          {progress}
        </Text>
      ) : null}
      {/* What is actually IN the pick list, so a packer can tell them apart
          without opening each one. Duplicates are collapsed — one OPL commonly
          repeats a variety at a length dozens of times. */}
      {item.varieties.length > 0 || item.bunches > 0 ? (
        <Text style={styles.pickerContents} numberOfLines={2}>
          {[
            item.varieties.join(', '),
            // The ORDER's length, not the allocation's — longer stems are cut
            // down during packing, so the box holds the order's length.
            displayLength(item.orderLength, item.lengths),
            item.bunches > 0 ? `${item.bunches} bunches` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </Pressable>
  );
}

function DetailRow({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string | null;
}) {
  return (
    <View style={styles.detailBlock}>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {caption ? (
        <Text style={styles.detailCaption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
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
  // Search sits above the two Segmented rows in one card, so the three filters
  // read as one control rather than three stacked cards.
  filters: { gap: spacing.md },
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
  detailBlock: { gap: 1 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  detailCaption: { ...typography.caption, textAlign: 'right' },
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
  pickerPrimary: { fontSize: 14, fontWeight: '600', color: colors.primary, marginTop: 2 },
  pickerCaption: { ...typography.caption },
  pickerProgress: { ...typography.caption, color: colors.textSecondary },
  pickerMeta: { fontSize: 13, color: colors.textSecondary },
  pickerContents: { fontSize: 13, fontWeight: '500', color: colors.primary, marginTop: 2 },

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
