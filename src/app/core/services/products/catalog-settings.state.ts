import { makeStateKey } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import * as v from 'valibot';
import { CatalogSummarySchema } from './product.schema';

/** JSON-safe published counts for TransferState. */
export interface CatalogSettingsSeed {
  readonly categories: Readonly<Record<string, number>>;
  readonly types: Readonly<Record<string, number>>;
  readonly brands: Readonly<Record<string, number>>;
  readonly total: number;
  readonly updatedAtMs: number | null;
}

export const CATALOG_SETTINGS_KEY = makeStateKey<CatalogSettingsSeed | null>('catalog-settings');

function timestampToMs(raw: unknown): number | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw.getTime();
  if (
    typeof raw === 'object' &&
    'toDate' in raw &&
    typeof (raw as { toDate: () => Date }).toDate === 'function'
  ) {
    return (raw as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return null;
}

export function toCatalogSettingsSeed(raw: unknown): CatalogSettingsSeed | null {
  const parsed = v.safeParse(CatalogSummarySchema, raw);
  if (!parsed.success) return null;
  return {
    categories: { ...parsed.output.categories },
    types: { ...parsed.output.types },
    brands: { ...parsed.output.brands },
    total: parsed.output.total,
    updatedAtMs: timestampToMs(parsed.output.updatedAt),
  };
}

export function catalogSeedToRaw(seed: CatalogSettingsSeed | null): unknown | null {
  if (!seed) return null;
  return {
    categories: seed.categories,
    types: seed.types,
    brands: seed.brands,
    total: seed.total,
    updatedAt: seed.updatedAtMs != null ? Timestamp.fromMillis(seed.updatedAtMs) : Timestamp.now(),
  };
}
