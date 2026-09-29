// When does the packing day roll over?
//
// ── THE BUG ────────────────────────────────────────────────────────────────
//
// The shift runs past midnight, and every date in the system rolled at 00:00
// underneath it.
//
// The picker's "Today" means delivery_date = TOMORROW, because packing runs a
// day ahead of the flight. At 23:59 on the 29th that is the 30th — tonight's
// work. One minute later it became the 1st, and everything the packers were
// holding moved to "Yesterday". The tab they were working emptied while they
// stood at it.
//
// Farm Pack List.date had the same seam: boxes closed before midnight landed on
// one date, boxes after on the next, so a single shift was split across two
// days in every dashboard that groups by it.
//
// ── THE RULE ───────────────────────────────────────────────────────────────
//
// The packing day rolls at 06:00, not midnight. Before that hour, "today" is
// still the previous calendar date — the shift that began yesterday evening is
// still the same shift.
//
//     29 Sep 23:59  ->  packing day 29 Sep
//     30 Sep 01:00  ->  packing day 29 Sep   (the same shift, still running)
//     30 Sep 05:59  ->  packing day 29 Sep
//     30 Sep 06:00  ->  packing day 30 Sep   (a new shift)
//
// 06:00 is far enough after the night shift ends to be safely outside it, and
// far enough before the morning starts that nobody is packing across it.
//
// The SAME rule is applied server-side to the date stamped on a new Farm Pack
// List — see the "Create Or Update Farm Pack List" Server Script. The two must
// agree, or the picker and the dashboard disagree about which day it is.
//
// Deliberately no relative imports: loaded directly by `node --test`, which is
// plain ESM and cannot resolve an extensionless specifier. Same constraint as
// resume.ts, lengths.ts and packState.ts.

/** The hour the packing day rolls over. Mirrored in the server script. */
export const ROLL_HOUR = 6;

/**
 * The packing day containing `now`, as a Date at local midnight.
 *
 * Before ROLL_HOUR this is YESTERDAY's calendar date: the shift that started
 * last evening has not ended yet.
 */
export function packingDay(now: Date = new Date(), rollHour: number = ROLL_HOUR): Date {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() < rollHour) d.setDate(d.getDate() - 1);
    return d;
}

/** `YYYY-MM-DD` in LOCAL time. Never toISOString, which is UTC and shifts the day. */
export function localDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The packing day, offset by `n` days, as `YYYY-MM-DD`. */
export function packingDayPlus(n: number, now: Date = new Date()): string {
    const d = packingDay(now);
    d.setDate(d.getDate() + n);
    return localDate(d);
}

/** Monday of the week containing the PACKING day, at local midnight. */
export function startOfPackingWeek(now: Date = new Date()): Date {
    const d = packingDay(now);
    const dow = d.getDay(); // 0 = Sunday
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return d;
}
