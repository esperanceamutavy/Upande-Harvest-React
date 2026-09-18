// Which unit is `custom_packrate` in, and what is the per-box target in the unit
// the packer actually scans?
//
// THE INVARIANT, true on every line inspected:
//
//     qty / custom_packrate == custom_number_of_boxes
//
//     SAL-ORD-2026-02165-1 Jazzbery       1040 / 260 = 4   uom Bunch(10)
//     SAL-ORD-2026-01493                     8 /   4 = 2   uom Bunch(10)
//     SAL-ORD-2026-02165-1 Brigitte Bardot  840 / 210 = 4   uom Stems
//
// So `custom_packrate` is ALWAYS in the same unit as `qty`. What varies is which
// unit `qty` is in — stems on the Jazzbery line, bunches on 01493 — and `uom`
// does not tell you, because both of those lines are `Bunch(10)`.
//
// WHAT DOES NOT WORK, each ruled out against live data rather than by argument:
//
//   * `conversion_factor`. It is 10.0 on both lines above and 1.0 on the Stems
//     line, so it separates uom from uom — not stems-packrate from
//     bunches-packrate, which is the question.
//   * The `Box Type` doctype. `Omang Standard Box` has no fields at all beyond
//     its name; there is no capacity recorded anywhere to compare against.
//   * Anything derived from OPL totals. OPL-2026-05500 is allocated 744 of 1040
//     stems, so its total over its box count gives 186, not the true 260. A
//     partially allocated pick list would poison any such rule.
//
// So the arbiter below is arithmetic first and physical second, and when neither
// settles it the caller is told to count STEMS and say "stems". A stem count
// labelled honestly is worth more than a bunch number that looks right and is
// wrong: the packer trusts the bunch number and closes the box on it.

export type PackrateBasis =
  /** uom is not Bunch(N), so packrate is stems — the ordinary case. */
  | 'stems-uom'
  /** packrate / stemsPerBunch is not a whole number, so packrate cannot be stems. */
  | 'integrality'
  /** Both readings are arithmetically valid; only one is a sane box. */
  | 'plausibility'
  /** The division is not exact, so no honest bunch target exists. */
  | 'inexact'
  /** Bunch size unknown, or both readings plausible. */
  | 'unresolved';

export interface PackrateInput {
  /** `custom_packrate`, as it arrives — string, number, null or absent. */
  packrate: unknown;
  /** Stems per bunch from the uom's `Bunch(N)` or the SO's `custom_bunching`. */
  stemsPerBunch: number | null;
  /** Whether the SO line's uom is `Bunch(N)`. */
  uomIsBunch: boolean;
}

export interface ResolvedPackrate {
  /** The per-box target, in `unitLabel`. Never rounded — see `inexact`. */
  perBox: number;
  /** What `perBox` counts. Only ever 'bunches' when that is provably honest. */
  unitLabel: 'bunches' | 'stems';
  /** Divide the SO line's `qty` by this to get the order total in `unitLabel`.
   *  Keeps `qty / packrate == boxes` true after conversion. */
  qtyDivisor: number;
  /** Stems in a full box, when known. Display and diagnostics only. */
  stemsPerBox: number | null;
  /** Which rule decided. Surfaced so a wrong call can be traced to its reason. */
  basis: PackrateBasis;
}

/**
 * A sane number of stems in one flower box.
 *
 * Deliberately wide. Live values run 40 (SAL-ORD-2026-01493: 4 bunches of 10) to
 * 300. The band only has to separate a reading from the SAME packrate multiplied
 * or divided by the bunch size, which is at least a 5x gap, so it does not need
 * to be tight — and a tight band would reject an unusual but real box.
 */
const MIN_STEMS_PER_BOX = 30;
const MAX_STEMS_PER_BOX = 1000;

function toPositiveNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Returns null when `packrate` is absent, zero or non-numeric — the caller
 * already treats "no pack rate" as a hard error and says so with the order name.
 */
export function resolvePackratePerBox(input: PackrateInput): ResolvedPackrate | null {
  const packrate = toPositiveNumber(input.packrate);
  if (packrate === null) return null;

  const stemsPerBunch = toPositiveNumber(input.stemsPerBunch);

  // Bunch size unknown from either source, or a "bunch" of one stem — which is
  // not a bunch. Either way: count stems and SAY stems, and divide by nothing.
  if (stemsPerBunch === null || stemsPerBunch === 1) {
    return {
      perBox: packrate,
      unitLabel: 'stems',
      qtyDivisor: 1,
      stemsPerBox: packrate,
      basis: 'unresolved',
    };
  }

  // ── The ordinary case: a Stems-uom line ──────────────────────────────────
  // packrate is stems, qty is stems. Both convert by the bunch size.
  if (!input.uomIsBunch) {
    return asBunchesFromStems(packrate, stemsPerBunch, 'stems-uom');
  }

  // ── A Bunch(N) line, where packrate may be either unit ────────────────────

  // 1. INTEGRALITY. If reading packrate as stems implies a fractional number of
  //    bunches per box, it cannot be stems — no box holds 0.4 of a bunch. This
  //    is what identifies SAL-ORD-2026-01493 (4 / 10 = 0.4) as already-bunches,
  //    and it is arithmetic, not judgement.
  const asStemsGivesBunches = packrate / stemsPerBunch;
  if (!Number.isInteger(asStemsGivesBunches) || asStemsGivesBunches < 1) {
    return {
      perBox: packrate,
      unitLabel: 'bunches',
      qtyDivisor: 1,
      stemsPerBox: packrate * stemsPerBunch,
      basis: 'integrality',
    };
  }

  // 2. PLAUSIBILITY. Both readings are now arithmetically valid, so the only
  //    thing left to separate them is the size of the resulting box. This is a
  //    HEURISTIC and is labelled as one: it is the fallback, used because the
  //    data carries no capacity anywhere to check against.
  //
  //    Jazzbery: 260 stems/box is a box; 260 bunches/box is 2600 stems and is not.
  const stemsIfStems = packrate;
  const stemsIfBunches = packrate * stemsPerBunch;
  const stemsSane = isSaneBox(stemsIfStems);
  const bunchesSane = isSaneBox(stemsIfBunches);

  if (stemsSane && !bunchesSane) {
    return asBunchesFromStems(packrate, stemsPerBunch, 'plausibility');
  }
  if (bunchesSane && !stemsSane) {
    return {
      perBox: packrate,
      unitLabel: 'bunches',
      qtyDivisor: 1,
      stemsPerBox: stemsIfBunches,
      basis: 'plausibility',
    };
  }

  // 3. Both sane, or neither. Refuse to guess.
  return {
    perBox: packrate,
    unitLabel: 'stems',
    qtyDivisor: 1,
    stemsPerBox: null,
    basis: 'unresolved',
  };
}

function isSaneBox(stems: number): boolean {
  return stems >= MIN_STEMS_PER_BOX && stems <= MAX_STEMS_PER_BOX;
}

/**
 * Convert a stems packrate into bunches — but only when the division is exact.
 *
 * NOT ROUNDED, deliberately. A fractional bunch target is not a real target: a
 * packer cannot scan half a bunch, and rounding 52.5 to 53 would close the box
 * one bunch late every time while looking perfectly reasonable on screen. So an
 * inexact division is surfaced by falling back to STEMS and saying "stems" —
 * the count stays exact and the label stays true, and `basis: 'inexact'` records
 * why the screen is not showing bunches.
 */
function asBunchesFromStems(
  packrate: number,
  stemsPerBunch: number,
  basis: PackrateBasis,
): ResolvedPackrate {
  const bunches = packrate / stemsPerBunch;
  if (!Number.isInteger(bunches)) {
    return {
      perBox: packrate,
      unitLabel: 'stems',
      qtyDivisor: 1,
      stemsPerBox: packrate,
      basis: 'inexact',
    };
  }
  return {
    perBox: bunches,
    unitLabel: 'bunches',
    qtyDivisor: stemsPerBunch,
    stemsPerBox: packrate,
    basis,
  };
}
