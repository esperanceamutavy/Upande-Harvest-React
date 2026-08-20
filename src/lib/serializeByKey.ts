// Per-key write serialization for scan-driven submissions.
//
// RESTYLE_PLAN.md §8.1 — HARD REQUIREMENT, not an optimisation.
//
// Slow networks plus rapid scanning let request N+1 reach the server before
// N's ACK arrives. For Stock-Entry writes that corrupts bucket state. React
// Query runs mutations in parallel by default, so the guard the legacy client
// had (`serializedByKey`, Upande-Harvest-React api.ts:493-507) does not come
// for free — it has to be carried across explicitly and wrapped around the
// mutationFn.
//
// Same key → strictly one at a time. Different keys → still parallel.
// A rejected predecessor does not block its successor: we await it only to
// order the calls, and swallow its error so the next scan still fires.
//
// Lives here rather than in lib/api.ts, which is off-limits (hard constraint 3).

const inflight = new Map<string, Promise<unknown>>();

export async function serializeByKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = inflight.get(key);
  if (prev) {
    try {
      await prev;
    } catch {
      // Predecessor failed — irrelevant to us, we still want our turn.
    }
  }

  const current = fn();
  inflight.set(key, current);
  try {
    return await current;
  } finally {
    // Only clear if we are still the newest — a later call may have replaced us.
    if (inflight.get(key) === current) inflight.delete(key);
  }
}

/** Test/debug helper: is a write currently in flight for this key? */
export function isSerializedKeyBusy(key: string): boolean {
  return inflight.has(key);
}
