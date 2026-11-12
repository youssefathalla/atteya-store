import {
  MAX_GIFT_CHOICES,
  MAX_OFFER_GIFTS,
  bundleRows,
  cleanBundleSet,
  parseOfferBanner,
} from './engine/index.js';
import type {
  Offer,
  OfferGift,
  OfferAudience,
  OfferBundleSetReward,
  OfferConditionAtom,
  OfferConditionField,
  OfferConditionGroup,
  OfferConditions,
  OfferLimits,
  OfferMinimum,
  OfferReward,
  OfferSaleItemsPolicy,
  OfferSchedule,
  OfferScope,
  OfferStacking,
  OfferTier,
  OfferVisibility,
} from './engine/index.js';

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

export function parseOfferDoc(
  id: string,
  data: Record<string, unknown> | undefined | null,
  code?: string | null,
): Offer | null {
  if (!data) return null;
  const name = readString(data['name']);
  const title = readString(data['title']);
  if (!name || !title) return null;

  const reward = parseReward(data['reward']);
  if (!reward) return null;

  const badge = readNullableString(data['badge']);
  const description = readNullableString(data['description']);
  const active = data['active'] === true;
  const archived = data['archived'] === true;
  const visibility: OfferVisibility = data['visibility'] === 'code' ? 'code' : 'public';
  const audience: OfferAudience = data['audience'] === 'signedIn' ? 'signedIn' : 'everyone';

  const schedule = parseSchedule(data['schedule']);
  const priority =
    typeof data['priority'] === 'number' && Number.isFinite(data['priority'])
      ? Math.max(-100, Math.min(100, Math.round(data['priority'])))
      : 0;
  const stacking: OfferStacking = data['stacking'] === 'exclusive' ? 'exclusive' : 'stackable';
  const saleItems: OfferSaleItemsPolicy =
    data['saleItems'] === 'exclude' || data['saleItems'] === 'stack' ? data['saleItems'] : 'bestOf';
  const scope: OfferScope = data['scope'] === 'cart' ? 'cart' : 'item';

  const conditions = parseConditions(data['conditions']);
  const exclude = parseConditions(data['exclude']);
  const minimum = parseMinimum(data['minimum']);
  const limits = parseLimits(data['limits']);
  const requiresCode = data['requiresCode'] === true || visibility === 'code';
  const updatedAtMs = readTimestampMs(data['updatedAt']);
  const banner = parseOfferBanner(data['banner']);

  return {
    id,
    name,
    title,
    badge,
    description,
    active,
    archived,
    visibility,
    audience,
    schedule,
    priority,
    stacking,
    saleItems,
    scope,
    conditions,
    exclude,
    minimum,
    reward,
    limits,
    requiresCode,
    code: code ?? null,
    updatedAtMs,
    banner,
  };
}

function parseSchedule(raw: unknown): OfferSchedule {
  if (typeof raw !== 'object' || raw === null) {
    return { startsAt: null, endsAt: null, timezone: 'Africa/Cairo' };
  }
  const obj = raw as Record<string, unknown>;
  return {
    startsAt: readDate(obj['startsAt']),
    endsAt: readDate(obj['endsAt']),
    timezone: 'Africa/Cairo',
  };
}

function parseConditions(raw: unknown): OfferConditions {
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
      const atom = parseAtom(atomRaw);
      if (atom) allOf.push(atom);
    }
    if (allOf.length > 0) {
      anyOf.push({ allOf });
    }
  }
  return { anyOf };
}

function parseAtom(raw: unknown): OfferConditionAtom | null {
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

function parseMinimum(raw: unknown): OfferMinimum | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const subtotal =
    typeof obj['subtotal'] === 'number' && Number.isFinite(obj['subtotal'])
      ? Math.round(obj['subtotal'])
      : undefined;
  const quantity =
    typeof obj['quantity'] === 'number' && Number.isFinite(obj['quantity'])
      ? Math.round(obj['quantity'])
      : undefined;
  if (subtotal === undefined && quantity === undefined) return null;
  return {
    ...(subtotal !== undefined ? { subtotal } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
  };
}

function parseLimits(raw: unknown): OfferLimits {
  if (typeof raw !== 'object' || raw === null) {
    return { totalUses: null, perCustomer: null };
  }
  const obj = raw as Record<string, unknown>;
  const totalUses =
    typeof obj['totalUses'] === 'number' && Number.isFinite(obj['totalUses'])
      ? Math.round(obj['totalUses'])
      : null;
  const perCustomer =
    typeof obj['perCustomer'] === 'number' && Number.isFinite(obj['perCustomer'])
      ? Math.round(obj['perCustomer'])
      : null;
  return { totalUses, perCustomer };
}

function parseReward(raw: unknown): OfferReward | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const kind = obj['kind'];

  switch (kind) {
    case 'percentOff': {
      const percent = readNumber(obj['percent']);
      if (percent === null) return null;
      return { kind: 'percentOff', percent };
    }
    case 'amountOff': {
      const amount = readNumber(obj['amount']);
      if (amount === null) return null;
      return { kind: 'amountOff', amount };
    }
    case 'fixedPrice': {
      const price = readNumber(obj['price']);
      if (price === null) return null;
      return { kind: 'fixedPrice', price };
    }
    case 'tiered': {
      const basis = obj['basis'] === 'subtotal' ? 'subtotal' : 'quantity';
      const rawTiers = Array.isArray(obj['tiers']) ? obj['tiers'] : [];
      const tiers: OfferTier[] = [];
      for (const rawTier of rawTiers) {
        if (typeof rawTier !== 'object' || rawTier === null) continue;
        const t = rawTier as Record<string, unknown>;
        const min = readNumber(t['min']);
        if (min === null) continue;
        const percent = readNumber(t['percent']);
        const amount = readNumber(t['amount']);
        tiers.push({
          min,
          ...(percent !== null ? { percent } : {}),
          ...(amount !== null ? { amount } : {}),
        });
      }
      return { kind: 'tiered', basis, tiers };
    }
    case 'buyXGetY': {
      const buyObj =
        typeof obj['buy'] === 'object' && obj['buy'] !== null ? (obj['buy'] as Record<string, unknown>) : {};
      const getObj =
        typeof obj['get'] === 'object' && obj['get'] !== null ? (obj['get'] as Record<string, unknown>) : {};
      const buyQty = readNumber(buyObj['quantity']) ?? 1;
      const getQty = readNumber(getObj['quantity']) ?? 1;
      const getPercent = readNumber(getObj['percent']) ?? 100;
      const getConditions = obj['getConditions'] ? parseConditions(obj['getConditions']) : null;
      return {
        kind: 'buyXGetY',
        buy: { quantity: buyQty },
        get: { quantity: getQty, percent: getPercent },
        getConditions,
        cheapestFree: obj['cheapestFree'] !== false,
        repeat: obj['repeat'] !== false,
        maxApplications: readNumber(obj['maxApplications']),
      };
    }
    case 'bundlePrice': {
      // Bad rows are dropped (`bundleRows`); an offer left with none gives nothing.
      const rawRows = Array.isArray(obj['rows']) ? obj['rows'] : [];
      const rows = rawRows.flatMap((raw) => {
        if (typeof raw !== 'object' || raw === null) return [];
        const row = raw as Record<string, unknown>;
        const quantity = readNumber(row['quantity']);
        const price = readNumber(row['price']);
        return quantity === null || price === null ? [] : [{ quantity, price }];
      });
      return { kind: 'bundlePrice', rows: bundleRows({ kind: 'bundlePrice', rows }) };
    }
    case 'bundleSet':
      return parseBundleSet(obj);
    case 'freeGift':
      return { kind: 'freeGift', gifts: parseGifts(obj) };
    case 'freeShipping':
      return { kind: 'freeShipping' };
    default:
      return null;
  }
}

/**
 * A Bundle & Save reward. Read as written, then checked with the engine's rules: a bad one keeps
 * the offer but with no groups, so it prices nothing (`cleanBundleSet`).
 */
function parseBundleSet(obj: Record<string, unknown>): OfferReward {
  const rawSlots = Array.isArray(obj['slots']) ? obj['slots'] : [];
  const slots = rawSlots.flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const slot = raw as Record<string, unknown>;
    return [
      {
        id: readString(slot['id']),
        name: readString(slot['name']),
        quantity: rawNumber(slot['quantity']) ?? 0,
        conditions: parseConditions(slot['conditions']),
      },
    ];
  });
  const rawSet =
    typeof obj['setReward'] === 'object' && obj['setReward'] !== null
      ? (obj['setReward'] as Record<string, unknown>)
      : {};
  const setReward: OfferBundleSetReward =
    rawSet['type'] === 'total'
      ? { type: 'total', price: rawNumber(rawSet['price']) ?? 0 }
      : rawSet['type'] === 'percent'
        ? { type: 'percent', percent: rawNumber(rawSet['percent']) ?? 0 }
        : rawSet['type'] === 'amount'
          ? { type: 'amount', amount: rawNumber(rawSet['amount']) ?? 0 }
          : rawSet['type'] === 'cheapestFree'
            ? { type: 'cheapestFree' }
            : { type: 'total', price: 0 };
  const maxSets =
    obj['maxSets'] === null || obj['maxSets'] === undefined ? null : (rawNumber(obj['maxSets']) ?? 0);
  return cleanBundleSet({ kind: 'bundleSet', slots, setReward, maxSets });
}

/** A finite number as written (not rounded, so 1.5 pieces or EGP 99.5 is refused, not fixed). */
function rawNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * Gifts of a Free gift offer. An old offer holding one fixed `giftProductId` becomes one gift
 * ("Free gift") with that one choice. Bad entries are skipped; the list is capped.
 */
export function parseGifts(obj: Record<string, unknown>): OfferGift[] {
  const raw = obj['gifts'];
  if (Array.isArray(raw)) {
    const gifts: OfferGift[] = [];
    const ids = new Set<string>();
    for (const entry of raw) {
      if (gifts.length >= MAX_OFFER_GIFTS) break;
      if (typeof entry !== 'object' || entry === null) continue;
      const rec = entry as Record<string, unknown>;
      const id = readString(rec['id']);
      if (!id || ids.has(id)) continue;
      const productIds = Array.isArray(rec['productIds'])
        ? Array.from(
            new Set(
              rec['productIds'].filter(
                (val): val is string => typeof val === 'string' && val.trim().length > 0,
              ),
            ),
          ).slice(0, MAX_GIFT_CHOICES)
        : [];
      ids.add(id);
      gifts.push({ id, name: readString(rec['name']) || 'Free gift', productIds });
    }
    return gifts;
  }
  const legacyProductId = readString(obj['giftProductId']);
  return legacyProductId ? [{ id: 'gift-1', name: 'Free gift', productIds: [legacyProductId] }] : [];
}

function readString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function readNullableString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.round(raw);
}

function readDate(raw: unknown): Date | null {
  const ms = readTimestampMs(raw);
  return ms > 0 ? new Date(ms) : null;
}

function readTimestampMs(raw: unknown): number {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'object' && raw !== null) {
    const toMillis = (raw as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const ms = (toMillis as () => number).call(raw);
      if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
    }
    const seconds =
      (raw as { _seconds?: unknown; seconds?: unknown })._seconds ?? (raw as { seconds?: unknown }).seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return Math.round(seconds * 1000);
    }
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
