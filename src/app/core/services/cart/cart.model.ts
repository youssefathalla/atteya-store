/** What the product page hands to the future CartService. Prices are NOT included: checkout re-prices from Firestore. */
export interface CartLineDraft {
  readonly productId: string;
  readonly variantId: string | null;
  readonly selection: Readonly<Record<string, string>>;
  readonly quantity: number;
}

/** Stable identity of a bag line: the same product with the same options is one line. */
export function cartLineKey(line: CartLineDraft): string {
  return `${line.productId}:${line.variantId ?? ''}:${stableSelection(line.selection)}`;
}

function stableSelection(selection: Readonly<Record<string, string>>): string {
  return Object.keys(selection)
    .sort()
    .map((key) => `${key}=${selection[key]}`)
    .join('|');
}
