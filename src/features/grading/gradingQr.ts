// Grading QR parsing — ported from the live Xflora app's
// src/utils/grading-utils.ts (detectGradingQRType / extractGradingQRValue).
//
// Grading labels come in two shapes: a JSON object keyed by slot, or a bare
// string with a type prefix. Both are in circulation in the field, so both are
// supported exactly as the legacy client supports them.

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

/** Pull the id out of a scanned QR, whatever slot type it is. */
export function extractGradingQrValue(data: string): string | null {
  const fallback = data.trim() || null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const pick = (...keys: string[]): string | null => {
      for (const k of keys) {
        if (parsed[k] != null) return String(parsed[k]);
      }
      return null;
    };

    if (parsed.bunch_id !== undefined || parsed.bunch !== undefined) {
      return pick('bunch_id', 'bunch') ?? fallback;
    }
    // Grader — prefer the employee/payroll id over the display name.
    if (
      parsed.employee !== undefined ||
      parsed.grader !== undefined ||
      parsed.employee_id !== undefined
    ) {
      return pick('employee_id', 'employee', 'grader') ?? fallback;
    }
    if (parsed.bucket_id !== undefined || parsed.bucket !== undefined) {
      return pick('bucket_id', 'bucket') ?? fallback;
    }
    return pick('id') ?? fallback;
  } catch {
    return fallback;
  }
}
