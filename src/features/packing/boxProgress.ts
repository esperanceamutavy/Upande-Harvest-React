import { parseStemsPerBunch } from './targets.ts';
import type { BoxProgress } from './resume';
import type { PackMode } from './mixGroup.ts';

// Lives here rather than in resume.ts so that module keeps ZERO relative
// imports: its tests run under `node --test` with native type stripping, which
// is plain ESM and cannot resolve an extensionless specifier. Adding one broke
// the whole resume suite.
//
// THIS module is now loaded directly by a test too, so its own relative imports
// carry the .ts extension — plain ESM resolves that, and Metro is happy with it
// (useOplList.ts has imported './chunked.ts' in production since the picker
// chunking work).

/**
 * Group Farm Pack List `pack_list_item` rows into per-box totals.
 *
 * THE one place "how much is in this box" is computed. The display, the cap
 * check and the completion test all read it through here, so they cannot
 * disagree — which they did, and that is what closed a box early.
 *
 * `bucket_id` is the BOX NUMBER despite the field name. Non-numeric values are
 * skipped rather than coerced to 0, which would merge unrelated rows into a
 * phantom box. Each row's own `bunch_uom` drives the stem conversion, so
 * mixed-size rows in one box still add up; "Stems" does not parse and one stem
 * per unit is correct for it.
 *
 * ── A BOUQUET IS ONE BUNCH, NOT ONE PER VARIETY ────────────────────────────
 *
 * A bouquet scan writes one row PER COMPONENT VARIETY, each carrying the same
 * `bunch_qty` — the number of bouquets. 35 four-variety bouquets is four rows
 * of 35, not 140 of anything.
 *
 * Summing `bunch_qty` therefore counted each bouquet once per variety. The
 * screen read "140 of 35", the cap was reached at roughly a quarter of the real
 * bouquets, and the box closed with 18 in it. OPL-2026-06849 ended up 35 / 18 /
 * 35 across three boxes — short in the MIDDLE, which is worse than short at the
 * end because nothing downstream looks for a hole.
 *
 * So for a bouquet the bunch count is ONE VARIETY'S rows, not the sum. The
 * components of a scan are written in a single request and always carry equal
 * quantities, so the largest per-variety total IS the bouquet count; max rather
 * than a picked variety only so a malformed row cannot silently undercount.
 *
 * STEMS ARE UNAFFECTED and still sum across every component — 175 + 70 + 105 +
 * 105 = 455 is the whole box, and that was always right.
 */
export function groupRowsByBox(
    rows: Record<string, unknown>[],
    mode: PackMode = 'straight',
): Map<number, BoxProgress> {
    const stemsByBox = new Map<number, number>();
    // box -> variety -> bunches, so a bouquet can be counted per variety.
    const bunchesByBoxVariety = new Map<number, Map<string, number>>();

    for (const row of rows) {
        const boxNumber = Number.parseInt(String(row.bucket_id ?? '').trim(), 10);
        if (!Number.isFinite(boxNumber)) continue;

        const bunches = Number(row.bunch_qty ?? 0) || 0;
        const perUnit = parseStemsPerBunch(String(row.bunch_uom ?? '')) ?? 1;
        const variety = String(row.item_code ?? '').trim() || '(unknown)';

        stemsByBox.set(boxNumber, (stemsByBox.get(boxNumber) ?? 0) + bunches * perUnit);

        const byVariety = bunchesByBoxVariety.get(boxNumber) ?? new Map<string, number>();
        byVariety.set(variety, (byVariety.get(variety) ?? 0) + bunches);
        bunchesByBoxVariety.set(boxNumber, byVariety);
    }

    const perBox = new Map<number, BoxProgress>();
    for (const [boxNumber, stems] of stemsByBox) {
        const byVariety = bunchesByBoxVariety.get(boxNumber) ?? new Map<string, number>();
        const totals = [...byVariety.values()];
        const bunches =
            mode === 'bouquet'
                ? Math.max(0, ...totals)
                : totals.reduce((sum, n) => sum + n, 0);
        perBox.set(boxNumber, { bunches, stems });
    }

    return perBox;
}
