// Unit resolution for the packing cap.
//
// Extracted from the Sales Order fetch so it can be tested without a network
// call — see targets.test.ts, which pins it against the live orders.
//
// THE PROBLEM THIS SOLVES: `custom_packrate` and `qty` are expressed in the SO
// line's uom, and that uom is not always bunches.
//
//   SAL-ORD-2026-01493  uom Bunch(10)  packrate 4    qty 8     → already bunches
//   SAL-ORD-2026-01494  uom Stems      packrate 200  qty 1200  → stems
//
// On the Stems order, 200 is 20 bunches. Showing "200 bunches" meant the cap
// was unreachable and the box could not close. `conversion_factor` does not
// help — on a Stems line it is 1, not the bunch size.
//
// AND A Bunch(N) UOM IS NOT PROOF THE PACKRATE IS BUNCHES. That assumption was
// this module's original early return, and it is what showed "78 of 260" on
// SAL-ORD-2026-02165-1 (Jazzbery, uom Bunch(10), packrate 260 STEMS) — 78
// bunches was already three full boxes of 26. Deciding stems-or-bunches is now
// packrate.ts's job; this module resolves the bunch SIZE and applies the answer.

import { resolvePackratePerBox, type PackrateBasis } from './packrate.ts';

/** `"Bunch(10)"` → 10. The server's own paren rule. */
export function parseStemsPerBunch(uom: string): number | null {
  const open = uom.indexOf('(');
  const close = uom.indexOf(')', open + 1);
  if (open < 0 || close < 0) return null;
  const n = Number.parseInt(uom.slice(open + 1, close), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `"X10"` / `"x10"` / `"10"` → 10. The Sales Order's statement of bunch size. */
export function parseBunching(raw: string): number | null {
  const n = Number.parseInt(raw.replace(/^\s*[Xx]\s*/, '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The bunch size THE ORDER states: the SO LINE's uom first, the header's
 * `custom_bunching` second, null when neither says.
 *
 * THE LINE WINS. A header bunching is an order-wide default and lines override
 * it — SAL-ORD-2026-02668's Brigitte Bardot line is Bunch(7) under an X5
 * header, and orders are now written with per-row bunching and no header value
 * at all: Bunch(5) on one line, Bunch(10) on another.
 *
 * `oplUom` is DELIBERATELY NOT CONSULTED here, which is the one place this
 * differs from resolveTargetUnits below. The OPL row describes what was
 * ALLOCATED; only the order can say what was ordered, and this is the figure a
 * scan is judged against.
 *
 * resolveTargetUnits calls this too, so there is a single implementation of
 * "line, then header" and the rule cannot drift from the arbiter again.
 */
export function orderBunchSize(uom: string, bunching: string): number | null {
  return parseStemsPerBunch(uom) ?? parseBunching(bunching) ?? null;
}

/**
 * Does this bunch match the size the ORDER is packed in?
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 *
 * SAL-ORD-2026-02617 is an X9 order at 450 stems a box. Box 1 took 50 x
 * Bunch(7) and closed 100 stems light; box 2 took a mix of sevens and nines.
 * Only box 3 was all nines. The customer is shipped bunches they did not order
 * and the box is short, and nothing caught either.
 *
 * So a bunch size that disagrees with the order's `custom_bunching` is refused,
 * exactly as a wrong variety or a short length is refused. This is STRICTER
 * than the box cap and it makes the cap arithmetic safe as a side effect: when
 * every bunch in a box is the same size, counting bunches and counting stems
 * give the same answer.
 *
 * ── WHEN IT DOES NOT APPLY ─────────────────────────────────────────────────
 *
 * `orderBunching` null — the order does not specify one, so bunch size is
 * unconstrained and behaviour is unchanged.
 *
 * `scanned` null — the bunch's own uom did not parse. Unchanged too: a format
 * surprise must not stop a grader's work reaching a packer, and there is
 * already a separate rejection for an unusable uom.
 *
 * A BOUQUET IS EXEMPT and the caller enforces that, not this function. A
 * bouquet's size comes from its recipe — 5 + 3 + 2 + 3 is a Bunch(13) whatever
 * the order's bunching says — so the question does not apply to it at all.
 */
export function bunchSizeMatchesOrder(
  scanned: number | null | undefined,
  orderBunching: number | null | undefined,
): boolean {
  if (orderBunching == null || orderBunching <= 0) return true;
  if (scanned == null || scanned <= 0) return true;
  return scanned === orderBunching;
}

export interface TargetUnitInput {
  /** The SO line's uom. */
  uom: string;
  packRate: number;
  qty: number;
  conversionFactor: number;
  /** The OPL row's uom — first choice for bunch size. */
  oplUom: string;
  /** The Sales Order's `custom_bunching` — second choice. */
  bunching: string;
  /**
   * The OPL's rows do not agree on a bunch size — e.g. BOX-OPL-2026-05502-1
   * carries Bunch(10) and Bunch(9) rows in one box.
   *
   * When they disagree there is no single number of stems a "bunch" means on
   * this pick list, so no bunch target can be honest and the session counts
   * stems. A bunch size is also NOT always stated by the order: the SO may say
   * Stems and leave the real size to whatever the scanned QR carries, which is
   * per-bunch and not knowable before the first scan.
   */
  mixedBunchSizes?: boolean;
}

export interface TargetUnits {
  unitLabel: 'bunches' | 'stems';
  capPerBox: number;
  orderTotal: number;
  stemsPerBunch: number | null;
  /** Which rule in packrate.ts decided the unit. Logged when it is a heuristic. */
  basis: PackrateBasis;
}

/**
 * Resolve bunch size, then express the cap and the order total in whatever unit
 * can honestly be named.
 *
 * Bunch size is resolved in order:
 *   1. the OPL row's `Bunch(N)` uom
 *   2. the Sales Order's `custom_bunching` (`"X10"`)
 *   3. neither — count STEMS, label them stems, and do not divide
 */
export function resolveTargetUnits(input: TargetUnitInput): TargetUnits {
  const { uom, packRate, qty, oplUom, bunching } = input;

  // Bunch SIZE only. The SO line's own uom is consulted too, since a Bunch(N)
  // line states its size there even when the OPL row says Stems.
  // The OPL row first for COUNTING — it is what was allocated and what the
  // packer will physically scan — then the order's own statement. The second
  // half is orderBunchSize, shared with the bunch-size rule so the two cannot
  // disagree about what the order says.
  const stemsPerBunch = parseStemsPerBunch(oplUom) ?? orderBunchSize(uom, bunching);
  const uomIsBunch = /^\s*bunch\s*\(/i.test(uom);

  // Rows disagreeing on bunch size is decisive on its own: nothing downstream
  // could interpret a single "bunches" figure across them.
  if (input.mixedBunchSizes) {
    return {
      unitLabel: 'stems',
      capPerBox: Math.max(1, packRate),
      orderTotal: Math.max(1, qty),
      stemsPerBunch,
      basis: 'unresolved',
    };
  }

  const resolved = resolvePackratePerBox({ packrate: packRate, stemsPerBunch, uomIsBunch });

  // No usable pack rate. useSalesOrderTargets already rejects this before we get
  // here, with the order name in the message; this keeps the function total.
  if (!resolved) {
    return { unitLabel: 'stems', capPerBox: 1, orderTotal: 1, stemsPerBunch, basis: 'unresolved' };
  }

  // `qty` is in the SAME unit as `packRate` — that is the invariant the whole
  // rule rests on — so the one divisor converts both, and qty/packrate == boxes
  // survives the conversion. conversionFactor is deliberately NOT applied: it
  // describes uom, and on these lines the uom is exactly what cannot be trusted.
  return {
    unitLabel: resolved.unitLabel,
    capPerBox: Math.max(1, resolved.perBox),
    orderTotal: Math.max(1, qty / resolved.qtyDivisor),
    stemsPerBunch,
    basis: resolved.basis,
  };
}
