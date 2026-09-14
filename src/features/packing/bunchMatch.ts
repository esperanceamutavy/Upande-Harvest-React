// Does a scanned bunch belong on this pick list?
//
// A MONO bunch carries one variety, and the answer is the old one: that variety,
// or its template, has to appear among the OPL's rows.
//
// A BOUQUET carries several. `item_code` on the label names only the FIRST of
// them, so matching on it alone would accept a bouquet whose other two varieties
// belong to a different order entirely — and reject nothing, since the first
// variety is usually common. The recipe is the identity, so EVERY component has
// to be on the pick list.
//
// That is strict on purpose. A bouquet is assembled once, at grading, and a
// packer holding the wrong one has no way to tell by eye: three varieties banded
// together look much like three others. Being told at the bench beats a customer
// opening the box.
//
// The cost is a false rejection when an OPL is only PARTIALLY allocated and a
// component has no row yet. That is the safe direction, and it resolves itself
// as soon as allocation completes.
//
// Deliberately no relative imports: loaded directly by `node --test`, which is
// plain ESM and cannot resolve an extensionless specifier.

/** The subset of a scanned bunch this module reads. */
export interface MatchableBunch {
    itemCode: string;
    variantParent: string;
    isMixedBunch: boolean;
    components: { variety: string; variantParent: string }[];
}

/** An OPL row, reduced to what matching needs. */
export interface MatchableRow {
    itemCode: string;
}

/** Why a bunch does not belong here. `null` means it does. */
export type BunchMatch =
    | null
    | { reason: 'variety-mismatch'; missing: string[] };

function rowMatches(rows: MatchableRow[], variety: string, parent: string): boolean {
    return rows.some((r) => r.itemCode === variety || r.itemCode === parent);
}

/**
 * Match a scanned bunch against a pick list's rows.
 *
 * `missing` names the components that are NOT on the pick list, so the packer
 * can be told which variety is wrong rather than just "mismatch" — with three
 * varieties in hand, that difference is the whole message.
 */
export function matchBunchToOpl(bunch: MatchableBunch, rows: MatchableRow[]): BunchMatch {
    if (!bunch.isMixedBunch) {
        return rowMatches(rows, bunch.itemCode, bunch.variantParent)
            ? null
            : { reason: 'variety-mismatch', missing: [bunch.itemCode] };
    }

    // A bouquet with no recipe cannot be checked, so it is not accepted.
    // useBunchDetails refuses these earlier; this is the belt to that braces.
    if (bunch.components.length === 0) {
        return { reason: 'variety-mismatch', missing: [bunch.itemCode] };
    }

    const missing = bunch.components
        .filter((c) => !rowMatches(rows, c.variety, c.variantParent))
        .map((c) => c.variety);

    return missing.length > 0 ? { reason: 'variety-mismatch', missing } : null;
}

/**
 * The length to compare against the order.
 *
 * A bouquet's components can differ in length, and the box is governed by the
 * SHORTEST of them: a 40CM stem in a 50CM order is short however long the rest
 * are. Mono bunches just use their own.
 */
export function effectiveStemLength(
    bunch: { isMixedBunch: boolean; stemLength: string; components: { stemLength: string }[] },
    // Takes compareLength itself. Typed on the one verdict this needs rather
    // than the full LengthVerdict union, so the module keeps zero imports and
    // stays loadable by `node --test`.
    compare: (a: string, b: string) => string,
): string {
    if (!bunch.isMixedBunch || bunch.components.length === 0) return bunch.stemLength;

    let shortest = '';
    for (const c of bunch.components) {
        if (!c.stemLength) continue;
        if (!shortest) {
            shortest = c.stemLength;
            continue;
        }
        if (compare(c.stemLength, shortest) === 'shorter') shortest = c.stemLength;
    }
    return shortest || bunch.stemLength;
}
