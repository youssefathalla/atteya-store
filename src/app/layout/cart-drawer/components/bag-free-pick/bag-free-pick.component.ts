import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
import { dealPickTitle } from '@core/services/cart/cart-deals';
import { toGiftChoice, type GiftChoiceView } from '@core/services/cart/cart-gifts';
import { CartService } from '@core/services/cart/cart.service';
import type { BagDealHint } from '@core/services/offers/engine';
import type { Product } from '@core/services/products/product.model';
import { ProductSchema } from '@core/services/products/product.schema';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { normalizeImageKitPath } from '@shared/utils/image';

/** A free-item choice, with the options it is added to the bag with. */
interface FreePickChoice extends GiftChoiceView {
  /** The only value of each option besides size (checkout needs every option chosen). */
  readonly fixedSelection: Readonly<Record<string, string>>;
}

/**
 * "You've earned a free grip": shown under the item when a Buy X Get Y group is complete but the
 * free piece must be one of a list of products and none is in the bag. Each choice is a photo
 * tile; tapping one (then its size, when it has sizes) adds it to the bag, where the offer makes
 * it free. Only published, in-stock products with no choice besides size are offered.
 */
@Component({
  selector: 'app-bag-free-pick',
  imports: [NgOptimizedImage, AppImageFallbackDirective, SkeletonComponent],
  templateUrl: './bag-free-pick.component.html',
  host: { class: 'block w-full' },
})
export class BagFreePickComponent {
  readonly hint = input.required<BagDealHint>();

  readonly #cart = inject(CartService);
  readonly #snackbar = inject(SnackbarService);
  readonly #firestore = injectFirestore();

  /** The tile whose size is being chosen. */
  readonly openChoice = signal<string | null>(null);

  readonly #choices = resource({
    params: () => [...this.hint().productIds],
    loader: async ({ params: ids }): Promise<readonly FreePickChoice[]> => {
      const products = await Promise.all(ids.map((id) => this.#read(id)));
      return products.flatMap((product) => {
        const choice = product ? toGiftChoice(product) : null;
        return product && choice ? [{ ...choice, fixedSelection: fixedSelection(product) }] : [];
      });
    },
  });

  readonly loading = computed(() => this.#choices.isLoading() && !this.#choices.hasValue());
  readonly choices = computed(() => (this.#choices.hasValue() ? this.#choices.value() : []));
  readonly title = computed(() => {
    const choices = this.choices();
    return dealPickTitle(this.hint(), choices.length === 1 ? choices[0]!.label : null);
  });
  readonly sizes = computed(() => {
    const open = this.openChoice();
    return this.choices().find((choice) => choice.productId === open)?.sizes ?? null;
  });

  path(raw: string): string {
    return normalizeImageKitPath(raw);
  }

  tileLabel(choice: FreePickChoice): string {
    return choice.sizes ? `${choice.label}, choose a size` : `Add ${choice.label} to your bag`;
  }

  pick(choice: FreePickChoice): void {
    if (choice.sizes) {
      this.openChoice.set(this.openChoice() === choice.productId ? null : choice.productId);
      return;
    }
    this.#add(choice, null);
  }

  pickSize(sizeId: string): void {
    const choice = this.choices().find((entry) => entry.productId === this.openChoice());
    if (choice) this.#add(choice, sizeId);
  }

  #add(choice: FreePickChoice, sizeId: string | null): void {
    const added = this.#cart.add({
      productId: choice.productId,
      variantId: null,
      selection: sizeId ? { ...choice.fixedSelection, size: sizeId } : choice.fixedSelection,
      quantity: 1,
    });
    // A full bag adds nothing: say so and keep the choice open, as Add to Bag does.
    if (!added) {
      this.#snackbar.error('Your bag is full. Remove an item to add this one.');
      return;
    }
    this.openChoice.set(null);
  }

  /** One product, or null when it is gone, unpublished or can't be read now. */
  async #read(productId: string): Promise<Product | null> {
    try {
      const snap = await getDoc(
        doc(this.#firestore, 'products', productId).withConverter(createValibotConverter(ProductSchema)),
      );
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      if (!isPermissionDenied(error)) console.warn('Could not read a free item choice', error);
      return null;
    }
  }
}

function fixedSelection(product: Product): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const option of product.options) {
    if (option.key !== 'size' && option.values.length === 1) selection[option.key] = option.values[0]!.id;
  }
  return selection;
}
