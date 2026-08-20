// Scanned-QR parsing — ported from the live Xflora app's
// src/utils/grading-utils.ts (detectGradingQRType / extractGradingQRValue).
//
// Labels come in two shapes: a JSON object keyed by slot, e.g.
// {"bunch_id":"BUNCH-38203"}, or a bare string with a type prefix. Both are in
// circulation in the field, so both are supported.
//
// Slot DETECTION only — which field a scanned label belongs to. The value
// extraction it used to own now lives in `src/lib/qr.ts`, shared by every
// scanning screen. It was previously `features/grading/gradingQr.ts`, which made
// it look grading-specific; packing was written without it partly for that
// reason and shipped sending raw JSON as the bunch id.

import type { GradingQrType } from '../../types/grading';

/** Which slot a scanned QR belongs to. `unknown` means the caller decides. */
export function detectGradingQrType(data: string): GradingQrType {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (parsed.bunch_id || parsed.bunch) return 'bunch';
    if (parsed.grader || parsed.employee) return 'grader';
    // STG long-storage labels route to the bucket slot — the server resolves
    // them to the bound source_bucket.
    if (parsed.bucket_id || parsed.bucket || parsed.box_id) return 'bucket';
  } catch {
    const upper = data.trim().toUpperCase();
    if (upper.startsWith('BN-') || upper.startsWith('BUNCH-')) return 'bunch';
    if (upper.startsWith('GR-') || upper.startsWith('EMP-') || upper.startsWith('GRADER-')) {
      return 'grader';
    }
    if (upper.startsWith('BK-') || upper.startsWith('BUCKET-') || upper.startsWith('STG-')) {
      return 'bucket';
    }
  }
  return 'unknown';
}
