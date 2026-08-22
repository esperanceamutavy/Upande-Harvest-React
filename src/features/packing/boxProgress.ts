import { parseStemsPerBunch } from './targets';
import type { BoxProgress } from './resume';

// Lives here rather than in resume.ts so that module keeps ZERO relative
// imports: its tests run under `node --test` with native type stripping, which
// is plain ESM and cannot resolve an extensionless specifier. Adding one broke
// the whole resume suite.

/**
 * Group Farm Pack List `pack_list_item` rows into per-box totals.
 *
 * Shared by the resume path and the picker's progress line, so "how many boxes
 * has this pack list got into" is computed one way only.
 *
 * `bucket_id` is the BOX NUMBER despite the field name. Non-numeric values are
 * skipped rather than coerced to 0, which would merge unrelated rows into a
 * phantom box. Each row's own `bunch_uom` drives the stem conversion, so
 * mixed-size rows in one box still add up; "Stems" does not parse and one stem
 * per unit is correct for it.
 */
export function groupRowsByBox(rows: Record<string, unknown>[]): Map<number, BoxProgress> {
    const perBox = new Map<number, BoxProgress>();

    for (const row of rows) {
        const boxNumber = Number.parseInt(String(row.bucket_id ?? '').trim(), 10);
        if (!Number.isFinite(boxNumber)) continue;

        const bunches = Number(row.bunch_qty ?? 0) || 0;
        const perUnit = parseStemsPerBunch(String(row.bunch_uom ?? '')) ?? 1;

        const current = perBox.get(boxNumber) ?? { bunches: 0, stems: 0 };
        perBox.set(boxNumber, {
            bunches: current.bunches + bunches,
            stems: current.stems + bunches * perUnit,
        });
    }

    return perBox;
}
