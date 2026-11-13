import { isPlatformBrowser } from '@angular/common';
import { Component, computed, effect, inject, output, PLATFORM_ID, resource, signal } from '@angular/core';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { Product } from '@core/services/products/product.model';
import { ProductsAdminService } from '../../products-manager/services/products-admin.service';

const SEARCH_DELAY_MS = 300;
const SHOWN_MAX = 20;

/** The piece we actually sent: a product (one colour) and, when it has sizes, a size. */
export interface SentPiece {
  readonly productId: string;
  readonly size: string | null;
}

/**
 * Wrong Item Sent at Approve: "What did we send instead?" Staff search any product (each colour is
 * its own product) and pick the size (ATS-293). Emits null until the choice is complete.
 */
@Component({
  selector: 'app-sent-piece-picker',
  host: { class: 'block w-full' },
  imports: [MatAutocompleteModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <div class="return-dialog-fields">
      <mat-form-field class="w-full" appearance="outline">
        <mat-label>Product we sent</mat-label>
        <input
          matInput
          type="text"
          [value]="text()"
          [matAutocomplete]="auto"
          (input)="onType($any($event.target).value)"
        />
        <mat-autocomplete #auto="matAutocomplete" (optionSelected)="pick($event)">
          @for (product of results(); track product.id) {
            <mat-option [value]="product.id">{{ product.name }}</mat-option>
          }
        </mat-autocomplete>
        @if (picked()) {
          <mat-hint>Picked. Type again to choose another product.</mat-hint>
        } @else if (search.isLoading()) {
          <mat-hint>Searching…</mat-hint>
        } @else if (term().length > 0 && results().length === 0) {
          <mat-hint>No product matches. Try another word from its name.</mat-hint>
        } @else {
          <mat-hint>Type part of the product's name.</mat-hint>
        }
      </mat-form-field>

      @if (sizes().length > 0) {
        <mat-form-field class="w-full" appearance="outline">
          <mat-label>Size we sent</mat-label>
          <mat-select [value]="size()" (valueChange)="size.set($event)">
            @for (option of sizes(); track option.id) {
              <mat-option [value]="option.id">{{ option.label }}</mat-option>
            }
          </mat-select>
          <mat-hint>The size on the piece the customer got.</mat-hint>
        </mat-form-field>
      }
    </div>
  `,
})
export class SentPiecePickerComponent {
  readonly #products = inject(ProductsAdminService);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly pieceChange = output<SentPiece | null>();

  readonly text = signal('');
  readonly term = signal('');
  readonly picked = signal<Product | null>(null);
  readonly size = signal<string | null>(null);

  readonly search = resource({
    params: () => {
      const term = this.term();
      return this.#browser && term.length > 1 ? term : undefined;
    },
    loader: ({ params }) => this.#products.searchProducts(params),
  });

  readonly results = computed(() =>
    this.search.hasValue() ? this.search.value().products.slice(0, SHOWN_MAX) : [],
  );

  readonly sizes = computed(() => {
    const product = this.picked();
    const option = product?.options.find((entry) => entry.key === 'size');
    return (option?.values ?? []).map((value) => ({ id: value.id, label: value.label }));
  });

  constructor() {
    effect((onCleanup) => {
      const text = this.text();
      const timer = setTimeout(() => this.term.set(this.picked() ? '' : text.trim()), SEARCH_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
    effect(() => {
      const product = this.picked();
      const size = this.size();
      if (!product) return this.pieceChange.emit(null);
      if (this.sizes().length > 0 && !size) return this.pieceChange.emit(null);
      this.pieceChange.emit({ productId: product.id, size: this.sizes().length > 0 ? size : null });
    });
  }

  onType(value: string): void {
    this.text.set(value);
    this.picked.set(null);
    this.size.set(null);
  }

  pick(event: MatAutocompleteSelectedEvent): void {
    const product = this.results().find((entry) => entry.id === event.option.value) ?? null;
    this.picked.set(product);
    this.size.set(null);
    this.text.set(product?.name ?? '');
  }
}
