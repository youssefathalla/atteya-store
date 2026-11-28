/**
 * What the product editor's store previews show (ATS-393): the Shop card, the product page and the
 * Check Before Saving list, built from the unsaved form so they follow every keystroke.
 */

/** The five editor tabs, in the order of the tab bar. */
export type EditorTab = 'product' | 'colours' | 'sizes' | 'price' | 'preview';

/** Which screen the Preview tab draws the product page on. */
export type PreviewDevice = 'computer' | 'phone';

export interface EditorPhotoView {
  readonly path: string;
  readonly alt: string;
}

/** One colour photo in the card's colour row, or a thumb under "More Colours". */
export interface EditorSwatchView {
  readonly key: string;
  readonly path: string | null;
  readonly label: string;
  readonly selected: boolean;
}

/** One size button on the product page. */
export interface EditorSizeView {
  readonly label: string;
  readonly soldOut: boolean;
}

/** The Shop card as the store draws it (`product-card.css`). */
export interface EditorCardView {
  readonly name: string;
  /** "Men – T-Shirts" when Gender is set, otherwise the short summary (or the description's first line). */
  readonly secondLine: string;
  /** True when the second line is the short summary (so it gets the summary's dashed outline). */
  readonly secondLineIsSummary: boolean;
  readonly photo: EditorPhotoView | null;
  readonly price: number | null;
  /** The crossed-out price, only when it is higher than the price. */
  readonly before: number | null;
  readonly swatches: readonly EditorSwatchView[];
  readonly badge: { readonly label: string; readonly boxed: boolean } | null;
}

/** The product page as the store draws it, for one colour. */
export interface EditorPageView {
  readonly crumbs: readonly string[];
  readonly name: string;
  readonly brand: string;
  readonly badge: string | null;
  readonly price: number | null;
  readonly before: number | null;
  readonly paragraphs: readonly string[];
  readonly details: readonly string[];
  /** "Materials" or "Specifications", set per category. */
  readonly detailsTitle: string;
  readonly photos: readonly EditorPhotoView[];
  readonly swatches: readonly EditorSwatchView[];
  readonly sizes: readonly EditorSizeView[];
  /** First size that isn't sold out, drawn as picked so the page looks like a shopper's. */
  readonly pickedSize: string | null;
  readonly soldOut: boolean;
  readonly slug: string;
}

export type EditorCheckTone = 'ok' | 'warn' | 'note';

/** One line of Check Before Saving. */
export interface EditorCheck {
  readonly id: string;
  readonly tone: EditorCheckTone;
  readonly title: string;
  readonly text: string;
  /** A link that opens the colour (and the Colours & Photos tab) to fix it. */
  readonly action: { readonly label: string; readonly colourIndex: number } | null;
}

/** A colour chip at the top of the Preview tab. */
export interface PreviewChip {
  readonly index: number;
  readonly label: string;
  readonly swatch: string | null;
  readonly colorId: string | null;
  readonly hidden: boolean;
}
