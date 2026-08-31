// How a greenhouse's received-vs-shelved gap reads on screen.
//
// gap_stems = received_stems - shelved_stems, computed server-side.
//
// A NEGATIVE GAP IS NORMAL AND MUST NOT LOOK LIKE AN ERROR. It means buckets
// received BEFORE the window were shelved inside it — routine on any day that
// opens with yesterday's arrivals still on the floor. Live examples on a single
// day: B2 -80, G2 -140, F2 -240. So it renders as "240 over" in muted text: no
// minus sign, no red.
//
// Zero is the target state, not the absence of data, so it says "level" and is
// the only value that gets a colour.
//
// Deliberately no relative imports: loaded directly by `node --test`, which is
// plain ESM and cannot resolve an extensionless specifier.

/** Which of the three states a gap is in. The screen maps this to a colour. */
export type GapTone = 'short' | 'over' | 'level';

export interface GapDisplay {
    text: string;
    tone: GapTone;
}

export function formatGap(gap: number | null | undefined): GapDisplay {
    if (gap == null || !Number.isFinite(gap)) return { text: '—', tone: 'over' };

    if (gap > 0) return { text: `${gap.toLocaleString()} short`, tone: 'short' };
    if (gap < 0) return { text: `${Math.abs(gap).toLocaleString()} over`, tone: 'over' };
    return { text: 'level', tone: 'level' };
}

/**
 * The three figures under the greenhouse name.
 *
 * STEMS ONLY. Bucket counts are deliberately excluded from this line: a bucket
 * can move more than once, so A5 legitimately shows 21 received buckets against
 * 38 transferred, and putting those side by side invites a reader to see a
 * discrepancy that is not there. Stems are the comparable figure.
 */
export function formatFlow(
    received: number,
    transferred: number,
    shelved: number,
): string {
    return (
        `${received.toLocaleString()} received · ` +
        `${transferred.toLocaleString()} transferred · ` +
        `${shelved.toLocaleString()} shelved`
    );
}
