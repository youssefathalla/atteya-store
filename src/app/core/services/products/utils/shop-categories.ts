/**
 * Shop tabs and Shop's Category filter, built from the category list staff edit in
 * Categories & Brands (ATS-249). Pure: no Angular, no Firestore (tested by `npm run test:cart`).
 */

/** The fields of a category doc the Shop page needs. */
export interface ShopCategorySource {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
  /** "Name on Shop Tabs" from Categories & Brands; missing or empty = the default name. */
  readonly shopLabel?: string;
  /** Missing counts as shown (the list the store reads is published categories only). */
  readonly published?: boolean;
}

export interface ShopTab {
  /** `all`, or the category id. */
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export interface ShopCategoryOption {
  /** Category id (also the `?category=` value). */
  readonly id: string;
  readonly label: string;
  /** Firestore / Algolia `categoryIds` value. */
  readonly categoryId: string;
}

/** Published product counts per category id (`settings/catalog.categories`); null = not known. */
export type ShopCategoryCounts = Readonly<Record<string, number>> | null;

export const SHOP_ALL_TAB: ShopTab = { id: 'all', label: 'All', path: '/shop' };

/**
 * Names the store used before staff could name tabs. A category with no saved `shopLabel`
 * keeps these (Rackets shows "Padel").
 */
export const BUILT_IN_SHOP_LABELS: Readonly<Record<string, string>> = {
  apparel: 'Apparel',
  accessories: 'Accessories',
  rackets: 'Padel',
  bags: 'Bags',
};

/** Built-in top-level categories that always open the Shop page, even while hidden. */
export const BUILT_IN_SHOP_CATEGORY_IDS: readonly string[] = ['apparel', 'accessories', 'rackets'];

/** Old address words that mean a built-in category (`/category/padel` → Rackets). */
const SHOP_CATEGORY_ALIASES: Readonly<Record<string, string>> = { padel: 'rackets' };

/** Tab (and filter) name: the saved `shopLabel`, else the built-in name, else the category name. */
export function shopTabLabel(category: Pick<ShopCategorySource, 'id' | 'name' | 'shopLabel'>): string {
  const saved = category.shopLabel?.trim();
  if (saved) return saved;
  return BUILT_IN_SHOP_LABELS[category.id] ?? category.name;
}

/** Shop-style address for a top-level category. */
export function shopCategoryPath(category: Pick<ShopCategorySource, 'slug'>): string {
  return `/category/${category.slug}`;
}

/** Shown on the store and, when counts are known, has at least one published product. */
export function shopCategoryShown(category: ShopCategorySource, counts: ShopCategoryCounts): boolean {
  if (category.published === false) return false;
  if (!counts) return true;
  return (counts[category.id] ?? 0) > 0;
}

/** All, then every shown top-level category in its saved order. */
export function shopTabsFrom(
  categories: readonly ShopCategorySource[],
  counts: ShopCategoryCounts,
): readonly ShopTab[] {
  const roots = sortByOrder(categories.filter((category) => category.parentId === null));
  return [
    SHOP_ALL_TAB,
    ...roots
      .filter((category) => shopCategoryShown(category, counts))
      .map((category) => ({
        id: category.id,
        label: shopTabLabel(category),
        path: shopCategoryPath(category),
      })),
  ];
}

/**
 * Shop's Category filter: every shown top-level category, each followed by its shown
 * sub-categories that have products, in their saved order.
 */
export function shopCategoryOptionsFrom(
  categories: readonly ShopCategorySource[],
  counts: ShopCategoryCounts,
): readonly ShopCategoryOption[] {
  const shown = categories.filter((category) => shopCategoryShown(category, counts));
  const shownIds = new Set(shown.map((category) => category.id));
  const options: ShopCategoryOption[] = [];
  for (const root of sortByOrder(shown.filter((category) => category.parentId === null))) {
    options.push(optionFor(root));
    const children = shown.filter((category) => category.parentId === root.id);
    for (const child of sortByOrder(children)) options.push(optionFor(child));
  }
  // A shown sub-category whose parent is hidden or empty still filters on its own.
  for (const orphan of sortByOrder(
    shown.filter((category) => category.parentId !== null && !shownIds.has(category.parentId)),
  )) {
    options.push(optionFor(orphan));
  }
  return options;
}

/**
 * The category id a `/category/<slug>` Shop page is for: a top-level category matched by
 * slug or id (any letter case), a built-in one, or an old alias. Null for anything else.
 */
export function shopCategoryIdForSlug(
  slug: string | null | undefined,
  categories: readonly ShopCategorySource[],
): string | null {
  const raw = (slug ?? '').trim().toLowerCase();
  if (!raw) return null;
  const target = SHOP_CATEGORY_ALIASES[raw] ?? raw;
  const match = categories.find(
    (category) =>
      category.parentId === null &&
      (category.slug.toLowerCase() === target || category.id.toLowerCase() === target),
  );
  if (match) return match.id;
  return BUILT_IN_SHOP_CATEGORY_IDS.includes(target) ? target : null;
}

/** The Shop tab for a category id, built even when the tab itself is left out (empty or hidden). */
export function shopTabFor(id: string, categories: readonly ShopCategorySource[]): ShopTab {
  if (id === SHOP_ALL_TAB.id) return SHOP_ALL_TAB;
  const category = categories.find((item) => item.id === id);
  if (category) {
    return { id, label: shopTabLabel(category), path: shopCategoryPath(category) };
  }
  return { id, label: BUILT_IN_SHOP_LABELS[id] ?? id, path: `/category/${id}` };
}

function optionFor(category: ShopCategorySource): ShopCategoryOption {
  return { id: category.id, label: shopTabLabel(category), categoryId: category.id };
}

function sortByOrder<T extends ShopCategorySource>(list: readonly T[]): T[] {
  return [...list].sort((left, right) => left.sortOrder - right.sortOrder);
}
