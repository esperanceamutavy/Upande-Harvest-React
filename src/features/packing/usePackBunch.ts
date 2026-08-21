import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { serializeByKey } from '../../lib/serializeByKey';
import type { PackBunchPayload, PackBunchResult, PackRejection } from '../../types/packing';

// POST /api/method/createOrUpdateFarmPackList — the ONLY packing write.
//
// ONE BUNCH PER REQUEST (`items` length 1). This is Rule 2's fix: the script's
// ungraded-bunch check is a `frappe.throw`, which aborts the whole `items`
// array, so a batch of 25 dies on one bad bunch at position 17 and blames none
// of them. At length 1 the rejection names the bunch that caused it and every
// preceding scan is already committed. See RESTYLE_PLAN.md §8.3.
//
// SERIALIZED under the 'packing' key (§8.1): the endpoint does a
// read-modify-write on the Farm Pack List document, so concurrent posts can
// lose an increment. Distinct key from 'grading' so the two flows queue
// independently.
async function packBunch(p: PackBunchPayload): Promise<PackBunchResult> {
  return serializeByKey('packing', async () => {
    const res = await apiClient.post<Record<string, unknown>>(
      '/api/method/createOrUpdateFarmPackList',
      {
        custom_sales_order: p.salesOrder,
        custom_customer: p.customer,
        // From the scanned bunch's own farm field — the OPL's is null on live
        // documents, and the app's configured farm is not the authority here.
        custom_farm: p.farm,
        custom_order_pick_list: p.orderPickList,
        items: [
          {
            item_code: p.itemCode,
            bunch_uom: p.bunchUom,
            bunch_id: p.bunchId,
            custom_stem_length: p.stemLength,
            box_id: String(p.boxId),
            bunch_qty: 1,
          },
        ],
        // Asks the server to render the Box Label PDF for the box this scan
        // just filled. Sent only on that scan.
        ...(p.closeBox
          ? { close_box: 1, close_box_number: p.closeBoxNumber ?? p.boxId }
          : {}),
      },
    );

    // The script sets `frappe.response['data']`, so the body is under `data` —
    // not the conventional `message`. Read defensively anyway: this backend uses
    // four different response conventions across four endpoints (§8.2), so
    // prefer `data`, accept `message`, and fall back to the body itself.
    const body = (res.data ?? {}) as Record<string, unknown>;
    const payload = ((body.data ?? body.message ?? body) ?? {}) as Record<string, unknown>;

    const alreadyPacked = Array.isArray(payload.already_packed)
      ? (payload.already_packed as Record<string, unknown>[])
          .map((b) => String(b?.bunch_id ?? ''))
          .filter(Boolean)
      : [];

    return {
      status: payload.status != null ? String(payload.status) : 'unknown',
      message: payload.message != null ? String(payload.message) : 'Bunch packed',
      docname: payload.docname != null ? String(payload.docname) : null,
      alreadyPacked,
      newlyPacked: payload.newly_packed != null ? Number(payload.newly_packed) : null,
      boxLabel: payload.box_label != null ? String(payload.box_label) : null,
      boxLabelPdf: payload.box_label_pdf != null ? String(payload.box_label_pdf) : null,
      boxLabelPdfError:
        payload.box_label_pdf_error != null ? String(payload.box_label_pdf_error) : null,
    };
  });
}

export function usePackBunch() {
  return useMutation({ mutationFn: packBunch });
}

/**
 * Strip the wrapper this endpoint adds to every error.
 *
 * The script's outer handler re-throws as
 * `frappe.throw(_("Error processing packing: ") + str(e))`, and its own
 * validations use `frappe.throw` too — so they get caught and re-prefixed. The
 * useful text is what follows. **Packing wraps; grading does NOT** (§8.2), which
 * is why this lives here rather than in `extractFrappeError`.
 */
export function stripPackingErrorPrefix(message: string): string {
  const marker = 'error processing packing:';
  const at = message.toLowerCase().indexOf(marker);
  return at < 0 ? message.trim() : message.slice(at + marker.length).trim();
}

/**
 * Classify a server error into a rejection reason. Matching is on substrings,
 * never equality — the messages interpolate bunch ids and are re-wrapped.
 *
 * `already-packed` is a WARNING, not an error: at `items` length 1 the script's
 * "All scanned bunches have already been packed" branch always fires for a
 * re-scan, so it is the normal shape of a duplicate rather than a fault.
 */
export function classifyPackError(message: string): PackRejection {
  const m = message.toLowerCase();
  if (m.includes('already been packed')) return 'already-packed';
  if (m.includes('has not been graded')) return 'ungraded';
  if (m.includes('invalid bunch size format')) return 'bad-uom';
  return 'error';
}
