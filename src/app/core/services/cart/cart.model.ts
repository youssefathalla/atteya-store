/** What the product page hands to the future CartService. Prices are NOT included: checkout re-prices from Firestore. */
export interface CartLineDraft {
  readonly productId: string;
  readonly variantId: string | null;
  readonly selection: Readonly<Record<string, string>>;
  readonly quantity: number;
}
