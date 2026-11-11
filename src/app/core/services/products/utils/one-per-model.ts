/** The fields `onePerModel` reads from a product (Firestore product or homepage seed). */
export interface ModelGroupItem {
  readonly id: string;
  readonly modelGroup: string | null;
  readonly stock?: number;
  readonly inStock?: boolean;
}

function inStock(item: ModelGroupItem): boolean {
  return typeof item.stock === 'number' ? item.stock > 0 : item.inStock !== false;
}

/**
 * One product per model, so a list never shows two colours of the same product (the other
 * colours are under each card's photo). Keeps the list's order: each model sits where its first
 * colour was, shown as the first colour that is in stock (or the first colour when none are).
 * Products without a model are all kept.
 */
export function onePerModel<T extends ModelGroupItem>(items: readonly T[]): T[] {
  const out: T[] = [];
  const slotByModel = new Map<string, number>();
  for (const item of items) {
    const model = item.modelGroup?.trim();
    if (!model) {
      out.push(item);
      continue;
    }
    const slot = slotByModel.get(model);
    if (slot === undefined) {
      slotByModel.set(model, out.length);
      out.push(item);
    } else if (!inStock(out[slot]!) && inStock(item)) {
      out[slot] = item;
    }
  }
  return out;
}
