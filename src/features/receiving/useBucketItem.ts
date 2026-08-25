import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../lib/api';
import { standardRate } from './sprayOverride';

// What variety is in this bucket, and how many stems does a full one hold?
//
// Two reads, because `item_group` lives on Item and NOT on Bucket QR Code
// (verified live: selecting `item_group` off Bucket QR Code fails with
// "Unknown column"):
//   1. Bucket QR Code → item_code (the VARIANT, e.g. "Limassol Spray-60CM")
//   2. Item.item_group + the bucket rates for that item_code
//
// Step 2 is cached per item_code for the app's lifetime, the same way
// useBunchDetails caches `variant_of`: a receiving session works through one
// variety at a time, so this is one extra call per distinct variety rather than
// one per scan. Step 1 cannot be cached — every bucket is a distinct record.

const SPRAY_ROSES = 'Spray Roses';

export interface BucketItem {
    itemCode: string;
    itemGroup: string | null;
    /** True when this bucket needs the unbunched stem-count prompt. */
    isSprayRose: boolean;
    /**
     * Stems in a full bucket: `custom_unbunched_bucket_rate`, falling back to
     * `custom_bucket_rate`. Live Spray Roses carry 0 and 90 respectively, so
     * the fallback is the normal path here, not an edge case.
     */
    standard: number | null;
}

const itemCache = new Map<string, { itemGroup: string | null; standard: number | null }>();

function toNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

async function getValue(
    doctype: string,
    name: string,
    fieldname: string[],
): Promise<Record<string, unknown> | null> {
    const res = await apiClient.post<{ message?: Record<string, unknown> }>(
        '/api/method/frappe.client.get_value',
        { doctype, filters: { name }, fieldname },
    );
    const m = res.data?.message;
    return m && Object.keys(m).length > 0 ? m : null;
}

async function fetchBucketItem(bucketId: string): Promise<BucketItem> {
    const bucket = await getValue('Bucket QR Code', bucketId, ['item_code']);
    const itemCode = bucket?.item_code != null ? String(bucket.item_code) : '';
    if (!itemCode) throw new Error(`Bucket ${bucketId} has no variety on record`);

    const cached = itemCache.get(itemCode);
    if (cached) {
        return {
            itemCode,
            itemGroup: cached.itemGroup,
            isSprayRose: cached.itemGroup === SPRAY_ROSES,
            standard: cached.standard,
        };
    }

    const item = await getValue('Item', itemCode, [
        'item_group',
        'custom_unbunched_bucket_rate',
        'custom_bucket_rate',
    ]);
    const itemGroup = item?.item_group != null ? String(item.item_group) : null;
    const standard = standardRate(
        toNum(item?.custom_unbunched_bucket_rate),
        toNum(item?.custom_bucket_rate),
    );

    itemCache.set(itemCode, { itemGroup, standard });
    return { itemCode, itemGroup, isSprayRose: itemGroup === SPRAY_ROSES, standard };
}

export function useBucketItem() {
    return useMutation({ mutationFn: fetchBucketItem });
}
