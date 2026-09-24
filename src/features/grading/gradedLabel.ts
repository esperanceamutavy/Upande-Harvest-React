// The WORDING of a graded-bunch confirmation.
//
// Split from bunchRecipe.ts and deliberately carrying NO relative imports: this
// module is loaded directly by `node --test`, which is plain ESM and cannot
// resolve an extensionless specifier. bunchRecipe.ts reaches lib/api, so a test
// importing it would drag the whole network layer in and fail to resolve.
// Same constraint as lengths.ts, targets.ts, mixGroup.ts and bunchMatch.ts.

/** The subset of a bouquet component this module renders. */
export interface LabelledComponent {
    variety: string;
    stems: number;
}

/**
 * The confirmation line for a graded bunch.
 *
 * A BOUQUET names no variety. It carries several and `item_code` names only the
 * first, so printing one would be actively misleading — worse than printing
 * none. The size is what identifies it; the varieties are listed beneath.
 *
 * A MONO bunch is unchanged and still names its variety.
 *
 * Pure, so the wording is pinned by a test rather than by reading the screen.
 */
export function gradedHeadline(opts: {
    isMixedBunch: boolean;
    bunchUom: string | null;
    qty: number | null;
    variety: string | null;
}): string {
    if (opts.isMixedBunch) {
        if (opts.bunchUom) return `${opts.bunchUom} graded`;
        // The size is missing — say the count rather than inventing a variety.
        return opts.qty != null ? `${opts.qty} stems graded` : 'Bouquet graded';
    }
    const stems = opts.qty != null ? `${opts.qty} stems` : 'graded';
    return `Graded: ${stems}${opts.variety ? ` · ${opts.variety}` : ''}`;
}

/** "Good Times-35CM 7" — one component, for the list under the confirmation. */
export function componentLabel(c: LabelledComponent): string {
    return `${c.variety} ${c.stems}`;
}
