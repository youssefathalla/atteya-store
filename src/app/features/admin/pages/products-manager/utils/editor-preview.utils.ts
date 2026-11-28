import type { ColorId } from '@core/services/products/catalog-taxonomy';
import type { ProductGenderId } from '@core/services/products/product.model';
import { cardShortDescription } from '@core/services/products/utils/card-short-description';
import {
  type CategoryPageSettings,
  categoryPageFor,
  detailLinesFromText,
  productDetailsTitle,
} from '@core/services/products/utils/product-details';
import { PRODUCT_CARD_COLORWAY_CAP } from '@shared/components/product-card/product-card.model';
import { genderCategoryLine } from '@shared/components/product-card/product-card.utils';
import { checkPhotoFit, PHOTO_SPOTS } from '@shared/utils/image';
import type {
  EditorCardView,
  EditorCheck,
  EditorPageView,
  EditorSwatchView,
  PreviewChip,
} from '../models/editor-preview.model';
import type { ColourDraft, ModelSizeDraft } from '../models/product-admin.model';
import { colourName, colourSwatch, colourTotal, parseCount, parseWholePounds } from './product-model.utils';

/** A category as the editor reads it (only what the previews need). */
export interface PreviewCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly detailsTitle?: 'materials' | 'specifications' | null;
}

export interface PreviewBrand {
  readonly id: string;
  readonly name: string;
}

/** The unsaved form, as the previews read it. */
export interface PreviewSource {
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly details: string;
  readonly gender: '' | ProductGenderId;
  readonly categoryId: string;
  readonly brandId: string;
  readonly categories: readonly PreviewCategory[];
  readonly brands: readonly PreviewBrand[];
  readonly price: number | null;
  readonly before: number | null;
  readonly sizes: readonly ModelSizeDraft[];
  readonly colours: readonly ColourDraft[];
  readonly badge: { readonly label: string; readonly boxed: boolean } | null;
}

/** A colour shoppers can see: shown by staff and in stock in some size. */
export function isColourOffered(colour: ColourDraft, sizes: readonly ModelSizeDraft[]): boolean {
  return colour.published && colourTotal(colour, sizes) > 0;
}

/** The price a colour sells at and its crossed-out price (only when higher). */
export function colourPrices(
  colour: ColourDraft,
  source: Pick<PreviewSource, 'price' | 'before'>,
): { readonly price: number | null; readonly before: number | null } {
  const price = colour.ownPrice ? parseWholePounds(colour.price) : source.price;
  const rawBefore = colour.ownPrice ? parseWholePounds(colour.compareAtPrice) : source.before;
  return { price, before: price !== null && rawBefore !== null && rawBefore > price ? rawBefore : null };
}

/** Colours in the store's colour rows: the shown ones, the previewed one, and hidden ones when asked. */
function rowColours(
  source: PreviewSource,
  currentIndex: number,
  showHidden: boolean,
): readonly { readonly colour: ColourDraft; readonly index: number }[] {
  return source.colours.flatMap((colour, index) =>
    index === currentIndex || showHidden || isColourOffered(colour, source.sizes) ? [{ colour, index }] : [],
  );
}

function swatchesFor(
  source: PreviewSource,
  currentIndex: number,
  showHidden: boolean,
): readonly EditorSwatchView[] {
  return rowColours(source, currentIndex, showHidden).map(({ colour, index }) => ({
    key: colour.productId,
    path: colour.images[0]?.path ?? null,
    label: colourName(colour.colors),
    selected: index === currentIndex,
  }));
}

/** The Shop card's colour row: capped like the store card (`visibleColorways`), keeping the current colour. */
function cardSwatches(swatches: readonly EditorSwatchView[]): readonly EditorSwatchView[] {
  if (swatches.length <= PRODUCT_CARD_COLORWAY_CAP) return swatches;
  const shown = swatches.slice(0, PRODUCT_CARD_COLORWAY_CAP);
  const current = swatches.find((swatch) => swatch.selected);
  return current && !shown.includes(current)
    ? [...shown.slice(0, PRODUCT_CARD_COLORWAY_CAP - 1), current]
    : shown;
}

/** A stock box left empty (a Save blocker), not the same as 0 (sold out). */
function stockOf(colour: ColourDraft, key: string): number | null {
  return parseCount(colour.stock[key] ?? '');
}

function categoryOf(source: PreviewSource, id: string): PreviewCategory | null {
  return source.categories.find((category) => category.id === id) ?? null;
}

/** The Shop card of one colour. */
export function buildCardView(
  source: PreviewSource,
  index: number,
  showHidden: boolean,
): EditorCardView | null {
  const colour = source.colours[index];
  if (!colour) return null;
  const photo = colour.images[0];
  const { price, before } = colourPrices(colour, source);
  const category = categoryOf(source, source.categoryId);
  const name = source.name.trim() || 'Product name';
  // Same rule as the store card (`genderCategoryLine`, then `cardShortDescription`).
  const genderLine = genderCategoryLine(source.gender || null, category?.name ?? null);
  const secondLine =
    genderLine ??
    cardShortDescription(source.summary.trim() || paragraphsOf(source.description)[0] || '', null);
  return {
    name,
    secondLine,
    secondLineIsSummary: genderLine === null && source.summary.trim().length > 0,
    photo: photo ? { path: photo.path, alt: photo.alt || name } : null,
    price,
    before,
    swatches: cardSwatches(swatchesFor(source, index, showHidden)),
    badge: source.badge,
  };
}

/** The product page of one colour. */
export function buildPageView(
  source: PreviewSource,
  index: number,
  showHidden: boolean,
): EditorPageView | null {
  const colour = source.colours[index];
  if (!colour) return null;
  const { price, before } = colourPrices(colour, source);
  const leaf = categoryOf(source, source.categoryId);
  const parent = leaf?.parentId ? categoryOf(source, leaf.parentId) : null;
  const sizes = source.sizes
    .filter((size) => !colour.notMade.includes(size.key))
    .map((size) => ({ label: size.label, soldOut: (stockOf(colour, size.key) ?? 0) === 0 }));
  const others = rowColours(source, index, showHidden);
  return {
    crumbs: ['Shop', ...(parent ? [parent.name] : []), ...(leaf ? [leaf.name] : [])],
    name: source.name.trim() || 'Product name',
    brand: source.brands.find((brand) => brand.id === source.brandId)?.name ?? '',
    badge: source.badge?.label ?? null,
    price,
    before,
    paragraphs: paragraphsOf(source.description),
    details: detailLinesFromText(source.details),
    detailsTitle: productDetailsTitle(detailsTitleFor(source)),
    photos: colour.images.map((image) => ({ path: image.path, alt: image.alt })),
    // The store lists other colours only when there is at least one more in stock.
    swatches: others.length > 1 ? swatchesFor(source, index, showHidden) : [],
    sizes,
    pickedSize: sizes.find((size) => !size.soldOut)?.label ?? null,
    soldOut: colourTotal(colour, source.sizes) === 0,
    slug: colour.slug ?? 'new-colour',
  };
}

/** Materials or Specifications, by the same rule as the store (`categoryPageFor`). */
function detailsTitleFor(source: PreviewSource): 'materials' | 'specifications' {
  const saved: Record<string, { detailsTitle?: 'materials' | 'specifications' | null }> = {};
  for (const category of source.categories) {
    saved[category.id] = category.detailsTitle === undefined ? {} : { detailsTitle: category.detailsTitle };
  }
  const ancestors: string[] = [];
  let parentId = categoryOf(source, source.categoryId)?.parentId ?? null;
  while (parentId && !ancestors.includes(parentId)) {
    ancestors.push(parentId);
    parentId = categoryOf(source, parentId)?.parentId ?? null;
  }
  const settings: CategoryPageSettings = saved;
  return categoryPageFor({ categoryId: source.categoryId, categoryIds: ancestors }, settings).detailsTitle;
}

/** Colour chips at the top of the Preview tab. */
export function buildPreviewChips(source: PreviewSource): readonly PreviewChip[] {
  return source.colours.map((colour, index) => ({
    index,
    label: colourName(colour.colors),
    swatch: colourSwatch(colour.colors[0] as ColorId | undefined),
    colorId: colour.colors[0] ?? null,
    hidden: !isColourOffered(colour, source.sizes),
  }));
}

/** "Navy", "Navy and Black", "Navy, Black and White". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Check Before Saving: what is fine and what to look at before the product goes live. */
export function buildChecks(source: PreviewSource): readonly EditorCheck[] {
  const checks: EditorCheck[] = [];
  const shown = source.colours
    .map((colour, index) => ({ colour, index, name: colourName(colour.colors) }))
    .filter(({ colour }) => colour.published);
  const offered = shown.filter(({ colour }) => isColourOffered(colour, source.sizes));

  if (source.price === null) {
    checks.push({
      id: 'price',
      tone: 'warn',
      title: 'No price yet',
      text: 'Add the selling price in Price & Organise.',
      action: null,
    });
  } else {
    checks.push({
      id: 'price',
      tone: 'ok',
      title:
        source.before === null
          ? `Price EGP ${source.price.toLocaleString('en-US')}`
          : `Price EGP ${source.price.toLocaleString('en-US')}, was EGP ${source.before.toLocaleString('en-US')}`,
      text: source.before === null ? 'Shoppers see one price.' : 'Shoppers see the old price crossed out.',
      action: null,
    });
  }

  const noPhotos = shown.filter(({ colour }) => colour.images.length === 0);
  if (noPhotos.length > 0) {
    checks.push({
      id: 'no-photos',
      tone: 'warn',
      title: `${joinNames(noPhotos.map((item) => item.name))} ${noPhotos.length === 1 ? 'has' : 'have'} no photos`,
      text: 'A colour needs a photo before shoppers can see it.',
      action: { label: `Add Photos to ${noPhotos[0]!.name}`, colourIndex: noPhotos[0]!.index },
    });
  }

  const onePhoto = offered.filter(({ colour }) => colour.images.length === 1);
  if (onePhoto.length > 0) {
    checks.push({
      id: 'one-photo',
      tone: 'warn',
      title: `${joinNames(onePhoto.map((item) => item.name))} ${onePhoto.length === 1 ? 'has' : 'have'} 1 photo${onePhoto.length === 1 ? '' : ' each'}`,
      text: "Shoppers can't swipe to see more.",
      action: { label: `Add Photos to ${onePhoto[0]!.name}`, colourIndex: onePhoto[0]!.index },
    });
  }

  // Save asks for a description on every colour's photos, hidden ones too.
  const missingAlt = source.colours
    .map((colour, index) => ({ colour, index, name: colourName(colour.colors) }))
    .filter(({ colour }) => colour.images.some((image) => image.alt.trim().length === 0));
  if (missingAlt.length > 0) {
    checks.push({
      id: 'alt',
      tone: 'warn',
      title: `A photo of ${missingAlt[0]!.name} has no description`,
      text: 'Each photo needs a short description for shoppers who use a screen reader.',
      action: { label: `Open ${missingAlt[0]!.name}`, colourIndex: missingAlt[0]!.index },
    });
  }

  const goodPhotos = offered.filter(({ colour }) => colour.images.length > 1);
  if (goodPhotos.length > 0 && missingAlt.length === 0) {
    checks.push({
      id: 'photos-ok',
      tone: 'ok',
      title: `${joinNames(goodPhotos.map((item) => item.name))} ${goodPhotos.length === 1 ? 'has' : 'have'} ${goodPhotos.length === 1 ? goodPhotos[0]!.colour.images.length : 'several'} photos`,
      text: 'Every photo has a description.',
      action: null,
    });
  }

  for (const [index, colour] of source.colours.entries()) {
    const name = colourName(colour.colors);
    const empty = source.sizes.filter(
      (size) => !colour.notMade.includes(size.key) && stockOf(colour, size.key) === null,
    );
    if (empty.length === 0) continue;
    checks.push({
      id: `no-stock-${colour.productId}`,
      tone: 'warn',
      title: `${name} has no stock entered for ${joinNames(empty.map((size) => size.label))}`,
      text: 'Enter a number, 0 if there is none, or mark the size Not Made.',
      action: { label: `Edit ${name} Stock`, colourIndex: index },
    });
  }

  for (const { colour, index, name } of offered) {
    if (source.sizes.length === 0) continue;
    const out = source.sizes.filter(
      (size) => !colour.notMade.includes(size.key) && stockOf(colour, size.key) === 0,
    );
    if (out.length === 0) continue;
    checks.push({
      id: `sold-out-${colour.productId}`,
      tone: 'warn',
      title: `${name} is sold out in ${joinNames(out.map((size) => size.label))}`,
      text: out.length === 1 ? 'That size shows crossed out.' : 'Those sizes show crossed out.',
      action: { label: `Edit ${name} Stock`, colourIndex: index },
    });
  }

  const spot = PHOTO_SPOTS.product;
  const offShape = shown.filter(({ colour }) =>
    colour.images.some((image) => {
      const fit = checkPhotoFit(spot, image.width, image.height);
      return fit !== null && !fit.fits;
    }),
  );
  if (offShape.length > 0) {
    checks.push({
      id: 'shape',
      tone: 'warn',
      title: `Some photos of ${joinNames(offShape.map((item) => item.name))} aren't 4 by 5`,
      text: 'The store frame is 4 wide by 5 tall, so those photos show a thin grey edge.',
      action: { label: `Open ${offShape[0]!.name}`, colourIndex: offShape[0]!.index },
    });
  }

  for (const { colour, index, name } of shown) {
    if (colour.images.length === 0 || colourTotal(colour, source.sizes) > 0) continue;
    checks.push({
      id: `empty-${colour.productId}`,
      tone: 'note',
      title: `${name} is sold out in every size`,
      text: "Shoppers don't see it until it has stock.",
      action: { label: `Edit ${name} Stock`, colourIndex: index },
    });
  }

  for (const [index, colour] of source.colours.entries()) {
    if (colour.published) continue;
    checks.push({
      id: `hidden-${colour.productId}`,
      tone: 'note',
      title: `${colourName(colour.colors)} is hidden`,
      text: "You hid it, so shoppers don't see it.",
      action: { label: `Open ${colourName(colour.colors)}`, colourIndex: index },
    });
  }

  return checks;
}

/** Description paragraphs, split on blank lines like the saved description. */
function paragraphsOf(text: string): readonly string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
