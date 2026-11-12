import type {
  OfferConditionAtom,
  OfferConditionField,
  OfferConditionGroup,
  OfferConditions,
} from './types.js';

const CONDITION_FIELDS: readonly OfferConditionField[] = [
  'productId',
  'brandId',
  'categoryIds',
  'type',
  'modelGroup',
  'colors',
  'sizes',
  'tags',
  'price',
];

/**
 * Offer rules as saved, read leniently: anything that isn't a known rule is dropped (empty values,
 * unknown fields, groups with no rules left), prices are rounded. The server's offer reader and
 * the Bundle & Save groups on both sides (`readBundleSet`) use it, so both read the same rules.
 */
export function readOfferConditions(raw: unknown): OfferConditions {
  if (typeof raw !== 'object' || raw === null) return { anyOf: [] };
  const anyOfRaw = (raw as { anyOf?: unknown }).anyOf;
  if (!Array.isArray(anyOfRaw)) return { anyOf: [] };

  const anyOf: OfferConditionGroup[] = [];
  for (const groupRaw of anyOfRaw) {
    if (typeof groupRaw !== 'object' || groupRaw === null) continue;
    const allOfRaw = (groupRaw as { allOf?: unknown }).allOf;
    if (!Array.isArray(allOfRaw)) continue;
    const allOf: OfferConditionAtom[] = [];
    for (const atomRaw of allOfRaw) {
      const atom = readConditionAtom(atomRaw);
      if (atom) allOf.push(atom);
    }
    if (allOf.length > 0) {
      anyOf.push({ allOf });
    }
  }
  return { anyOf };
}

function readConditionAtom(raw: unknown): OfferConditionAtom | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const field = obj['field'];
  if (typeof field !== 'string' || !CONDITION_FIELDS.includes(field as OfferConditionField)) {
    return null;
  }

  if (field === 'price') {
    const min =
      typeof obj['min'] === 'number' && Number.isFinite(obj['min']) ? Math.round(obj['min']) : undefined;
    const max =
      typeof obj['max'] === 'number' && Number.isFinite(obj['max']) ? Math.round(obj['max']) : undefined;
    return { field: 'price', ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  }

  const inList = Array.isArray(obj['in'])
    ? obj['in'].filter((val): val is string => typeof val === 'string' && val.trim().length > 0)
    : undefined;
  const notInList = Array.isArray(obj['notIn'])
    ? obj['notIn'].filter((val): val is string => typeof val === 'string' && val.trim().length > 0)
    : undefined;

  return {
    field: field as Exclude<OfferConditionField, 'price'>,
    ...(inList ? { in: inList } : {}),
    ...(notInList ? { notIn: notInList } : {}),
  };
}
