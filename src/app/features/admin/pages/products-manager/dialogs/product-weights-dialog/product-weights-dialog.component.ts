import { isPlatformBrowser } from '@angular/common';
import { Component, computed, effect, inject, PLATFORM_ID, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { CatalogToolsService, type ProductWeightsReport } from '../../services/catalog-tools.service';
import { importActionError } from '../../utils/import-error';

const MAX_GRAMS = 100_000;

/** '' = no default (null); whole grams 0–100,000; anything else = not valid (undefined). */
function parseGrams(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value <= MAX_GRAMS ? value : undefined;
}

/**
 * Catalogue Tools → Shipping Weights. Staff set a default weight per category and fill the
 * products that have none (`productWeights` callable). A weight already on a product is kept.
 */
@Component({
  selector: 'app-product-weights-dialog',
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule, RouterLink, SkeletonComponent],
  templateUrl: './product-weights-dialog.component.html',
})
export class ProductWeightsDialogComponent {
  readonly #tools = inject(CatalogToolsService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly reportResource = resource({
    loader: async (): Promise<ProductWeightsReport | undefined> =>
      isPlatformBrowser(this.#platformId) ? this.#tools.productWeights({ action: 'preview' }) : undefined,
  });

  /** Text in each category's weight field, keyed by category id. */
  readonly drafts = signal<Readonly<Record<string, string>>>({});
  readonly isSaving = signal(false);
  readonly isFilling = signal(false);

  readonly report = computed(() =>
    this.reportResource.hasValue() ? this.reportResource.value() : undefined,
  );

  /** Categories whose field differs from what checkout uses now, with the new value. */
  readonly changes = computed((): Record<string, number | null> | null => {
    const report = this.report();
    if (!report) return {};
    const drafts = this.drafts();
    const out: Record<string, number | null> = {};
    for (const category of report.categories) {
      const text = drafts[category.id];
      if (text === undefined) continue;
      const value = parseGrams(text);
      if (value === undefined) return null;
      if (value !== category.grams) out[category.id] = value;
    }
    return out;
  });

  readonly changeCount = computed(() => {
    const changes = this.changes();
    return changes ? Object.keys(changes).length : 0;
  });

  /** Listed products that Fill Empty Weights would give a weight to. */
  readonly fillable = computed(
    () => this.report()?.missing.filter((row) => row.suggestedGrams !== null).length ?? 0,
  );

  readonly categoryNames = computed(() => {
    const names = new Map<string, string>();
    for (const category of this.report()?.categories ?? []) names.set(category.id, category.name);
    return names;
  });

  readonly busy = computed(() => this.isSaving() || this.isFilling());

  /** Nothing changed, a field isn't valid, or something is running. */
  readonly saveDisabled = computed(() => this.busy() || this.changes() === null || this.changeCount() === 0);

  /** Unsaved defaults would be ignored, so they must be saved first. */
  readonly fillDisabled = computed(() => this.busy() || this.changeCount() > 0 || this.fillable() === 0);

  constructor() {
    // Fill the fields from each fresh report (on open, after Save Defaults, after Fill).
    effect(() => {
      const report = this.report();
      if (!report) return;
      const next: Record<string, string> = {};
      for (const category of report.categories) {
        next[category.id] = category.grams === null ? '' : String(category.grams);
      }
      this.drafts.set(next);
    });
  }

  fieldError(id: string): string {
    const text = this.drafts()[id];
    return text !== undefined && parseGrams(text) === undefined
      ? 'Whole grams from 0 to 100,000, or leave it empty.'
      : '';
  }

  onDraft(id: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.drafts.update((prev) => ({ ...prev, [id]: value }));
  }

  async saveDefaults(): Promise<void> {
    const changes = this.changes();
    if (this.busy() || !changes || Object.keys(changes).length === 0) return;
    this.isSaving.set(true);
    try {
      const report = await this.#tools.productWeights({ action: 'saveDefaults', weights: changes });
      this.reportResource.set(report);
      this.#snackbar.success('Default weights saved.');
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  async fillEmpty(): Promise<void> {
    if (this.busy() || this.changeCount() > 0) return;
    this.isFilling.set(true);
    try {
      const report = await this.#tools.productWeights({ action: 'fillEmpty' });
      this.reportResource.set(report);
      this.#snackbar.success(
        report.filled === 1 ? '1 product now has a weight.' : `${report.filled} products now have a weight.`,
      );
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    } finally {
      this.isFilling.set(false);
    }
  }
}
