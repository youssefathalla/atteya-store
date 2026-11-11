import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SharedIconModule } from '@shared/ui/mat-icon';
import type { Product } from '@core/services/products/product.model';
import type { StockChange } from '../../models/product-admin.model';

const MAX_COUNT = 100_000;
const COUNT_ERROR = 'Use a whole number of 0 or more.';

export interface ProductStockDialogData {
  readonly product: Product;
}

interface StockInputRow {
  readonly id: string;
  readonly label: string;
  readonly prefill: number;
}

interface StockFormState {
  readonly sized: boolean;
  readonly hadMap: boolean;
  readonly stockUnset: boolean;
  readonly rows: readonly StockInputRow[];
  readonly flatTotal: number | null;
  readonly savedSummary: string;
  readonly initial: Readonly<Record<string, string>>;
}

@Component({
  selector: 'app-product-stock-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, SharedIconModule],
  templateUrl: './product-stock-dialog.component.html',
  styleUrl: './product-stock-dialog.component.css',
})
export class ProductStockDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<ProductStockDialogComponent, StockChange | null>);
  readonly data = inject<ProductStockDialogData>(MAT_DIALOG_DATA);
  readonly #form = buildStockForm(this.data.product);
  readonly #sized = this.#form.sized;
  readonly #hadMap = this.#form.hadMap;
  readonly #stockUnset = this.#form.stockUnset;
  readonly #initial = this.#form.initial;
  readonly #sizeEdited = signal(false);
  readonly rows = this.#form.rows;
  readonly flatTotal = this.#form.flatTotal;
  readonly savedSummary = this.#form.savedSummary;
  readonly draft = signal(this.#form.initial);

  readonly canSave = computed(() => {
    const countsAreValid = this.rows.every((row) => parseCount(this.draft()[row.id] ?? '') !== null);
    if (!countsAreValid) return false;
    if (this.#sized && !this.#hadMap) return this.#sizeEdited();
    return true;
  });

  readonly total = computed(() => {
    let sum = 0;
    for (const row of this.rows) {
      const parsed = parseCount(this.draft()[row.id] ?? '');
      if (parsed === null) return null;
      sum += parsed;
    }
    return sum;
  });

  count(id: string): string {
    return this.draft()[id] ?? '';
  }

  fieldError(id: string): string {
    return parseCount(this.draft()[id] ?? '') === null ? COUNT_ERROR : '';
  }

  totalText(): string {
    const total = this.total();
    return total === null ? '—' : String(total);
  }

  availabilityText(): string {
    const total = this.total();
    if (total === null) return '';
    return total > 0 ? 'In stock' : 'Out of stock';
  }

  inputId(id: string): string {
    return `product-stock-${id}`;
  }

  onCountInput(id: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.value !== (this.#initial[id] ?? '')) this.#sizeEdited.set(true);
    this.draft.update((current) => ({ ...current, [id]: target.value }));
  }

  onSave(event: Event): void {
    event.preventDefault();
    if (!this.canSave()) return;
    this.#dialogRef.close(this.#change());
  }

  #change(): StockChange | null {
    if (!this.#sized) {
      const next = parseCount(this.draft()['stock'] ?? '');
      const prefill = this.rows[0]?.prefill ?? 0;
      if (next === null) return null;
      if (!this.#stockUnset && next === prefill) return null;
      return { stock: next };
    }

    const stockBySize: Record<string, number> = {};
    for (const row of this.rows) {
      const next = parseCount(this.draft()[row.id] ?? '');
      if (next === null) return null;
      if (!this.#hadMap || next !== row.prefill) stockBySize[row.id] = next;
    }
    return Object.keys(stockBySize).length === 0 ? null : { stockBySize };
  }
}

function buildStockForm(product: Product): StockFormState {
  const sizeOption = product.options.find((option) => option.key === 'size');
  const seen = new Set<string>();
  const sizeRows: StockInputRow[] = [];
  for (const value of sizeOption?.values ?? []) {
    if (value.id.length === 0 || seen.has(value.id)) continue;
    seen.add(value.id);
    sizeRows.push({ id: value.id, label: value.label, prefill: 0 });
  }

  const hadMap = product.stockBySize !== undefined;
  const rows =
    sizeRows.length > 0
      ? sizeRows.map((row) => ({
          ...row,
          prefill: hadMap ? (product.stockBySize?.[row.id] ?? 0) : 0,
        }))
      : [{ id: 'stock', label: 'Stock', prefill: typeof product.stock === 'number' ? product.stock : 0 }];

  const initial: Record<string, string> = {};
  for (const row of rows) initial[row.id] = String(row.prefill);

  const flatTotal =
    sizeRows.length > 0 && !hadMap && typeof product.stock === 'number' ? product.stock : null;

  return {
    sized: sizeRows.length > 0,
    hadMap,
    stockUnset: sizeRows.length === 0 && typeof product.stock !== 'number',
    rows,
    flatTotal,
    savedSummary: savedSummary(product),
    initial,
  };
}

function savedSummary(product: Product): string {
  if (typeof product.stock !== 'number') return 'Now: not set.';
  return `Now: ${product.stock}, ${product.inStock ? 'in stock' : 'out of stock'}.`;
}

function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value > MAX_COUNT) return null;
  return value;
}
