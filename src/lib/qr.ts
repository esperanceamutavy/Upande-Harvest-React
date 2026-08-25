// Shared scanned-QR unwrapping.
//
// Labels in the field arrive in three shapes:
//   1. a JSON object keyed by slot — {"bunch_id":"BUNCH-38203"}
//   2. malformed JSON that still contains the value — {"bunch_id":"BUNCH-1"
//   3. a bare id — BUNCH-38203
//
// MUST be applied AT THE POINT OF CAPTURE, before the value reaches state, the
// display or a payload. Unwrapping only at the API boundary fixes the request
// but leaves the session log showing raw JSON blobs — which is exactly how the
// packing screen shipped: it sent `{"bunch_id":"BUNCH-38203"}` as the id and
// the server answered `Bunch {"bunch_id":"BUNCH-38203"} not found`.

/**
 * Keys checked in order, first present wins.
 *
 * `employee` and `grader` are not in the canonical list but are kept: grader
 * badges use them, and dropping them would regress the grading and
 * receiving-out badge latches to returning raw JSON.
 */
const ID_KEYS = [
  'bunch_id',
  'coldroom_bucket',
  'bucket_id',
  'box_label',
  'box_id',
  'id',
  'employee_id',
  'employee',
  'grader',
] as const;

/**
 * A Frappe desk URL — `https://host/app/box-label/BOX-OPL-2026-00158-1`.
 *
 * Box Label QRs encode exactly this: `_attach_qr` in dispatch_session.py renders
 * `/app/box-label/<name>` so a scan resolves to the BOX rather than to its pack
 * list. A packer scanning a printed label therefore gets a URL, not a bare id
 * and not JSON — and dispatch would post the whole URL as the box name.
 *
 * Anchored at both ends so it cannot fire on a JSON blob that merely contains a
 * path. Only a string that IS a desk URL matches.
 */
const DESK_URL = /^(?:https?:\/\/[^/]+)?\/app\/[a-z0-9-]+\/([^/?#]+)\/?$/i;

function idFromDeskUrl(text: string): string | null {
  const match = DESK_URL.exec(text);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    // A malformed escape must not throw out of a scan.
    return match[1].trim() || null;
  }
}

/** Pull the clean id out of whatever the scanner produced. */
export function extractScannedId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Checked before JSON: a desk URL is not JSON, and the `:"` fallback below
  // would not find anything usable in one.
  const fromUrl = idFromDeskUrl(trimmed);
  if (fromUrl) return fromUrl;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      for (const key of ID_KEYS) {
        const v = obj[key];
        if (v != null && String(v).trim().length > 0) return String(v).trim();
      }
    }
    // LEGACY COLDROOM LABELS — do NOT remove. Some old printed labels are
    // shaped {"<id>":"bucket"}: the id is the KEY, and the VALUE is the literal
    // string "bucket". Those labels are still in circulation. Checked after the
    // named keys so a well-formed label always wins.
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v === 'bucket' && k.trim()) return k.trim();
      }
    }

    // Parsed, but nothing recognisable in it — a bare JSON string or number
    // still yields a usable value; an unkeyed object does not.
    if (typeof parsed === 'string' || typeof parsed === 'number') {
      return String(parsed).trim() || null;
    }
  } catch {
    // Not valid JSON. A truncated scan can still carry the value: everything
    // after the first `:"` up to the closing quote/brace.
    const at = trimmed.indexOf(':"');
    if (at >= 0) {
      const tail = trimmed.slice(at + 2).replace(/["}\s]+$/, '').trim();
      if (tail) return tail;
    }
  }

  return trimmed;
}
