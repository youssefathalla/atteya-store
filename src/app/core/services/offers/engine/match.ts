// GENERATED — edit functions/src/offers/engine
import type {
  OfferConditionAtom,
  OfferConditionGroup,
  OfferConditions,
  ProductFacts,
  VariantFacts,
} from './types';

export type MatchLevel = 'none' | 'partial' | 'full';

export function matchProduct(
  conditions: OfferConditions,
  exclude: OfferConditions,
  facts: ProductFacts,
): MatchLevel {
  if (exclude.anyOf.length > 0) {
    const exMatch = evaluateConditions(exclude, facts);
    if (exMatch === 'full') return 'none';
  }

  if (conditions.anyOf.length === 0) {
    return 'full';
  }

  return evaluateConditions(conditions, facts);
}

export function matchVariant(
  conditions: OfferConditions,
  exclude: OfferConditions,
  facts: ProductFacts,
  variant: VariantFacts | null,
): boolean {
  if (!variant) {
    return matchProduct(conditions, exclude, facts) !== 'none';
  }

  const variantFacts: ProductFacts = {
    ...facts,
    colors: variant.color ? [variant.color] : facts.colors,
    sizes: variant.size ? [variant.size] : facts.sizes,
  };

  return matchProduct(conditions, exclude, variantFacts) !== 'none';
}

export function partialColorSummary(conditions: OfferConditions, facts: ProductFacts): string[] {
  if (facts.colors.length <= 1) return [];
  const matchedColors = new Set<string>();

  for (const group of conditions.anyOf) {
    if (evaluateGroup(group, facts) === 'none') continue;
    for (const atom of group.allOf) {
      if (atom.field !== 'colors') continue;
      if (atom.in && atom.in.length > 0) {
        for (const color of facts.colors) {
          if (atom.in.includes(color)) matchedColors.add(color);
        }
      }
    }
  }

  if (matchedColors.size > 0 && matchedColors.size < facts.colors.length) {
    return Array.from(matchedColors);
  }
  return [];
}

function evaluateConditions(conditions: OfferConditions, facts: ProductFacts): MatchLevel {
  let hasPartial = false;
  for (const group of conditions.anyOf) {
    const level = evaluateGroup(group, facts);
    if (level === 'full') return 'full';
    if (level === 'partial') hasPartial = true;
  }
  return hasPartial ? 'partial' : 'none';
}

function evaluateGroup(group: OfferConditionGroup, facts: ProductFacts): MatchLevel {
  let groupLevel: MatchLevel = 'full';
  for (const atom of group.allOf) {
    const level = evaluateAtom(atom, facts);
    if (level === 'none') return 'none';
    if (level === 'partial') groupLevel = 'partial';
  }
  return groupLevel;
}

function evaluateAtom(atom: OfferConditionAtom, facts: ProductFacts): MatchLevel {
  if (atom.field === 'price') {
    if (typeof atom.min === 'number' && facts.price < atom.min) return 'none';
    if (typeof atom.max === 'number' && facts.price > atom.max) return 'none';
    return 'full';
  }

  const inList = atom.in ?? [];
  const notInList = atom.notIn ?? [];

  switch (atom.field) {
    case 'productId':
      return matchScalar(facts.productId, inList, notInList);
    case 'brandId':
      return matchScalar(facts.brandId, inList, notInList);
    case 'type':
      return matchScalar(facts.type, inList, notInList);
    case 'modelGroup':
      if (facts.modelGroup === null) {
        return inList.length > 0 ? 'none' : 'full';
      }
      return matchScalar(facts.modelGroup, inList, notInList);
    case 'categoryIds':
      return matchSet(facts.categoryIds, inList, notInList, false);
    case 'tags':
      return matchSet(facts.tags, inList, notInList, false);
    case 'colors':
      return matchSet(facts.colors, inList, notInList, true);
    case 'sizes':
      return matchSet(facts.sizes, inList, notInList, true);
  }
}

function matchScalar(
  value: string,
  inList: readonly string[],
  notInList: readonly string[],
): MatchLevel {
  if (notInList.length > 0 && notInList.includes(value)) return 'none';
  if (inList.length > 0 && !inList.includes(value)) return 'none';
  return 'full';
}

function matchSet(
  values: readonly string[],
  inList: readonly string[],
  notInList: readonly string[],
  allowPartialWhenSubset: boolean,
): MatchLevel {
  if (notInList.length > 0) {
    const unblocked = values.filter((val) => !notInList.includes(val));
    if (values.length > 0 && unblocked.length === 0) return 'none';
    if (allowPartialWhenSubset && unblocked.length < values.length) {
      if (inList.length === 0) return 'partial';
    }
    if (!allowPartialWhenSubset && unblocked.length < values.length) {
      return 'none';
    }
  }

  if (inList.length > 0) {
    if (values.length === 0) return 'none';
    const matching = values.filter((val) => inList.includes(val));
    if (matching.length === 0) return 'none';
    if (allowPartialWhenSubset && matching.length < values.length) {
      return 'partial';
    }
  }

  return 'full';
}
