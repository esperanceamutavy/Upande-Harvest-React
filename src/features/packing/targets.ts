// Unit resolution for the packing cap.
//
// Extracted from the Sales Order fetch so it can be tested without a network
// call — see targets.test.ts, which pins it against both live orders.
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
}

export interface TargetUnits {
  unitLabel: 'bunches' | 'stems';
  capPerBox: number;
  orderTotal: number;
  stemsPerBunch: number | null;
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
  const { uom, packRate, qty, conversionFactor, oplUom, bunching } = input;

  const stemsPerBunch = parseStemsPerBunch(oplUom) ?? parseBunching(bunching) ?? null;
  const soIsBunchUom = /^\s*bunch\s*\(/i.test(uom);

  // Already counted in bunches — dividing here would double-convert.
  if (soIsBunchUom) {
    return {
      unitLabel: 'bunches',
      capPerBox: Math.max(1, Math.round(packRate)),
      orderTotal: Math.max(1, Math.round(qty)),
      stemsPerBunch,
    };
  }

  // Stems on the wire, bunches on the bench.
  if (stemsPerBunch) {
    return {
      unitLabel: 'bunches',
      capPerBox: Math.max(1, Math.round(packRate / stemsPerBunch)),
      orderTotal: Math.max(1, Math.round((qty * conversionFactor) / stemsPerBunch)),
      stemsPerBunch,
    };
  }

  // Bunch size unknown from either source. Count stems and SAY stems — showing
  // a stem count as "bunches" is exactly the blocker this exists to prevent.
  return {
    unitLabel: 'stems',
    capPerBox: Math.max(1, Math.round(packRate)),
    orderTotal: Math.max(1, Math.round(qty * conversionFactor)),
    stemsPerBunch: null,
  };
}
