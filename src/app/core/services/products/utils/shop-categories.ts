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
  /** Product page Size Chart (ATS-250): null = same as the parent; missing = built-in default. */
  readonly sizeChart?: 'clothing' | 'none' | null;
  /** Product page Details Title (ATS-250): null and missing as for `sizeChart`. */
  readonly detailsTitle?: 'materials' | 'specifications' | null;
  /** Categories & Brands → Photo: the picture shown when someone shares the category's link (ATS-263). */
  readonly image?: ShareImage;
}

/** A photo for share previews: storage path plus its alt text. */
export interface ShareImage {
  readonly path: string;
  readonly alt: string;
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
 * slug or id (any letter case), or a built-in one staff haven't deleted. Null for anything else.
 */
export function shopCategoryIdForSlug(
  slug: string | null | undefined,
  categories: readonly ShopCategorySource[],
  deletedBuiltIns: ReadonlySet<string> = new Set(),
): string | null {
  const target = (slug ?? '').trim().toLowerCase();
  if (!target) return null;
  const match = categories.find(
    (category) =>
      category.parentId === null &&
      (category.slug.toLowerCase() === target || category.id.toLowerCase() === target),
  );
  if (match) return match.id;
  return BUILT_IN_SHOP_CATEGORY_IDS.includes(target) && !deletedBuiltIns.has(target) ? target : null;
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

/**
 * Every category id `?category=` may name: the published categories (shown or empty) plus the
 * built-in ones, so a saved link to an empty category still filters (to nothing) instead of
 * quietly showing everything.
 */
export function shopCategoryFilterIds(categories: readonly ShopCategorySource[]): ReadonlySet<string> {
  return new Set<string>([
    ...categories.filter((category) => category.published !== false).map((category) => category.id),
    ...Object.keys(BUILT_IN_SHOP_LABELS),
  ]);
}

/** Filter options plus any chosen category the list leaves out (empty), so it can be unticked. */
export function withChosenCategories(
  options: readonly ShopCategoryOption[],
  chosen: readonly string[],
  categories: readonly ShopCategorySource[],
): readonly ShopCategoryOption[] {
  const missing = chosen.filter((id) => !options.some((option) => option.id === id));
  if (missing.length === 0) return options;
  return [
    ...options,
    ...missing.map((id) => {
      const category = categories.find((item) => item.id === id);
      const label = category ? shopTabLabel(category) : (BUILT_IN_SHOP_LABELS[id] ?? id);
      return { id, label, categoryId: id };
    }),
  ];
}

function optionFor(category: ShopCategorySource): ShopCategoryOption {
  return { id: category.id, label: shopTabLabel(category), categoryId: category.id };
}

function sortByOrder<T extends ShopCategorySource>(list: readonly T[]): T[] {
  return [...list].sort((left, right) => left.sortOrder - right.sortOrder);
}
