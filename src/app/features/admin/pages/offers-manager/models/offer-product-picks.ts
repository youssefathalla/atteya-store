/**
 * The offer product picker (ATS-270): one row per product (all colours of one model together),
 * then a Colours choice. "All colours" is saved as the product's model (`modelGroup`), so a colour
 * added later joins the offer; specific colours are saved as those colours' product ids. Pure, so
 * `npm run test:cart` covers it.
 */

/** The product fields the picker reads. */
export interface PickerProduct {
  readonly id: string;
  readonly name: string;
  readonly modelGroup?: string | null;
  readonly colors?: readonly string[];
}

/** A colour's name and dot, from the colour palette. */
export interface PickerColourInfo {
  readonly label: string;
  readonly swatch: string | null;
}

export interface OfferProductColour {
  readonly productId: string;
  readonly colorId: string | null;
  readonly label: string;
  readonly swatch: string | null;
}

/** One product as staff see it: every colour of one model, or one product without a model. */
export interface OfferProductModel {
  readonly key: string;
  readonly modelGroup: string | null;
  readonly name: string;
  readonly colours: readonly OfferProductColour[];
}

/** One picked product: all its colours, or the colours ticked. */
export interface ProductPick {
  readonly key: string;
  /** Null when the product no longer exists. */
  readonly model: OfferProductModel | null;
  readonly all: boolean;
  readonly productIds: readonly string[];
}

/** What a product rule saves: models picked with All colours, and single product ids. */
export interface SavedProductPicks {
  readonly modelGroups: readonly string[];
  readonly productIds: readonly string[];
}

/** Groups the products into one entry per model (first colour's name), in the order they come. */
export function groupOfferProducts(
  products: readonly PickerProduct[],
  colourInfo: (colorId: string) => PickerColourInfo | null,
): OfferProductModel[] {
  const buckets = new Map<string, { modelGroup: string | null; items: PickerProduct[] }>();
  for (const product of products) {
    const modelGroup = product.modelGroup?.trim() || null;
    const key = modelGroup ? `model:${modelGroup}` : `product:${product.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(product);
    else buckets.set(key, { modelGroup, items: [product] });
  }
  return [...buckets].map(([key, bucket]) => ({
    key,
    modelGroup: bucket.modelGroup,
    name: bucket.items[0]!.name,
    colours: bucket.items.map((product, index) => {
      const colorId = product.colors?.[0] ?? null;
      const info = colorId ? colourInfo(colorId) : null;
      return {
        productId: product.id,
        colorId,
        label: info?.label ?? `Colour ${index + 1}`,
        swatch: info?.swatch ?? null,
      };
    }),
  }));
}

/** True when the product has 2 or more colours, so staff pick All colours or some of them. */
export function hasColourChoice(model: OfferProductModel | null): boolean {
  return (model?.colours.length ?? 0) >= 2;
}

/**
 * Reads saved models and product ids back as picks. Product ids of one model are grouped as that
 * product with those colours ticked (an offer saved before ATS-270 opens this way). With
 * `expandModels`, a product whose every colour is picked reads as All colours.
 */
export function readProductPicks(
  saved: SavedProductPicks,
  models: readonly OfferProductModel[],
  expandModels = false,
): ProductPick[] {
  const byGroup = new Map<string, OfferProductModel>();
  const byProduct = new Map<string, OfferProductModel>();
  for (const model of models) {
    if (model.modelGroup) byGroup.set(model.modelGroup, model);
    for (const colour of model.colours) byProduct.set(colour.productId, model);
  }
  const picks = new Map<string, { model: OfferProductModel | null; all: boolean; productIds: string[] }>();
  for (const modelGroup of saved.modelGroups) {
    const model = byGroup.get(modelGroup) ?? null;
    const key = model?.key ?? `model:${modelGroup}`;
    if (!picks.has(key)) picks.set(key, { model, all: true, productIds: [] });
  }
  for (const productId of saved.productIds) {
    const model = byProduct.get(productId) ?? null;
    const grouped = model !== null && hasColourChoice(model);
    const key = grouped ? model.key : `product:${productId}`;
    const pick = picks.get(key);
    if (!pick) {
      picks.set(key, { model, all: false, productIds: [productId] });
    } else if (!pick.all && !pick.productIds.includes(productId)) {
      pick.productIds.push(productId);
    }
  }
  return [...picks].map(([key, pick]) => {
    const everyColour =
      expandModels &&
      !pick.all &&
      hasColourChoice(pick.model) &&
      pick.model!.colours.every((colour) => pick.productIds.includes(colour.productId));
    if (everyColour) return { key, model: pick.model, all: true, productIds: [] };
    if (pick.all) return { key, model: pick.model, all: true, productIds: [] };
    // Keep the colours in the product's own order.
    const order = pick.model?.colours.map((colour) => colour.productId) ?? [];
    const productIds = [...pick.productIds].sort((a, b) => rank(order, a) - rank(order, b));
    return { key, model: pick.model, all: false, productIds };
  });
}

function rank(order: readonly string[], id: string): number {
  const at = order.indexOf(id);
  return at === -1 ? order.length : at;
}

/**
 * The saved form of the picks. All colours saves the model, unless `expandModels` (free gifts,
 * which can only name products): then it saves every colour the product has today.
 */
export function writeProductPicks(picks: readonly ProductPick[], expandModels = false): SavedProductPicks {
  const modelGroups: string[] = [];
  const productIds: string[] = [];
  const addProduct = (id: string): void => {
    if (!productIds.includes(id)) productIds.push(id);
  };
  for (const pick of picks) {
    if (pick.all) {
      const modelGroup = pick.model?.modelGroup ?? (pick.key.startsWith('model:') ? pick.key.slice(6) : null);
      if (expandModels && pick.model) {
        pick.model.colours.forEach((colour) => addProduct(colour.productId));
      } else if (modelGroup && !modelGroups.includes(modelGroup)) {
        modelGroups.push(modelGroup);
      }
    } else {
      pick.productIds.forEach(addProduct);
    }
  }
  return { modelGroups, productIds };
}

/** A new pick for a product: All colours when it has several, otherwise that one product. */
export function newProductPick(model: OfferProductModel): ProductPick {
  if (hasColourChoice(model) && model.modelGroup) {
    return { key: model.key, model, all: true, productIds: [] };
  }
  return {
    key: hasColourChoice(model) ? model.key : `product:${model.colours[0]!.productId}`,
    model,
    all: false,
    productIds: model.colours.map((colour) => colour.productId),
  };
}

/** The value for the All colours option of the Colours dropdown. */
export const ALL_COLOURS = 'all';

/**
 * The Colours dropdown's new choice. Ticking All colours clears the specific ones, ticking a
 * colour unticks All colours, and unticking every colour goes back to All colours.
 */
export function nextColourChoice(pick: ProductPick, selected: readonly string[]): ProductPick {
  const specific = selected.filter((value) => value !== ALL_COLOURS);
  const allTicked = selected.includes(ALL_COLOURS);
  if (specific.length === 0 || (allTicked && !pick.all)) {
    return { ...pick, all: true, productIds: [] };
  }
  const order = pick.model?.colours.map((colour) => colour.productId) ?? [];
  return { ...pick, all: false, productIds: [...specific].sort((a, b) => rank(order, a) - rank(order, b)) };
}

/** The dropdown's selected values for a pick. */
export function colourChoiceValues(pick: ProductPick): readonly string[] {
  return pick.all ? [ALL_COLOURS] : pick.productIds;
}

/** "Nox Padel Shorts · All colours", "Nox Padel Shorts · Black, White", or the name alone. */
export function productPickLabel(pick: ProductPick): string {
  if (!pick.model) return 'Product not found';
  if (!hasColourChoice(pick.model)) return pick.model.name;
  if (pick.all) return `${pick.model.name} · All colours`;
  const labels = pick.productIds.map(
    (id) => pick.model!.colours.find((colour) => colour.productId === id)?.label ?? 'Colour not found',
  );
  return `${pick.model.name} · ${labels.join(', ')}`;
}

/** "3 colours" for a product with several, or null. */
export function colourCountNote(model: OfferProductModel): string | null {
  return hasColourChoice(model) ? `${model.colours.length} colours` : null;
}

/** Product name per model (the first colour's name), for tags and sentences. */
export function modelNames(products: readonly PickerProduct[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const product of products) {
    const modelGroup = product.modelGroup?.trim();
    if (modelGroup && !names.has(modelGroup)) names.set(modelGroup, product.name);
  }
  return names;
}
